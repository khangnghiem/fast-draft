//! Fast Draft desktop app entry point.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    fd_desktop::run();
}
