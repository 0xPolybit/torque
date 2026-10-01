use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use librqbit::{
    api::{ApiTorrentListOpts, TorrentIdOrHash},
    AddTorrent, AddTorrentOptions, Api, Magnet, Session, SessionOptions, SessionPersistenceConfig,
    TorrentStats, TorrentStatsState,
};
use serde::Serialize;
use thiserror::Error;
use url::Url;
use uuid::Uuid;

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
    #[error("Torrent status error: {0}")]
    Status(String),
    #[error("The download service could not lock its directory list.")]
    DirectoryLock,
    #[error("The download service could not lock its selected torrent files.")]
    TorrentFileSelectionLock,
    #[error("The selected torrent file is no longer available. Choose it again.")]
    UnknownTorrentFileSelection,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TorrentState {
    Queued,
    Downloading,
    Paused,
    Completed,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentFile {
    pub name: String,
    pub size_bytes: u64,
    pub included: bool,
}

#[derive(Debug, Clone, Serialize)]
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
}

pub struct TorrentService {
    api: Api,
    directories: Mutex<HashMap<String, PathBuf>>,
    torrent_file_selections: Mutex<HashMap<String, PathBuf>>,
    default_directory_id: String,
}

impl TorrentService {
    pub async fn new(
        default_output_directory: PathBuf,
        persistence_directory: PathBuf,
    ) -> Result<Self, TorrentError> {
        fs::create_dir_all(&default_output_directory)
            .map_err(|error| TorrentError::DownloadDirectory(error.to_string()))?;
        fs::create_dir_all(&persistence_directory)
            .map_err(|error| TorrentError::Engine(error.to_string()))?;

        let options = SessionOptions {
            fastresume: true,
            persistence: Some(SessionPersistenceConfig::Json {
                folder: Some(persistence_directory),
            }),
            ..SessionOptions::default()
        };
        let session = Session::new_with_opts(default_output_directory.clone(), options)
            .await
            .map_err(|error| TorrentError::Engine(error.to_string()))?;
        Self::with_session(session, default_output_directory)
    }

    fn with_session(
        session: Arc<Session>,
        default_output_directory: PathBuf,
    ) -> Result<Self, TorrentError> {
        let api = Api::new(session, None);
        let service = Self {
            api,
            directories: Mutex::new(HashMap::new()),
            torrent_file_selections: Mutex::new(HashMap::new()),
            default_directory_id: Uuid::new_v4().to_string(),
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
        Ok(directory)
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

    pub async fn add_selected_torrent_file(
        &self,
        selection_id: &str,
        directory_id: &str,
    ) -> Result<TorrentStatus, TorrentError> {
        let torrent_path = self
            .torrent_file_selections
            .lock()
            .map_err(|_| TorrentError::TorrentFileSelectionLock)?
            .remove(selection_id)
            .ok_or(TorrentError::UnknownTorrentFileSelection)?;

        match self.add_torrent_file(&torrent_path, directory_id).await {
            Ok(status) => Ok(status),
            Err(error) => {
                self.torrent_file_selections
                    .lock()
                    .map_err(|_| TorrentError::TorrentFileSelectionLock)?
                    .insert(selection_id.to_string(), torrent_path);
                Err(error)
            }
        }
    }

    pub fn discard_torrent_file_selection(&self, selection_id: &str) -> Result<(), TorrentError> {
        self.torrent_file_selections
            .lock()
            .map_err(|_| TorrentError::TorrentFileSelectionLock)?
            .remove(selection_id);
        Ok(())
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

    pub async fn add_magnet(
        &self,
        magnet_link: &str,
        directory_id: &str,
    ) -> Result<TorrentStatus, TorrentError> {
        let trimmed = validate_magnet(magnet_link)?;

        let output_directory = self.validate_output_directory(directory_id)?;
        let response = self
            .api
            .api_add_torrent(
                AddTorrent::from_url(trimmed),
                Some(add_options(&output_directory)),
            )
            .await
            .map_err(|error| TorrentError::Engine(error.to_string()))?;
        let id = response.id.ok_or_else(|| {
            TorrentError::Engine("The torrent engine did not start the download.".to_string())
        })?;
        self.get_torrent_status(id)
    }

    pub async fn add_torrent_url(
        &self,
        torrent_url: &str,
        directory_id: &str,
    ) -> Result<TorrentStatus, TorrentError> {
        let normalized_url = validate_torrent_url(torrent_url)?;
        let output_directory = self.validate_output_directory(directory_id)?;
        let response = self
            .api
            .api_add_torrent(
                AddTorrent::from_url(normalized_url.as_str()),
                Some(add_options(&output_directory)),
            )
            .await
            .map_err(|error| TorrentError::Engine(error.to_string()))?;
        let id = response.id.ok_or_else(|| {
            TorrentError::Engine("The torrent engine did not start the download.".to_string())
        })?;
        self.get_torrent_status(id)
    }

    pub async fn add_torrent_file(
        &self,
        torrent_path: &Path,
        directory_id: &str,
    ) -> Result<TorrentStatus, TorrentError> {
        let bytes = read_torrent_file(torrent_path)?;

        let output_directory = self.validate_output_directory(directory_id)?;
        let response = self
            .api
            .api_add_torrent(
                AddTorrent::from_bytes(bytes),
                Some(add_options(&output_directory)),
            )
            .await
            .map_err(|error| TorrentError::Engine(error.to_string()))?;
        let id = response.id.ok_or_else(|| {
            TorrentError::Engine("The torrent engine did not start the download.".to_string())
        })?;
        self.get_torrent_status(id)
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
        self.api
            .api_torrent_action_forget(TorrentIdOrHash::Id(id))
            .await
            .map_err(|error| TorrentError::Engine(error.to_string()))?;
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
        listed
            .torrents
            .into_iter()
            .filter_map(|torrent| torrent.id)
            .map(|id| self.get_torrent_status(id))
            .collect()
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

        Ok(status_from_parts(details, stats, connected_peers))
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

fn add_options(output_directory: &Path) -> AddTorrentOptions {
    AddTorrentOptions {
        output_folder: Some(output_directory.to_string_lossy().into_owned()),
        ..AddTorrentOptions::default()
    }
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
    fn add_options_use_the_selected_output_directory() {
        let options = add_options(Path::new("C:/downloads/selected"));
        assert_eq!(
            options.output_folder.as_deref(),
            Some("C:/downloads/selected")
        );
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

        let added = service
            .add_selected_torrent_file(&file_selection.id, &selected.id)
            .await
            .expect("start the selected local torrent");

        assert_eq!(added.output_directory, "selected");
        assert_eq!(added.total_bytes, 1);
        assert!(matches!(
            service
                .add_selected_torrent_file(&file_selection.id, &selected.id)
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
        let added = service
            .add_torrent_file(&torrent_file, &selected.id)
            .await
            .expect("add torrent to the local test session");

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
    async fn torrent_url_fetches_and_adds_metainfo_from_http() {
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
        let added = service
            .add_torrent_url(&url, &directory.id)
            .await
            .expect("fetch and add torrent metainfo from HTTP");
        server.join().expect("join local torrent server");

        assert_eq!(added.name.as_deref(), Some("hello"));
        assert_eq!(added.total_bytes, 1);
        assert_eq!(added.output_directory, "downloads");
        service.api.session().stop().await;
    }
}
