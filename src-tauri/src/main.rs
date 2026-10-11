#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[tauri::command]
fn bridge_config() -> (String, String) {
    let port = std::env::var("PET_PORT").unwrap_or_else(|_| "17789".into());
    let endpoint = std::env::var("PET_ENDPOINT")
        .unwrap_or_else(|_| format!("ws://127.0.0.1:{port}/ws"));
    (endpoint, std::env::var("PET_TOKEN").unwrap_or_default())
}
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![bridge_config])
        .run(tauri::generate_context!())
        .expect("failed to start Duckside");
}
