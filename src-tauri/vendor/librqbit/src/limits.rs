use arc_swap::ArcSwapOption;
use governor::DefaultDirectRateLimiter as RateLimiter;
use governor::Quota;
use serde::Deserialize;
use serde::Serialize;
use std::num::NonZeroU32;
use std::sync::Arc;

#[derive(Default, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct LimitsConfig {
    pub upload_bps: Option<NonZeroU32>,
    pub download_bps: Option<NonZeroU32>,
}

struct Limit {
    limiter: ArcSwapOption<RateLimiter>,
    current_bps: std::sync::atomic::AtomicU32,
}

impl Limit {
    fn new_inner(bps: Option<NonZeroU32>) -> Option<Arc<RateLimiter>> {
        let bps = bps?;
        // BitTorrent requests are made in protocol blocks. Allow one full block
        // through even when the configured rate is lower than a block, while
        // keeping the quota's refill interval tied to the requested bytes/sec.
        let minimum_burst = NonZeroU32::new(librqbit_core::constants::CHUNK_SIZE)
            .expect("BitTorrent chunks have a non-zero size");
        let quota = Quota::per_second(bps).allow_burst(bps.max(minimum_burst));
        Some(Arc::new(RateLimiter::direct(quota)))
    }

    fn new(bps: Option<NonZeroU32>) -> Self {
        use std::sync::atomic::AtomicU32;
        Self {
            limiter: ArcSwapOption::new(Self::new_inner(bps)),
            current_bps: AtomicU32::new(bps.map(|v| v.get()).unwrap_or(0)),
        }
    }

    async fn acquire(&self, size: NonZeroU32) -> crate::Result<()> {
        let lim = self.limiter.load().clone();
        if let Some(rl) = lim.as_ref() {
            rl.until_n_ready(size).await?;
        }
        Ok(())
    }

    fn set(&self, limit: Option<NonZeroU32>) {
        use std::sync::atomic::Ordering;
        let new = Self::new_inner(limit);
        self.limiter.swap(new);
        self.current_bps
            .store(limit.map(|v| v.get()).unwrap_or(0), Ordering::Relaxed);
    }

    fn get(&self) -> Option<NonZeroU32> {
        use std::sync::atomic::Ordering;
        NonZeroU32::new(self.current_bps.load(Ordering::Relaxed))
    }
}

pub struct Limits {
    down: Limit,
    up: Limit,
}

impl Limits {
    pub fn new(config: LimitsConfig) -> Self {
        Self {
            down: Limit::new(config.download_bps),
            up: Limit::new(config.upload_bps),
        }
    }

    pub async fn prepare_for_upload(&self, len: NonZeroU32) -> crate::Result<()> {
        self.up.acquire(len).await
    }

    pub async fn prepare_for_download(&self, len: NonZeroU32) -> crate::Result<()> {
        self.down.acquire(len).await
    }

    pub fn set_upload_bps(&self, bps: Option<NonZeroU32>) {
        self.up.set(bps);
    }

    pub fn set_download_bps(&self, bps: Option<NonZeroU32>) {
        self.down.set(bps);
    }

    pub fn get_upload_bps(&self) -> Option<NonZeroU32> {
        self.up.get()
    }

    pub fn get_download_bps(&self) -> Option<NonZeroU32> {
        self.down.get()
    }

    pub fn get_config(&self) -> LimitsConfig {
        LimitsConfig {
            upload_bps: self.get_upload_bps(),
            download_bps: self.get_download_bps(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[tokio::test]
    async fn runtime_limit_updates_apply_without_recreating_the_bucket() {
        let limits = Limits::new(LimitsConfig {
            download_bps: NonZeroU32::new(librqbit_core::constants::CHUNK_SIZE),
            upload_bps: None,
        });
        let chunk = NonZeroU32::new(librqbit_core::constants::CHUNK_SIZE).unwrap();
        limits.prepare_for_download(chunk).await.unwrap();

        let started = Instant::now();
        limits.prepare_for_download(chunk).await.unwrap();
        assert!(started.elapsed() >= Duration::from_millis(750));
        assert_eq!(
            limits.get_download_bps(),
            NonZeroU32::new(librqbit_core::constants::CHUNK_SIZE)
        );

        limits.set_download_bps(None);
        let started = Instant::now();
        limits
            .prepare_for_download(NonZeroU32::new(4096).unwrap())
            .await
            .unwrap();
        assert!(started.elapsed() < Duration::from_millis(250));
        assert_eq!(limits.get_download_bps(), None);
    }

    #[tokio::test]
    async fn upload_bucket_enforces_its_own_rate() {
        let chunk = NonZeroU32::new(librqbit_core::constants::CHUNK_SIZE).unwrap();
        let limits = Limits::new(LimitsConfig {
            download_bps: None,
            upload_bps: Some(chunk),
        });
        limits.prepare_for_upload(chunk).await.unwrap();

        let started = Instant::now();
        limits.prepare_for_upload(chunk).await.unwrap();
        assert!(started.elapsed() >= Duration::from_millis(750));
        assert_eq!(limits.get_upload_bps(), Some(chunk));
    }

    #[tokio::test]
    async fn global_and_torrent_buckets_enforce_the_lower_cap() {
        let chunk = NonZeroU32::new(librqbit_core::constants::CHUNK_SIZE).unwrap();
        for (global_bps, torrent_bps) in [
            (chunk.get() * 4, chunk.get()),
            (chunk.get(), chunk.get() * 4),
        ] {
            let global = Limits::new(LimitsConfig {
                download_bps: NonZeroU32::new(global_bps),
                upload_bps: None,
            });
            let torrent = Limits::new(LimitsConfig {
                download_bps: NonZeroU32::new(torrent_bps),
                upload_bps: None,
            });
            torrent.prepare_for_download(chunk).await.unwrap();
            global.prepare_for_download(chunk).await.unwrap();

            let started = Instant::now();
            torrent.prepare_for_download(chunk).await.unwrap();
            global.prepare_for_download(chunk).await.unwrap();
            assert!(started.elapsed() >= Duration::from_millis(750));
        }
    }
}
