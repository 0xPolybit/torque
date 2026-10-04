mod internet_archive;

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

use async_trait::async_trait;
use futures::future::join_all;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio_util::sync::CancellationToken;

pub use internet_archive::InternetArchiveProvider;

const PROVIDER_TIMEOUT: Duration = Duration::from_secs(15);
const DEFAULT_PAGE_SIZE: u32 = 12;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchProviderCapabilities {
    pub search: bool,
    pub pagination: bool,
    pub details: bool,
    pub magnet_links: bool,
    pub torrent_files: bool,
    pub categories: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchProviderInfo {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub capabilities: SearchProviderCapabilities,
    pub health: ProviderHealth,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderHealth {
    pub state: ProviderHealthState,
    pub message: Option<String>,
    pub retry_after_seconds: Option<u64>,
}

impl Default for ProviderHealth {
    fn default() -> Self {
        Self {
            state: ProviderHealthState::Unknown,
            message: None,
            retry_after_seconds: None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderHealthState {
    Unknown,
    Healthy,
    Degraded,
    Unavailable,
    RateLimited,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchFilters {
    pub category: Option<String>,
    pub provider_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TorrentSearchResult {
    pub provider: String,
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub size_bytes: Option<u64>,
    pub seeders: Option<u64>,
    pub leechers: Option<u64>,
    pub info_hash: Option<String>,
    pub published_at: Option<String>,
    pub magnet_uri: Option<String>,
    pub torrent_url: Option<String>,
    pub source_page: String,
    pub license: Option<String>,
    pub verified: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TorrentSearchDetails {
    pub result: TorrentSearchResult,
    pub creator: Option<String>,
    pub subjects: Vec<String>,
    pub torrent_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum TorrentDownloadSource {
    Magnet(String),
    TorrentUrl(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchProviderPage {
    pub results: Vec<TorrentSearchResult>,
    pub total_results: Option<u64>,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchProviderStatus {
    pub provider_id: String,
    pub health: ProviderHealth,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TorrentSearchResponse {
    pub query: String,
    pub page: u32,
    pub page_size: u32,
    pub results: Vec<TorrentSearchResult>,
    pub providers: Vec<SearchProviderStatus>,
    pub has_more: bool,
    pub cancelled: bool,
}

#[derive(Debug, Clone, Error)]
pub enum ProviderError {
    #[error("Network request failed: {0}")]
    Network(String),
    #[error("The provider returned HTTP {0}.")]
    HttpStatus(u16),
    #[error("The provider rate-limited requests.")]
    RateLimited(Option<u64>),
    #[error("The provider returned invalid data: {0}")]
    InvalidResponse(String),
    #[error("This item is not eligible for authorized torrent distribution: {0}")]
    UnsupportedItem(String),
    #[error("The search was cancelled.")]
    Cancelled,
}

#[async_trait]
pub trait SearchProvider: Send + Sync {
    fn id(&self) -> &'static str;
    fn name(&self) -> &'static str;
    fn icon(&self) -> &'static str;
    fn capabilities(&self) -> SearchProviderCapabilities;

    async fn search(
        &self,
        query: &str,
        page: u32,
        page_size: u32,
        filters: &SearchFilters,
        cancellation: CancellationToken,
    ) -> Result<SearchProviderPage, ProviderError>;

    async fn get_details(
        &self,
        result_id: &str,
        cancellation: CancellationToken,
    ) -> Result<TorrentSearchDetails, ProviderError>;

    async fn get_download_source(
        &self,
        result_id: &str,
        cancellation: CancellationToken,
    ) -> Result<TorrentDownloadSource, ProviderError>;

    async fn health_check(&self) -> Result<(), ProviderError>;
}

#[derive(Default)]
struct SearchRuntime {
    active: Mutex<HashMap<String, ActiveSearch>>,
    health: Mutex<HashMap<String, ProviderHealth>>,
    rate_limit_deadlines: Mutex<HashMap<String, Instant>>,
    next_generation: AtomicU64,
}

struct ActiveSearch {
    generation: u64,
    cancellation: CancellationToken,
}

#[derive(Clone)]
pub struct SearchService {
    providers: Vec<Arc<dyn SearchProvider>>,
    runtime: Arc<SearchRuntime>,
}

impl SearchService {
    pub fn new() -> Self {
        Self::with_providers(vec![Arc::new(InternetArchiveProvider::new())])
    }

    pub fn with_providers(providers: Vec<Arc<dyn SearchProvider>>) -> Self {
        Self {
            providers,
            runtime: Arc::new(SearchRuntime::default()),
        }
    }

    pub fn providers(&self) -> Vec<SearchProviderInfo> {
        self.providers
            .iter()
            .map(|provider| SearchProviderInfo {
                id: provider.id().to_string(),
                name: provider.name().to_string(),
                icon: provider.icon().to_string(),
                capabilities: provider.capabilities(),
                health: self.health_for(provider.id()),
            })
            .collect()
    }

    pub async fn refresh_provider_health(&self) -> Vec<SearchProviderInfo> {
        let checks = self.providers.iter().map(|provider| async move {
            if let Some(retry_after) = self.rate_limited_for(provider.id()) {
                return (
                    provider.id(),
                    ProviderHealth {
                        state: ProviderHealthState::RateLimited,
                        message: Some(
                            "The provider asked Torque to slow down. Try again later.".to_string(),
                        ),
                        retry_after_seconds: Some(retry_after),
                    },
                );
            }
            let result = tokio::time::timeout(PROVIDER_TIMEOUT, provider.health_check()).await;
            let health = match result {
                Ok(Ok(())) => ProviderHealth {
                    state: ProviderHealthState::Healthy,
                    message: None,
                    retry_after_seconds: None,
                },
                Ok(Err(error)) => Self::health_from_error(error),
                Err(_) => ProviderHealth {
                    state: ProviderHealthState::Unavailable,
                    message: Some("Provider health check timed out.".to_string()),
                    retry_after_seconds: None,
                },
            };
            (provider.id(), health)
        });

        for (provider_id, health) in join_all(checks).await {
            self.record_health(provider_id, health);
        }
        self.providers()
    }

    pub async fn search(
        &self,
        search_id: String,
        query: String,
        page: u32,
        filters: SearchFilters,
    ) -> Result<TorrentSearchResponse, String> {
        let query = query.trim();
        if search_id.trim().is_empty() || search_id.len() > 128 {
            return Err("The search request identifier is invalid.".to_string());
        }
        if query.is_empty() {
            return Err("Enter a search term.".to_string());
        }
        if query.chars().count() > 160 {
            return Err("Search terms must be 160 characters or fewer.".to_string());
        }
        if page == 0 || page > 800 {
            return Err("The requested search page is out of range.".to_string());
        }
        if let Some(category) = filters.category.as_deref() {
            if !["software", "datasets", "media"].contains(&category) {
                return Err("Choose a supported search category.".to_string());
            }
        }
        if let Some(provider_id) = filters.provider_id.as_deref() {
            if !self
                .providers
                .iter()
                .any(|provider| provider.id() == provider_id)
            {
                return Err("That search provider is not available.".to_string());
            }
        }

        let cancellation = CancellationToken::new();
        let generation = self.runtime.next_generation.fetch_add(1, Ordering::Relaxed);
        {
            let mut active = self
                .runtime
                .active
                .lock()
                .map_err(|_| "The search service is temporarily unavailable.".to_string())?;
            if let Some(previous) = active.insert(
                search_id.clone(),
                ActiveSearch {
                    generation,
                    cancellation: cancellation.clone(),
                },
            ) {
                previous.cancellation.cancel();
            }
        }
        let _guard = SearchGuard {
            id: search_id.clone(),
            generation,
            runtime: Arc::clone(&self.runtime),
        };

        let query = query.to_string();
        let providers = self
            .providers
            .iter()
            .filter(|provider| {
                filters
                    .provider_id
                    .as_deref()
                    .is_none_or(|provider_id| provider.id() == provider_id)
            })
            .cloned()
            .collect::<Vec<_>>();
        let provider_jobs = providers.iter().map(|provider| {
            let provider = Arc::clone(provider);
            let child = cancellation.child_token();
            let parent = cancellation.clone();
            let query = query.clone();
            let filters = filters.clone();
            let rate_limited_for = self.rate_limited_for(provider.id());
            async move {
                if let Some(retry_after) = rate_limited_for {
                    return (provider.id(), Err(ProviderError::RateLimited(Some(retry_after))));
                }
                let operation = provider.search(
                    &query,
                    page,
                    DEFAULT_PAGE_SIZE,
                    &filters,
                    child,
                );
                let result = tokio::select! {
                    _ = parent.cancelled() => Err(ProviderError::Cancelled),
                    result = tokio::time::timeout(PROVIDER_TIMEOUT, operation) => match result {
                        Ok(result) => result,
                        Err(_) => Err(ProviderError::Network("The provider request timed out.".to_string())),
                    },
                };
                (provider.id(), result)
            }
        });
        let outcomes = join_all(provider_jobs).await;
        let cancelled = cancellation.is_cancelled();
        let mut results = Vec::new();
        let mut provider_statuses = Vec::with_capacity(outcomes.len());
        let mut has_more = false;

        for (provider_id, outcome) in outcomes {
            let health = match outcome {
                Ok(page) => {
                    if !cancelled {
                        results.extend(page.results);
                    }
                    has_more |= page.has_more;
                    ProviderHealth {
                        state: ProviderHealthState::Healthy,
                        message: None,
                        retry_after_seconds: None,
                    }
                }
                Err(ProviderError::Cancelled) if cancelled => self.health_for(provider_id),
                Err(error) => Self::health_from_error(error),
            };
            self.record_health(provider_id, health.clone());
            provider_statuses.push(SearchProviderStatus {
                provider_id: provider_id.to_string(),
                health,
            });
        }

        Ok(TorrentSearchResponse {
            query,
            page,
            page_size: DEFAULT_PAGE_SIZE,
            results,
            providers: provider_statuses,
            has_more: has_more && !cancelled,
            cancelled,
        })
    }

    pub fn cancel_search(&self, search_id: &str) -> bool {
        let Ok(active) = self.runtime.active.lock() else {
            return false;
        };
        if let Some(cancellation) = active.get(search_id) {
            cancellation.cancellation.cancel();
            true
        } else {
            false
        }
    }

    pub async fn get_details(
        &self,
        provider_id: &str,
        result_id: &str,
    ) -> Result<TorrentSearchDetails, String> {
        let provider = self.find_provider(provider_id)?;
        self.ensure_provider_not_rate_limited(provider_id)?;
        self.run_item_request(
            provider_id,
            provider.get_details(result_id, CancellationToken::new()),
        )
        .await
    }

    pub async fn get_download_source(
        &self,
        provider_id: &str,
        result_id: &str,
    ) -> Result<TorrentDownloadSource, String> {
        let provider = self.find_provider(provider_id)?;
        self.ensure_provider_not_rate_limited(provider_id)?;
        self.run_item_request(
            provider_id,
            provider.get_download_source(result_id, CancellationToken::new()),
        )
        .await
    }

    async fn run_item_request<T>(
        &self,
        provider_id: &str,
        request: impl std::future::Future<Output = Result<T, ProviderError>>,
    ) -> Result<T, String> {
        match tokio::time::timeout(PROVIDER_TIMEOUT, request).await {
            Ok(Ok(value)) => {
                self.record_health(
                    provider_id,
                    ProviderHealth {
                        state: ProviderHealthState::Healthy,
                        message: None,
                        retry_after_seconds: None,
                    },
                );
                Ok(value)
            }
            Ok(Err(error)) => {
                match &error {
                    ProviderError::Network(_)
                    | ProviderError::HttpStatus(_)
                    | ProviderError::InvalidResponse(_)
                    | ProviderError::RateLimited(_) => {
                        self.record_health(provider_id, Self::health_from_error(error.clone()));
                    }
                    ProviderError::UnsupportedItem(_) | ProviderError::Cancelled => {}
                }
                Err(error.to_string())
            }
            Err(_) => {
                self.record_health(
                    provider_id,
                    ProviderHealth {
                        state: ProviderHealthState::Unavailable,
                        message: Some("The provider request timed out.".to_string()),
                        retry_after_seconds: None,
                    },
                );
                Err("The provider request timed out. Try again shortly.".to_string())
            }
        }
    }

    fn find_provider(&self, provider_id: &str) -> Result<&Arc<dyn SearchProvider>, String> {
        self.providers
            .iter()
            .find(|provider| provider.id() == provider_id)
            .ok_or_else(|| "That search provider is not available.".to_string())
    }

    fn health_for(&self, provider_id: &str) -> ProviderHealth {
        self.runtime
            .health
            .lock()
            .ok()
            .and_then(|health| health.get(provider_id).cloned())
            .unwrap_or_default()
    }

    fn record_health(&self, provider_id: &str, health: ProviderHealth) {
        if health.state == ProviderHealthState::RateLimited {
            let wait = Duration::from_secs(health.retry_after_seconds.unwrap_or(30).clamp(1, 3600));
            if let Ok(mut deadlines) = self.runtime.rate_limit_deadlines.lock() {
                deadlines.insert(provider_id.to_string(), Instant::now() + wait);
            }
        } else if let Ok(mut deadlines) = self.runtime.rate_limit_deadlines.lock() {
            deadlines.remove(provider_id);
        }
        if let Ok(mut states) = self.runtime.health.lock() {
            states.insert(provider_id.to_string(), health);
        }
    }

    fn rate_limited_for(&self, provider_id: &str) -> Option<u64> {
        let mut deadlines = self.runtime.rate_limit_deadlines.lock().ok()?;
        let until = deadlines.get(provider_id).copied()?;
        let now = Instant::now();
        if until <= now {
            deadlines.remove(provider_id);
            return None;
        }
        Some(until.duration_since(now).as_secs().max(1))
    }

    fn ensure_provider_not_rate_limited(&self, provider_id: &str) -> Result<(), String> {
        if let Some(retry_after) = self.rate_limited_for(provider_id) {
            return Err(format!(
                "The provider asked Torque to slow down. Try again in about {retry_after} seconds."
            ));
        }
        Ok(())
    }

    fn health_from_error(error: ProviderError) -> ProviderHealth {
        match error {
            ProviderError::RateLimited(retry_after_seconds) => ProviderHealth {
                state: ProviderHealthState::RateLimited,
                message: Some(
                    "The provider asked Torque to slow down. Try again later.".to_string(),
                ),
                retry_after_seconds,
            },
            ProviderError::Cancelled => ProviderHealth {
                state: ProviderHealthState::Unknown,
                message: None,
                retry_after_seconds: None,
            },
            error => ProviderHealth {
                state: ProviderHealthState::Unavailable,
                message: Some(error.to_string()),
                retry_after_seconds: None,
            },
        }
    }
}

impl Default for SearchService {
    fn default() -> Self {
        Self::new()
    }
}

struct SearchGuard {
    id: String,
    generation: u64,
    runtime: Arc<SearchRuntime>,
}

impl Drop for SearchGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = self.runtime.active.lock() {
            if active
                .get(&self.id)
                .is_some_and(|current| current.generation == self.generation)
            {
                active.remove(&self.id);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicU64, Ordering},
        Mutex as StdMutex,
    };

    struct StubProvider {
        id: &'static str,
        failure: bool,
        wait_for_cancel: bool,
        rate_limited: bool,
        calls: Arc<AtomicU64>,
        received_cancellation: Arc<StdMutex<Option<CancellationToken>>>,
    }

    #[async_trait]
    impl SearchProvider for StubProvider {
        fn id(&self) -> &'static str {
            self.id
        }

        fn name(&self) -> &'static str {
            "Test source"
        }

        fn icon(&self) -> &'static str {
            "test"
        }

        fn capabilities(&self) -> SearchProviderCapabilities {
            SearchProviderCapabilities {
                search: true,
                pagination: true,
                details: true,
                magnet_links: false,
                torrent_files: true,
                categories: vec!["software".to_string()],
            }
        }

        async fn search(
            &self,
            query: &str,
            _page: u32,
            _page_size: u32,
            _filters: &SearchFilters,
            cancellation: CancellationToken,
        ) -> Result<SearchProviderPage, ProviderError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            *self
                .received_cancellation
                .lock()
                .expect("test cancellation state lock") = Some(cancellation.clone());
            if self.wait_for_cancel {
                tokio::select! {
                    _ = cancellation.cancelled() => return Err(ProviderError::Cancelled),
                    _ = tokio::time::sleep(Duration::from_secs(5)) => {}
                }
            }
            if self.failure {
                return Err(ProviderError::HttpStatus(503));
            }
            if self.rate_limited {
                return Err(ProviderError::RateLimited(Some(45)));
            }
            Ok(SearchProviderPage {
                results: vec![TorrentSearchResult {
                    provider: self.id.to_string(),
                    id: "id-1".to_string(),
                    title: query.to_string(),
                    description: None,
                    category: Some("software".to_string()),
                    size_bytes: Some(42),
                    seeders: None,
                    leechers: None,
                    info_hash: None,
                    published_at: None,
                    magnet_uri: None,
                    torrent_url: None,
                    source_page: "https://example.invalid/item".to_string(),
                    license: Some("CC0".to_string()),
                    verified: None,
                }],
                total_results: Some(1),
                has_more: false,
            })
        }

        async fn get_details(
            &self,
            _result_id: &str,
            _cancellation: CancellationToken,
        ) -> Result<TorrentSearchDetails, ProviderError> {
            Err(ProviderError::UnsupportedItem("test".to_string()))
        }

        async fn get_download_source(
            &self,
            _result_id: &str,
            _cancellation: CancellationToken,
        ) -> Result<TorrentDownloadSource, ProviderError> {
            Err(ProviderError::UnsupportedItem("test".to_string()))
        }

        async fn health_check(&self) -> Result<(), ProviderError> {
            Ok(())
        }
    }

    fn stub(id: &'static str, failure: bool, wait_for_cancel: bool) -> Arc<StubProvider> {
        Arc::new(StubProvider {
            id,
            failure,
            wait_for_cancel,
            rate_limited: false,
            calls: Arc::new(AtomicU64::new(0)),
            received_cancellation: Arc::new(StdMutex::new(None)),
        })
    }

    fn rate_limited_stub() -> Arc<StubProvider> {
        Arc::new(StubProvider {
            id: "limited",
            failure: false,
            wait_for_cancel: false,
            rate_limited: true,
            calls: Arc::new(AtomicU64::new(0)),
            received_cancellation: Arc::new(StdMutex::new(None)),
        })
    }

    #[tokio::test]
    async fn available_providers_return_results_when_another_provider_fails() {
        let good = stub("good", false, false);
        let service =
            SearchService::with_providers(vec![good.clone(), stub("offline", true, false)]);

        let response = service
            .search(
                "search-1".to_string(),
                "open source".to_string(),
                1,
                SearchFilters::default(),
            )
            .await
            .expect("aggregated search succeeds");

        assert_eq!(response.results.len(), 1);
        assert_eq!(response.results[0].provider, "good");
        assert_eq!(response.providers.len(), 2);
        assert_eq!(
            response.providers[1].health.state,
            ProviderHealthState::Unavailable
        );
    }

    #[tokio::test]
    async fn cancellation_reaches_each_provider_and_discards_partial_results() {
        let provider = stub("slow", false, true);
        let service = Arc::new(SearchService::with_providers(vec![provider.clone()]));
        let searching = {
            let service = Arc::clone(&service);
            tokio::spawn(async move {
                service
                    .search(
                        "cancel-me".to_string(),
                        "dataset".to_string(),
                        1,
                        SearchFilters::default(),
                    )
                    .await
                    .expect("cancelled searches return a response")
            })
        };
        tokio::time::timeout(Duration::from_secs(1), async {
            while provider.calls.load(Ordering::SeqCst) == 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("provider search starts before cancellation");

        assert!(service.cancel_search("cancel-me"));
        let response = searching.await.expect("search task completes");
        assert!(response.cancelled);
        assert!(response.results.is_empty());
        assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
        assert!(provider
            .received_cancellation
            .lock()
            .expect("test cancellation state lock")
            .as_ref()
            .expect("provider received its cancellation token")
            .is_cancelled());
    }

    #[tokio::test]
    async fn search_input_is_validated_before_a_provider_is_called() {
        let service = SearchService::with_providers(vec![stub("good", false, false)]);
        assert!(service
            .search(
                "search-1".to_string(),
                " ".to_string(),
                1,
                SearchFilters::default(),
            )
            .await
            .is_err());
        assert!(service
            .search(
                "search-2".to_string(),
                "valid".to_string(),
                0,
                SearchFilters::default(),
            )
            .await
            .is_err());
    }

    #[tokio::test]
    async fn provider_filter_only_queries_the_selected_provider() {
        let selected = stub("selected", false, false);
        let other = stub("other", false, false);
        let service = SearchService::with_providers(vec![selected.clone(), other.clone()]);

        let response = service
            .search(
                "provider-filter".to_string(),
                "dataset".to_string(),
                1,
                SearchFilters {
                    category: None,
                    provider_id: Some("selected".to_string()),
                },
            )
            .await
            .expect("selected provider search succeeds");

        assert_eq!(response.providers.len(), 1);
        assert_eq!(response.providers[0].provider_id, "selected");
        assert_eq!(selected.calls.load(Ordering::SeqCst), 1);
        assert_eq!(other.calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn rate_limited_provider_is_held_until_retry_after_expires() {
        let provider = rate_limited_stub();
        let service = SearchService::with_providers(vec![provider.clone()]);

        let first = service
            .search(
                "rate-1".to_string(),
                "dataset".to_string(),
                1,
                SearchFilters::default(),
            )
            .await
            .expect("rate limits are provider health, not search-wide failures");
        assert_eq!(
            first.providers[0].health.state,
            ProviderHealthState::RateLimited
        );
        assert_eq!(first.providers[0].health.retry_after_seconds, Some(45));

        let second = service
            .search(
                "rate-2".to_string(),
                "dataset".to_string(),
                1,
                SearchFilters::default(),
            )
            .await
            .expect("a throttled provider does not fail the search command");
        assert_eq!(
            second.providers[0].health.state,
            ProviderHealthState::RateLimited
        );
        assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
    }
}
