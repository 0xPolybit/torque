use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::torrent::{DownloadDirectory, TorrentFileSelection, TorrentService, TorrentStatus};

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
pub async fn add_magnet(
    service: State<'_, TorrentService>,
    magnet_link: String,
    output_directory_id: String,
) -> Result<TorrentStatus, String> {
    service
        .add_magnet(&magnet_link, &output_directory_id)
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
pub async fn add_torrent_file(
    service: State<'_, TorrentService>,
    torrent_file_id: String,
    output_directory_id: String,
) -> Result<TorrentStatus, String> {
    service
        .add_selected_torrent_file(&torrent_file_id, &output_directory_id)
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
pub async fn add_torrent_url(
    service: State<'_, TorrentService>,
    torrent_url: String,
    output_directory_id: String,
) -> Result<TorrentStatus, String> {
    service
        .add_torrent_url(&torrent_url, &output_directory_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_torrents(service: State<'_, TorrentService>) -> Result<Vec<TorrentStatus>, String> {
    service.get_torrents().map_err(|error| error.to_string())
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
