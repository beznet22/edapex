use std::sync::OnceLock;

use jni::objects::{JClass, JString};
use jni::JNIEnv;
use tauri::{AppHandle, Emitter};

/// The app handle JNI needs.
///
/// A JNI function is called from a JVM thread and cannot receive Tauri state, so the handle
/// is captured once at setup. `OnceLock` is enough: there is one app per process.
static APP: OnceLock<AppHandle> = OnceLock::new();

pub fn set_app(handle: AppHandle) {
    let _ = APP.set(handle);
}

/// Trade a Google ID token for a session, in Rust.
///
/// The token crosses from Kotlin to here and never reaches the page; the session token is
/// written to the keychain and only an event travels back to the WebView. A failure is
/// reported as the message the sign-in screen shows, because "nothing happened" after a tap
/// is the worst of the three outcomes.
pub async fn exchange(token: &str) -> Result<(), String> {
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| format!("Sign-in client: {error}"))?
        .post(format!("{}/api/v1/auth/google/native", crate::auth::api_base()))
        .json(&serde_json::json!({ "idToken": token }))
        .send()
        .await
        .map_err(|error| format!("Sign-in request: {error}"))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("Sign-in response: {error}"))?;

    if !status.is_success() {
        let message = body
            .get("message")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("Google sign-in was rejected");
        return Err(message.to_string());
    }

    let token = body
        .get("token")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "Sign-in response has no session".to_string())?;
    crate::auth::store_token(token).map_err(|error| error.message)
}

fn emit<S: serde::Serialize + Clone>(app: &AppHandle, event: &str, payload: S) {
    let _ = app.emit(event, payload);
}

#[no_mangle]
pub extern "system" fn Java_com_bronotek_edapex_NativeAuth_exchange(
    mut env: JNIEnv,
    _class: JClass,
    token: JString,
) {
    let Ok(token) = env.get_string(&token) else {
        return;
    };
    let token: String = token.into();
    let Some(app) = APP.get().cloned() else {
        return;
    };

    tauri::async_runtime::spawn(async move {
        match exchange(&token).await {
            Ok(()) => emit(&app, "auth:changed", true),
            Err(message) => emit(&app, "auth:failed", message),
        }
    });
}

#[no_mangle]
pub extern "system" fn Java_com_bronotek_edapex_NativeAuth_failed(
    mut env: JNIEnv,
    _class: JClass,
    message: JString,
) {
    let text = env
        .get_string(&message)
        .map(String::from)
        .unwrap_or_else(|_| "Google sign-in could not start".to_string());
    if let Some(app) = APP.get() {
        emit(app, "auth:failed", text);
    }
}
