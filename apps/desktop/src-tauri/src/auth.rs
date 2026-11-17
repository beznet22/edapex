use base64::Engine;
use rand::RngCore;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::state::{HostError, HostState, PendingAuth};

const KEYRING_SERVICE: &str = "com.bronotek.edapex";
const KEYRING_USER: &str = "session";
const DEFAULT_API_BASE: &str = "https://api.llacademy.ng";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStartResult {
    pub authorize_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub authenticated: bool,
}

pub fn api_base() -> String {
    std::env::var("EDAPEX_API_BASE")
        .unwrap_or_else(|_| DEFAULT_API_BASE.to_string())
        .trim_end_matches('/')
        .to_string()
}

#[cfg(target_os = "android")]
mod android {
    //! The Keystore-backed store, reached over JNI.
    //!
    //! `keyring` has no Android backend and quietly falls back to memory, so this is the one
    //! that persists. The class is resolved once, from the JVM thread that calls
    //! `RunBridge.nativeInit`: `FindClass` on an arbitrary thread cannot see app classes.

    use jni::objects::{GlobalRef, JObject, JString, JValue};
    use jni::JavaVM;
    use std::sync::OnceLock;

    use crate::state::HostError;

    static VM: OnceLock<JavaVM> = OnceLock::new();
    static CLASS: OnceLock<GlobalRef> = OnceLock::new();

    pub fn init(env: &mut jni::JNIEnv) {
        let Ok(vm) = env.get_java_vm() else { return };
        let Ok(local) = env.find_class("com/bronotek/edapex/SessionStore") else {
            return;
        };
        let Ok(global) = env.new_global_ref(local) else { return };
        let _ = CLASS.set(global);
        let _ = VM.set(vm);
    }

    fn failure(action: &str, detail: impl std::fmt::Display) -> HostError {
        HostError::new("auth_required", format!("{action}: {detail}"), false)
    }

    fn with_env<T>(
        action: &str,
        body: impl FnOnce(&mut jni::JNIEnv, &jni::objects::JClass) -> Result<T, HostError>,
    ) -> Result<T, HostError> {
        let class = CLASS
            .get()
            .ok_or_else(|| failure(action, "the session store is not ready"))?;
        let vm = VM
            .get()
            .ok_or_else(|| failure(action, "the session store is not ready"))?;
        let mut env = vm.attach_current_thread().map_err(|e| failure(action, e))?;
        let local = env
            .new_local_ref(&**class)
            .map_err(|e| failure(action, e))?;
        let jclass = jni::objects::JClass::from(local);
        body(&mut env, &jclass)
    }

    pub fn read() -> Result<String, HostError> {
        with_env("Read session", |env, class| {
            let value = env
                .call_static_method(class, "read", "()Ljava/lang/String;", &[])
                .map_err(|e| failure("Read session", e))?;
            let object: JObject = value.l().map_err(|e| failure("Read session", e))?;
            if object.is_null() {
                return Ok(String::new());
            }
            let text: String = env
                .get_string(&JString::from(object))
                .map_err(|e| failure("Read session", e))?
                .into();
            Ok(text)
        })
    }

    pub fn save(token: &str) -> Result<(), HostError> {
        with_env("Store session", |env, class| {
            let value = env
                .new_string(token)
                .map_err(|e| failure("Store session", e))?;
            env.call_static_method(
                class,
                "save",
                "(Ljava/lang/String;)V",
                &[JValue::Object(&JObject::from(value))],
            )
            .map_err(|e| failure("Store session", e))?;
            Ok(())
        })
    }

    pub fn clear() -> Result<(), HostError> {
        with_env("Clear session", |env, class| {
            env.call_static_method(class, "clear", "()V", &[])
                .map_err(|e| failure("Clear session", e))?;
            Ok(())
        })
    }
}

#[cfg(target_os = "android")]
pub fn android_init(env: &mut jni::JNIEnv) {
    android::init(env);
}

#[cfg(not(target_os = "android"))]
fn entry() -> Result<keyring::Entry, HostError> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| HostError::new("auth_required", format!("Secure storage: {error}"), false))
}

pub fn session_token() -> Result<Option<String>, HostError> {
    #[cfg(target_os = "android")]
    {
        let token = android::read()?;
        return Ok(if token.is_empty() { None } else { Some(token) });
    }
    #[cfg(not(target_os = "android"))]
    {
        let entry = entry()?;
        match entry.get_password() {
            Ok(token) if !token.is_empty() => Ok(Some(token)),
            Ok(_) => Ok(None),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(HostError::new(
                "auth_required",
                format!("Read secure storage: {error}"),
                false,
            )),
        }
    }
}

pub(crate) fn store_token(token: &str) -> Result<(), HostError> {
    #[cfg(target_os = "android")]
    {
        return android::save(token);
    }
    #[cfg(not(target_os = "android"))]
    {
        entry()?
            .set_password(token)
            .map_err(|error| HostError::new("auth_required", format!("Store secure token: {error}"), false))
    }
}

fn clear_token() -> Result<(), HostError> {
    #[cfg(target_os = "android")]
    {
        return android::clear();
    }
    #[cfg(not(target_os = "android"))]
    {
        match entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(HostError::new(
                "auth_required",
                format!("Clear secure token: {error}"),
                false,
            )),
        }
    }
}

fn challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

fn verifier() -> String {
    let mut bytes = [0u8; 48];
    rand::thread_rng().fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn client() -> Result<reqwest::Client, HostError> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| HostError::new("internal_error", format!("HTTP client: {error}"), true))
}

#[tauri::command]
pub async fn auth_start(
    app: tauri::AppHandle,
    state: State<'_, HostState>,
) -> Result<AuthStartResult, HostError> {
    let verifier = verifier();
    let code_challenge = challenge(&verifier);
    let response = client()?
        .post(format!("{}/api/v1/auth/desktop/start", api_base()))
        .json(&serde_json::json!({
            "codeChallenge": code_challenge,
            "redirectUri": "edapex://auth"
        }))
        .send()
        .await
        .map_err(|error| HostError::new("provider_unavailable", format!("Sign-in request: {error}"), true))?;
    if !response.status().is_success() {
        return Err(HostError::new(
            "provider_unavailable",
            format!("Sign-in request failed with status {}", response.status()),
            true
        ));
    }
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|error| HostError::new("provider_unavailable", format!("Sign-in response: {error}"), true))?;
    let authorize_url = body
        .get("authorizeUrl")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| HostError::new("provider_unavailable", "Sign-in URL is missing", true))?
        .to_string();

    let mut pending = state
        .pending_auth
        .lock()
        .map_err(|_| HostError::new("internal_error", "Sign-in state is unavailable", true))?;
    *pending = Some(PendingAuth { verifier });
    // `open::that` returns Ok on desktop and silently does nothing on Android — the Android
    // backend needs an Intent, which the opener plugin issues. The `let _` is why the phone
    // sat on "Waiting for your browser" with no browser.
    app.opener()
        .open_url(&authorize_url, None::<&str>)
        .map_err(|error| {
            HostError::new("provider_unavailable", format!("Open browser: {error}"), true)
        })?;
    Ok(AuthStartResult { authorize_url })
}

#[tauri::command]
pub async fn auth_exchange(
    state: State<'_, HostState>,
    code: String,
) -> Result<serde_json::Value, HostError> {
    let pending = state
        .pending_auth
        .lock()
        .map_err(|_| HostError::new("internal_error", "Sign-in state is unavailable", true))?
        .take()
        .ok_or_else(|| HostError::new("auth_required", "Start sign-in before exchanging a code", false))?;
    let response = client()?
        .post(format!("{}/api/v1/auth/desktop/exchange", api_base()))
        .json(&serde_json::json!({
            "code": code,
            "codeVerifier": pending.verifier
        }))
        .send()
        .await
        .map_err(|error| HostError::new("provider_unavailable", format!("Token exchange: {error}"), true))?;
    if !response.status().is_success() {
        return Err(HostError::new(
            "auth_required",
            format!("Token exchange failed with status {}", response.status()),
            false
        ));
    }
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|error| HostError::new("provider_unavailable", format!("Token response: {error}"), true))?;
    let token = body
        .get("token")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| HostError::new("provider_unavailable", "Token is missing", true))?;
    store_token(token)?;
    Ok(body)
}

#[tauri::command]
pub async fn auth_status() -> Result<AuthStatus, HostError> {
    Ok(AuthStatus {
        authenticated: session_token()?.is_some(),
    })
}

#[tauri::command]
pub async fn auth_logout() -> Result<(), HostError> {
    if let Some(token) = session_token()? {
        if let Ok(client) = client() {
            let _ = client
                .post(format!("{}/api/v1/auth/mobile/logout", api_base()))
                .json(&serde_json::json!({ "token": token }))
                .send()
                .await;
        }
    }
    clear_token()
}
