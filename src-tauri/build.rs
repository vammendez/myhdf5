fn main() {
    // Increase stack size for Windows to handle large files
    #[cfg(target_os = "windows")]
    {
        println!("cargo:rustc-link-arg=/STACK:16777216"); // 16 MB stack
    }
    
    tauri_build::build()
}
