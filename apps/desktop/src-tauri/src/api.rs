use std::collections::HashMap;
use std::fs;

use reqwest::Method;
use serde::Deserialize;
use tauri::State;

use crate::auth::{api_base, session_token};
use crate::state::{HostError, HostState};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TenantHeaders {
    pub academic_id: i64,
    pub class_id: i64,
    pub section_id: i64,
}

fn allowed_path(path: &str) -> bool {
    path.starts_with("/api/v1/")
        && !path.contains("..")
        && !path.contains("://")
        && !path.contains('\\')
}

fn method_of(value: &str) -> Result<Method, HostError> {
    match value.to_ascii_uppercase().as_str() {
        "GET" => Ok(Method::GET),
        "POST" => Ok(Method::POST),
        "PATCH" => Ok(Method::PATCH),
        "DELETE" => Ok(Method::DELETE),
        _ => Err(HostError::new(
            "invalid_input",
            "Unsupported HTTP method",
            false,
        )),
    }
}

fn error_for_status(status: reqwest::StatusCode, body: &serde_json::Value) -> HostError {
    let message = body
        .get("message")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("EdApex API request failed");
    if status == reqwest::StatusCode::UNAUTHORIZED {
        HostError::new("auth_required", message, false)
    } else {
        HostError::new("provider_unavailable", message, status.is_server_error())
    }
}

async fn send(
    method: Method,
    path: String,
    body: Option<serde_json::Value>,
    headers: Option<HashMap<String, String>>,
) -> Result<serde_json::Value, HostError> {
    if !allowed_path(&path) {
        return Err(HostError::new(
            "invalid_input",
            "API path is not allowed",
            false,
        ));
    }
    let token = session_token()?.ok_or_else(HostError::auth_required)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| HostError::new("internal_error", format!("HTTP client: {error}"), true))?;
    let mut request = client
        .request(method, format!("{}{}", api_base(), path))
        .bearer_auth(token);
    if let Some(headers) = headers {
        for (key, value) in headers {
            request = request.header(key, value);
        }
    }
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|error| HostError::new("provider_unavailable", format!("API request: {error}"), true))?;
    if response.status() == reqwest::StatusCode::NO_CONTENT {
        return Ok(serde_json::Value::Null);
    }
    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|error| HostError::new("provider_unavailable", format!("API response: {error}"), true))?;
    if !status.is_success() {
        return Err(error_for_status(status, &body));
    }
    Ok(body)
}

#[tauri::command]
pub async fn api_request(
    method: String,
    path: String,
    body: Option<serde_json::Value>,
    headers: Option<HashMap<String, String>>,
) -> Result<serde_json::Value, HostError> {
    send(method_of(&method)?, path, body, headers).await
}

#[tauri::command]
pub async fn ocr_mistral(
    state: State<'_, HostState>,
    capture_id: String,
    tenant: TenantHeaders,
) -> Result<serde_json::Value, HostError> {
    let path = state.capture_path(&capture_id)?;
    let bytes = fs::read(&path)
        .map_err(|error| HostError::new("invalid_input", format!("Read capture: {error}"), false))?;
    if bytes.len() as u64 > 10 * 1024 * 1024 {
        return Err(HostError::new("invalid_input", "Capture is larger than 10 MB", false));
    }
    let token = session_token()?.ok_or_else(HostError::auth_required)?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("capture.jpg")
        .to_string();
    let form = reqwest::multipart::Form::new().part(
        "file",
        reqwest::multipart::Part::bytes(bytes)
            .file_name(file_name)
            .mime_str("image/jpeg")
            .map_err(|error| HostError::new("invalid_input", format!("Capture type: {error}"), false))?,
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|error| HostError::new("internal_error", format!("HTTP client: {error}"), true))?;
    let response = client
        .post(format!("{}/api/v1/assessments/ocr/extractions", api_base()))
        .bearer_auth(token)
        .header("x-ocr-consent", "cloud")
        .header("X-Academic-Id", tenant.academic_id.to_string())
        .header("X-Class-Id", tenant.class_id.to_string())
        .header("X-Section-Id", tenant.section_id.to_string())
        .multipart(form)
        .send()
        .await
        .map_err(|error| HostError::new("provider_unavailable", format!("Cloud OCR: {error}"), true))?;
    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|error| HostError::new("provider_unavailable", format!("Cloud OCR response: {error}"), true))?;
    if !status.is_success() {
        return Err(error_for_status(status, &body));
    }
    Ok(body)
}
