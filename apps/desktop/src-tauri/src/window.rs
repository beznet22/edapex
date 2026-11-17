//! Window controls for the frameless shell.
//!
//! The window has `decorations: false`, so dragging and the control buttons are ours to
//! provide. `data-tauri-drag-region` covers the simple case; these commands exist because the
//! drag area is a dedicated element and the shell needs programmatic control for the
//! double-click-to-maximise path.
//!
//! macOS keeps its native traffic lights (the window uses a transparent titlebar), so the
//! shell does not call the control commands there — but they are harmless, and keeping one
//! command list is worth more than a `cfg` that only hides them.
//!
//! **Android is different.** `start_dragging`, `minimize`, `unmaximize` and `maximize` are
//! `WindowExt` methods that do not exist on a mobile `WebviewWindow`, so the crate did not
//! compile for Android at all. The commands stay registered on every platform — the shell's
//! capability check is what decides whether to call them — and the mobile arm is an explicit
//! no-op rather than a second handler list. `close` and `is_focused` exist on both.

use tauri::Manager;

/// The window these commands act on. One window in v1.
const MAIN: &str = "main";

#[cfg(desktop)]
fn window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window(MAIN)
        .ok_or_else(|| "the main window is not available".to_string())
}

#[tauri::command]
pub fn window_start_dragging(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    {
        window(&app)?.start_dragging().map_err(|error| error.to_string())
    }
    #[cfg(mobile)]
    {
        let _ = app;
        Ok(())
    }
}

#[tauri::command]
pub fn window_minimize(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    {
        window(&app)?.minimize().map_err(|error| error.to_string())
    }
    #[cfg(mobile)]
    {
        let _ = app;
        Ok(())
    }
}

#[tauri::command]
pub fn window_toggle_maximize(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let window = window(&app)?;
        if window.is_maximized().map_err(|error| error.to_string())? {
            window.unmaximize().map_err(|error| error.to_string())
        } else {
            window.maximize().map_err(|error| error.to_string())
        }
    }
    #[cfg(mobile)]
    {
        let _ = app;
        Ok(())
    }
}

#[tauri::command]
pub fn window_close(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    {
        window(&app)?.close().map_err(|error| error.to_string())
    }
    #[cfg(mobile)]
    {
        let _ = app;
        Ok(())
    }
}

/// Reports whether the window has focus.
///
/// The shell dims the titlebar when it does not. An undecorated window has no other way to
/// signal that it is not the active one, and without it the app reads as a page rather than
/// an application.
#[tauri::command]
pub fn window_is_focused(app: tauri::AppHandle) -> Result<bool, String> {
    app.get_webview_window(MAIN)
        .ok_or_else(|| "the main window is not available".to_string())?
        .is_focused()
        .map_err(|error| error.to_string())
}
