//! IPC commands for native file I/O.

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::State;

/// Maximum number of recent files to remember.
const MAX_RECENT_FILES: usize = 10;

/// Name of the recent-files JSON file in the app data directory.
const RECENT_FILES_NAME: &str = "recent_files.json";

/// A single entry in the recent files list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentFile {
    /// Absolute path to the file.
    pub path: String,
    /// Display name (filename without directory).
    pub name: String,
}

/// Read the content of a `.fd` file from disk.
#[tauri::command]
pub fn open_file(path: String, state: State<'_, AppState>) -> Result<String, String> {
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to open: {e}"))?;
    *state.current_file.lock().unwrap() = Some(PathBuf::from(&path));
    Ok(content)
}

/// Write content to the current file (or a specified path).
#[tauri::command]
pub fn save_file(path: String, content: String, state: State<'_, AppState>) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Failed to save: {e}"))?;
    *state.current_file.lock().unwrap() = Some(PathBuf::from(&path));
    Ok(())
}

/// Get the list of recently opened files.
#[tauri::command]
pub fn get_recent_files(state: State<'_, AppState>) -> Vec<RecentFile> {
    let path = state.app_data_dir.join(RECENT_FILES_NAME);
    match fs::read_to_string(&path) {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

/// Add a file to the recent files list.
#[tauri::command]
pub fn add_recent_file(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let recent_path = state.app_data_dir.join(RECENT_FILES_NAME);

    // Load existing list
    let mut files: Vec<RecentFile> = match fs::read_to_string(&recent_path) {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(_) => Vec::new(),
    };

    // Remove duplicate if present
    files.retain(|f| f.path != path);

    // Extract display name
    let name = PathBuf::from(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    // Prepend new entry
    files.insert(0, RecentFile { path, name });

    // Cap at max
    files.truncate(MAX_RECENT_FILES);

    // Persist
    let json =
        serde_json::to_string_pretty(&files).map_err(|e| format!("Failed to serialize: {e}"))?;
    if let Some(parent) = recent_path.parent() {
        fs::create_dir_all(parent).ok();
    }
    fs::write(&recent_path, json).map_err(|e| format!("Failed to write: {e}"))?;

    Ok(())
}

/// Get the path of the currently open file (or empty string).
#[tauri::command]
pub fn get_current_file(state: State<'_, AppState>) -> String {
    state
        .current_file
        .lock()
        .unwrap()
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}
