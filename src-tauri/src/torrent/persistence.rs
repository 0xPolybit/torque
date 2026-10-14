use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::priority::TorrentFilePriority;
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentCategory {
    pub id: String,
    pub name: String,
    pub created_at: u64,
    #[serde(default)]
    pub default_download_directory: Option<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentTag {
    pub id: String,
    pub name: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentLibraryMetadata {
    pub categories: Vec<TorrentCategory>,
    pub tags: Vec<TorrentTag>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentMetadataAssociation {
    pub info_hash: String,
    pub category_id: Option<String>,
    pub tag_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", content = "categoryId", rename_all = "snake_case")]
pub enum TorrentCategoryEdit {
    Keep,
    Assign(String),
    Clear,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", content = "tagIds", rename_all = "snake_case")]
pub enum TorrentTagEdit {
    Keep,
    Add(Vec<String>),
    Remove(Vec<String>),
    Replace(Vec<String>),
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
    #[serde(default)]
    pub file_priorities: Vec<TorrentFilePriority>,
    #[serde(default)]
    pub download_limit_bytes_per_second: Option<u64>,
    #[serde(default)]
    pub upload_limit_bytes_per_second: Option<u64>,
    #[serde(default)]
    pub is_rechecking: bool,
    #[serde(default)]
    pub resume_after_recheck: bool,
    #[serde(default)]
    pub recheck_engine_reset: bool,
    #[serde(default)]
    pub recheck_trackers: Vec<String>,
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
            is_seeding: false,
            category: None,
            tags: Vec::new(),
            download_limit_bytes_per_second: self.download_limit_bytes_per_second,
            upload_limit_bytes_per_second: self.upload_limit_bytes_per_second,
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
    #[serde(default)]
    categories: HashMap<String, TorrentCategory>,
    #[serde(default)]
    tags: HashMap<String, TorrentTag>,
    /// Application metadata keyed by normalized info hash, separate from torrent metainfo.
    #[serde(default)]
    torrent_metadata: HashMap<String, TorrentMetadataAssociation>,
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
            categories: HashMap::new(),
            tags: HashMap::new(),
            torrent_metadata: HashMap::new(),
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

    pub fn torrent_library_metadata(&self) -> Result<TorrentLibraryMetadata, String> {
        self.state
            .lock()
            .map(|state| {
                let mut categories: Vec<_> = state.categories.values().cloned().collect();
                let mut tags: Vec<_> = state.tags.values().cloned().collect();
                categories.sort_by_key(|item| item.name.to_lowercase());
                tags.sort_by_key(|item| item.name.to_lowercase());
                TorrentLibraryMetadata { categories, tags }
            })
            .map_err(|_| "state lock poisoned".to_string())
    }

    pub fn create_category(&self, name: &str) -> Result<TorrentCategory, String> {
        let name = validate_library_name(name)?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        ensure_unique_name(
            state.categories.values().map(|item| item.name.as_str()),
            &name,
        )?;
        let category = TorrentCategory {
            id: Uuid::new_v4().to_string(),
            name,
            created_at: now_millis(),
            default_download_directory: None,
        };
        state
            .categories
            .insert(category.id.clone(), category.clone());
        self.write_locked(&state)?;
        Ok(category)
    }

    pub fn rename_category(&self, id: &str, name: &str) -> Result<TorrentCategory, String> {
        let name = validate_library_name(name)?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        if !state.categories.contains_key(id) {
            return Err("This category no longer exists.".to_string());
        }
        ensure_unique_name(
            state
                .categories
                .values()
                .filter(|item| item.id != id)
                .map(|item| item.name.as_str()),
            &name,
        )?;
        let category = state.categories.get_mut(id).expect("checked above");
        category.name = name;
        let updated = category.clone();
        self.write_locked(&state)?;
        Ok(updated)
    }

    pub fn delete_category(&self, id: &str) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        if state.categories.remove(id).is_none() {
            return Err("This category no longer exists.".to_string());
        }
        for metadata in state.torrent_metadata.values_mut() {
            if metadata.category_id.as_deref() == Some(id) {
                metadata.category_id = None;
            }
        }
        state
            .torrent_metadata
            .retain(|_, metadata| metadata.category_id.is_some() || !metadata.tag_ids.is_empty());
        self.write_locked(&state)
    }

    pub fn create_tag(&self, name: &str) -> Result<TorrentTag, String> {
        let name = validate_library_name(name)?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        ensure_unique_name(state.tags.values().map(|item| item.name.as_str()), &name)?;
        let tag = TorrentTag {
            id: Uuid::new_v4().to_string(),
            name,
            created_at: now_millis(),
        };
        state.tags.insert(tag.id.clone(), tag.clone());
        self.write_locked(&state)?;
        Ok(tag)
    }

    pub fn rename_tag(&self, id: &str, name: &str) -> Result<TorrentTag, String> {
        let name = validate_library_name(name)?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        if !state.tags.contains_key(id) {
            return Err("This tag no longer exists.".to_string());
        }
        ensure_unique_name(
            state
                .tags
                .values()
                .filter(|item| item.id != id)
                .map(|item| item.name.as_str()),
            &name,
        )?;
        let tag = state.tags.get_mut(id).expect("checked above");
        tag.name = name;
        let updated = tag.clone();
        self.write_locked(&state)?;
        Ok(updated)
    }

    pub fn delete_tag(&self, id: &str) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        if state.tags.remove(id).is_none() {
            return Err("This tag no longer exists.".to_string());
        }
        for metadata in state.torrent_metadata.values_mut() {
            metadata.tag_ids.retain(|tag_id| tag_id != id);
        }
        state
            .torrent_metadata
            .retain(|_, metadata| metadata.category_id.is_some() || !metadata.tag_ids.is_empty());
        self.write_locked(&state)
    }

    pub fn update_torrent_metadata(
        &self,
        info_hashes: &[String],
        category_edit: &TorrentCategoryEdit,
        tag_edit: &TorrentTagEdit,
    ) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        let edited_category = match category_edit {
            TorrentCategoryEdit::Assign(id) => {
                if !state.categories.contains_key(id) {
                    return Err("Choose a category that still exists.".to_string());
                }
                Some(Some(id.clone()))
            }
            TorrentCategoryEdit::Clear => Some(None),
            TorrentCategoryEdit::Keep => None,
        };
        let edited_tags = match tag_edit {
            TorrentTagEdit::Keep => None,
            TorrentTagEdit::Add(ids)
            | TorrentTagEdit::Remove(ids)
            | TorrentTagEdit::Replace(ids) => Some(ids),
        };
        if edited_tags.is_some_and(|ids| ids.iter().any(|id| !state.tags.contains_key(id))) {
            return Err("One or more selected tags no longer exist.".to_string());
        }
        for info_hash in info_hashes {
            let key = info_hash.to_ascii_lowercase();
            let Some(category_id) = edited_category.as_ref() else {
                if edited_tags.is_none() {
                    continue;
                }
                let metadata = state
                    .torrent_metadata
                    .entry(key.clone())
                    .or_insert_with(|| TorrentMetadataAssociation {
                        info_hash: info_hash.clone(),
                        category_id: None,
                        tag_ids: Vec::new(),
                    });
                apply_tag_edit(&mut metadata.tag_ids, tag_edit);
                if metadata.category_id.is_none() && metadata.tag_ids.is_empty() {
                    state.torrent_metadata.remove(&key);
                }
                continue;
            };
            let metadata = state
                .torrent_metadata
                .entry(key.clone())
                .or_insert_with(|| TorrentMetadataAssociation {
                    info_hash: info_hash.clone(),
                    category_id: None,
                    tag_ids: Vec::new(),
                });
            metadata.category_id = category_id.clone();
            apply_tag_edit(&mut metadata.tag_ids, tag_edit);
            if metadata.category_id.is_none() && metadata.tag_ids.is_empty() {
                state.torrent_metadata.remove(&key);
            }
        }
        self.write_locked(&state)
    }

    pub fn resolved_torrent_metadata(
        &self,
        info_hash: &str,
    ) -> Result<(Option<TorrentCategory>, Vec<TorrentTag>), String> {
        self.state
            .lock()
            .map(|state| {
                let association = state.torrent_metadata.get(&info_hash.to_ascii_lowercase());
                let category = association
                    .and_then(|metadata| metadata.category_id.as_ref())
                    .and_then(|id| state.categories.get(id))
                    .cloned();
                let tags = association
                    .map(|metadata| {
                        metadata
                            .tag_ids
                            .iter()
                            .filter_map(|id| state.tags.get(id).cloned())
                            .collect()
                    })
                    .unwrap_or_default();
                (category, tags)
            })
            .map_err(|_| "state lock poisoned".to_string())
    }

    pub fn begin_recheck(
        &self,
        info_hash: &str,
        resume_after: bool,
        trackers: Vec<String>,
    ) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        let record = state
            .torrents
            .get_mut(&info_hash.to_ascii_lowercase())
            .ok_or_else(|| "torrent is not present in the saved library".to_string())?;
        record.is_rechecking = true;
        record.resume_after_recheck = resume_after;
        record.recheck_engine_reset = false;
        record.recheck_trackers = trackers;
        record.last_state = TorrentState::Checking;
        self.write_locked(&state)
    }

    pub fn mark_recheck_engine_reset(&self, info_hash: &str) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        let record = state
            .torrents
            .get_mut(&info_hash.to_ascii_lowercase())
            .ok_or_else(|| "torrent is not present in the saved library".to_string())?;
        record.recheck_engine_reset = true;
        self.write_locked(&state)
    }

    pub fn finish_recheck(&self, info_hash: &str) -> Result<bool, String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        let Some(record) = state.torrents.get_mut(&info_hash.to_ascii_lowercase()) else {
            return Ok(false);
        };
        let resume_after = record.resume_after_recheck;
        record.is_rechecking = false;
        record.resume_after_recheck = false;
        record.recheck_engine_reset = false;
        record.recheck_trackers.clear();
        // The old completion bit is not authoritative once verification ends.
        // The engine status refresh below will mark it complete again if all
        // selected piece hashes still match.
        record.last_state = TorrentState::Paused;
        self.write_locked(&state)?;
        Ok(resume_after)
    }

    pub fn recheck_state(&self, info_hash: &str) -> Result<Option<(bool, bool)>, String> {
        self.state
            .lock()
            .map(|state| {
                state
                    .torrents
                    .get(&info_hash.to_ascii_lowercase())
                    .map(|record| (record.is_rechecking, record.recheck_engine_reset))
            })
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
        status.download_limit_bytes_per_second =
            prior.and_then(|record| record.download_limit_bytes_per_second);
        status.upload_limit_bytes_per_second =
            prior.and_then(|record| record.upload_limit_bytes_per_second);
        if let Some(prior) = prior {
            for file in &mut status.files {
                let saved_priority = if prior.file_priorities.len() == status.files.len() {
                    prior.file_priorities.get(file.index).copied()
                } else {
                    prior.selected_file_indices.as_ref().map(|selected| {
                        if selected.contains(&file.index) {
                            TorrentFilePriority::Normal
                        } else {
                            TorrentFilePriority::Skip
                        }
                    })
                };
                if let Some(priority) = saved_priority {
                    file.priority = priority;
                    file.included = priority.is_selected();
                    if !file.included {
                        file.state = super::service::TorrentFileState::Skipped;
                    }
                }
            }
        }
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
        let file_priorities = if status.files.is_empty() {
            prior
                .map(|record| record.file_priorities.clone())
                .unwrap_or_default()
        } else {
            status.files.iter().map(|file| file.priority).collect()
        };
        let selected_file_indices = if status.files.is_empty() {
            prior.and_then(|record| record.selected_file_indices.clone())
        } else {
            Some(
                status
                    .files
                    .iter()
                    .filter(|file| file.priority.is_selected())
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
            file_priorities,
            download_limit_bytes_per_second: status.download_limit_bytes_per_second,
            upload_limit_bytes_per_second: status.upload_limit_bytes_per_second,
            is_rechecking: prior.is_some_and(|record| record.is_rechecking),
            resume_after_recheck: prior.is_some_and(|record| record.resume_after_recheck),
            recheck_engine_reset: prior.is_some_and(|record| record.recheck_engine_reset),
            recheck_trackers: prior
                .map(|record| record.recheck_trackers.clone())
                .unwrap_or_default(),
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
                || prior.file_priorities != record.file_priorities
                || prior.download_limit_bytes_per_second != record.download_limit_bytes_per_second
                || prior.upload_limit_bytes_per_second != record.upload_limit_bytes_per_second
                || prior.is_rechecking != record.is_rechecking
                || prior.resume_after_recheck != record.resume_after_recheck
                || prior.recheck_engine_reset != record.recheck_engine_reset
                || prior.recheck_trackers != record.recheck_trackers
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
        let key = info_hash.to_ascii_lowercase();
        state.torrents.remove(&key);
        state.torrent_metadata.remove(&key);
        self.write_locked(&state)
    }

    pub fn set_file_priorities(
        &self,
        info_hash: &str,
        priorities: Vec<TorrentFilePriority>,
    ) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        let record = state
            .torrents
            .get_mut(&info_hash.to_ascii_lowercase())
            .ok_or_else(|| "torrent is not present in the saved library".to_string())?;
        let old_selected_file_indices = record.selected_file_indices.clone();
        let old_file_priorities = record.file_priorities.clone();
        record.selected_file_indices = Some(
            priorities
                .iter()
                .enumerate()
                .filter_map(|(index, priority)| priority.is_selected().then_some(index))
                .collect(),
        );
        record.file_priorities = priorities;
        if let Err(error) = self.write_locked(&state) {
            let record = state
                .torrents
                .get_mut(&info_hash.to_ascii_lowercase())
                .expect("record remains in state");
            record.selected_file_indices = old_selected_file_indices;
            record.file_priorities = old_file_priorities;
            return Err(error);
        }
        Ok(())
    }

    pub fn set_torrent_bandwidth_limits(
        &self,
        info_hash: &str,
        download_limit_bytes_per_second: Option<u64>,
        upload_limit_bytes_per_second: Option<u64>,
    ) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        let record = state
            .torrents
            .get_mut(&info_hash.to_ascii_lowercase())
            .ok_or_else(|| "torrent is not present in the saved library".to_string())?;
        let previous = (
            record.download_limit_bytes_per_second,
            record.upload_limit_bytes_per_second,
        );
        record.download_limit_bytes_per_second = download_limit_bytes_per_second;
        record.upload_limit_bytes_per_second = upload_limit_bytes_per_second;
        if let Err(error) = self.write_locked(&state) {
            let record = state
                .torrents
                .get_mut(&info_hash.to_ascii_lowercase())
                .expect("record remains in state");
            record.download_limit_bytes_per_second = previous.0;
            record.upload_limit_bytes_per_second = previous.1;
            return Err(error);
        }
        Ok(())
    }

    pub fn torrent_bandwidth_limits(
        &self,
        info_hash: &str,
    ) -> Result<(Option<u64>, Option<u64>), String> {
        self.state
            .lock()
            .map(|state| {
                state
                    .torrents
                    .get(&info_hash.to_ascii_lowercase())
                    .map(|record| {
                        (
                            record.download_limit_bytes_per_second,
                            record.upload_limit_bytes_per_second,
                        )
                    })
                    .unwrap_or((None, None))
            })
            .map_err(|_| "state lock poisoned".to_string())
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

fn validate_library_name(input: &str) -> Result<String, String> {
    let name = input.trim();
    if name.is_empty() {
        return Err("Enter a name.".to_string());
    }
    if name.chars().count() > 48 {
        return Err("Names can be up to 48 characters.".to_string());
    }
    if name.chars().any(char::is_control) {
        return Err("Names cannot contain control characters.".to_string());
    }
    Ok(name.to_string())
}

fn ensure_unique_name<'a>(
    mut names: impl Iterator<Item = &'a str>,
    candidate: &str,
) -> Result<(), String> {
    let normalized_candidate = candidate.to_lowercase();
    if names.any(|name| name.to_lowercase() == normalized_candidate) {
        Err("A category or tag with that name already exists.".to_string())
    } else {
        Ok(())
    }
}

fn apply_tag_edit(tags: &mut Vec<String>, edit: &TorrentTagEdit) {
    match edit {
        TorrentTagEdit::Keep => {}
        TorrentTagEdit::Add(additions) => {
            let mut seen: HashSet<String> = tags.iter().cloned().collect();
            tags.extend(
                additions
                    .iter()
                    .filter(|id| seen.insert((*id).clone()))
                    .cloned(),
            );
        }
        TorrentTagEdit::Remove(removals) => {
            let removals: HashSet<&str> = removals.iter().map(String::as_str).collect();
            tags.retain(|id| !removals.contains(id.as_str()));
        }
        TorrentTagEdit::Replace(replacements) => {
            let mut seen = HashSet::new();
            *tags = replacements
                .iter()
                .filter(|id| seen.insert((*id).clone()))
                .cloned()
                .collect();
        }
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
    fn per_torrent_bandwidth_limits_survive_reopen_and_can_be_cleared() {
        let temp = tempfile::tempdir().expect("temporary directory");
        let path = temp.path().join("application-state.json");
        let info_hash = "a1b2c3";
        let persistence = ApplicationPersistence::open(&path);
        {
            let mut state = persistence.state.lock().expect("lock app state");
            state.torrents.insert(
                info_hash.to_string(),
                PersistedTorrent {
                    id: 12,
                    info_hash: info_hash.to_string(),
                    name: Some("Test torrent".into()),
                    total_pieces: 3,
                    output_path: temp.path().join("downloads"),
                    last_state: TorrentState::Paused,
                    last_error: None,
                    progress_percent: 0.0,
                    downloaded_bytes: 0,
                    total_bytes: 128,
                    added_at: 1,
                    completed_at: None,
                    source_type: TorrentSourceType::TorrentFile,
                    selected_file_indices: None,
                    file_priorities: Vec::new(),
                    download_limit_bytes_per_second: None,
                    upload_limit_bytes_per_second: None,
                    is_rechecking: false,
                    resume_after_recheck: false,
                    recheck_engine_reset: false,
                    recheck_trackers: Vec::new(),
                },
            );
            persistence.write_locked(&state).expect("write test record");
        }
        persistence
            .set_torrent_bandwidth_limits(info_hash, Some(2 * 1024 * 1024), Some(256 * 1024))
            .expect("save torrent limits");
        drop(persistence);

        let restored = ApplicationPersistence::open(&path);
        assert_eq!(
            restored
                .torrent_bandwidth_limits(info_hash)
                .expect("read restored limits"),
            (Some(2 * 1024 * 1024), Some(256 * 1024))
        );
        restored
            .set_torrent_bandwidth_limits(info_hash, None, None)
            .expect("clear limits");
        assert_eq!(
            restored
                .torrent_bandwidth_limits(info_hash)
                .expect("read cleared limits"),
            (None, None)
        );
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
    fn categories_tags_and_torrent_assignments_persist_and_cascade() {
        let temp = tempfile::tempdir().expect("temporary directory");
        let path = temp.path().join("application-state.json");
        let persistence = ApplicationPersistence::open(&path);
        let category = persistence
            .create_category("  日本語・研究  ")
            .expect("category");
        let first_tag = persistence.create_tag("Important").expect("first tag");
        let second_tag = persistence.create_tag("Архив").expect("unicode tag");
        let third_tag = persistence.create_tag("Temporary").expect("third tag");
        let hash = "ABCDEF0123456789".to_string();
        let second_hash = "0123456789ABCDEF".to_string();
        let bulk_hashes = vec![hash.clone(), second_hash.clone()];

        persistence
            .update_torrent_metadata(
                &bulk_hashes,
                &TorrentCategoryEdit::Assign(category.id.clone()),
                &TorrentTagEdit::Replace(vec![
                    first_tag.id.clone(),
                    second_tag.id.clone(),
                    first_tag.id.clone(),
                ]),
            )
            .expect("assign metadata");
        drop(persistence);

        let restored = ApplicationPersistence::open(&path);
        let (restored_category, restored_tags) = restored
            .resolved_torrent_metadata(&hash)
            .expect("resolve metadata");
        assert_eq!(restored_category.expect("category").name, "日本語・研究");
        assert_eq!(restored_tags.len(), 2);
        let (bulk_category, bulk_tags) = restored
            .resolved_torrent_metadata(&second_hash)
            .expect("resolve bulk assignment");
        assert_eq!(bulk_category.expect("bulk category").id, category.id);
        assert_eq!(bulk_tags.len(), 2);
        let renamed_category = restored
            .rename_category(&category.id, "映像・研究")
            .expect("rename category");
        let renamed_tag = restored
            .rename_tag(&second_tag.id, "アーカイブ")
            .expect("rename tag");
        assert_eq!(renamed_category.name, "映像・研究");
        assert_eq!(renamed_tag.name, "アーカイブ");

        restored
            .update_torrent_metadata(
                std::slice::from_ref(&hash),
                &TorrentCategoryEdit::Keep,
                &TorrentTagEdit::Add(vec![third_tag.id.clone()]),
            )
            .expect("add tag");
        restored
            .update_torrent_metadata(
                std::slice::from_ref(&hash),
                &TorrentCategoryEdit::Keep,
                &TorrentTagEdit::Remove(vec![first_tag.id.clone()]),
            )
            .expect("remove tag");

        restored
            .delete_category(&category.id)
            .expect("delete category");
        restored.delete_tag(&second_tag.id).expect("delete tag");
        let (category_after_delete, tags_after_delete) = restored
            .resolved_torrent_metadata(&hash)
            .expect("resolve after delete");
        assert!(category_after_delete.is_none());
        assert_eq!(tags_after_delete, vec![third_tag]);
    }

    #[test]
    fn taxonomy_names_are_validated_and_legacy_state_defaults_cleanly() {
        let temp = tempfile::tempdir().expect("temporary directory");
        let path = temp.path().join("application-state.json");
        let legacy_state = serde_json::json!({
            "version": 1,
            "torrents": {
                "abcdef": {
                    "id": 7,
                    "infoHash": "ABCDEF",
                    "name": "Existing download",
                    "totalPieces": 1,
                    "outputPath": temp.path().join("old-download").to_string_lossy(),
                    "lastState": "completed",
                    "lastError": null,
                    "progressPercent": 100.0,
                    "downloadedBytes": 4,
                    "totalBytes": 4,
                    "addedAt": 1,
                    "completedAt": 2
                }
            }
        });
        fs::write(
            &path,
            serde_json::to_vec(&legacy_state).expect("encode legacy state"),
        )
        .expect("write legacy state");
        let persistence = ApplicationPersistence::open(&path);
        assert_eq!(persistence.torrents().expect("legacy torrent").len(), 1);
        assert_eq!(
            persistence
                .resolved_torrent_metadata("abcdef")
                .expect("missing legacy metadata"),
            (None, Vec::new())
        );
        assert!(persistence
            .torrent_library_metadata()
            .expect("legacy taxonomy")
            .categories
            .is_empty());
        assert!(persistence.create_category(" \n ").is_err());
        persistence.create_category("Work").expect("valid category");
        assert!(persistence.create_category("work").is_err());
        persistence.create_tag("Important").expect("valid tag");
        assert!(persistence.create_tag("important").is_err());
        assert!(persistence.create_category(&"x".repeat(49)).is_err());
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
