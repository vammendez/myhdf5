// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::fs;
use std::path::PathBuf;

fn get_temp_file_path() -> PathBuf {
    env::temp_dir().join("myhdf5_open_file.txt")
}

#[tauri::command]
fn get_initial_file() -> Option<String> {
    let temp_file = get_temp_file_path();
    
    if temp_file.exists() {
        if let Ok(content) = fs::read_to_string(&temp_file) {
            let path = content.trim().to_string();
            // Always delete the temp file after reading it
            let _ = fs::remove_file(&temp_file);
            if !path.is_empty() {
                return Some(path);
            }
        } else {
            // If we can't read it, delete it
            let _ = fs::remove_file(&temp_file);
        }
    }
    
    None
}

fn main() {
    // Check for H5 file in command line arguments
    let args: Vec<String> = env::args().collect();
    
    // Write debug log
    let log_path = env::temp_dir().join("myhdf5_debug.log");
    let mut log_content = format!("=== App started ===\nArguments count: {}\n", args.len());
    for (i, arg) in args.iter().enumerate() {
        log_content.push_str(&format!("  Arg[{}]: {}\n", i, arg));
    }
    
    // Find H5 file in arguments (skip first arg which is the exe path)
    let h5_file = args.iter().skip(1).find(|arg| {
        let lower = arg.to_lowercase();
        lower.ends_with(".h5") || lower.ends_with(".hdf5") || lower.ends_with(".hdf")
    });
    
    if let Some(file_path) = h5_file {
        log_content.push_str(&format!("Found H5 file: {}\n", file_path));
        
        // Write the file path to a temp file
        let temp_file = get_temp_file_path();
        log_content.push_str(&format!("Temp file path: {:?}\n", temp_file));
        
        match fs::write(&temp_file, file_path) {
            Ok(_) => log_content.push_str("Successfully wrote temp file\n"),
            Err(e) => log_content.push_str(&format!("Failed to write temp file: {}\n", e)),
        }
    } else {
        log_content.push_str("No H5 file found in arguments\n");
    }
    
    let _ = fs::write(&log_path, log_content);

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_initial_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

