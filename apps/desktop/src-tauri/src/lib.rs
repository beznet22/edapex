mod window;
mod agent;
mod api;
mod native_auth;
mod auth;
mod capture;
mod mcp;
mod ocr;
mod pdf;
mod state;

use edapex_core::CoreHealth;
use serde::Serialize;

use state::HostState;
use tauri::Manager;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostCapabilities {
    pub native_agent: bool,
    pub local_ocr: bool,
    pub screenshot_capture: bool,
    pub camera_preview: bool,
    pub browser_assistance: bool,
    pub mobile_safe_tools_only: bool,
}

#[tauri::command]
fn runtime_health() -> CoreHealth {
    edapex_core::health()
}

#[tauri::command]
fn host_capabilities(app: tauri::AppHandle) -> HostCapabilities {
    HostCapabilities {
        native_agent: app.state::<HostState>().has_agent(),
        local_ocr: true,
        screenshot_capture: cfg!(not(any(target_os = "android", target_os = "ios"))),
        camera_preview: false,
        browser_assistance: cfg!(not(any(target_os = "android", target_os = "ios")))
            && mcp::chrome_available(&app),
        mobile_safe_tools_only: cfg!(any(target_os = "android", target_os = "ios")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .manage(HostState::default())
        .setup(|app| {
            native_auth::set_app(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_health,
            host_capabilities,
            agent::commands::agent_connect,
            agent::commands::agent_attach,
            agent::commands::agent_thread_start,
            agent::commands::agent_turn_start,
            agent::commands::agent_turn_interrupt,
            agent::commands::agent_approval_response,
            agent::commands::agent_close,
            auth::auth_start,
            auth::auth_exchange,
            auth::auth_status,
            auth::auth_logout,
            api::api_request,
            api::ocr_mistral,
            window::window_start_dragging,
            window::window_minimize,
            window::window_toggle_maximize,
            window::window_close,
            window::window_is_focused,
            capture::capture_screen,
            capture::capture_import,
            capture::capture_import_path,
            capture::capture_release,
            capture::capture_preview,
            ocr::ocr_extract,
            pdf::render_pdf
        ])
        .run(tauri::generate_context!())
        .expect("error while running EdApex Work");
}
