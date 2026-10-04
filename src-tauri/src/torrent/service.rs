use std::{
    collections::HashMap,
    collections::HashSet,
    fs,
    num::NonZeroU32,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use bytes::Bytes;
use librqbit::{
    api::{ApiTorrentListOpts, TorrentIdOrHash},
    AddTorrent, AddTorrentOptions, Api, Magnet, Session, SessionOptions, SessionPersistenceConfig,
    TorrentStats, TorrentStatsState,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::Mutex as AsyncMutex;
use url::Url;
use uuid::Uuid;

use super::persistence::{now_millis, AppPreferences, ApplicationPersistence};

const MAX_TORRENT_FILE_SIZE: u64 = 64 * 1024 * 1024;

#[derive(Debug, Error)]
pub enum TorrentError {
    #[error("Enter a magnet link that starts with magnet:?.")]
    EmptyMagnet,
    #[error("Invalid magnet link: {0}")]
    InvalidMagnet(String),
    #[error("Enter a valid HTTP or HTTPS URL to a .torrent file.")]
    InvalidTorrentUrl,
    #[error("Choose a .torrent file to start the download.")]
    InvalidTorrentFile,
    #[error("The selected torrent file is larger than the 64 MiB limit.")]
    TorrentFileTooLarge,
    #[error("The selected download folder is no longer available. Choose it again.")]
    UnknownDownloadDirectory,
    #[error("Could not access the selected download folder: {0}")]
    DownloadDirectory(String),
    #[error("Could not read the selected torrent file: {0}")]
    ReadTorrentFile(String),
    #[error("The selected file is not a valid torrent: {0}")]
    InvalidTorrentMetadata(String),
    #[error("Torrent engine error: {0}")]
    Engine(String),
    #[error("Could not fetch torrent metadata: {0}")]
    MetadataResolution(String),
    #[error("Torrent status error: {0}")]
    Status(String),
    #[error("The download service could not lock its directory list.")]
    DirectoryLock,
    #[error("The download service could not lock its selected torrent files.")]
    TorrentFileSelectionLock,
    #[error("The selected torrent file is no longer available. Choose it again.")]
    UnknownTorrentFileSelection,
    #[error("Could not lock torrent previews.")]
    PreviewLock,
    #[error("The torrent preview expired. Inspect the source again.")]
    UnknownTorrentPreview,
    #[error("Select at least one file to download.")]
    NoFilesSelected,
    #[error("The selected files do not match this torrent preview. Inspect it again.")]
    InvalidFileSelection,
    #[error("This torrent is already in your library.")]
    DuplicateTorrent,
    #[error("Selected files need {selected_bytes} bytes, but the destination has {available_bytes} bytes free.")]
    InsufficientDiskSpace {
        selected_bytes: u64,
        available_bytes: u64,
    },
    #[error("A torrent file path would escape the selected download folder.")]
    UnsafeTorrentPath,
    #[error("Wait until the torrent is active or paused before changing its file selection.")]
    FileSelectionUnavailable,
    #[error("Torrent metadata is larger than the 64 MiB limit.")]
    TorrentMetadataTooLarge,
    #[error(
        "The torrent engine unexpectedly started a download during inspection; it was paused."
    )]
    InspectionStartedTorrent,
    #[error("Could not save application state: {0}")]
    Persistence(String),
    #[error("The application state could not be locked.")]
    ApplicationStateLock,
    #[error("The queue state could not be locked.")]
    QueueLock,
    #[error("Maximum simultaneous downloads must be between 1 and 64.")]
    InvalidConcurrentDownloadLimit,
    #[error("Bandwidth limits must be no greater than 4 GiB/s.")]
    InvalidBandwidthLimit,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadDirectory {
    pub id: String,
    pub name: String,
    pub display_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentFileSelection {
    pub id: String,
    pub file_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentPreviewFile {
    pub index: usize,
    pub path: String,
    pub filename: String,
    pub size_bytes: String,
    pub extension: Option<String>,
    pub category: TorrentFileCategory,
    pub is_executable_or_script: bool,
    pub selected: bool,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TorrentFileCategory {
    Video,
    Audio,
    Archive,
    Document,
    Other,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExistingTorrent {
    pub id: usize,
    pub name: Option<String>,
    pub state: TorrentState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentPreview {
    pub preview_id: String,
    pub name: String,
    pub info_hash: String,
    pub total_size: String,
    pub piece_count: u32,
    pub trackers: Vec<String>,
    pub is_private: bool,
    pub files: Vec<TorrentPreviewFile>,
    pub existing_torrent: Option<ExistingTorrent>,
}

#[derive(Debug, Clone)]
struct PreparedTorrentPreview {
    metainfo: Bytes,
    info_hash: String,
    file_count: usize,
    file_sizes: Vec<u64>,
    file_paths: Vec<String>,
    source_type: TorrentSourceType,
}

struct PreviewMetadata {
    name: String,
    info_hash: String,
    total_size: u64,
    piece_count: u32,
    trackers: Vec<String>,
    is_private: bool,
    files: Vec<TorrentPreviewFile>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TorrentState {
    Queued,
    Downloading,
    Paused,
    Completed,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QueueMove {
    Up,
    Down,
    Top,
    Bottom,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TorrentSourceType {
    Magnet,
    TorrentFile,
    TorrentUrl,
    #[default]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentPeerStatus {
    /// The remote address is masked before it leaves the service.
    pub address: String,
    pub client: Option<String>,
    pub connection_state: String,
    pub downloaded_bytes: u64,
    pub uploaded_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentDetails {
    pub peers: Option<Vec<TorrentPeerStatus>>,
    pub trackers: Vec<String>,
    pub output_directory: Option<String>,
    pub piece_size_bytes: Option<u64>,
    pub torrent_created_at: Option<u64>,
    pub created_by: Option<String>,
    pub comment: Option<String>,
    pub is_private: Option<bool>,
    pub source_type: TorrentSourceType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentFile {
    pub index: usize,
    pub name: String,
    pub path: String,
    pub size_bytes: String,
    pub downloaded_bytes: String,
    pub progress_percent: f64,
    pub included: bool,
    pub state: TorrentFileState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TorrentFileState {
    Skipped,
    Queued,
    Downloading,
    Paused,
    Completed,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentStatus {
    pub id: usize,
    pub info_hash: String,
    pub name: Option<String>,
    pub total_pieces: u32,
    pub files: Vec<TorrentFile>,
    pub output_directory: String,
    pub state: TorrentState,
    pub error: Option<String>,
    pub progress_percent: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub uploaded_bytes: u64,
    pub download_speed_bytes_per_second: u64,
    pub upload_speed_bytes_per_second: Option<u64>,
    pub connected_peers: Option<usize>,
    pub added_at: u64,
    pub completed_at: Option<u64>,
    pub engine_available: bool,
    pub file_selection_editable: bool,
    pub queue_position: Option<usize>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct QueueState {
    /// Order of unfinished transfers, normalized lowercase info hashes.
    order: Vec<String>,
    /// Transfers intentionally held by the concurrency scheduler.
    waiting: Vec<String>,
}

pub struct TorrentService {
    api: Api,
    session: Arc<Session>,
    directories: Mutex<HashMap<String, PathBuf>>,
    torrent_file_selections: Mutex<HashMap<String, PathBuf>>,
    torrent_previews: Mutex<HashMap<String, PreparedTorrentPreview>>,
    default_directory_id: String,
    persistence: ApplicationPersistence,
    missing_torrent_ids: Mutex<HashMap<usize, String>>,
    queue: Mutex<QueueState>,
    queue_operations: AsyncMutex<()>,
}

impl TorrentService {
    pub async fn new(
        default_output_directory: PathBuf,
        persistence_directory: PathBuf,
        application_state_path: PathBuf,
    ) -> Result<Self, TorrentError> {
        let persistence = ApplicationPersistence::open(application_state_path);
        let fallback_directory = persistence_directory
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("Downloads");
        let default_output_directory = choose_default_directory(
            persistence.last_download_directory(),
            default_output_directory,
            fallback_directory,
            &persistence,
        )?;
        fs::create_dir_all(&persistence_directory)
            .map_err(|error| TorrentError::Engine(error.to_string()))?;
        preserve_invalid_engine_session(&persistence_directory);

        let options = SessionOptions {
            fastresume: true,
            persistence: Some(SessionPersistenceConfig::Json {
                folder: Some(persistence_directory.clone()),
            }),
            ..SessionOptions::default()
        };
        let session = Session::new_with_opts(default_output_directory.clone(), options)
            .await
            .map_err(|error| TorrentError::Engine(error.to_string()))?;
        let service = Self::with_persistence(session, default_output_directory, persistence)?;
        service
            .restore_missing_torrents(&persistence_directory)
            .await?;
        service.apply_startup_resume_preference().await;
        service.get_torrents()?;
        Ok(service)
    }

    #[cfg(test)]
    fn with_session(
        session: Arc<Session>,
        default_output_directory: PathBuf,
    ) -> Result<Self, TorrentError> {
        Self::with_persistence(
            session,
            default_output_directory,
            ApplicationPersistence::in_memory(),
        )
    }

    fn with_persistence(
        session: Arc<Session>,
        default_output_directory: PathBuf,
        persistence: ApplicationPersistence,
    ) -> Result<Self, TorrentError> {
        let api = Api::new(Arc::clone(&session), None);
        let (queue_order, queued_info_hashes) = persistence
            .queue_state()
            .map_err(TorrentError::Persistence)?;
        let service = Self {
            api,
            session,
            directories: Mutex::new(HashMap::new()),
            torrent_file_selections: Mutex::new(HashMap::new()),
            torrent_previews: Mutex::new(HashMap::new()),
            default_directory_id: Uuid::new_v4().to_string(),
            persistence,
            missing_torrent_ids: Mutex::new(HashMap::new()),
            queue: Mutex::new(QueueState {
                order: queue_order,
                waiting: queued_info_hashes,
            }),
            queue_operations: AsyncMutex::new(()),
        };

        service.apply_rate_limits()?;

        let canonical_directory = validate_directory(&default_output_directory)?;
        service
            .directories
            .lock()
            .map_err(|_| TorrentError::DirectoryLock)?
            .insert(service.default_directory_id.clone(), canonical_directory);

        Ok(service)
    }

    pub fn list_download_directories(&self) -> Result<Vec<DownloadDirectory>, TorrentError> {
        let directories = self
            .directories
            .lock()
            .map_err(|_| TorrentError::DirectoryLock)?;

        let mut entries: Vec<_> = directories
            .iter()
            .map(|(id, path)| DownloadDirectory {
                id: id.clone(),
                name: directory_name(path),
                display_path: display_path(path),
            })
            .collect();
        entries.sort_by_key(|entry| entry.id != self.default_directory_id);
        Ok(entries)
    }

    /// Registers a folder chosen through the native folder dialog. The frontend
    /// only receives an opaque token and display name, never a filesystem grant.
    pub fn register_download_directory(
        &self,
        path: PathBuf,
    ) -> Result<DownloadDirectory, TorrentError> {
        let path = validate_directory(&path)?;
        let directory = DownloadDirectory {
            id: Uuid::new_v4().to_string(),
            name: directory_name(&path),
            display_path: display_path(&path),
        };
        self.directories
            .lock()
            .map_err(|_| TorrentError::DirectoryLock)?
            .insert(directory.id.clone(), path);
        let selected_path = self
            .directories
            .lock()
            .map_err(|_| TorrentError::DirectoryLock)?
            .get(&directory.id)
            .cloned()
            .ok_or(TorrentError::UnknownDownloadDirectory)?;
        self.persistence
            .set_last_download_directory(selected_path)
            .map_err(TorrentError::Persistence)?;
        Ok(directory)
    }

    pub fn preferences(&self) -> Result<AppPreferences, TorrentError> {
        self.persistence
            .preferences()
            .map_err(TorrentError::Persistence)
    }

    pub async fn set_preferences(
        &self,
        preferences: AppPreferences,
    ) -> Result<AppPreferences, TorrentError> {
        validate_preferences(&preferences)?;
        self.persistence
            .set_preferences(preferences)
            .map_err(TorrentError::Persistence)?;
        self.apply_rate_limits()?;
        let _guard = self.queue_operations.lock().await;
        self.schedule_queue_locked().await?;
        self.preferences()
    }

    fn apply_rate_limits(&self) -> Result<(), TorrentError> {
        let preferences = self.preferences()?;
        let to_engine_limit = |limit: Option<u64>| -> Result<Option<NonZeroU32>, TorrentError> {
            limit
                .map(|bytes| {
                    u32::try_from(bytes)
                        .ok()
                        .and_then(NonZeroU32::new)
                        .ok_or(TorrentError::InvalidBandwidthLimit)
                })
                .transpose()
        };
        self.session.ratelimits.set_download_bps(to_engine_limit(
            preferences.download_limit_bytes_per_second,
        )?);
        self.session
            .ratelimits
            .set_upload_bps(to_engine_limit(preferences.upload_limit_bytes_per_second)?);
        Ok(())
    }

    fn persist_queue_locked(&self, queue: &QueueState) -> Result<(), TorrentError> {
        self.persistence
            .set_queue_state(queue.order.clone(), queue.waiting.clone())
            .map_err(TorrentError::Persistence)
    }

    fn decorate_torrents(&self, torrents: &mut [TorrentStatus]) -> Result<(), TorrentError> {
        let live_hashes: HashSet<_> = torrents
            .iter()
            .filter(|torrent| torrent.state != TorrentState::Completed)
            .map(|torrent| torrent.info_hash.to_ascii_lowercase())
            .collect();
        let waiting_hashes: HashSet<_> = torrents
            .iter()
            .filter(|torrent| torrent.engine_available && torrent.state != TorrentState::Completed)
            .map(|torrent| torrent.info_hash.to_ascii_lowercase())
            .collect();
        let mut queue = self.queue.lock().map_err(|_| TorrentError::QueueLock)?;
        let previous = queue.clone();
        queue.order.retain(|hash| live_hashes.contains(hash));
        for torrent in torrents
            .iter()
            .filter(|torrent| torrent.state != TorrentState::Completed)
        {
            let hash = torrent.info_hash.to_ascii_lowercase();
            if !queue.order.contains(&hash) {
                queue.order.push(hash);
            }
        }
        let order_hashes: HashSet<_> = queue.order.iter().cloned().collect();
        queue
            .waiting
            .retain(|hash| order_hashes.contains(hash) && waiting_hashes.contains(hash));
        if *queue != previous {
            self.persist_queue_locked(&queue)?;
        }
        for torrent in torrents {
            let hash = torrent.info_hash.to_ascii_lowercase();
            torrent.queue_position = queue
                .waiting
                .iter()
                .position(|entry| entry == &hash)
                .map(|position| position + 1);
            if torrent.queue_position.is_some()
                && torrent.engine_available
                && matches!(torrent.state, TorrentState::Paused | TorrentState::Queued)
            {
                torrent.state = TorrentState::Queued;
            }
        }
        Ok(())
    }

    async fn schedule_queue_locked(&self) -> Result<(), TorrentError> {
        let preferences = self.preferences()?;
        let mut torrents = self.get_torrents()?;
        let waiting_before: HashSet<String> = self
            .queue
            .lock()
            .map_err(|_| TorrentError::QueueLock)?
            .waiting
            .iter()
            .cloned()
            .collect();

        let active = {
            let mut queue = self.queue.lock().map_err(|_| TorrentError::QueueLock)?;
            let previous = queue.clone();
            queue.waiting.retain(|hash| {
                torrents.iter().any(|torrent| {
                    torrent.info_hash.eq_ignore_ascii_case(hash)
                        && torrent.engine_available
                        && torrent.state != TorrentState::Error
                        && torrent.state != TorrentState::Completed
                })
            });

            let mut active: Vec<_> = torrents
                .iter()
                .filter(|torrent| {
                    torrent.state == TorrentState::Downloading
                        || (torrent.state == TorrentState::Queued
                            && !waiting_before.contains(&torrent.info_hash.to_ascii_lowercase()))
                })
                .cloned()
                .collect();
            active.sort_by_key(|torrent| {
                queue
                    .order
                    .iter()
                    .position(|hash| hash.eq_ignore_ascii_case(&torrent.info_hash))
                    .unwrap_or(usize::MAX)
            });
            if *queue != previous {
                self.persist_queue_locked(&queue)?;
            }
            active
        };

        for torrent in active
            .iter()
            .skip(preferences.maximum_simultaneous_downloads)
        {
            self.api
                .api_torrent_action_pause(TorrentIdOrHash::Id(torrent.id))
                .await
                .map_err(|error| TorrentError::Engine(error.to_string()))?;
            let hash = torrent.info_hash.to_ascii_lowercase();
            let mut queue = self.queue.lock().map_err(|_| TorrentError::QueueLock)?;
            if !queue.waiting.contains(&hash) {
                queue.waiting.push(hash);
            }
            self.persist_queue_locked(&queue)?;
        }

        torrents = self.get_torrents()?;
        let waiting = self
            .queue
            .lock()
            .map_err(|_| TorrentError::QueueLock)?
            .waiting
            .clone();
        let active_count = torrents
            .iter()
            .filter(|torrent| {
                torrent.state == TorrentState::Downloading
                    || (torrent.state == TorrentState::Queued
                        && !waiting.contains(&torrent.info_hash.to_ascii_lowercase()))
            })
            .count();
        let mut available_slots = preferences
            .maximum_simultaneous_downloads
            .saturating_sub(active_count);

        for hash in waiting {
            if available_slots == 0 {
                break;
            }
            let Some(torrent) = torrents
                .iter()
                .find(|torrent| torrent.info_hash.eq_ignore_ascii_case(&hash))
            else {
                continue;
            };
            if matches!(torrent.state, TorrentState::Error | TorrentState::Completed) {
                continue;
            }
            self.api
                .api_torrent_action_start(TorrentIdOrHash::Id(torrent.id))
                .await
                .map_err(|error| TorrentError::Engine(error.to_string()))?;
            let mut queue = self.queue.lock().map_err(|_| TorrentError::QueueLock)?;
            queue
                .waiting
                .retain(|entry| !entry.eq_ignore_ascii_case(&hash));
            self.persist_queue_locked(&queue)?;
            available_slots -= 1;
        }
        Ok(())
    }

    pub async fn refresh_torrents(&self) -> Result<Vec<TorrentStatus>, TorrentError> {
        let _guard = self.queue_operations.lock().await;
        self.schedule_queue_locked().await?;
        self.get_torrents()
    }

    pub async fn move_queued_torrent(
        &self,
        id: usize,
        movement: QueueMove,
    ) -> Result<TorrentStatus, TorrentError> {
        let _guard = self.queue_operations.lock().await;
        let current = self.get_torrent_status(id)?;
        let hash = current.info_hash.to_ascii_lowercase();
        let mut queue = self.queue.lock().map_err(|_| TorrentError::QueueLock)?;
        reorder_waiting(&mut queue, &hash, movement)?;
        self.persist_queue_locked(&queue)?;
        drop(queue);
        self.get_torrent_status(id)
    }

    fn remove_from_queue(&self, info_hash: &str) -> Result<(), TorrentError> {
        let hash = info_hash.to_ascii_lowercase();
        let mut queue = self.queue.lock().map_err(|_| TorrentError::QueueLock)?;
        queue.order.retain(|entry| entry != &hash);
        queue.waiting.retain(|entry| entry != &hash);
        self.persist_queue_locked(&queue)
    }

    fn decorate_torrent(&self, status: &mut TorrentStatus) -> Result<(), TorrentError> {
        let queue = self.queue.lock().map_err(|_| TorrentError::QueueLock)?;
        let hash = status.info_hash.to_ascii_lowercase();
        status.queue_position = queue
            .waiting
            .iter()
            .position(|entry| entry == &hash)
            .map(|position| position + 1);
        if status.queue_position.is_some()
            && status.engine_available
            && matches!(status.state, TorrentState::Paused | TorrentState::Queued)
        {
            status.state = TorrentState::Queued;
        }
        Ok(())
    }

    /// Retains a validated torrent file behind an opaque, single-use frontend ID.
    /// The native picker is the only source of paths accepted by this method.
    pub fn register_torrent_file(
        &self,
        torrent_path: PathBuf,
    ) -> Result<TorrentFileSelection, TorrentError> {
        let torrent_path = fs::canonicalize(&torrent_path)
            .map_err(|error| TorrentError::ReadTorrentFile(error.to_string()))?;
        read_torrent_file(&torrent_path)?;
        let file_name = torrent_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .ok_or(TorrentError::InvalidTorrentFile)?;
        let selection = TorrentFileSelection {
            id: Uuid::new_v4().to_string(),
            file_name,
        };
        self.torrent_file_selections
            .lock()
            .map_err(|_| TorrentError::TorrentFileSelectionLock)?
            .insert(selection.id.clone(), torrent_path);
        Ok(selection)
    }

    pub fn discard_torrent_file_selection(&self, selection_id: &str) -> Result<(), TorrentError> {
        self.torrent_file_selections
            .lock()
            .map_err(|_| TorrentError::TorrentFileSelectionLock)?
            .remove(selection_id);
        Ok(())
    }

    pub async fn inspect_magnet(
        &self,
        magnet_link: &str,
        directory_id: &str,
    ) -> Result<TorrentPreview, TorrentError> {
        let magnet_link = validate_magnet(magnet_link)?.to_owned();
        let output_directory = self.validate_output_directory(directory_id)?;
        self.inspect_source(
            AddTorrent::from_url(magnet_link.as_str()),
            &output_directory,
            TorrentSourceType::Magnet,
        )
        .await
    }

    pub async fn inspect_torrent_url(
        &self,
        torrent_url: &str,
        directory_id: &str,
    ) -> Result<TorrentPreview, TorrentError> {
        let torrent_url = validate_torrent_url(torrent_url)?.to_string();
        let output_directory = self.validate_output_directory(directory_id)?;
        self.inspect_source(
            AddTorrent::from_url(torrent_url.as_str()),
            &output_directory,
            TorrentSourceType::TorrentUrl,
        )
        .await
    }

    pub async fn inspect_selected_torrent_file(
        &self,
        selection_id: &str,
        directory_id: &str,
    ) -> Result<TorrentPreview, TorrentError> {
        let output_directory = self.validate_output_directory(directory_id)?;
        let torrent_path = self
            .torrent_file_selections
            .lock()
            .map_err(|_| TorrentError::TorrentFileSelectionLock)?
            .remove(selection_id)
            .ok_or(TorrentError::UnknownTorrentFileSelection)?;

        let result = match read_torrent_file(&torrent_path) {
            Ok(bytes) => {
                self.inspect_source(
                    AddTorrent::from_bytes(bytes),
                    &output_directory,
                    TorrentSourceType::TorrentFile,
                )
                .await
            }
            Err(error) => Err(error),
        };

        if result.is_err() {
            self.torrent_file_selections
                .lock()
                .map_err(|_| TorrentError::TorrentFileSelectionLock)?
                .insert(selection_id.to_string(), torrent_path);
        }
        result
    }

    async fn inspect_source(
        &self,
        source: AddTorrent<'_>,
        output_directory: &Path,
        source_type: TorrentSourceType,
    ) -> Result<TorrentPreview, TorrentError> {
        self.inspect_source_with_options(source, inspection_options(output_directory), source_type)
            .await
    }

    async fn inspect_source_with_options(
        &self,
        source: AddTorrent<'_>,
        options: AddTorrentOptions,
        source_type: TorrentSourceType,
    ) -> Result<TorrentPreview, TorrentError> {
        let response = self
            .session
            .add_torrent(source, Some(options))
            .await
            .map_err(|error| TorrentError::MetadataResolution(error.to_string()))?;

        let (metadata, metainfo) = match response {
            librqbit::AddTorrentResponse::ListOnly(response) => {
                let metainfo = response.torrent_bytes.clone();
                let metadata =
                    preview_metadata(&response.info, response.info_hash.as_string(), &metainfo)?;
                (metadata, metainfo)
            }
            librqbit::AddTorrentResponse::AlreadyManaged(_, handle) => {
                let (metadata, metainfo) = handle
                    .with_metadata(|metadata| {
                        let metainfo = metadata.torrent_bytes.clone();
                        let preview = preview_metadata(
                            &metadata.info,
                            handle.info_hash().as_string(),
                            &metainfo,
                        )?;
                        Ok::<_, TorrentError>((preview, metainfo))
                    })
                    .map_err(|error| TorrentError::MetadataResolution(error.to_string()))??;
                (metadata, metainfo)
            }
            librqbit::AddTorrentResponse::Added(id, _) => {
                let _ = self
                    .api
                    .api_torrent_action_pause(TorrentIdOrHash::Id(id))
                    .await;
                return Err(TorrentError::InspectionStartedTorrent);
            }
        };

        if metainfo.len() as u64 > MAX_TORRENT_FILE_SIZE {
            return Err(TorrentError::TorrentMetadataTooLarge);
        }

        let preview_id = Uuid::new_v4().to_string();
        let file_sizes = metadata
            .files
            .iter()
            .map(|file| {
                file.size_bytes.parse::<u64>().map_err(|_| {
                    TorrentError::InvalidTorrentMetadata(
                        "A torrent file has an invalid size.".to_string(),
                    )
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        let existing_torrent = self
            .find_existing_torrent(&metadata.info_hash)?
            .map(|torrent| ExistingTorrent {
                id: torrent.id,
                name: torrent.name,
                state: torrent.state,
            });
        let prepared = PreparedTorrentPreview {
            info_hash: metadata.info_hash.clone(),
            file_count: metadata.files.len(),
            file_sizes,
            file_paths: metadata
                .files
                .iter()
                .map(|file| file.path.clone())
                .collect(),
            metainfo,
            source_type,
        };
        self.torrent_previews
            .lock()
            .map_err(|_| TorrentError::PreviewLock)?
            .insert(preview_id.clone(), prepared);

        Ok(TorrentPreview {
            preview_id,
            name: metadata.name,
            info_hash: metadata.info_hash,
            total_size: metadata.total_size.to_string(),
            piece_count: metadata.piece_count,
            trackers: metadata.trackers,
            is_private: metadata.is_private,
            files: metadata.files,
            existing_torrent,
        })
    }

    pub fn discard_torrent_preview(&self, preview_id: &str) -> Result<(), TorrentError> {
        self.torrent_previews
            .lock()
            .map_err(|_| TorrentError::PreviewLock)?
            .remove(preview_id);
        Ok(())
    }

    pub async fn start_inspected_torrent(
        &self,
        preview_id: &str,
        directory_id: &str,
        selected_file_indices: &[usize],
        allow_insufficient_space: bool,
    ) -> Result<TorrentStatus, TorrentError> {
        let _guard = self.queue_operations.lock().await;
        let output_directory = self.validate_output_directory(directory_id)?;
        let prepared = self
            .torrent_previews
            .lock()
            .map_err(|_| TorrentError::PreviewLock)?
            .get(preview_id)
            .cloned()
            .ok_or(TorrentError::UnknownTorrentPreview)?;

        if self.find_existing_torrent(&prepared.info_hash)?.is_some() {
            return Err(TorrentError::DuplicateTorrent);
        }

        if selected_file_indices.is_empty() {
            return Err(TorrentError::NoFilesSelected);
        }
        if selected_file_indices.len() > prepared.file_count
            || selected_file_indices
                .iter()
                .any(|index| *index >= prepared.file_count)
        {
            return Err(TorrentError::InvalidFileSelection);
        }
        let mut only_files: Vec<_> = selected_file_indices
            .iter()
            .copied()
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        if only_files.is_empty() {
            return Err(TorrentError::NoFilesSelected);
        }
        only_files.sort_unstable();

        validate_torrent_paths_for_output(&output_directory, &prepared.file_paths)?;
        let selected_bytes = selected_file_size(&prepared.file_sizes, &only_files);
        let available_bytes = self.output_directory_free_space(directory_id)?;
        validate_available_space(selected_bytes, available_bytes, allow_insufficient_space)?;

        let preferences = self.preferences()?;
        let current = self.get_torrents()?;
        let waiting = self
            .queue
            .lock()
            .map_err(|_| TorrentError::QueueLock)?
            .waiting
            .clone();
        let active_count = current
            .iter()
            .filter(|torrent| {
                torrent.state == TorrentState::Downloading
                    || (torrent.state == TorrentState::Queued
                        && torrent.queue_position.is_none()
                        && !waiting.contains(&torrent.info_hash.to_ascii_lowercase()))
            })
            .count();
        let will_queue = preferences.start_downloads_automatically
            && active_count >= preferences.maximum_simultaneous_downloads;
        let response = self
            .api
            .api_add_torrent(
                AddTorrent::from_bytes(prepared.metainfo.clone()),
                Some(AddTorrentOptions {
                    output_folder: Some(output_directory.to_string_lossy().into_owned()),
                    paused: !preferences.start_downloads_automatically || will_queue,
                    only_files: Some(only_files),
                    ..AddTorrentOptions::default()
                }),
            )
            .await
            .map_err(|error| TorrentError::Engine(error.to_string()))?;
        let id = response.id.ok_or_else(|| {
            TorrentError::Engine("The torrent engine did not start the download.".to_string())
        })?;
        let mut status = self.get_torrent_status(id)?;
        if !status.info_hash.eq_ignore_ascii_case(&prepared.info_hash) {
            return Err(TorrentError::Engine(
                "The started torrent did not match its inspected metadata.".to_string(),
            ));
        }
        self.persistence
            .update_torrent(&mut status, output_directory.clone())
            .map_err(TorrentError::Persistence)?;
        self.persistence
            .update_source_type(&status.info_hash, prepared.source_type)
            .map_err(TorrentError::Persistence)?;
        {
            let mut queue = self.queue.lock().map_err(|_| TorrentError::QueueLock)?;
            let hash = status.info_hash.to_ascii_lowercase();
            queue.order.retain(|entry| entry != &hash);
            queue.order.push(hash.clone());
            if will_queue && !queue.waiting.contains(&hash) {
                queue.waiting.push(hash);
            }
            self.persist_queue_locked(&queue)?;
        }
        self.decorate_torrent(&mut status)?;
        self.discard_torrent_preview(preview_id)?;
        Ok(status)
    }

    pub fn default_directory_id(&self) -> &str {
        &self.default_directory_id
    }

    pub fn validate_output_directory(&self, directory_id: &str) -> Result<PathBuf, TorrentError> {
        let path = self
            .directories
            .lock()
            .map_err(|_| TorrentError::DirectoryLock)?
            .get(directory_id)
            .cloned()
            .ok_or(TorrentError::UnknownDownloadDirectory)?;

        validate_directory(&path)
    }

    /// Returns available bytes for a registered destination. `None` means the
    /// platform/filesystem could not provide a reliable free-space estimate.
    pub fn output_directory_free_space(
        &self,
        directory_id: &str,
    ) -> Result<Option<u64>, TorrentError> {
        let directory = self.validate_output_directory(directory_id)?;
        Ok(fs2::available_space(directory).ok())
    }

    fn find_existing_torrent(
        &self,
        info_hash: &str,
    ) -> Result<Option<TorrentStatus>, TorrentError> {
        Ok(self
            .get_torrents()?
            .into_iter()
            .find(|torrent| torrent.info_hash.eq_ignore_ascii_case(info_hash)))
    }

    pub async fn pause_torrent(&self, id: usize) -> Result<TorrentStatus, TorrentError> {
        let _guard = self.queue_operations.lock().await;
        let hash = self.get_torrent_status(id)?.info_hash.to_ascii_lowercase();
        self.api
            .api_torrent_action_pause(TorrentIdOrHash::Id(id))
            .await
            .map_err(|error| TorrentError::Engine(error.to_string()))?;
        {
            let mut queue = self.queue.lock().map_err(|_| TorrentError::QueueLock)?;
            queue.waiting.retain(|entry| entry != &hash);
            self.persist_queue_locked(&queue)?;
        }
        self.schedule_queue_locked().await?;
        let mut status = self.get_torrent_status(id)?;
        self.decorate_torrent(&mut status)?;
        Ok(status)
    }

    pub async fn resume_torrent(&self, id: usize) -> Result<TorrentStatus, TorrentError> {
        self.start_or_queue_torrent(id).await
    }

    pub async fn retry_torrent(&self, id: usize) -> Result<TorrentStatus, TorrentError> {
        self.start_or_queue_torrent(id).await
    }

    async fn start_or_queue_torrent(&self, id: usize) -> Result<TorrentStatus, TorrentError> {
        let _guard = self.queue_operations.lock().await;
        let current = self.get_torrents()?;
        let target = current
            .iter()
            .find(|torrent| torrent.id == id)
            .ok_or_else(|| TorrentError::Status("The torrent is no longer available.".into()))?;
        let hash = target.info_hash.to_ascii_lowercase();
        let preferences = self.preferences()?;
        let active_count = current
            .iter()
            .filter(|torrent| {
                torrent.state == TorrentState::Downloading
                    || (torrent.state == TorrentState::Queued && torrent.queue_position.is_none())
            })
            .count();
        if active_count >= preferences.maximum_simultaneous_downloads {
            if target.state == TorrentState::Error {
                return Err(TorrentError::Engine(
                    "All download slots are in use. Retry this torrent after a slot opens or pause another download.".to_string(),
                ));
            }
            let mut queue = self.queue.lock().map_err(|_| TorrentError::QueueLock)?;
            if !queue.order.contains(&hash) {
                queue.order.push(hash.clone());
            }
            if !queue.waiting.contains(&hash) {
                queue.waiting.push(hash);
            }
            self.persist_queue_locked(&queue)?;
            return self.get_torrent_status(id).and_then(|mut status| {
                self.decorate_torrent(&mut status)?;
                Ok(status)
            });
        }
        {
            let mut queue = self.queue.lock().map_err(|_| TorrentError::QueueLock)?;
            queue.waiting.retain(|entry| entry != &hash);
            if !queue.order.contains(&hash) {
                queue.order.push(hash.clone());
            }
            self.persist_queue_locked(&queue)?;
        }
        self.api
            .api_torrent_action_start(TorrentIdOrHash::Id(id))
            .await
            .map_err(|error| TorrentError::Engine(error.to_string()))?;
        let mut status = self.get_torrent_status(id)?;
        self.decorate_torrent(&mut status)?;
        Ok(status)
    }

    pub async fn update_torrent_file_selection(
        &self,
        id: usize,
        selected_file_indices: &[usize],
    ) -> Result<TorrentStatus, TorrentError> {
        let details = self
            .api
            .api_torrent_details(TorrentIdOrHash::Id(id))
            .map_err(|error| TorrentError::Status(error.to_string()))?;
        if selected_file_indices.is_empty() {
            return Err(TorrentError::NoFilesSelected);
        }
        let file_count = details.files.as_ref().map_or(0, Vec::len);
        if file_count == 0
            || selected_file_indices.len() > file_count
            || selected_file_indices
                .iter()
                .any(|index| *index >= file_count)
        {
            return Err(TorrentError::InvalidFileSelection);
        }
        let stats = self
            .api
            .api_stats_v1(TorrentIdOrHash::Id(id))
            .map_err(|error| TorrentError::Status(error.to_string()))?;
        if !matches!(
            stats.state,
            TorrentStatsState::Live | TorrentStatsState::Paused
        ) {
            return Err(TorrentError::FileSelectionUnavailable);
        }

        let only_files = selected_file_indices
            .iter()
            .copied()
            .collect::<HashSet<_>>();
        self.api
            .api_torrent_action_update_only_files(TorrentIdOrHash::Id(id), &only_files)
            .await
            .map_err(|error| TorrentError::Engine(error.to_string()))?;
        self.get_torrent_status(id)
    }

    /// Remove the session entry without deleting the downloaded data.
    pub async fn remove_torrent(&self, id: usize, delete_files: bool) -> Result<(), TorrentError> {
        let _guard = self.queue_operations.lock().await;
        if let Some(info_hash) = self
            .missing_torrent_ids
            .lock()
            .map_err(|_| TorrentError::ApplicationStateLock)?
            .remove(&id)
        {
            if delete_files {
                return Err(TorrentError::Engine(
                    "Downloaded files cannot be safely removed because the torrent session is unavailable. The saved files were kept.".to_string(),
                ));
            }
            self.persistence
                .remove_torrent(&info_hash)
                .map_err(TorrentError::Persistence)?;
            self.remove_from_queue(&info_hash)?;
            return Ok(());
        }
        let info_hash = self
            .get_torrent_status(id)
            .ok()
            .map(|status| status.info_hash);
        if delete_files {
            self.api
                .api_torrent_action_delete(TorrentIdOrHash::Id(id))
                .await
        } else {
            self.api
                .api_torrent_action_forget(TorrentIdOrHash::Id(id))
                .await
        }
        .map_err(|error| TorrentError::Engine(error.to_string()))?;
        if let Some(info_hash) = info_hash {
            self.persistence
                .remove_torrent(&info_hash)
                .map_err(TorrentError::Persistence)?;
            self.remove_from_queue(&info_hash)?;
        }
        self.schedule_queue_locked().await?;
        Ok(())
    }

    /// Resolve an output directory from rqbit's torrent record, never from a
    /// frontend-provided path.
    pub fn torrent_output_directory(&self, id: usize) -> Result<PathBuf, TorrentError> {
        let details = self
            .api
            .api_torrent_details(TorrentIdOrHash::Id(id))
            .map_err(|error| TorrentError::Status(error.to_string()))?;
        validate_directory(Path::new(&details.output_folder))
    }

    pub fn get_torrents(&self) -> Result<Vec<TorrentStatus>, TorrentError> {
        let listed = self
            .api
            .api_torrent_list_ext(ApiTorrentListOpts { with_stats: true });
        let mut torrents: Vec<_> = listed
            .torrents
            .into_iter()
            .filter_map(|torrent| torrent.id)
            .map(|id| self.get_torrent_status(id))
            .collect::<Result<_, _>>()?;

        let actual_hashes: HashSet<_> = torrents
            .iter()
            .map(|torrent| torrent.info_hash.to_ascii_lowercase())
            .collect();
        let mut used_ids: HashSet<_> = torrents.iter().map(|torrent| torrent.id).collect();
        let mut missing_ids = self
            .missing_torrent_ids
            .lock()
            .map_err(|_| TorrentError::ApplicationStateLock)?;
        missing_ids.clear();
        for record in self
            .persistence
            .torrents()
            .map_err(TorrentError::Persistence)?
            .into_iter()
            .filter(|record| !actual_hashes.contains(&record.info_hash.to_ascii_lowercase()))
        {
            let id = if used_ids.insert(record.id) {
                record.id
            } else {
                let mut candidate = used_ids
                    .iter()
                    .copied()
                    .max()
                    .unwrap_or(0)
                    .saturating_add(1);
                while !used_ids.insert(candidate) {
                    candidate = candidate.saturating_add(1);
                }
                candidate
            };
            missing_ids.insert(id, record.info_hash.clone());
            torrents.push(record.fallback_status(id));
        }
        self.decorate_torrents(&mut torrents)?;
        torrents.sort_by_key(|torrent| {
            let state_order = match torrent.state {
                TorrentState::Downloading => 0,
                TorrentState::Queued => 1,
                TorrentState::Paused => 2,
                TorrentState::Error => 3,
                TorrentState::Completed => 4,
            };
            let queue_position = if torrent.state == TorrentState::Queued {
                torrent.queue_position.unwrap_or(usize::MAX)
            } else {
                0
            };
            (state_order, queue_position)
        });
        Ok(torrents)
    }

    pub fn get_torrent_status(&self, id: usize) -> Result<TorrentStatus, TorrentError> {
        let torrent_id = TorrentIdOrHash::parse(&id.to_string())
            .map_err(|error| TorrentError::Status(error.to_string()))?;
        let details = self
            .api
            .api_torrent_details(torrent_id)
            .map_err(|error| TorrentError::Status(error.to_string()))?;
        let stats = self
            .api
            .api_stats_v1(torrent_id)
            .map_err(|error| TorrentError::Status(error.to_string()))?;
        let connected_peers = self
            .api
            .api_peer_stats(torrent_id, Default::default())
            .ok()
            .map(|snapshot| snapshot.peers.len());
        let output_path = PathBuf::from(&details.output_folder);
        let mut status = status_from_parts(details, stats, connected_peers);
        self.persistence
            .update_torrent(&mut status, output_path)
            .map_err(TorrentError::Persistence)?;
        self.decorate_torrent(&mut status)?;
        Ok(status)
    }

    pub fn get_torrent_details(&self, id: usize) -> Result<TorrentDetails, TorrentError> {
        let torrent_id = TorrentIdOrHash::parse(&id.to_string())
            .map_err(|error| TorrentError::Status(error.to_string()))?;
        let source_type = self
            .persistence
            .source_type_for_id(id)
            .map_err(TorrentError::Persistence)?;
        let saved_output_path = self
            .persistence
            .output_path_for_id(id)
            .map_err(TorrentError::Persistence)?;
        let Some(torrent) = self.session.get(torrent_id) else {
            return Ok(TorrentDetails {
                peers: None,
                trackers: Vec::new(),
                output_directory: saved_output_path.map(|path| path.to_string_lossy().into_owned()),
                piece_size_bytes: None,
                torrent_created_at: None,
                created_by: None,
                comment: None,
                is_private: None,
                source_type,
            });
        };

        let peers = self
            .api
            .api_peer_stats(torrent_id, Default::default())
            .ok()
            .map(|snapshot| {
                let mut peers: Vec<_> = snapshot
                    .peers
                    .into_iter()
                    .map(|(address, peer)| TorrentPeerStatus {
                        address: mask_peer_address(&address),
                        client: peer.client_name,
                        connection_state: peer.state.to_string(),
                        downloaded_bytes: peer.counters.fetched_bytes,
                        uploaded_bytes: peer.counters.uploaded_bytes,
                    })
                    .collect();
                peers.sort_by(|left, right| left.address.cmp(&right.address));
                peers
            });
        let mut trackers: Vec<_> = torrent
            .shared()
            .trackers
            .iter()
            .map(ToString::to_string)
            .collect();
        trackers.sort();
        let metadata = torrent.with_metadata(|metadata| {
            let parsed = librqbit::torrent_from_bytes(&metadata.torrent_bytes).ok();
            (
                Some(metadata.info.info().piece_length as u64),
                Some(metadata.info.info().private),
                parsed.as_ref().and_then(|parsed| {
                    parsed
                        .creation_date
                        .map(|seconds| (seconds as u64).saturating_mul(1000))
                }),
                parsed.as_ref().and_then(|parsed| {
                    parsed
                        .created_by
                        .as_ref()
                        .and_then(|bytes| std::str::from_utf8(bytes.as_ref()).ok())
                        .map(str::to_owned)
                }),
                parsed.as_ref().and_then(|parsed| {
                    parsed
                        .comment
                        .as_ref()
                        .and_then(|bytes| std::str::from_utf8(bytes.as_ref()).ok())
                        .map(str::to_owned)
                }),
            )
        });
        let (piece_size_bytes, is_private, torrent_created_at, created_by, comment) =
            metadata.map_err(|error| TorrentError::MetadataResolution(error.to_string()))?;

        Ok(TorrentDetails {
            peers,
            trackers,
            output_directory: Some(torrent.output_folder().to_string_lossy().into_owned()),
            piece_size_bytes,
            torrent_created_at,
            created_by,
            comment,
            is_private,
            source_type,
        })
    }

    async fn restore_missing_torrents(
        &self,
        persistence_directory: &Path,
    ) -> Result<(), TorrentError> {
        let records = self
            .persistence
            .torrents()
            .map_err(TorrentError::Persistence)?;
        let known_hashes: HashSet<_> = self
            .engine_info_hashes()
            .into_iter()
            .map(|hash| hash.to_ascii_lowercase())
            .collect();
        for record in records {
            if known_hashes.contains(&record.info_hash.to_ascii_lowercase())
                || !is_valid_info_hash(&record.info_hash)
            {
                continue;
            }
            if let Err(error) = fs::create_dir_all(&record.output_path) {
                eprintln!(
                    "Could not recreate saved download folder {}: {error}",
                    record.output_path.display()
                );
                continue;
            }
            let source = cached_torrent_file(persistence_directory, &record.info_hash);
            let add_torrent = match source.and_then(|path| fs::read(path).ok()) {
                Some(bytes) if librqbit::torrent_from_bytes(&bytes).is_ok() => {
                    AddTorrent::from_bytes(bytes)
                }
                _ => AddTorrent::from_url(format!("magnet:?xt=urn:btih:{}", record.info_hash)),
            };
            let options = AddTorrentOptions {
                output_folder: Some(record.output_path.to_string_lossy().into_owned()),
                paused: true,
                only_files: record.selected_file_indices.clone(),
                ..AddTorrentOptions::default()
            };
            if let Err(error) = self.api.api_add_torrent(add_torrent, Some(options)).await {
                eprintln!("Could not restore torrent {}: {error}", record.info_hash);
            }
        }
        Ok(())
    }

    fn engine_info_hashes(&self) -> Vec<String> {
        self.api
            .api_torrent_list_ext(ApiTorrentListOpts { with_stats: false })
            .torrents
            .into_iter()
            .filter_map(|torrent| torrent.id)
            .filter_map(|id| {
                self.api
                    .api_torrent_details(TorrentIdOrHash::Id(id))
                    .ok()
                    .map(|details| details.info_hash)
            })
            .collect()
    }

    async fn apply_startup_resume_preference(&self) {
        let preferences = match self.preferences() {
            Ok(preferences) => preferences,
            Err(error) => {
                eprintln!("Could not load startup preferences: {error}");
                return;
            }
        };
        let mut torrents = match self.get_torrents() {
            Ok(torrents) => torrents,
            Err(error) => {
                eprintln!("Could not restore the torrent queue: {error}");
                return;
            }
        };
        let order = match self.queue.lock() {
            Ok(queue) => queue.order.clone(),
            Err(_) => return,
        };
        torrents.sort_by_key(|torrent| {
            order
                .iter()
                .position(|hash| hash.eq_ignore_ascii_case(&torrent.info_hash))
                .unwrap_or(usize::MAX)
        });
        if let Ok(mut queue) = self.queue.lock() {
            queue.waiting.clear();
        }

        let mut active = 0usize;
        for torrent in torrents
            .into_iter()
            .filter(|torrent| torrent.state != TorrentState::Completed && torrent.engine_available)
        {
            let should_run = preferences.resume_unfinished_on_startup
                && active < preferences.maximum_simultaneous_downloads;
            let result = if should_run {
                match torrent.state {
                    TorrentState::Downloading => {
                        active += 1;
                        continue;
                    }
                    TorrentState::Paused | TorrentState::Queued => {
                        self.api
                            .api_torrent_action_start(TorrentIdOrHash::Id(torrent.id))
                            .await
                    }
                    TorrentState::Error | TorrentState::Completed => continue,
                }
            } else {
                if matches!(
                    torrent.state,
                    TorrentState::Downloading | TorrentState::Queued
                ) {
                    self.api
                        .api_torrent_action_pause(TorrentIdOrHash::Id(torrent.id))
                        .await
                } else if torrent.state == TorrentState::Paused {
                    if preferences.resume_unfinished_on_startup {
                        if let Ok(mut queue) = self.queue.lock() {
                            queue.waiting.push(torrent.info_hash.to_ascii_lowercase());
                        }
                    }
                    continue;
                } else {
                    continue;
                }
            };
            match result {
                Ok(_) if should_run => active += 1,
                Ok(_) => {
                    if preferences.resume_unfinished_on_startup {
                        if let Ok(mut queue) = self.queue.lock() {
                            queue.waiting.push(torrent.info_hash.to_ascii_lowercase());
                        }
                    }
                }
                Err(error) => eprintln!("Could not restore torrent {}: {error}", torrent.id),
            }
        }
        if let Ok(queue) = self.queue.lock() {
            if let Err(error) = self.persist_queue_locked(&queue) {
                eprintln!("Could not persist restored queue order: {error}");
            }
        }
    }
}

fn validate_directory(path: &Path) -> Result<PathBuf, TorrentError> {
    let canonical = fs::canonicalize(path)
        .map_err(|error| TorrentError::DownloadDirectory(error.to_string()))?;
    if !canonical.is_dir() {
        return Err(TorrentError::DownloadDirectory(
            "the selected location is not a folder".to_string(),
        ));
    }
    Ok(canonical)
}

fn validate_preferences(preferences: &AppPreferences) -> Result<(), TorrentError> {
    if !(1..=64).contains(&preferences.maximum_simultaneous_downloads) {
        return Err(TorrentError::InvalidConcurrentDownloadLimit);
    }
    if preferences
        .download_limit_bytes_per_second
        .into_iter()
        .chain(preferences.upload_limit_bytes_per_second)
        .any(|limit| limit > u32::MAX as u64)
    {
        return Err(TorrentError::InvalidBandwidthLimit);
    }
    Ok(())
}

fn reorder_waiting(
    queue: &mut QueueState,
    info_hash: &str,
    movement: QueueMove,
) -> Result<(), TorrentError> {
    let Some(index) = queue.waiting.iter().position(|entry| entry == info_hash) else {
        return Err(TorrentError::Engine(
            "Only queued downloads can be reordered.".to_string(),
        ));
    };
    let value = queue.waiting.remove(index);
    let destination = match movement {
        QueueMove::Up => index.saturating_sub(1),
        QueueMove::Down => (index + 1).min(queue.waiting.len()),
        QueueMove::Top => 0,
        QueueMove::Bottom => queue.waiting.len(),
    };
    queue.waiting.insert(destination, value);
    let waiting_set: HashSet<_> = queue.waiting.iter().cloned().collect();
    let waiting_order = queue.waiting.clone();
    queue.order.retain(|entry| !waiting_set.contains(entry));
    queue.order.extend(waiting_order);
    Ok(())
}

pub(super) fn choose_default_directory(
    remembered: Option<PathBuf>,
    system_default: PathBuf,
    app_data_fallback: PathBuf,
    persistence: &ApplicationPersistence,
) -> Result<PathBuf, TorrentError> {
    if let Some(path) = remembered {
        if path.is_dir() {
            if let Ok(path) = fs::canonicalize(path) {
                return Ok(path);
            }
        }
        persistence
            .clear_last_download_directory()
            .map_err(TorrentError::Persistence)?;
    }

    for candidate in [system_default, app_data_fallback] {
        if fs::create_dir_all(&candidate).is_ok() {
            if let Ok(canonical) = fs::canonicalize(&candidate) {
                if canonical.is_dir() {
                    return Ok(canonical);
                }
            }
        }
    }
    Err(TorrentError::DownloadDirectory(
        "neither the system Downloads folder nor the app data download folder is available"
            .to_string(),
    ))
}

#[derive(Deserialize)]
struct EngineSessionFile {
    torrents: HashMap<usize, EngineSessionTorrent>,
}

#[derive(Deserialize)]
struct EngineSessionTorrent {
    info_hash: String,
    trackers: HashSet<String>,
    output_folder: PathBuf,
    only_files: Option<Vec<usize>>,
    is_paused: bool,
}

fn preserve_invalid_engine_session(persistence_directory: &Path) {
    let session_path = persistence_directory.join("session.json");
    let bytes = match fs::read(&session_path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
        Err(error) => {
            eprintln!("Could not inspect rqbit session state: {error}");
            return;
        }
    };
    let is_valid = serde_json::from_slice::<EngineSessionFile>(&bytes)
        .map(|database| {
            database.torrents.values().all(|torrent| {
                let _ = (
                    &torrent.trackers,
                    &torrent.output_folder,
                    &torrent.only_files,
                    torrent.is_paused,
                );
                is_valid_info_hash(&torrent.info_hash)
            })
        })
        .unwrap_or(false);
    if is_valid {
        return;
    }
    let backup = persistence_directory.join(format!("session.json.corrupt-{}", now_millis()));
    match fs::rename(&session_path, &backup) {
        Ok(()) => eprintln!(
            "Moved unreadable rqbit session state to {}.",
            backup.display()
        ),
        Err(error) => eprintln!("Could not preserve unreadable rqbit session state: {error}"),
    }
}

fn is_valid_info_hash(info_hash: &str) -> bool {
    info_hash.len() == 40 && info_hash.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn cached_torrent_file(persistence_directory: &Path, info_hash: &str) -> Option<PathBuf> {
    [
        info_hash.to_ascii_lowercase(),
        info_hash.to_ascii_uppercase(),
    ]
    .into_iter()
    .map(|hash| persistence_directory.join(format!("{hash}.torrent")))
    .find(|path| path.is_file())
}

fn directory_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| path.display().to_string())
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn read_torrent_file(torrent_path: &Path) -> Result<Vec<u8>, TorrentError> {
    if !torrent_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("torrent"))
    {
        return Err(TorrentError::InvalidTorrentFile);
    }

    let metadata = fs::metadata(torrent_path)
        .map_err(|error| TorrentError::ReadTorrentFile(error.to_string()))?;
    if !metadata.is_file() {
        return Err(TorrentError::InvalidTorrentFile);
    }
    if metadata.len() > MAX_TORRENT_FILE_SIZE {
        return Err(TorrentError::TorrentFileTooLarge);
    }
    let bytes =
        fs::read(torrent_path).map_err(|error| TorrentError::ReadTorrentFile(error.to_string()))?;
    librqbit::torrent_from_bytes(&bytes)
        .map_err(|error| TorrentError::InvalidTorrentMetadata(error.to_string()))?;
    Ok(bytes)
}

fn validate_torrent_url(input: &str) -> Result<Url, TorrentError> {
    let url = Url::parse(input.trim()).map_err(|_| TorrentError::InvalidTorrentUrl)?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(TorrentError::InvalidTorrentUrl);
    }
    Ok(url)
}

fn validate_magnet(input: &str) -> Result<&str, TorrentError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(TorrentError::EmptyMagnet);
    }
    if !trimmed.starts_with("magnet:?") {
        return Err(TorrentError::InvalidMagnet(
            "link must start with magnet:?".to_string(),
        ));
    }
    Magnet::parse(trimmed).map_err(|error| TorrentError::InvalidMagnet(error.to_string()))?;
    Ok(trimmed)
}

fn inspection_options(output_directory: &Path) -> AddTorrentOptions {
    AddTorrentOptions {
        list_only: true,
        output_folder: Some(output_directory.to_string_lossy().into_owned()),
        ..AddTorrentOptions::default()
    }
}

fn validate_torrent_path_components(components: &[String]) -> Result<(), TorrentError> {
    if components.is_empty()
        || components.iter().any(|component| {
            component.is_empty()
                || matches!(component.as_str(), "." | "..")
                || component.contains('/')
                || component.contains('\\')
                || component.contains(':')
                || component.chars().any(char::is_control)
                || Path::new(component).is_absolute()
        })
    {
        return Err(TorrentError::InvalidTorrentMetadata(
            "A torrent file contains an unsafe path component.".to_string(),
        ));
    }
    Ok(())
}

fn validate_torrent_paths_for_output(
    output_directory: &Path,
    paths: &[String],
) -> Result<(), TorrentError> {
    let root = validate_directory(output_directory)?;
    for path in paths {
        let components: Vec<String> = path.split('/').map(str::to_owned).collect();
        validate_torrent_path_components(&components)
            .map_err(|_| TorrentError::UnsafeTorrentPath)?;
        let mut current = root.clone();
        for component in components {
            current.push(component);
            match fs::symlink_metadata(&current) {
                Ok(_) => {
                    let canonical =
                        fs::canonicalize(&current).map_err(|_| TorrentError::UnsafeTorrentPath)?;
                    if !canonical.starts_with(&root) {
                        return Err(TorrentError::UnsafeTorrentPath);
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
                Err(error) => {
                    return Err(TorrentError::DownloadDirectory(error.to_string()));
                }
            }
        }
    }
    Ok(())
}

fn classify_torrent_file(extension: Option<&str>) -> (TorrentFileCategory, bool) {
    let extension = extension.unwrap_or_default().to_ascii_lowercase();
    let category = if matches!(
        extension.as_str(),
        "mkv"
            | "mp4"
            | "avi"
            | "mov"
            | "wmv"
            | "flv"
            | "webm"
            | "m4v"
            | "mpg"
            | "mpeg"
            | "ts"
            | "m2ts"
            | "vob"
            | "3gp"
            | "ogv"
    ) {
        TorrentFileCategory::Video
    } else if matches!(
        extension.as_str(),
        "mp3" | "flac" | "wav" | "aac" | "ogg" | "opus" | "m4a" | "wma" | "alac"
    ) {
        TorrentFileCategory::Audio
    } else if matches!(
        extension.as_str(),
        "zip" | "7z" | "rar" | "tar" | "gz" | "bz2" | "xz" | "zst" | "tgz" | "iso"
    ) {
        TorrentFileCategory::Archive
    } else if matches!(
        extension.as_str(),
        "pdf"
            | "txt"
            | "md"
            | "rtf"
            | "doc"
            | "docx"
            | "xls"
            | "xlsx"
            | "ppt"
            | "pptx"
            | "odt"
            | "ods"
            | "odp"
            | "csv"
            | "epub"
    ) {
        TorrentFileCategory::Document
    } else {
        TorrentFileCategory::Other
    };
    let is_executable_or_script = matches!(
        extension.as_str(),
        "exe" | "msi" | "bat" | "cmd" | "ps1" | "scr" | "js" | "vbs"
    );
    (category, is_executable_or_script)
}

fn validate_available_space(
    selected_bytes: u64,
    available_bytes: Option<u64>,
    allow_insufficient_space: bool,
) -> Result<(), TorrentError> {
    if !allow_insufficient_space {
        if let Some(available_bytes) = available_bytes {
            if selected_bytes > available_bytes {
                return Err(TorrentError::InsufficientDiskSpace {
                    selected_bytes,
                    available_bytes,
                });
            }
        }
    }
    Ok(())
}

fn selected_file_size(file_sizes: &[u64], selected_indices: &[usize]) -> u64 {
    selected_indices.iter().fold(0_u64, |total, index| {
        total.saturating_add(file_sizes[*index])
    })
}

fn preview_metadata<ByteBuf: AsRef<[u8]>>(
    info: &librqbit::ValidatedTorrentMetaV1Info<ByteBuf>,
    info_hash: String,
    metainfo: &[u8],
) -> Result<PreviewMetadata, TorrentError> {
    if metainfo.len() as u64 > MAX_TORRENT_FILE_SIZE {
        return Err(TorrentError::TorrentMetadataTooLarge);
    }

    let files = info
        .iter_file_details()
        .enumerate()
        .map(|(index, file)| {
            let components = file.filename.to_vec();
            let Some(filename) = components.last() else {
                return Err(TorrentError::InvalidTorrentMetadata(
                    "A torrent file has an empty path.".to_string(),
                ));
            };
            validate_torrent_path_components(&components)?;

            let extension = Path::new(filename)
                .extension()
                .and_then(|extension| extension.to_str())
                .filter(|extension| !extension.is_empty())
                .map(str::to_ascii_lowercase);
            let (category, is_executable_or_script) = classify_torrent_file(extension.as_deref());

            Ok(TorrentPreviewFile {
                index,
                path: components.join("/"),
                filename: filename.clone(),
                size_bytes: file.len.to_string(),
                extension,
                category,
                is_executable_or_script,
                selected: true,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    let mut seen_trackers = HashSet::new();
    let trackers = librqbit::torrent_from_bytes(metainfo)
        .ok()
        .map(|torrent| {
            torrent
                .iter_announce()
                .filter_map(|tracker| std::str::from_utf8(tracker.as_ref()).ok())
                .filter(|tracker| seen_trackers.insert((*tracker).to_string()))
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();

    Ok(PreviewMetadata {
        name: info
            .name()
            .map(|name| name.into_owned())
            .unwrap_or_else(|| "Unnamed torrent".to_string()),
        info_hash,
        total_size: info.lengths().total_length(),
        piece_count: info.lengths().total_pieces(),
        trackers,
        is_private: info.info().private,
        files,
    })
}

fn status_from_parts(
    details: librqbit::api::TorrentDetailsResponse,
    stats: TorrentStats,
    connected_peers: Option<usize>,
) -> TorrentStatus {
    let state = torrent_state_from_engine(stats.state, stats.finished);
    let progress_percent = if stats.total_bytes == 0 {
        0.0
    } else {
        (stats.progress_bytes as f64 / stats.total_bytes as f64 * 100.0).clamp(0.0, 100.0)
    };
    let (download_speed_bytes_per_second, upload_speed_bytes_per_second) = stats
        .live
        .as_ref()
        .map(|live| {
            (
                live.download_speed.as_bytes(),
                Some(live.upload_speed.as_bytes()),
            )
        })
        .unwrap_or((0, None));

    let files = details.files.unwrap_or_default();
    TorrentStatus {
        id: details.id.unwrap_or_default(),
        info_hash: details.info_hash,
        name: details.name,
        total_pieces: details.total_pieces,
        files: files
            .into_iter()
            .enumerate()
            .map(|(index, file)| {
                let downloaded_bytes = stats
                    .file_progress
                    .get(index)
                    .copied()
                    .unwrap_or_default()
                    .min(file.length);
                let progress_percent = if file.length == 0 {
                    100.0
                } else {
                    downloaded_bytes as f64 / file.length as f64 * 100.0
                };
                let file_state = if !file.included {
                    TorrentFileState::Skipped
                } else if progress_percent >= 100.0 {
                    TorrentFileState::Completed
                } else {
                    match state {
                        TorrentState::Queued => TorrentFileState::Queued,
                        TorrentState::Downloading => TorrentFileState::Downloading,
                        TorrentState::Paused => TorrentFileState::Paused,
                        TorrentState::Completed => TorrentFileState::Completed,
                        TorrentState::Error => TorrentFileState::Error,
                    }
                };
                TorrentFile {
                    index,
                    name: file.name,
                    path: file.components.join("/"),
                    size_bytes: file.length.to_string(),
                    downloaded_bytes: downloaded_bytes.to_string(),
                    progress_percent,
                    included: file.included,
                    state: file_state,
                }
            })
            .collect(),
        output_directory: directory_name(Path::new(&details.output_folder)),
        state,
        error: stats.error,
        progress_percent,
        downloaded_bytes: stats.progress_bytes,
        total_bytes: stats.total_bytes,
        uploaded_bytes: stats.uploaded_bytes,
        download_speed_bytes_per_second,
        upload_speed_bytes_per_second,
        connected_peers,
        added_at: 0,
        completed_at: None,
        engine_available: true,
        file_selection_editable: matches!(
            stats.state,
            TorrentStatsState::Live | TorrentStatsState::Paused
        ),
        queue_position: None,
    }
}

fn mask_peer_address(address: &str) -> String {
    use std::net::{IpAddr, SocketAddr};

    match address.parse::<SocketAddr>().map(|socket| socket.ip()) {
        Ok(IpAddr::V4(ip)) => {
            let octets = ip.octets();
            format!("{}.{}.{}.*", octets[0], octets[1], octets[2])
        }
        Ok(IpAddr::V6(ip)) => {
            let segments = ip.segments();
            format!(
                "{:x}:{:x}:{:x}:{:x}::/64",
                segments[0], segments[1], segments[2], segments[3]
            )
        }
        Err(_) => "Peer address hidden".to_string(),
    }
}

fn torrent_state_from_engine(state: TorrentStatsState, finished: bool) -> TorrentState {
    match state {
        TorrentStatsState::Initializing { paused: true } => TorrentState::Paused,
        TorrentStatsState::Initializing { paused: false } => TorrentState::Queued,
        TorrentStatsState::Live if finished => TorrentState::Completed,
        TorrentStatsState::Live => TorrentState::Downloading,
        TorrentStatsState::Paused => TorrentState::Paused,
        TorrentStatsState::Error => TorrentState::Error,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    const ONE_BYTE_TORRENT: &[u8] = b"d4:infod6:lengthi1e4:name5:hello12:piece lengthi16384e6:pieces20:\x11\xf6\xad\x8e\xc5\x2a\x29\x84\xab\xaa\xfd\x7c\x3b\x51\x65\x03\x78\x5c\x20\x72ee";
    const COMPLETE_TORRENT: &[u8] = b"d4:infod6:lengthi5e4:name5:world12:piece lengthi16384e6:pieces20:\x7c\x21\x14\x33\xf0\x20\x71\x59\x77\x41\xe6\xff\x5a\x8e\xa3\x47\x89\xab\xbf\x43ee";
    const NESTED_TORRENT: &[u8] = b"d4:infod5:filesld6:lengthi3e4:pathl4:disc7:one.mkveed6:lengthi5e4:pathl4:disc7:two.srteee4:name4:Show12:piece lengthi16384e6:pieces20:\x11\xf6\xad\x8e\xc5\x2a\x29\x84\xab\xaa\xfd\x7c\x3b\x51\x65\x03\x78\x5c\x20\x72ee";

    #[test]
    fn queue_order_supports_top_up_down_and_bottom_moves() {
        let mut queue = QueueState {
            order: vec!["active".into(), "a".into(), "b".into(), "c".into()],
            waiting: vec!["a".into(), "b".into(), "c".into()],
        };
        reorder_waiting(&mut queue, "b", QueueMove::Up).expect("move up");
        assert_eq!(queue.waiting, ["b", "a", "c"]);
        reorder_waiting(&mut queue, "b", QueueMove::Down).expect("move down");
        assert_eq!(queue.waiting, ["a", "b", "c"]);
        reorder_waiting(&mut queue, "c", QueueMove::Top).expect("move to top");
        assert_eq!(queue.waiting, ["c", "a", "b"]);
        reorder_waiting(&mut queue, "c", QueueMove::Bottom).expect("move to bottom");
        assert_eq!(queue.waiting, ["a", "b", "c"]);
        assert_eq!(queue.order, ["active", "a", "b", "c"]);
    }

    #[test]
    fn concurrent_download_and_bandwidth_preferences_are_validated() {
        let mut preferences = AppPreferences::default();
        assert!(validate_preferences(&preferences).is_ok());
        preferences.maximum_simultaneous_downloads = 0;
        assert!(matches!(
            validate_preferences(&preferences),
            Err(TorrentError::InvalidConcurrentDownloadLimit)
        ));
        preferences.maximum_simultaneous_downloads = 2;
        preferences.download_limit_bytes_per_second = Some(u32::MAX as u64 + 1);
        assert!(matches!(
            validate_preferences(&preferences),
            Err(TorrentError::InvalidBandwidthLimit)
        ));
    }

    #[tokio::test]
    async fn global_bandwidth_preferences_configure_librqbit_limits() {
        let temp = tempfile::tempdir().expect("temporary test directory");
        let output = temp.path().join("downloads");
        fs::create_dir_all(&output).expect("create downloads");
        let session = Session::new_with_opts(
            output.clone(),
            SessionOptions {
                dht: None,
                listen: None,
                persistence: None,
                ..SessionOptions::default()
            },
        )
        .await
        .expect("create test session");
        let service = TorrentService::with_session(session, output).expect("service");
        let mut preferences = service.preferences().expect("default preferences");
        preferences.maximum_simultaneous_downloads = 2;
        preferences.download_limit_bytes_per_second = Some(512 * 1024);
        preferences.upload_limit_bytes_per_second = Some(2 * 1024 * 1024);
        service
            .set_preferences(preferences)
            .await
            .expect("save network preferences");
        let limits = service.session.ratelimits.get_config();
        assert_eq!(limits.download_bps, NonZeroU32::new(512 * 1024));
        assert_eq!(limits.upload_bps, NonZeroU32::new(2 * 1024 * 1024));
        assert_eq!(
            service
                .preferences()
                .unwrap()
                .maximum_simultaneous_downloads,
            2
        );
        service.api.session().stop().await;
    }

    #[tokio::test]
    async fn concurrency_limit_queues_downloads_and_starts_the_next_in_order() {
        async fn add(service: &TorrentService, bytes: &[u8]) -> TorrentStatus {
            let destination = service
                .validate_output_directory(service.default_directory_id())
                .expect("registered destination");
            let preview = service
                .inspect_source(
                    AddTorrent::from_bytes(bytes.to_vec()),
                    &destination,
                    TorrentSourceType::TorrentFile,
                )
                .await
                .expect("inspect torrent");
            let file_indices = preview
                .files
                .iter()
                .map(|file| file.index)
                .collect::<Vec<_>>();
            service
                .start_inspected_torrent(
                    &preview.preview_id,
                    service.default_directory_id(),
                    &file_indices,
                    false,
                )
                .await
                .expect("add torrent")
        }

        let temp = tempfile::tempdir().expect("temporary test directory");
        let output = temp.path().join("downloads");
        fs::create_dir_all(&output).expect("create downloads");
        let session = Session::new_with_opts(
            output.clone(),
            SessionOptions {
                dht: None,
                listen: None,
                persistence: None,
                ..SessionOptions::default()
            },
        )
        .await
        .expect("create test session");
        let service = TorrentService::with_session(session, output).expect("service");
        let mut preferences = service.preferences().expect("default preferences");
        preferences.maximum_simultaneous_downloads = 1;
        service
            .set_preferences(preferences)
            .await
            .expect("set concurrency limit");

        let first = add(&service, ONE_BYTE_TORRENT).await;
        let second = add(&service, COMPLETE_TORRENT).await;
        let third = add(&service, NESTED_TORRENT).await;
        assert_eq!(second.state, TorrentState::Queued);
        assert_eq!(second.queue_position, Some(1));
        assert_eq!(third.state, TorrentState::Queued);
        assert_eq!(third.queue_position, Some(2));

        service
            .move_queued_torrent(third.id, QueueMove::Top)
            .await
            .expect("promote third torrent");
        service
            .pause_torrent(first.id)
            .await
            .expect("pause active torrent");
        let refreshed = service.refresh_torrents().await.expect("refresh queue");
        let next = refreshed
            .iter()
            .find(|torrent| torrent.id == third.id)
            .unwrap();
        let remaining = refreshed
            .iter()
            .find(|torrent| torrent.id == second.id)
            .unwrap();
        assert_eq!(
            next.queue_position, None,
            "the promoted torrent took the free slot"
        );
        assert_eq!(remaining.queue_position, Some(1));
        service.api.session().stop().await;
    }

    // The skipped README occupies its own later piece; earlier files share the selected file's first piece.
    fn multi_file_download_torrent() -> Vec<u8> {
        let mut info = b"d5:filesl".to_vec();
        info.extend_from_slice(b"d6:lengthi3e4:pathl4:disc7:one.mkvee");
        info.extend_from_slice(b"d6:lengthi5e4:pathl4:disc7:two.srtee");
        info.extend_from_slice(b"d6:lengthi16376e4:pathl4:disc10:filler.binee");
        info.extend_from_slice(b"d6:lengthi4e4:pathl5:extra10:readme.txtee");
        info.extend_from_slice(b"e4:name4:Show12:piece lengthi16384e6:pieces40:");
        info.extend_from_slice(&[
            0x62, 0x14, 0x23, 0xd0, 0xca, 0xa5, 0x22, 0xd0, 0xc4, 0x31, 0x59, 0xb9, 0x2a, 0x8f,
            0x81, 0xe4, 0x2d, 0xfb, 0xe8, 0x01, 0xa5, 0xfd, 0xf1, 0xff, 0x3c, 0xe3, 0x70, 0x9f,
            0x66, 0x39, 0x67, 0xe2, 0x4c, 0x0a, 0xb1, 0x4e, 0x6e, 0x9d, 0x04, 0xbe,
        ]);
        info.push(b'e');
        let mut metainfo = b"d4:info".to_vec();
        metainfo.extend_from_slice(&info);
        metainfo.push(b'e');
        metainfo
    }

    #[test]
    fn accepts_a_valid_magnet_and_rejects_invalid_inputs() {
        let valid = "magnet:?xt=urn:btih:0123456789012345678901234567890123456789&dn=sample";
        assert!(validate_magnet(valid).is_ok());
        assert!(matches!(
            validate_magnet("not a magnet"),
            Err(TorrentError::InvalidMagnet(_))
        ));
        assert!(matches!(
            validate_magnet(" "),
            Err(TorrentError::EmptyMagnet)
        ));
    }

    #[test]
    fn torrent_paths_are_portable_unicode_and_reject_escape_components() {
        assert!(
            validate_torrent_path_components(&["展示".to_string(), "résumé.mp4".to_string(),])
                .is_ok()
        );
        for unsafe_component in ["..", ".", "C:", "../outside", "folder\\file", "/root"] {
            assert!(
                validate_torrent_path_components(&[
                    unsafe_component.to_string(),
                    "file.txt".to_string(),
                ])
                .is_err(),
                "component should be rejected: {unsafe_component}"
            );
        }
        assert_eq!(
            classify_torrent_file(Some("MKV")),
            (TorrentFileCategory::Video, false)
        );
        assert_eq!(
            classify_torrent_file(Some("Mp3")),
            (TorrentFileCategory::Audio, false)
        );
        assert_eq!(
            classify_torrent_file(Some("ZIP")),
            (TorrentFileCategory::Archive, false)
        );
        assert_eq!(
            classify_torrent_file(Some("pdf")),
            (TorrentFileCategory::Document, false)
        );
        for extension in ["exe", "msi", "bat", "cmd", "ps1", "scr", "js", "vbs"] {
            assert_eq!(
                classify_torrent_file(Some(extension)),
                (TorrentFileCategory::Other, true),
                "extension should be listed as executable or script: {extension}"
            );
        }
    }

    #[test]
    fn insufficient_space_is_rejected_unless_the_user_explicitly_overrides() {
        assert!(matches!(
            validate_available_space(11, Some(10), false),
            Err(TorrentError::InsufficientDiskSpace {
                selected_bytes: 11,
                available_bytes: 10
            })
        ));
        assert!(validate_available_space(10, Some(10), false).is_ok());
        assert!(validate_available_space(11, None, false).is_ok());
        assert!(validate_available_space(11, Some(10), true).is_ok());
        assert_eq!(selected_file_size(&[1_000, 2_000, 3_000], &[0, 2]), 4_000);
    }

    #[test]
    fn output_path_validation_keeps_files_under_the_selected_folder() {
        let temp = tempfile::tempdir().expect("temporary directory");
        let destination = temp.path().join("destination");
        fs::create_dir_all(&destination).expect("create destination");
        assert!(
            validate_torrent_paths_for_output(&destination, &["folder/資料.txt".to_string()])
                .is_ok()
        );
        assert!(matches!(
            validate_torrent_paths_for_output(&destination, &["folder/../outside.txt".to_string()]),
            Err(TorrentError::UnsafeTorrentPath)
        ));
    }

    #[tokio::test]
    async fn large_unicode_file_lists_are_inspected_without_starting_a_torrent() {
        let temp = tempfile::tempdir().expect("temporary directory");
        let output = temp.path().join("downloads");
        fs::create_dir_all(&output).expect("create downloads");
        let mut info = b"d5:filesl".to_vec();
        for index in 0..3_000 {
            let filename = format!("資料-{index:05}.pdf");
            info.extend_from_slice(b"d6:lengthi1e4:pathl");
            info.extend_from_slice(format!("{}:", filename.len()).as_bytes());
            info.extend_from_slice(filename.as_bytes());
            info.extend_from_slice(b"ee");
        }
        info.extend_from_slice(b"e4:name6:Bundle12:piece lengthi16384e6:pieces20:");
        info.extend_from_slice(&[0; 20]);
        let mut metainfo = b"d4:info".to_vec();
        metainfo.extend_from_slice(&info);
        metainfo.extend_from_slice(b"ee");

        let session = Session::new_with_opts(
            output.clone(),
            SessionOptions {
                dht: None,
                listen: None,
                persistence: None,
                ..SessionOptions::default()
            },
        )
        .await
        .expect("create test session");
        let service = TorrentService::with_session(session, output.clone()).expect("service");
        let preview = service
            .inspect_source(
                AddTorrent::from_bytes(metainfo),
                &output,
                TorrentSourceType::TorrentFile,
            )
            .await
            .expect("inspect the large torrent");

        assert_eq!(preview.files.len(), 3_000);
        assert_eq!(preview.files[0].filename, "資料-00000.pdf");
        assert!(preview.files.iter().all(|file| {
            file.category == TorrentFileCategory::Document && file.size_bytes == "1"
        }));
        assert!(service.get_torrents().expect("list torrents").is_empty());
        service.api.session().stop().await;
    }

    #[tokio::test]
    async fn free_space_query_uses_a_validated_directory_handle() {
        let temp = tempfile::tempdir().expect("temporary directory");
        let default_directory = temp.path().join("downloads");
        fs::create_dir_all(&default_directory).expect("create downloads");
        let session = Session::new_with_opts(
            default_directory.clone(),
            SessionOptions {
                dht: None,
                listen: None,
                persistence: None,
                ..SessionOptions::default()
            },
        )
        .await
        .expect("create test session");
        let service = TorrentService::with_session(session, default_directory).expect("service");
        assert!(service
            .output_directory_free_space(service.default_directory_id())
            .expect("query free space")
            .is_some());
        service.api.session().stop().await;
    }

    #[test]
    fn accepts_http_and_https_torrent_urls_only() {
        assert!(validate_torrent_url("https://example.test/file.torrent").is_ok());
        assert!(validate_torrent_url("http://example.test/file.torrent").is_ok());
        assert!(validate_torrent_url("file:///tmp/file.torrent").is_err());
        assert!(validate_torrent_url("javascript:alert(1)").is_err());
        assert!(validate_torrent_url("https://user:secret@example.test/file.torrent").is_err());
    }

    #[test]
    fn parses_a_local_torrent_file_and_rejects_bad_metainfo() {
        // Valid, single-file, zero-byte torrent metainfo.
        let bytes = b"d4:infod6:lengthi0e4:name5:hello12:piece lengthi16384e6:pieces0:ee";
        let parsed = librqbit::torrent_from_bytes(bytes).expect("valid torrent metadata");
        assert_eq!(
            parsed.info.data.name.as_ref().map(|name| name.as_ref()),
            Some(&b"hello"[..])
        );
        assert!(librqbit::torrent_from_bytes(b"not a torrent").is_err());
    }

    #[test]
    fn rejects_an_invalid_torrent_file_before_registering_it() {
        let temp = tempfile::tempdir().expect("temporary test directory");
        let path = temp.path().join("invalid.torrent");
        fs::write(&path, b"not a torrent").expect("write invalid torrent data");

        assert!(matches!(
            read_torrent_file(&path),
            Err(TorrentError::InvalidTorrentMetadata(_))
        ));
    }

    #[test]
    fn inspection_options_use_the_selected_output_directory_without_starting() {
        let options = inspection_options(Path::new("C:/downloads/selected"));
        assert_eq!(
            options.output_folder.as_deref(),
            Some("C:/downloads/selected")
        );
        assert!(options.list_only);
        assert!(options.only_files.is_none());
    }

    #[test]
    fn completed_engine_state_maps_to_the_app_completed_state() {
        assert_eq!(
            torrent_state_from_engine(TorrentStatsState::Live, true),
            TorrentState::Completed
        );
        assert_eq!(
            torrent_state_from_engine(TorrentStatsState::Live, false),
            TorrentState::Downloading
        );
    }

    #[test]
    fn peer_addresses_are_masked_without_exposing_ports() {
        assert_eq!(mask_peer_address("192.0.2.47:51413"), "192.0.2.*");
        assert_eq!(
            mask_peer_address("[2001:db8:abcd:12::8]:51413"),
            "2001:db8:abcd:12::/64"
        );
        assert_eq!(mask_peer_address("unknown peer"), "Peer address hidden");
    }

    #[tokio::test]
    async fn selected_output_directory_is_used_when_adding_a_local_torrent() {
        let temp = tempfile::tempdir().expect("temporary test directory");
        let default_directory = temp.path().join("default");
        let selected_directory = temp.path().join("selected");
        fs::create_dir_all(&default_directory).expect("default output directory");
        fs::create_dir_all(&selected_directory).expect("selected output directory");

        let session = Session::new_with_opts(
            default_directory.clone(),
            SessionOptions {
                dht: None,
                listen: None,
                persistence: None,
                ..SessionOptions::default()
            },
        )
        .await
        .expect("create test session");
        let service =
            TorrentService::with_session(session, default_directory).expect("create test service");
        let selected = service
            .register_download_directory(selected_directory)
            .expect("register the chosen folder");
        let torrent_file = temp.path().join("sample.torrent");
        fs::write(&torrent_file, ONE_BYTE_TORRENT).expect("write torrent metadata");

        let file_selection = service
            .register_torrent_file(torrent_file.clone())
            .expect("stage the selected file without starting it");
        assert_eq!(file_selection.file_name, "sample.torrent");

        let preview = service
            .inspect_selected_torrent_file(&file_selection.id, &selected.id)
            .await
            .expect("inspect the selected local torrent");

        assert_eq!(preview.name, "hello");
        assert_eq!(preview.total_size, "1");
        assert_eq!(preview.files.len(), 1);
        assert_eq!(preview.files[0].path, "hello");
        assert_eq!(preview.files[0].size_bytes, "1");
        assert!(service.get_torrents().expect("read queue").is_empty());

        let added = service
            .start_inspected_torrent(&preview.preview_id, &selected.id, &[0], false)
            .await
            .expect("start the inspected local torrent");

        assert_eq!(added.output_directory, "selected");
        assert_eq!(added.total_bytes, 1);

        let duplicate_file = service
            .register_torrent_file(torrent_file)
            .expect("stage the existing torrent again");
        let duplicate_preview = service
            .inspect_selected_torrent_file(&duplicate_file.id, &selected.id)
            .await
            .expect("inspect the duplicate torrent");
        let duplicate = duplicate_preview
            .existing_torrent
            .as_ref()
            .expect("duplicate metadata is returned");
        assert_eq!(duplicate.id, added.id);
        assert!(matches!(
            service
                .start_inspected_torrent(&duplicate_preview.preview_id, &selected.id, &[0], false)
                .await,
            Err(TorrentError::DuplicateTorrent)
        ));
        assert!(matches!(
            service
                .inspect_selected_torrent_file(&file_selection.id, &selected.id)
                .await,
            Err(TorrentError::UnknownTorrentFileSelection)
        ));
        service.api.session().stop().await;
    }

    #[tokio::test]
    async fn torrent_can_pause_resume_and_be_removed_while_keeping_files() {
        let temp = tempfile::tempdir().expect("temporary test directory");
        let default_directory = temp.path().join("default");
        let selected_directory = temp.path().join("selected");
        fs::create_dir_all(&default_directory).expect("default output directory");
        fs::create_dir_all(&selected_directory).expect("selected output directory");
        let preserved_file = selected_directory.join("preserve-me.txt");
        fs::write(&preserved_file, b"downloaded data").expect("write preserved data");

        let session = Session::new_with_opts(
            default_directory.clone(),
            SessionOptions {
                dht: None,
                listen: None,
                persistence: None,
                ..SessionOptions::default()
            },
        )
        .await
        .expect("create test session");
        let service =
            TorrentService::with_session(session, default_directory).expect("create test service");
        let selected = service
            .register_download_directory(selected_directory.clone())
            .expect("register the chosen folder");
        let torrent_file = temp.path().join("sample.torrent");
        fs::write(&torrent_file, ONE_BYTE_TORRENT).expect("write torrent metadata");
        let file_selection = service
            .register_torrent_file(torrent_file)
            .expect("stage torrent metadata");
        let preview = service
            .inspect_selected_torrent_file(&file_selection.id, &selected.id)
            .await
            .expect("inspect torrent metadata");
        let added = service
            .start_inspected_torrent(&preview.preview_id, &selected.id, &[0], false)
            .await
            .expect("start inspected torrent");
        let details = service
            .get_torrent_details(added.id)
            .expect("read torrent technical details");
        assert_eq!(details.piece_size_bytes, Some(16_384));
        assert_eq!(details.is_private, Some(false));
        assert_eq!(details.source_type, TorrentSourceType::TorrentFile);
        assert_eq!(
            PathBuf::from(details.output_directory.as_deref().expect("saved location")),
            fs::canonicalize(&selected_directory).expect("canonical selected folder")
        );

        assert_eq!(
            service
                .torrent_output_directory(added.id)
                .expect("resolve its registered output folder"),
            fs::canonicalize(&selected_directory).expect("canonical selected folder")
        );
        let paused = service
            .pause_torrent(added.id)
            .await
            .expect("pause the torrent");
        assert_eq!(paused.state, TorrentState::Paused);

        let resumed = service
            .resume_torrent(added.id)
            .await
            .expect("resume the torrent");
        assert_ne!(resumed.state, TorrentState::Paused);

        service
            .remove_torrent(added.id, false)
            .await
            .expect("remove torrent without deleting its files");
        assert_eq!(
            fs::read(&preserved_file).expect("preserved file remains"),
            b"downloaded data"
        );
        assert!(matches!(
            service.get_torrent_status(added.id),
            Err(TorrentError::Status(_))
        ));
        service.api.session().stop().await;
    }

    #[tokio::test]
    async fn file_selection_updates_use_stable_indices_after_adding() {
        let temp = tempfile::tempdir().expect("temporary test directory");
        let output_directory = temp.path().join("downloads");
        fs::create_dir_all(&output_directory).expect("output directory");
        let session = Session::new_with_opts(
            output_directory.clone(),
            SessionOptions {
                dht: None,
                listen: None,
                persistence: None,
                ..SessionOptions::default()
            },
        )
        .await
        .expect("create test session");
        let service =
            TorrentService::with_session(session, output_directory).expect("create test service");
        let directory = service
            .list_download_directories()
            .expect("list folders")
            .into_iter()
            .next()
            .expect("default output directory");
        let torrent_path = temp.path().join("nested.torrent");
        fs::write(&torrent_path, NESTED_TORRENT).expect("write nested torrent");
        let selection = service
            .register_torrent_file(torrent_path)
            .expect("register local torrent");
        let preview = service
            .inspect_selected_torrent_file(&selection.id, &directory.id)
            .await
            .expect("inspect nested torrent");
        let added = service
            .start_inspected_torrent(&preview.preview_id, &directory.id, &[1], false)
            .await
            .expect("start with only the second file selected");

        let mut status = added;
        for _ in 0..50 {
            if status.file_selection_editable {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            status = service
                .get_torrent_status(status.id)
                .expect("wait for rqbit initialization");
        }
        assert!(status.file_selection_editable);
        assert_eq!(status.files.len(), 2);
        assert_eq!(status.files[0].index, 0);
        assert_eq!(status.files[0].path, "disc/one.mkv");
        assert!(!status.files[0].included);
        assert_eq!(status.files[1].index, 1);
        assert_eq!(status.files[1].path, "disc/two.srt");
        assert!(status.files[1].included);

        let paused = service
            .pause_torrent(status.id)
            .await
            .expect("pause before changing the selection");
        let updated = service
            .update_torrent_file_selection(paused.id, &[0])
            .await
            .expect("select the first file after adding");
        assert_eq!(updated.files[0].index, 0);
        assert!(updated.files[0].included);
        assert_eq!(updated.files[1].index, 1);
        assert!(!updated.files[1].included);
        assert_eq!(updated.files[0].size_bytes, "3");
        assert_eq!(updated.files[1].size_bytes, "5");
        assert!(matches!(
            service
                .update_torrent_file_selection(updated.id, &[2])
                .await,
            Err(TorrentError::InvalidFileSelection)
        ));
        service.api.session().stop().await;
    }

    #[tokio::test]
    async fn only_selected_file_payload_is_downloaded_from_a_local_peer() {
        let temp = tempfile::tempdir().expect("temporary test directory");
        let seed_directory = temp.path().join("seed");
        let client_directory = temp.path().join("client");
        fs::create_dir_all(seed_directory.join("disc")).expect("create nested seed folder");
        fs::create_dir_all(seed_directory.join("extra")).expect("create extra seed folder");
        fs::create_dir_all(&client_directory).expect("create client folder");
        fs::write(seed_directory.join("disc/one.mkv"), b"abc").expect("seed first file");
        fs::write(seed_directory.join("disc/two.srt"), b"12345").expect("seed selected file");
        fs::write(seed_directory.join("disc/filler.bin"), vec![b'f'; 16_376])
            .expect("seed boundary-piece filler");
        fs::write(seed_directory.join("extra/readme.txt"), b"WXYZ").expect("seed skipped file");
        let metainfo = multi_file_download_torrent();
        let parsed = librqbit::torrent_from_bytes(&metainfo).expect("parse download fixture");

        let seeder = Session::new_with_opts(
            seed_directory.clone(),
            SessionOptions {
                dht: None,
                listen: Some(librqbit::ListenerOptions {
                    listen_addr: "127.0.0.1:0".parse().expect("ephemeral peer port"),
                    ..Default::default()
                }),
                persistence: None,
                ..SessionOptions::default()
            },
        )
        .await
        .expect("create local seeder");
        let seed_handle = seeder
            .add_torrent(
                AddTorrent::from_bytes(metainfo.clone()),
                Some(AddTorrentOptions {
                    output_folder: Some(seed_directory.to_string_lossy().into_owned()),
                    overwrite: true,
                    ..AddTorrentOptions::default()
                }),
            )
            .await
            .expect("add local seed torrent")
            .into_handle()
            .expect("get local seed handle");
        seed_handle
            .wait_until_initialized()
            .await
            .expect("initialize local seeder");
        let peer = seeder.listen_addr().expect("local seeder peer address");

        let client_session = Session::new_with_opts(
            client_directory.clone(),
            SessionOptions {
                dht: None,
                listen: None,
                persistence: None,
                ..SessionOptions::default()
            },
        )
        .await
        .expect("create selective-download client");
        let service = TorrentService::with_session(client_session, client_directory.clone())
            .expect("create selective-download service");
        let directory = service
            .list_download_directories()
            .expect("list output folders")
            .into_iter()
            .next()
            .expect("client output folder");
        let output_directory = service
            .validate_output_directory(&directory.id)
            .expect("validate client destination");
        let torrent_file = temp.path().join("selective.torrent");
        fs::write(&torrent_file, &metainfo).expect("write local metainfo");
        let file_grant = service
            .register_torrent_file(torrent_file)
            .expect("stage local metainfo");
        let preview = service
            .inspect_selected_torrent_file(&file_grant.id, &directory.id)
            .await
            .expect("inspect multi-file metainfo");
        assert_eq!(preview.files[1].index, 1);
        assert_eq!(preview.files[1].path, "disc/two.srt");
        assert_eq!(preview.files[3].index, 3);
        assert_eq!(preview.files[3].path, "extra/readme.txt");
        assert_eq!(preview.info_hash, parsed.info_hash.as_string());

        let response = service
            .api
            .api_add_torrent(
                AddTorrent::from_bytes(metainfo),
                Some(AddTorrentOptions {
                    output_folder: Some(output_directory.to_string_lossy().into_owned()),
                    only_files: Some(vec![preview.files[1].index]),
                    initial_peers: Some(vec![peer]),
                    ..AddTorrentOptions::default()
                }),
            )
            .await
            .expect("start download for the selected file only");
        let torrent_id = response.id.expect("selective torrent id");
        let selected_path = output_directory.join("disc/two.srt");
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(8);
        while tokio::time::Instant::now() < deadline {
            if fs::read(&selected_path).ok().as_deref() == Some(&b"12345"[..]) {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }
        assert_eq!(
            fs::read(&selected_path).expect("selected file payload downloaded"),
            b"12345"
        );
        let status = service
            .get_torrent_status(torrent_id)
            .expect("retrieve selective download status");
        assert!(status.files[1].included);
        assert_eq!(status.files[1].downloaded_bytes, "5");
        assert!(!status.files[3].included);
        assert_eq!(status.files[3].downloaded_bytes, "0");

        service.api.session().stop().await;
        seeder.stop().await;
    }

    #[tokio::test]
    async fn torrent_url_fetches_and_inspects_metainfo_without_starting() {
        let temp = tempfile::tempdir().expect("temporary test directory");
        let output_directory = temp.path().join("downloads");
        fs::create_dir_all(&output_directory).expect("output directory");
        let session = Session::new_with_opts(
            output_directory.clone(),
            SessionOptions {
                dht: None,
                listen: None,
                persistence: None,
                ..SessionOptions::default()
            },
        )
        .await
        .expect("create test session");
        let service =
            TorrentService::with_session(session, output_directory).expect("create test service");
        let directory = service
            .list_download_directories()
            .expect("list registered folders")
            .into_iter()
            .next()
            .expect("default folder is registered");

        let listener = TcpListener::bind("127.0.0.1:0").expect("bind a local test server");
        let address = listener.local_addr().expect("local server address");
        let server = thread::spawn(move || {
            let (mut connection, _) = listener.accept().expect("accept the torrent request");
            let mut request = [0_u8; 2048];
            let _ = connection.read(&mut request).expect("read HTTP request");
            write!(
                connection,
                "HTTP/1.1 200 OK\r\nContent-Type: application/x-bittorrent\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                ONE_BYTE_TORRENT.len()
            )
            .expect("write HTTP headers");
            connection
                .write_all(ONE_BYTE_TORRENT)
                .expect("write torrent metainfo");
        });

        let url = format!("http://{address}/sample.torrent");
        let preview = service
            .inspect_torrent_url(&url, &directory.id)
            .await
            .expect("fetch and inspect torrent metainfo from HTTP");
        server.join().expect("join local torrent server");

        assert_eq!(preview.name, "hello");
        assert_eq!(preview.total_size, "1");
        assert_eq!(preview.files[0].size_bytes, "1");
        assert!(service.get_torrents().expect("read queue").is_empty());
        service.api.session().stop().await;
    }

    #[tokio::test]
    async fn inspection_reports_nested_files_and_exact_sizes_without_starting() {
        let temp = tempfile::tempdir().expect("temporary test directory");
        let output_directory = temp.path().join("downloads");
        fs::create_dir_all(&output_directory).expect("output directory");
        let session = Session::new_with_opts(
            output_directory.clone(),
            SessionOptions {
                dht: None,
                listen: None,
                persistence: None,
                ..SessionOptions::default()
            },
        )
        .await
        .expect("create test session");
        let service =
            TorrentService::with_session(session, output_directory).expect("create test service");
        let directory = service
            .list_download_directories()
            .expect("list folders")
            .into_iter()
            .next()
            .expect("default output directory");
        let torrent_path = temp.path().join("nested.torrent");
        fs::write(&torrent_path, NESTED_TORRENT).expect("write nested torrent");
        let selection = service
            .register_torrent_file(torrent_path)
            .expect("register local torrent");

        let preview = service
            .inspect_selected_torrent_file(&selection.id, &directory.id)
            .await
            .expect("inspect nested torrent");

        assert_eq!(preview.name, "Show");
        assert_eq!(preview.total_size, "8");
        assert_eq!(preview.files.len(), 2);
        assert_eq!(preview.files[0].index, 0);
        assert_eq!(preview.files[0].path, "disc/one.mkv");
        assert_eq!(preview.files[0].size_bytes, "3");
        assert_eq!(preview.files[1].path, "disc/two.srt");
        assert_eq!(preview.files[1].size_bytes, "5");
        assert!(preview.files.iter().all(|file| file.selected));
        assert!(service.get_torrents().expect("read queue").is_empty());
        assert!(matches!(
            service
                .start_inspected_torrent(&preview.preview_id, &directory.id, &[], false)
                .await,
            Err(TorrentError::NoFilesSelected)
        ));
        assert!(matches!(
            service
                .start_inspected_torrent(&preview.preview_id, &directory.id, &[usize::MAX], false)
                .await,
            Err(TorrentError::InvalidFileSelection)
        ));
        assert!(service.get_torrents().expect("read queue").is_empty());
        let started = service
            .start_inspected_torrent(&preview.preview_id, &directory.id, &[1], false)
            .await
            .expect("start only the selected file");
        assert_eq!(started.output_directory, "downloads");
        assert_eq!(
            started
                .files
                .iter()
                .filter(|file| file.included)
                .map(|file| file.size_bytes.parse::<u64>().expect("numeric file size"))
                .sum::<u64>(),
            5
        );
        service.api.session().stop().await;
    }

    #[tokio::test]
    async fn magnet_metadata_is_resolved_from_a_local_peer_without_starting_content() {
        let temp = tempfile::tempdir().expect("temporary test directory");
        let seed_directory = temp.path().join("seed");
        let client_directory = temp.path().join("client");
        fs::create_dir_all(&seed_directory).expect("seed directory");
        fs::create_dir_all(&client_directory).expect("client directory");
        fs::write(seed_directory.join("hello"), b"x").expect("prepare seed file");

        let seeder = Session::new_with_opts(
            seed_directory.clone(),
            SessionOptions {
                dht: None,
                listen: Some(librqbit::ListenerOptions {
                    listen_addr: "127.0.0.1:0".parse().expect("ephemeral peer port"),
                    ..Default::default()
                }),
                persistence: None,
                ..SessionOptions::default()
            },
        )
        .await
        .expect("create local seeder");
        let seed_handle = seeder
            .add_torrent(
                AddTorrent::from_bytes(ONE_BYTE_TORRENT.to_vec()),
                Some(AddTorrentOptions {
                    output_folder: Some(seed_directory.to_string_lossy().into_owned()),
                    overwrite: true,
                    ..AddTorrentOptions::default()
                }),
            )
            .await
            .expect("add torrent metadata to seeder")
            .into_handle()
            .expect("seed torrent handle");
        seed_handle
            .wait_until_initialized()
            .await
            .expect("initialize seeder");
        let peer = seeder.listen_addr().expect("seeder peer address");

        let client_session = Session::new_with_opts(
            client_directory.clone(),
            SessionOptions {
                dht: None,
                listen: None,
                persistence: None,
                ..SessionOptions::default()
            },
        )
        .await
        .expect("create metadata client");
        let service = TorrentService::with_session(client_session, client_directory.clone())
            .expect("create metadata client service");
        let output_id = service
            .list_download_directories()
            .expect("list download directories")
            .into_iter()
            .next()
            .expect("client output folder")
            .id;
        let output_directory = service
            .validate_output_directory(&output_id)
            .expect("validate client output folder");
        let metainfo =
            librqbit::torrent_from_bytes(ONE_BYTE_TORRENT).expect("parse fixture metainfo");
        let magnet = format!("magnet:?xt=urn:btih:{}", metainfo.info_hash.as_string());
        let preview = tokio::time::timeout(
            std::time::Duration::from_secs(8),
            service.inspect_source_with_options(
                AddTorrent::from_url(magnet.as_str()),
                AddTorrentOptions {
                    list_only: true,
                    output_folder: Some(output_directory.to_string_lossy().into_owned()),
                    initial_peers: Some(vec![peer]),
                    ..AddTorrentOptions::default()
                },
                TorrentSourceType::Magnet,
            ),
        )
        .await
        .expect("magnet metadata resolution timed out")
        .expect("resolve magnet metadata from the local peer");

        assert_eq!(preview.name, "hello");
        assert_eq!(preview.total_size, "1");
        assert!(service
            .get_torrents()
            .expect("read client queue")
            .is_empty());
        service.api.session().stop().await;
        seeder.stop().await;
    }

    #[tokio::test]
    async fn rqbit_session_and_application_metadata_survive_restart() {
        let temp = tempfile::tempdir().expect("temporary test directory");
        let default_directory = temp.path().join("downloads");
        let selected_directory = temp.path().join("selected");
        let rqbit_directory = temp.path().join("rqbit");
        let app_state_path = temp.path().join("application-state.json");
        fs::create_dir_all(&default_directory).expect("default download directory");
        fs::create_dir_all(&selected_directory).expect("selected download directory");
        fs::write(selected_directory.join("world"), b"world").expect("prepare completed data");

        let session = Session::new_with_opts(
            default_directory.clone(),
            SessionOptions {
                dht: None,
                listen: None,
                fastresume: true,
                persistence: Some(SessionPersistenceConfig::Json {
                    folder: Some(rqbit_directory.clone()),
                }),
                ..SessionOptions::default()
            },
        )
        .await
        .expect("create persistent test session");
        let service = TorrentService::with_persistence(
            session,
            default_directory.clone(),
            ApplicationPersistence::open(app_state_path.clone()),
        )
        .expect("create service with persistence");
        let selected = service
            .register_download_directory(selected_directory.clone())
            .expect("remember selected folder");
        let pending_path = temp.path().join("pending.torrent");
        let completed_path = temp.path().join("completed.torrent");
        fs::write(&pending_path, NESTED_TORRENT).expect("write pending metainfo");
        fs::write(&completed_path, COMPLETE_TORRENT).expect("write completed metainfo");
        let pending_selection = service
            .register_torrent_file(pending_path)
            .expect("register unfinished torrent");
        let pending_preview = service
            .inspect_selected_torrent_file(&pending_selection.id, &selected.id)
            .await
            .expect("inspect unfinished torrent");
        let pending = service
            .start_inspected_torrent(&pending_preview.preview_id, &selected.id, &[1], false)
            .await
            .expect("start unfinished torrent");
        let pending = service
            .pause_torrent(pending.id)
            .await
            .expect("pause unfinished torrent before restart");
        let saved_pending = service
            .persistence
            .torrents()
            .expect("read saved torrent metadata")
            .into_iter()
            .find(|record| record.info_hash == pending.info_hash)
            .expect("unfinished torrent persistence record");
        assert_eq!(saved_pending.selected_file_indices, Some(vec![1]));
        let completed_response = service
            .api
            .api_add_torrent(
                AddTorrent::from_bytes(fs::read(&completed_path).expect("read completed metainfo")),
                Some(AddTorrentOptions {
                    output_folder: Some(selected_directory.to_string_lossy().into_owned()),
                    overwrite: true,
                    ..AddTorrentOptions::default()
                }),
            )
            .await
            .expect("add completed torrent");
        let completed_id = completed_response.id.expect("completed torrent id");
        let mut completed = service
            .get_torrent_status(completed_id)
            .expect("read completed torrent status");
        for _ in 0..50 {
            if completed.state == TorrentState::Completed {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            completed = service
                .get_torrent_status(completed_id)
                .expect("check completed torrent");
        }
        assert_eq!(completed.state, TorrentState::Completed);
        let pending_added_at = pending.added_at;
        let completed_at = completed.completed_at;
        service.api.session().stop().await;

        let restored_session = Session::new_with_opts(
            selected_directory.clone(),
            SessionOptions {
                dht: None,
                listen: None,
                fastresume: true,
                persistence: Some(SessionPersistenceConfig::Json {
                    folder: Some(rqbit_directory),
                }),
                ..SessionOptions::default()
            },
        )
        .await
        .expect("restore persistent test session");
        let restored_service = TorrentService::with_persistence(
            restored_session,
            selected_directory.clone(),
            ApplicationPersistence::open(app_state_path),
        )
        .expect("create restored service");
        restored_service.apply_startup_resume_preference().await;
        let mut restored = restored_service
            .get_torrents()
            .expect("retrieve restored queue");
        let completed_id = restored
            .iter()
            .find(|torrent| torrent.info_hash == completed.info_hash)
            .expect("completed torrent session entry")
            .id;
        for _ in 0..80 {
            if restored.iter().any(|torrent| {
                torrent.info_hash == completed.info_hash && torrent.state == TorrentState::Completed
            }) {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            restored = restored_service
                .get_torrents()
                .expect("refresh restored queue");
        }

        let restored_pending = restored
            .iter()
            .find(|torrent| torrent.info_hash == pending.info_hash)
            .expect("unfinished torrent survives restart");
        let restored_completed = restored
            .iter()
            .find(|torrent| torrent.info_hash == completed.info_hash)
            .expect("completed torrent survives restart");
        assert_eq!(restored_pending.added_at, pending_added_at);
        assert_ne!(restored_pending.state, TorrentState::Paused);
        assert_eq!(restored_pending.files.len(), 2);
        assert!(!restored_pending.files[0].included);
        assert!(restored_pending.files[1].included);
        assert_eq!(restored_completed.state, TorrentState::Completed);
        assert_eq!(restored_completed.completed_at, completed_at);
        assert_eq!(restored_completed.id, completed_id);
        let completed_duplicate = restored_service
            .find_existing_torrent(&completed.info_hash)
            .expect("check completed history");
        assert_eq!(
            completed_duplicate.map(|torrent| torrent.state),
            Some(TorrentState::Completed)
        );
        let restored_details = restored_service
            .get_torrent_details(restored_pending.id)
            .expect("read restored torrent details");
        assert_eq!(restored_details.source_type, TorrentSourceType::TorrentFile);
        assert_eq!(
            PathBuf::from(
                restored_details
                    .output_directory
                    .as_deref()
                    .expect("restored output path")
            ),
            fs::canonicalize(&selected_directory).expect("canonical selected folder")
        );
        assert_eq!(
            restored_service
                .torrent_output_directory(restored_pending.id)
                .expect("restored output folder"),
            fs::canonicalize(selected_directory).expect("canonical selected folder")
        );
        restored_service.api.session().stop().await;
    }

    #[test]
    fn malformed_rqbit_session_is_moved_aside_for_recovery() {
        let temp = tempfile::tempdir().expect("temporary test directory");
        let engine_directory = temp.path().join("rqbit");
        fs::create_dir_all(&engine_directory).expect("create engine folder");
        let session_path = engine_directory.join("session.json");
        fs::write(&session_path, b"{broken").expect("write malformed session");

        preserve_invalid_engine_session(&engine_directory);

        assert!(!session_path.exists());
        assert!(fs::read_dir(&engine_directory)
            .expect("list engine state")
            .any(|entry| entry
                .expect("engine state entry")
                .file_name()
                .to_string_lossy()
                .contains("session.json.corrupt-")));
    }
}
