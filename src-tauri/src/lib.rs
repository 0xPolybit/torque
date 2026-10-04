mod commands;
mod discovery;
mod torrent;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let default_output = app
                .path()
                .download_dir()
                .or_else(|_| app.path().app_data_dir().map(|path| path.join("Downloads")))?;
            let persistence_directory = app.path().app_data_dir()?.join("rqbit");
            let application_state_path = app.path().app_data_dir()?.join("application-state.json");
            let service = tauri::async_runtime::block_on(torrent::TorrentService::new(
                default_output,
                persistence_directory,
                application_state_path,
            ))
            .map_err(|error| std::io::Error::other(error.to_string()))?;
            app.manage(service);
            app.manage(discovery::SearchService::new());

            let show_item = MenuItem::with_id(app, "show", "Show Torque", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Torque", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            if let Some(icon) = app.default_window_icon() {
                TrayIconBuilder::new()
                    .icon(icon.clone())
                    .tooltip("Torque")
                    .menu(&menu)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if matches!(
                            event,
                            TrayIconEvent::Click {
                                button: MouseButton::Left,
                                button_state: MouseButtonState::Up,
                                ..
                            }
                        ) {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let minimize_to_tray = app
                    .try_state::<torrent::TorrentService>()
                    .and_then(|service| service.preferences().ok())
                    .is_some_and(|preferences| preferences.minimize_to_tray);
                if minimize_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::get_app_preferences,
            commands::set_app_preferences,
            commands::get_download_directories,
            commands::select_download_directory,
            commands::select_torrent_file,
            commands::discard_torrent_file_selection,
            commands::inspect_magnet,
            commands::inspect_torrent_file,
            commands::inspect_torrent_url,
            commands::start_inspected_torrent,
            commands::get_output_directory_free_space,
            commands::discard_torrent_preview,
            commands::get_torrents,
            commands::get_torrent_status,
            commands::get_torrent_details,
            commands::update_torrent_file_selection,
            commands::pause_torrent,
            commands::resume_torrent,
            commands::retry_torrent,
            commands::remove_torrent,
            commands::move_queued_torrent,
            commands::open_torrent_folder,
            commands::get_search_providers,
            commands::refresh_search_provider_health,
            commands::search_torrents,
            commands::cancel_torrent_search,
            commands::get_torrent_search_details,
            commands::get_torrent_search_source
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Torque desktop shell");
}
