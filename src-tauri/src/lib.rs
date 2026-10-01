mod commands;
mod torrent;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let default_output = app
                .path()
                .download_dir()
                .or_else(|_| app.path().app_data_dir().map(|path| path.join("Downloads")))?;
            let persistence_directory = app.path().app_data_dir()?.join("rqbit");
            let service = tauri::async_runtime::block_on(torrent::TorrentService::new(
                default_output,
                persistence_directory,
            ))
            .map_err(|error| std::io::Error::other(error.to_string()))?;
            app.manage(service);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::get_download_directories,
            commands::select_download_directory,
            commands::add_magnet,
            commands::add_torrent_file,
            commands::add_torrent_url,
            commands::get_torrents,
            commands::get_torrent_status
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Torque desktop shell");
}
