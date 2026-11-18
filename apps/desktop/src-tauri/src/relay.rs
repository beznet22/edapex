use serde_json::{json, Value};
use tauri::command;

use crate::api::{allowed_path, exchange, method_of};
use crate::state::HostError;

/// The session relay's request path.
///
/// `api_request` deliberately maps any rejection to a `HostError`, which loses
/// the status. The relay needs it: 409 `lease_held` and 410 `session_deleted` are
/// answers, not failures, and the client branches on them. This command therefore
/// returns `{ status, body }` and leaves the decision to the caller.
///
/// It is scoped to the session relay rather than re-opening the general proxy:
/// a command that returns arbitrary statuses for arbitrary paths is a wider
/// surface than the one it replaces.
const RELAY_PREFIX: &str = "/api/v1/agent/sessions/";

fn allowed_relay_path(path: &str) -> bool {
    path.len() > RELAY_PREFIX.len()
        && path.starts_with(RELAY_PREFIX)
        && allowed_path(path)
        && !path.contains("..")
        && !path.contains("://")
}

#[command]
pub async fn relay_request(
    method: String,
    path: String,
    body: Option<Value>,
) -> Result<Value, HostError> {
    if !allowed_relay_path(&path) {
        return Err(HostError::new(
            "invalid_input",
            "Relay path is not allowed",
            false,
        ));
    }
    let (status, body) = exchange(method_of(&method)?, path, body, None).await?;
    Ok(json!({ "status": status.as_u16(), "body": body }))
}

#[cfg(test)]
mod tests {
    use super::allowed_relay_path;

    #[test]
    fn accepts_session_relay_paths_only() {
        assert!(allowed_relay_path("/api/v1/agent/sessions/abc/events"));
        assert!(allowed_relay_path("/api/v1/agent/sessions/abc/commands"));
        assert!(!allowed_relay_path("/api/v1/agent/devices"));
        assert!(!allowed_relay_path("/api/v1/agent/sessions/../devices"));
        assert!(!allowed_relay_path("/api/v1/agent/sessions/abc/../../students"));
        assert!(!allowed_relay_path("https://evil.test/api/v1/agent/sessions/x"));
        assert!(!allowed_relay_path("/api/v1/agent/sessions/"));
    }
}
