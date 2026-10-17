use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::discovery::{
    SearchFilters, SearchProviderInfo, SearchService, TorrentDownloadSource, TorrentSearchDetails,
    TorrentSearchResponse,
};
use crate::torrent::{
    AppPreferences, DownloadDirectory, QueueMove, TorrentBandwidthDirection, TorrentCategory,
    TorrentCategoryEdit, TorrentDetails, TorrentFilePriorityUpdate, TorrentFileSelection,
    TorrentLibraryMetadata, TorrentPreview, TorrentService, TorrentStatus, TorrentTag,
    TorrentTagEdit, UpdatePreferences,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    name: String,
    version: String,
    platform: &'static str,
    default_download_directory: Option<String>,
}

#[tauri::command]
pub fn get_app_info(app: AppHandle) -> AppInfo {
    let package = app.package_info();
    let download_directory = app
        .path()
        .download_dir()
        .ok()
        .map(|path| path.to_string_lossy().into_owned());

    AppInfo {
        name: package.name.clone(),
        version: package.version.to_string(),
        platform: std::env::consts::OS,
        default_download_directory: download_directory,
    }
}

#[tauri::command]
pub fn get_app_preferences(service: State<'_, TorrentService>) -> Result<AppPreferences, String> {
    service.preferences().map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn set_app_preferences(
    service: State<'_, TorrentService>,
    preferences: AppPreferences,
) -> Result<AppPreferences, String> {
    service
        .set_preferences(preferences)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_update_preferences(
    service: State<'_, TorrentService>,
    preferences: UpdatePreferences,
) -> Result<UpdatePreferences, String> {
    service
        .set_update_preferences(preferences)
        .map_err(|error| error.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadDirectoryList {
    default_id: String,
    directories: Vec<DownloadDirectory>,
}

#[tauri::command]
pub fn get_download_directories(
    service: State<'_, TorrentService>,
) -> Result<DownloadDirectoryList, String> {
    Ok(DownloadDirectoryList {
        default_id: service.default_directory_id().to_string(),
        directories: service
            .list_download_directories()
            .map_err(|error| error.to_string())?,
    })
}

#[tauri::command]
pub async fn select_download_directory(
    app: AppHandle,
    service: State<'_, TorrentService>,
) -> Result<Option<DownloadDirectory>, String> {
    let Some(selected) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path: PathBuf = selected
        .into_path()
        .map_err(|error| format!("Could not access the selected folder: {error}"))?;
    service
        .register_download_directory(path)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn inspect_magnet(
    service: State<'_, TorrentService>,
    magnet_link: String,
    output_directory_id: String,
) -> Result<TorrentPreview, String> {
    service
        .inspect_magnet(&magnet_link, &output_directory_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn select_torrent_file(
    app: AppHandle,
    service: State<'_, TorrentService>,
) -> Result<Option<TorrentFileSelection>, String> {
    let Some(selected) = app
        .dialog()
        .file()
        .add_filter("Torrent files", &["torrent"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path: PathBuf = selected
        .into_path()
        .map_err(|error| format!("Could not access the selected torrent file: {error}"))?;
    service
        .register_torrent_file(path)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn inspect_torrent_file(
    service: State<'_, TorrentService>,
    torrent_file_id: String,
    output_directory_id: String,
) -> Result<TorrentPreview, String> {
    service
        .inspect_selected_torrent_file(&torrent_file_id, &output_directory_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn discard_torrent_file_selection(
    service: State<'_, TorrentService>,
    torrent_file_id: String,
) -> Result<(), String> {
    service
        .discard_torrent_file_selection(&torrent_file_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn inspect_torrent_url(
    service: State<'_, TorrentService>,
    torrent_url: String,
    output_directory_id: String,
) -> Result<TorrentPreview, String> {
    service
        .inspect_torrent_url(&torrent_url, &output_directory_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn start_inspected_torrent(
    service: State<'_, TorrentService>,
    preview_id: String,
    output_directory_id: String,
    selected_file_indices: Vec<usize>,
    allow_insufficient_space: bool,
) -> Result<TorrentStatus, String> {
    service
        .start_inspected_torrent(
            &preview_id,
            &output_directory_id,
            &selected_file_indices,
            allow_insufficient_space,
        )
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_output_directory_free_space(
    service: State<'_, TorrentService>,
    output_directory_id: String,
) -> Result<Option<String>, String> {
    service
        .output_directory_free_space(&output_directory_id)
        .map(|bytes| bytes.map(|value| value.to_string()))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn discard_torrent_preview(
    service: State<'_, TorrentService>,
    preview_id: String,
) -> Result<(), String> {
    service
        .discard_torrent_preview(&preview_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_torrents(
    service: State<'_, TorrentService>,
) -> Result<Vec<TorrentStatus>, String> {
    service
        .refresh_torrents()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_torrent_status(
    service: State<'_, TorrentService>,
    torrent_id: usize,
) -> Result<TorrentStatus, String> {
    service
        .get_torrent_status(torrent_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_torrent_library_metadata(
    service: State<'_, TorrentService>,
) -> Result<TorrentLibraryMetadata, String> {
    service
        .torrent_library_metadata()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_torrent_category(
    service: State<'_, TorrentService>,
    name: String,
) -> Result<TorrentCategory, String> {
    service
        .create_torrent_category(&name)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn rename_torrent_category(
    service: State<'_, TorrentService>,
    category_id: String,
    name: String,
) -> Result<TorrentCategory, String> {
    service
        .rename_torrent_category(&category_id, &name)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_torrent_category(
    service: State<'_, TorrentService>,
    category_id: String,
) -> Result<(), String> {
    service
        .delete_torrent_category(&category_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_torrent_tag(
    service: State<'_, TorrentService>,
    name: String,
) -> Result<TorrentTag, String> {
    service
        .create_torrent_tag(&name)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn rename_torrent_tag(
    service: State<'_, TorrentService>,
    tag_id: String,
    name: String,
) -> Result<TorrentTag, String> {
    service
        .rename_torrent_tag(&tag_id, &name)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_torrent_tag(
    service: State<'_, TorrentService>,
    tag_id: String,
) -> Result<(), String> {
    service
        .delete_torrent_tag(&tag_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_torrent_library_metadata(
    service: State<'_, TorrentService>,
    torrent_ids: Vec<usize>,
    category_edit: TorrentCategoryEdit,
    tag_edit: TorrentTagEdit,
) -> Result<(), String> {
    service
        .set_torrent_library_metadata(&torrent_ids, &category_edit, &tag_edit)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_torrent_details(
    service: State<'_, TorrentService>,
    torrent_id: usize,
) -> Result<TorrentDetails, String> {
    service
        .get_torrent_details(torrent_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_torrent_file_selection(
    service: State<'_, TorrentService>,
    torrent_id: usize,
    selected_file_indices: Vec<usize>,
) -> Result<TorrentStatus, String> {
    service
        .update_torrent_file_selection(torrent_id, &selected_file_indices)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_torrent_file_priorities(
    service: State<'_, TorrentService>,
    torrent_id: usize,
    updates: Vec<TorrentFilePriorityUpdate>,
) -> Result<TorrentStatus, String> {
    service
        .update_torrent_file_priorities(torrent_id, &updates)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn set_torrent_bandwidth_limit(
    service: State<'_, TorrentService>,
    torrent_id: usize,
    direction: TorrentBandwidthDirection,
    limit_bytes_per_second: Option<u64>,
) -> Result<TorrentStatus, String> {
    service
        .set_torrent_bandwidth_limits(torrent_id, direction, limit_bytes_per_second)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn pause_torrent(
    service: State<'_, TorrentService>,
    torrent_id: usize,
) -> Result<TorrentStatus, String> {
    service
        .pause_torrent(torrent_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn resume_torrent(
    service: State<'_, TorrentService>,
    torrent_id: usize,
) -> Result<TorrentStatus, String> {
    service
        .resume_torrent(torrent_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn retry_torrent(
    service: State<'_, TorrentService>,
    torrent_id: usize,
) -> Result<TorrentStatus, String> {
    service
        .retry_torrent(torrent_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn force_recheck(
    service: State<'_, TorrentService>,
    torrent_id: usize,
) -> Result<TorrentStatus, String> {
    service
        .force_recheck(torrent_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn cancel_torrent_recheck(
    service: State<'_, TorrentService>,
    torrent_id: usize,
) -> Result<TorrentStatus, String> {
    service
        .cancel_torrent_recheck(torrent_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn remove_torrent(
    service: State<'_, TorrentService>,
    torrent_id: usize,
    delete_files: bool,
) -> Result<(), String> {
    service
        .remove_torrent(torrent_id, delete_files)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn move_queued_torrent(
    service: State<'_, TorrentService>,
    torrent_id: usize,
    movement: QueueMove,
) -> Result<TorrentStatus, String> {
    service
        .move_queued_torrent(torrent_id, movement)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_torrent_folder(
    app: AppHandle,
    service: State<'_, TorrentService>,
    torrent_id: usize,
) -> Result<(), String> {
    let directory = service
        .torrent_output_directory(torrent_id)
        .map_err(|error| error.to_string())?;
    app.opener()
        .open_path(directory.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| format!("Could not open the torrent's download folder: {error}"))
}

#[tauri::command]
pub fn get_search_providers(service: State<'_, SearchService>) -> Vec<SearchProviderInfo> {
    service.providers()
}

#[tauri::command]
pub async fn refresh_search_provider_health(
    service: State<'_, SearchService>,
) -> Result<Vec<SearchProviderInfo>, String> {
    Ok(service.refresh_provider_health().await)
}

#[tauri::command]
pub async fn search_torrents(
    service: State<'_, SearchService>,
    search_id: String,
    query: String,
    page: u32,
    filters: SearchFilters,
) -> Result<TorrentSearchResponse, String> {
    service.search(search_id, query, page, filters).await
}

#[tauri::command]
pub fn cancel_torrent_search(service: State<'_, SearchService>, search_id: String) -> bool {
    service.cancel_search(&search_id)
}

#[tauri::command]
pub async fn get_torrent_search_details(
    service: State<'_, SearchService>,
    provider_id: String,
    result_id: String,
) -> Result<TorrentSearchDetails, String> {
    service.get_details(&provider_id, &result_id).await
}

#[tauri::command]
pub async fn get_torrent_search_source(
    service: State<'_, SearchService>,
    provider_id: String,
    result_id: String,
) -> Result<TorrentDownloadSource, String> {
    service.get_download_source(&provider_id, &result_id).await
}
