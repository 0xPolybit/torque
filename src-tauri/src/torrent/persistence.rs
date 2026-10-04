use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

use super::service::{TorrentSourceType, TorrentState, TorrentStatus};

const STATE_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemePreference {
    System,
    Dark,
    Light,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AppPreferences {
    pub resume_unfinished_on_startup: bool,
    pub start_downloads_automatically: bool,
    pub ask_for_destination_every_time: bool,
    pub maximum_simultaneous_downloads: usize,
    pub download_limit_bytes_per_second: Option<u64>,
    pub upload_limit_bytes_per_second: Option<u64>,
    pub minimize_to_tray: bool,
    pub confirm_before_removing_torrent: bool,
    pub confirm_before_deleting_files: bool,
    pub theme: ThemePreference,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            resume_unfinished_on_startup: true,
            start_downloads_automatically: true,
            ask_for_destination_every_time: false,
            maximum_simultaneous_downloads: 3,
            download_limit_bytes_per_second: None,
            upload_limit_bytes_per_second: None,
            minimize_to_tray: false,
            confirm_before_removing_torrent: true,
            confirm_before_deleting_files: true,
            theme: ThemePreference::Dark,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedTorrent {
    pub id: usize,
    pub info_hash: String,
    pub name: Option<String>,
    pub total_pieces: u32,
    pub output_path: PathBuf,
    pub last_state: TorrentState,
    pub last_error: Option<String>,
    pub progress_percent: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub added_at: u64,
    pub completed_at: Option<u64>,
    #[serde(default)]
    pub source_type: TorrentSourceType,
    #[serde(default)]
    pub selected_file_indices: Option<Vec<usize>>,
}

impl PersistedTorrent {
    pub(crate) fn fallback_status(&self, id: usize) -> TorrentStatus {
        let completed = self.last_state == TorrentState::Completed;
        TorrentStatus {
            id,
            info_hash: self.info_hash.clone(),
            name: self.name.clone(),
            total_pieces: self.total_pieces,
            files: Vec::new(),
            output_directory: self
                .output_path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| self.output_path.to_string_lossy().into_owned()),
            state: if completed {
                TorrentState::Completed
            } else {
                TorrentState::Error
            },
            error: if self.last_state == TorrentState::Completed {
                Some(format!(
                    "This completed download could not be restored from the torrent session. Its saved folder is {}.",
                    self.output_path.display()
                ))
            } else {
                Some(format!(
                    "This download could not be restored from the torrent session. Its saved folder is {}.",
                    self.output_path.display()
                ))
            },
            progress_percent: if completed {
                100.0
            } else {
                self.progress_percent
            },
            downloaded_bytes: if completed {
                self.total_bytes
            } else {
                self.downloaded_bytes
            },
            total_bytes: self.total_bytes,
            uploaded_bytes: 0,
            download_speed_bytes_per_second: 0,
            upload_speed_bytes_per_second: None,
            connected_peers: None,
            added_at: self.added_at,
            completed_at: self.completed_at,
            engine_available: false,
            file_selection_editable: false,
            queue_position: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppStateFile {
    version: u32,
    #[serde(default)]
    last_download_directory: Option<PathBuf>,
    #[serde(default)]
    preferences: AppPreferences,
    #[serde(default)]
    torrents: HashMap<String, PersistedTorrent>,
    #[serde(default)]
    queue_order: Vec<String>,
    #[serde(default)]
    queued_info_hashes: Vec<String>,
}

impl Default for AppStateFile {
    fn default() -> Self {
        Self {
            version: STATE_VERSION,
            last_download_directory: None,
            preferences: AppPreferences::default(),
            torrents: HashMap::new(),
            queue_order: Vec::new(),
            queued_info_hashes: Vec::new(),
        }
    }
}

pub struct ApplicationPersistence {
    path: Option<PathBuf>,
    state: Mutex<AppStateFile>,
}

impl ApplicationPersistence {
    pub fn open(path: impl Into<PathBuf>) -> Self {
        let path = path.into();
        let state = match fs::read(&path) {
            Ok(bytes) => match serde_json::from_slice::<AppStateFile>(&bytes) {
                Ok(state) if state.version == STATE_VERSION => state,
                Ok(_) => {
                    eprintln!("Ignoring Torque state with an unsupported version.");
                    preserve_corrupt_file(&path);
                    AppStateFile::default()
                }
                Err(error) => {
                    eprintln!("Ignoring unreadable Torque state: {error}");
                    preserve_corrupt_file(&path);
                    AppStateFile::default()
                }
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => AppStateFile::default(),
            Err(error) => {
                eprintln!("Could not read Torque state: {error}");
                AppStateFile::default()
            }
        };
        Self {
            path: Some(path),
            state: Mutex::new(state),
        }
    }

    #[cfg(test)]
    pub fn in_memory() -> Self {
        Self {
            path: None,
            state: Mutex::new(AppStateFile::default()),
        }
    }

    pub fn last_download_directory(&self) -> Option<PathBuf> {
        self.state.lock().ok()?.last_download_directory.clone()
    }

    pub fn clear_last_download_directory(&self) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        state.last_download_directory = None;
        self.write_locked(&state)
    }

    pub fn set_last_download_directory(&self, path: PathBuf) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        state.last_download_directory = Some(path);
        self.write_locked(&state)
    }

    pub fn preferences(&self) -> Result<AppPreferences, String> {
        self.state
            .lock()
            .map(|state| state.preferences.clone())
            .map_err(|_| "state lock poisoned".to_string())
    }

    pub fn set_preferences(&self, preferences: AppPreferences) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        state.preferences = preferences;
        self.write_locked(&state)
    }

    pub fn queue_state(&self) -> Result<(Vec<String>, Vec<String>), String> {
        self.state
            .lock()
            .map(|state| (state.queue_order.clone(), state.queued_info_hashes.clone()))
            .map_err(|_| "state lock poisoned".to_string())
    }

    pub fn set_queue_state(
        &self,
        queue_order: Vec<String>,
        queued_info_hashes: Vec<String>,
    ) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        state.queue_order = queue_order;
        state.queued_info_hashes = queued_info_hashes;
        self.write_locked(&state)
    }

    pub fn torrents(&self) -> Result<Vec<PersistedTorrent>, String> {
        self.state
            .lock()
            .map(|state| state.torrents.values().cloned().collect())
            .map_err(|_| "state lock poisoned".to_string())
    }

    pub fn update_torrent(
        &self,
        status: &mut TorrentStatus,
        output_path: PathBuf,
    ) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        let key = status.info_hash.to_ascii_lowercase();
        let now = now_millis();
        let prior = state.torrents.get(&key);
        let added_at = prior.map(|record| record.added_at).unwrap_or(now);
        let completed_at = if status.state == TorrentState::Completed {
            prior.and_then(|record| record.completed_at).or(Some(now))
        } else {
            prior.and_then(|record| record.completed_at)
        };
        let name = status
            .name
            .clone()
            .or_else(|| prior.and_then(|record| record.name.clone()));
        let total_pieces = if status.total_pieces == 0 {
            prior.map(|record| record.total_pieces).unwrap_or_default()
        } else {
            status.total_pieces
        };
        let total_bytes = if status.total_bytes == 0 {
            prior.map(|record| record.total_bytes).unwrap_or_default()
        } else {
            status.total_bytes
        };
        let downloaded_bytes = if status.total_bytes == 0 {
            prior
                .map(|record| record.downloaded_bytes)
                .unwrap_or_default()
        } else {
            status.downloaded_bytes
        };
        let progress_percent = if status.total_bytes == 0 {
            prior
                .map(|record| record.progress_percent)
                .unwrap_or(status.progress_percent)
        } else {
            status.progress_percent
        };
        let last_state = if prior.is_some_and(|record| record.last_state == TorrentState::Completed)
            && matches!(
                status.state,
                TorrentState::Queued | TorrentState::Downloading
            )
            && status.progress_percent < 100.0
        {
            TorrentState::Completed
        } else {
            status.state
        };
        let selected_file_indices = if status.files.is_empty() {
            prior.and_then(|record| record.selected_file_indices.clone())
        } else {
            Some(
                status
                    .files
                    .iter()
                    .filter(|file| file.included)
                    .map(|file| file.index)
                    .collect(),
            )
        };
        let source_type = prior
            .map(|record| record.source_type)
            .unwrap_or(TorrentSourceType::Unknown);
        let record = PersistedTorrent {
            id: status.id,
            info_hash: status.info_hash.clone(),
            name: name.clone(),
            total_pieces,
            output_path,
            last_state,
            last_error: status.error.clone(),
            progress_percent,
            downloaded_bytes,
            total_bytes,
            added_at,
            completed_at,
            source_type,
            selected_file_indices,
        };
        let should_write = prior.is_none_or(|prior| {
            prior.id != record.id
                || prior.name != record.name
                || prior.total_pieces != record.total_pieces
                || prior.output_path != record.output_path
                || prior.last_state != record.last_state
                || prior.last_error != record.last_error
                || prior.completed_at != record.completed_at
                || prior.source_type != record.source_type
                || prior.selected_file_indices != record.selected_file_indices
                || (prior.progress_percent - record.progress_percent).abs() >= 1.0
        });
        state.torrents.insert(key, record);
        if should_write {
            self.write_locked(&state)?;
        }
        status.added_at = added_at;
        status.completed_at = completed_at;
        if status.name.is_none() {
            status.name = name;
        }
        status.engine_available = true;
        Ok(())
    }

    pub fn remove_torrent(&self, info_hash: &str) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        state.torrents.remove(&info_hash.to_ascii_lowercase());
        self.write_locked(&state)
    }

    pub fn update_source_type(
        &self,
        info_hash: &str,
        source_type: TorrentSourceType,
    ) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        if let Some(record) = state.torrents.get_mut(&info_hash.to_ascii_lowercase()) {
            record.source_type = source_type;
            self.write_locked(&state)?;
        }
        Ok(())
    }

    pub fn source_type_for_id(&self, id: usize) -> Result<TorrentSourceType, String> {
        self.state
            .lock()
            .map(|state| {
                state
                    .torrents
                    .values()
                    .find(|record| record.id == id)
                    .map(|record| record.source_type)
                    .unwrap_or_default()
            })
            .map_err(|_| "state lock poisoned".to_string())
    }

    pub fn output_path_for_id(&self, id: usize) -> Result<Option<PathBuf>, String> {
        self.state
            .lock()
            .map(|state| {
                state
                    .torrents
                    .values()
                    .find(|record| record.id == id)
                    .map(|record| record.output_path.clone())
            })
            .map_err(|_| "state lock poisoned".to_string())
    }

    fn write_locked(&self, state: &AppStateFile) -> Result<(), String> {
        let Some(path) = self.path.as_ref() else {
            return Ok(());
        };
        let parent = path
            .parent()
            .ok_or_else(|| "state path has no parent".to_string())?;
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent)
            .map_err(|error| format!("could not create a state file: {error}"))?;
        serde_json::to_writer(&mut temporary, state).map_err(|error| error.to_string())?;
        temporary
            .flush()
            .and_then(|()| temporary.as_file().sync_all())
            .map_err(|error| format!("could not flush application state: {error}"))?;
        temporary
            .persist(path)
            .map_err(|error| format!("could not replace application state: {}", error.error))?;
        Ok(())
    }
}

fn preserve_corrupt_file(path: &Path) {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return;
    };
    let backup = path.with_file_name(format!("{name}.corrupt-{}", now_millis()));
    if let Err(error) = fs::rename(path, &backup) {
        eprintln!("Could not preserve the unreadable state file: {error}");
    }
}

pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn corrupt_state_is_preserved_and_defaults_are_loaded() {
        let temp = tempfile::tempdir().expect("temporary directory");
        let path = temp.path().join("application-state.json");
        fs::write(&path, b"{broken").expect("write corrupt state");

        let persistence = ApplicationPersistence::open(&path);

        assert!(
            persistence
                .preferences()
                .expect("default preferences")
                .resume_unfinished_on_startup
        );
        let defaults = persistence.preferences().expect("default preferences");
        assert!(defaults.start_downloads_automatically);
        assert_eq!(defaults.maximum_simultaneous_downloads, 3);
        assert_eq!(defaults.download_limit_bytes_per_second, None);
        assert_eq!(defaults.theme, ThemePreference::Dark);
        assert!(!path.exists());
        assert!(fs::read_dir(temp.path())
            .expect("list state files")
            .any(|entry| entry
                .expect("state file entry")
                .file_name()
                .to_string_lossy()
                .contains("corrupt-")));
    }

    #[test]
    fn selected_directory_and_resume_preference_survive_reopen() {
        let temp = tempfile::tempdir().expect("temporary directory");
        let path = temp.path().join("application-state.json");
        let folder = temp.path().join("chosen");
        fs::create_dir_all(&folder).expect("create chosen folder");

        let persistence = ApplicationPersistence::open(&path);
        persistence
            .set_last_download_directory(folder.clone())
            .expect("save selected folder");
        persistence
            .set_preferences(AppPreferences {
                resume_unfinished_on_startup: false,
                start_downloads_automatically: false,
                theme: ThemePreference::Light,
                ..AppPreferences::default()
            })
            .expect("save preference");
        drop(persistence);

        let restored = ApplicationPersistence::open(path);
        assert_eq!(restored.last_download_directory(), Some(folder));
        let preferences = restored.preferences().expect("restored preferences");
        assert!(!preferences.resume_unfinished_on_startup);
        assert!(!preferences.start_downloads_automatically);
        assert_eq!(preferences.theme, ThemePreference::Light);
    }

    #[test]
    fn queued_torrents_and_order_survive_reopen() {
        let temp = tempfile::tempdir().expect("temporary directory");
        let path = temp.path().join("application-state.json");
        let persistence = ApplicationPersistence::open(&path);
        persistence
            .set_queue_state(
                vec!["active-hash".into(), "queued-b".into(), "queued-a".into()],
                vec!["queued-b".into(), "queued-a".into()],
            )
            .expect("persist queue");
        drop(persistence);

        let restored = ApplicationPersistence::open(path);
        let (order, waiting) = restored.queue_state().expect("restore queue");
        assert_eq!(order, ["active-hash", "queued-b", "queued-a"]);
        assert_eq!(waiting, ["queued-b", "queued-a"]);
    }

    #[test]
    fn older_preference_documents_receive_new_defaults() {
        let temp = tempfile::tempdir().expect("temporary directory");
        let path = temp.path().join("application-state.json");
        fs::write(
            &path,
            br#"{"version":1,"preferences":{"resumeUnfinishedOnStartup":false}}"#,
        )
        .expect("write legacy preferences");

        let persistence = ApplicationPersistence::open(path);
        let preferences = persistence.preferences().expect("legacy preferences");

        assert!(!preferences.resume_unfinished_on_startup);
        assert!(preferences.start_downloads_automatically);
        assert_eq!(preferences.theme, ThemePreference::Dark);
    }

    #[test]
    fn missing_last_directory_is_discarded_without_failing_startup_selection() {
        let temp = tempfile::tempdir().expect("temporary directory");
        let persistence = ApplicationPersistence::open(temp.path().join("state.json"));
        persistence
            .set_last_download_directory(temp.path().join("removed-folder"))
            .expect("save last folder");
        let fallback = temp.path().join("system-downloads");

        let selected = super::super::service::choose_default_directory(
            persistence.last_download_directory(),
            fallback.clone(),
            temp.path().join("app-downloads"),
            &persistence,
        )
        .expect("fallback folder is usable");

        assert_eq!(
            selected,
            fs::canonicalize(&fallback).expect("canonical fallback")
        );
        assert!(persistence.last_download_directory().is_none());
    }
}
