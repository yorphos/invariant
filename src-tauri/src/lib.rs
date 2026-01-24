mod db;
#[cfg(desktop)]
mod updater;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(db::DbState {
            connections: std::sync::Mutex::new(std::collections::HashMap::new()),
        });

    #[cfg(desktop)]
    {
        builder = builder.manage(updater::PendingUpdate(std::sync::Mutex::new(None)));
    }

    builder = builder
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    #[cfg(desktop)]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            db::execute_transaction,
            updater::check_for_update,
            updater::download_and_install_update,
            updater::get_current_version,
        ]);
    }

    #[cfg(not(desktop))]
    {
        builder = builder.invoke_handler(tauri::generate_handler![db::execute_transaction]);
    }

    builder
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Show the main window after setup is complete
            let window = app.get_webview_window("main").unwrap();
            window.show().unwrap();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
