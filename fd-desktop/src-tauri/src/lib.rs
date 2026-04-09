//! Fast Draft desktop app — Tauri v2 backend.
//!
//! Exposes IPC commands for native file I/O (Open/Save/Recent Files).
//! The frontend is the existing `site/` web playground served via Tauri's
//! built-in web view — no rendering changes needed.

mod commands;

#[cfg(test)]
mod commands_tests;

use std::path::PathBuf;
use std::sync::Mutex;

pub use commands::*;

/// Application state shared across IPC commands.
pub struct AppState {
    /// Path to the currently open file (if any).
    pub current_file: Mutex<Option<PathBuf>>,
    /// Path to the app data directory (for recent files).
    pub app_data_dir: PathBuf,
}

/// Tauri app entry point — called from main.rs.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            use tauri::Manager;
            let app_data = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            app.manage(AppState {
                current_file: Mutex::new(None),
                app_data_dir: app_data,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_file,
            commands::save_file,
            commands::get_recent_files,
            commands::add_recent_file,
            commands::get_current_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Fast Draft");
}
