use edapex_core::CoreHealth;

#[tauri::command]
fn runtime_health() -> CoreHealth {
    edapex_core::health()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![runtime_health])
        .run(tauri::generate_context!())
        .expect("error while running EdApex Work");
}
