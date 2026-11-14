use base64::Engine;
use rand::RngCore;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::State;

use crate::state::{HostError, HostState, PendingAuth};

const KEYRING_SERVICE: &str = "ng.llacademy.edapex";
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

fn entry() -> Result<keyring::Entry, HostError> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| HostError::new("auth_required", format!("Secure storage: {error}"), false))
}

pub fn session_token() -> Result<Option<String>, HostError> {
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

fn store_token(token: &str) -> Result<(), HostError> {
    entry()?
        .set_password(token)
        .map_err(|error| HostError::new("auth_required", format!("Store secure token: {error}"), false))
}

fn clear_token() -> Result<(), HostError> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(HostError::new(
            "auth_required",
            format!("Clear secure token: {error}"),
            false,
        )),
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
pub async fn auth_start(state: State<'_, HostState>) -> Result<AuthStartResult, HostError> {
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
    let _ = open::that(&authorize_url);
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
