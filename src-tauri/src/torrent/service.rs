use std::{
    collections::HashMap,
    collections::HashSet,
    fs,
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
    pub selected: bool,
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
}

#[derive(Debug, Clone)]
struct PreparedTorrentPreview {
    metainfo: Bytes,
    info_hash: String,
    file_count: usize,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentFile {
    pub name: String,
    pub size_bytes: u64,
    pub included: bool,
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
        let service = Self {
            api,
            session,
            directories: Mutex::new(HashMap::new()),
            torrent_file_selections: Mutex::new(HashMap::new()),
            torrent_previews: Mutex::new(HashMap::new()),
            default_directory_id: Uuid::new_v4().to_string(),
            persistence,
            missing_torrent_ids: Mutex::new(HashMap::new()),
        };

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

    pub fn set_preferences(
        &self,
        preferences: AppPreferences,
    ) -> Result<AppPreferences, TorrentError> {
        self.persistence
            .set_preferences(preferences)
            .map_err(TorrentError::Persistence)?;
        self.preferences()
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
                self.inspect_source(AddTorrent::from_bytes(bytes), &output_directory)
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
    ) -> Result<TorrentPreview, TorrentError> {
        self.inspect_source_with_options(source, inspection_options(output_directory))
            .await
    }

    async fn inspect_source_with_options(
        &self,
        source: AddTorrent<'_>,
        options: AddTorrentOptions,
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
        let prepared = PreparedTorrentPreview {
            info_hash: metadata.info_hash.clone(),
            file_count: metadata.files.len(),
            metainfo,
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
    ) -> Result<TorrentStatus, TorrentError> {
        let output_directory = self.validate_output_directory(directory_id)?;
        let prepared = self
            .torrent_previews
            .lock()
            .map_err(|_| TorrentError::PreviewLock)?
            .get(preview_id)
            .cloned()
            .ok_or(TorrentError::UnknownTorrentPreview)?;

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

        let start_automatically = self.preferences()?.start_downloads_automatically;
        let response = self
            .api
            .api_add_torrent(
                AddTorrent::from_bytes(prepared.metainfo.clone()),
                Some(AddTorrentOptions {
                    output_folder: Some(output_directory.to_string_lossy().into_owned()),
                    paused: !start_automatically,
                    only_files: Some(only_files),
                    ..AddTorrentOptions::default()
                }),
            )
            .await
            .map_err(|error| TorrentError::Engine(error.to_string()))?;
        let id = response.id.ok_or_else(|| {
            TorrentError::Engine("The torrent engine did not start the download.".to_string())
        })?;
        let status = self.get_torrent_status(id)?;
        if !status.info_hash.eq_ignore_ascii_case(&prepared.info_hash) {
            return Err(TorrentError::Engine(
                "The started torrent did not match its inspected metadata.".to_string(),
            ));
        }
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

    pub async fn pause_torrent(&self, id: usize) -> Result<TorrentStatus, TorrentError> {
        self.api
            .api_torrent_action_pause(TorrentIdOrHash::Id(id))
            .await
            .map_err(|error| TorrentError::Engine(error.to_string()))?;
        self.get_torrent_status(id)
    }

    pub async fn resume_torrent(&self, id: usize) -> Result<TorrentStatus, TorrentError> {
        self.start_torrent(id).await
    }

    pub async fn retry_torrent(&self, id: usize) -> Result<TorrentStatus, TorrentError> {
        self.start_torrent(id).await
    }

    async fn start_torrent(&self, id: usize) -> Result<TorrentStatus, TorrentError> {
        self.api
            .api_torrent_action_start(TorrentIdOrHash::Id(id))
            .await
            .map_err(|error| TorrentError::Engine(error.to_string()))?;
        self.get_torrent_status(id)
    }

    /// Remove the session entry without deleting the downloaded data.
    pub async fn remove_torrent(&self, id: usize) -> Result<(), TorrentError> {
        if let Some(info_hash) = self
            .missing_torrent_ids
            .lock()
            .map_err(|_| TorrentError::ApplicationStateLock)?
            .remove(&id)
        {
            self.persistence
                .remove_torrent(&info_hash)
                .map_err(TorrentError::Persistence)?;
            return Ok(());
        }
        let info_hash = self
            .get_torrent_status(id)
            .ok()
            .map(|status| status.info_hash);
        self.api
            .api_torrent_action_forget(TorrentIdOrHash::Id(id))
            .await
            .map_err(|error| TorrentError::Engine(error.to_string()))?;
        if let Some(info_hash) = info_hash {
            self.persistence
                .remove_torrent(&info_hash)
                .map_err(TorrentError::Persistence)?;
        }
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
        Ok(status)
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
        let resume = self.preferences()?.resume_unfinished_on_startup;

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
                paused: !resume,
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
        let resume = match self.preferences() {
            Ok(preferences) => preferences.resume_unfinished_on_startup,
            Err(error) => {
                eprintln!("Could not load startup preference: {error}");
                return;
            }
        };
        for attempt in 0..10 {
            let ids: Vec<_> = self
                .api
                .api_torrent_list_ext(ApiTorrentListOpts { with_stats: true })
                .torrents
                .into_iter()
                .filter_map(|torrent| torrent.id)
                .collect();
            let mut pending_initialization = false;
            for id in ids {
                let Ok(status) = self.get_torrent_status(id) else {
                    continue;
                };
                let should_start =
                    resume && matches!(status.state, TorrentState::Paused | TorrentState::Queued);
                let should_pause = !resume
                    && matches!(
                        status.state,
                        TorrentState::Downloading | TorrentState::Queued
                    );
                if !should_start && !should_pause {
                    continue;
                }
                let result = if should_start {
                    self.api
                        .api_torrent_action_start(TorrentIdOrHash::Id(id))
                        .await
                } else {
                    self.api
                        .api_torrent_action_pause(TorrentIdOrHash::Id(id))
                        .await
                };
                match result {
                    Ok(_) => {
                        let still_unsettled = self
                            .get_torrent_status(id)
                            .map(|status| {
                                if resume {
                                    matches!(
                                        status.state,
                                        TorrentState::Paused | TorrentState::Queued
                                    )
                                } else {
                                    matches!(
                                        status.state,
                                        TorrentState::Downloading | TorrentState::Queued
                                    )
                                }
                            })
                            .unwrap_or(false);
                        pending_initialization |= still_unsettled;
                    }
                    Err(error) => {
                        eprintln!("Could not apply startup preference to torrent {id}: {error}");
                        pending_initialization = true;
                    }
                }
            }
            if !pending_initialization || attempt == 9 {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
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
            if components.iter().any(|component| {
                component.is_empty()
                    || matches!(component.as_str(), "." | "..")
                    || component.contains('/')
                    || component.contains('\\')
            }) {
                return Err(TorrentError::InvalidTorrentMetadata(
                    "A torrent file contains an unsafe path component.".to_string(),
                ));
            }

            let extension = Path::new(filename)
                .extension()
                .and_then(|extension| extension.to_str())
                .filter(|extension| !extension.is_empty())
                .map(str::to_ascii_lowercase);

            Ok(TorrentPreviewFile {
                index,
                path: components.join("/"),
                filename: filename.clone(),
                size_bytes: file.len.to_string(),
                extension,
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

    TorrentStatus {
        id: details.id.unwrap_or_default(),
        info_hash: details.info_hash,
        name: details.name,
        total_pieces: details.total_pieces,
        files: details
            .files
            .unwrap_or_default()
            .into_iter()
            .map(|file| TorrentFile {
                name: file.name,
                size_bytes: file.length,
                included: file.included,
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
            .register_torrent_file(torrent_file)
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
            .start_inspected_torrent(&preview.preview_id, &selected.id, &[0])
            .await
            .expect("start the inspected local torrent");

        assert_eq!(added.output_directory, "selected");
        assert_eq!(added.total_bytes, 1);
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
            .start_inspected_torrent(&preview.preview_id, &selected.id, &[0])
            .await
            .expect("start inspected torrent");

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
            .remove_torrent(added.id)
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
                .start_inspected_torrent(&preview.preview_id, &directory.id, &[])
                .await,
            Err(TorrentError::NoFilesSelected)
        ));
        assert!(matches!(
            service
                .start_inspected_torrent(&preview.preview_id, &directory.id, &[usize::MAX])
                .await,
            Err(TorrentError::InvalidFileSelection)
        ));
        assert!(service.get_torrents().expect("read queue").is_empty());
        let started = service
            .start_inspected_torrent(&preview.preview_id, &directory.id, &[1])
            .await
            .expect("start only the selected file");
        assert_eq!(started.output_directory, "downloads");
        assert_eq!(
            started
                .files
                .iter()
                .filter(|file| file.included)
                .map(|file| file.size_bytes)
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
        fs::write(&pending_path, ONE_BYTE_TORRENT).expect("write pending metainfo");
        fs::write(&completed_path, COMPLETE_TORRENT).expect("write completed metainfo");
        let pending_selection = service
            .register_torrent_file(pending_path)
            .expect("register unfinished torrent");
        let pending_preview = service
            .inspect_selected_torrent_file(&pending_selection.id, &selected.id)
            .await
            .expect("inspect unfinished torrent");
        let pending = service
            .start_inspected_torrent(&pending_preview.preview_id, &selected.id, &[0])
            .await
            .expect("start unfinished torrent");
        let pending = service
            .pause_torrent(pending.id)
            .await
            .expect("pause unfinished torrent before restart");
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
        assert_eq!(restored_completed.state, TorrentState::Completed);
        assert_eq!(restored_completed.completed_at, completed_at);
        assert_eq!(restored_completed.id, completed_id);
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
