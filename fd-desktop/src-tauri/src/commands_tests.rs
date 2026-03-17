//! Integration tests for desktop IPC commands.
//!
//! Each test creates an isolated temp directory so tests can run in parallel
//! without interfering with each other or the real filesystem.

use crate::commands::*;
use crate::AppState;
use std::path::PathBuf;
use std::sync::Mutex;
use tempfile::TempDir;

/// Create a fresh `AppState` rooted in a temp directory.
fn make_state(tmp: &TempDir) -> AppState {
    AppState {
        current_file: Mutex::new(None),
        app_data_dir: tmp.path().to_path_buf(),
    }
}

/// Helper: write a file inside the temp dir and return its path.
fn write_tmp_file(tmp: &TempDir, name: &str, content: &str) -> String {
    let path = tmp.path().join(name);
    std::fs::write(&path, content).unwrap();
    path.to_string_lossy().to_string()
}

// ── open_file ─────────────────────────────────────────────────────

#[test]
fn open_file_reads_content() {
    let tmp = TempDir::new().unwrap();
    let state = make_state(&tmp);
    let path = write_tmp_file(&tmp, "hello.fd", "rect @box { w: 100 h: 50 }");

    let result = open_file_inner(&path, &state);
    assert_eq!(result.unwrap(), "rect @box { w: 100 h: 50 }");

    // current_file should be updated
    let current = state.current_file.lock().unwrap();
    assert_eq!(current.as_ref().unwrap(), &PathBuf::from(&path));
}

#[test]
fn open_file_nonexistent_errors() {
    let tmp = TempDir::new().unwrap();
    let state = make_state(&tmp);
    let path = tmp.path().join("nope.fd").to_string_lossy().to_string();

    let result = open_file_inner(&path, &state);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("Failed to open"));
}

// ── save_file ─────────────────────────────────────────────────────

#[test]
fn save_file_writes_content() {
    let tmp = TempDir::new().unwrap();
    let state = make_state(&tmp);
    let path = tmp.path().join("out.fd").to_string_lossy().to_string();

    save_file_inner(&path, "ellipse @dot { w: 20 h: 20 }", &state).unwrap();

    let content = std::fs::read_to_string(&path).unwrap();
    assert_eq!(content, "ellipse @dot { w: 20 h: 20 }");

    let current = state.current_file.lock().unwrap();
    assert_eq!(current.as_ref().unwrap(), &PathBuf::from(&path));
}

#[test]
fn save_file_overwrites_existing() {
    let tmp = TempDir::new().unwrap();
    let state = make_state(&tmp);
    let path = write_tmp_file(&tmp, "existing.fd", "old content");

    save_file_inner(&path, "new content", &state).unwrap();

    let content = std::fs::read_to_string(&path).unwrap();
    assert_eq!(content, "new content");
}

// ── get_recent_files ──────────────────────────────────────────────

#[test]
fn get_recent_files_empty() {
    let tmp = TempDir::new().unwrap();
    let state = make_state(&tmp);

    let files = get_recent_files_inner(&state);
    assert!(files.is_empty());
}

// ── add_recent_file ───────────────────────────────────────────────

#[test]
fn add_recent_file_persists() {
    let tmp = TempDir::new().unwrap();
    let state = make_state(&tmp);

    add_recent_file_inner("/home/user/project/design.fd", &state).unwrap();

    let files = get_recent_files_inner(&state);
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].path, "/home/user/project/design.fd");
    assert_eq!(files[0].name, "design.fd");
}

#[test]
fn add_recent_file_deduplicates() {
    let tmp = TempDir::new().unwrap();
    let state = make_state(&tmp);

    add_recent_file_inner("/a/first.fd", &state).unwrap();
    add_recent_file_inner("/b/second.fd", &state).unwrap();
    add_recent_file_inner("/a/first.fd", &state).unwrap(); // re-open

    let files = get_recent_files_inner(&state);
    assert_eq!(files.len(), 2);
    // Most recent first
    assert_eq!(files[0].path, "/a/first.fd");
    assert_eq!(files[1].path, "/b/second.fd");
}

#[test]
fn add_recent_file_caps_at_10() {
    let tmp = TempDir::new().unwrap();
    let state = make_state(&tmp);

    for i in 0..12 {
        add_recent_file_inner(&format!("/files/file_{i}.fd"), &state).unwrap();
    }

    let files = get_recent_files_inner(&state);
    assert_eq!(files.len(), 10);
    // Most recent = file_11, oldest kept = file_2
    assert_eq!(files[0].path, "/files/file_11.fd");
    assert_eq!(files[9].path, "/files/file_2.fd");
}

#[test]
fn add_recent_file_extracts_name() {
    let tmp = TempDir::new().unwrap();
    let state = make_state(&tmp);

    add_recent_file_inner("/long/nested/path/to/ui_mockup.fd", &state).unwrap();

    let files = get_recent_files_inner(&state);
    assert_eq!(files[0].name, "ui_mockup.fd");
}

// ── get_current_file ──────────────────────────────────────────────

#[test]
fn get_current_file_empty_default() {
    let tmp = TempDir::new().unwrap();
    let state = make_state(&tmp);

    assert_eq!(get_current_file_inner(&state), "");
}

#[test]
fn get_current_file_after_open() {
    let tmp = TempDir::new().unwrap();
    let state = make_state(&tmp);
    let path = write_tmp_file(&tmp, "test.fd", "text @hello { content: \"Hi\" }");

    open_file_inner(&path, &state).unwrap();
    assert_eq!(get_current_file_inner(&state), path);
}

// ── roundtrip ─────────────────────────────────────────────────────

#[test]
fn roundtrip_open_save() {
    let tmp = TempDir::new().unwrap();
    let state = make_state(&tmp);
    let path = write_tmp_file(&tmp, "roundtrip.fd", "rect @original { w: 50 h: 50 }");

    // Open
    let content = open_file_inner(&path, &state).unwrap();
    assert_eq!(content, "rect @original { w: 50 h: 50 }");

    // Modify + save
    let modified = content.replace("50", "100");
    save_file_inner(&path, &modified, &state).unwrap();

    // Re-open
    let reloaded = open_file_inner(&path, &state).unwrap();
    assert_eq!(reloaded, "rect @original { w: 100 h: 100 }");
}
