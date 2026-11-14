use std::fs;

use serde::Deserialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub enabled: bool,
    pub command: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub args: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct McpFile {
    #[serde(rename = "chrome-devtools")]
    chrome_devtools: Option<McpServer>,
}

pub fn chrome_server(app: &AppHandle) -> Option<McpServer> {
    let path = app.path().app_config_dir().ok()?.join("mcp.json");
    let text = fs::read_to_string(path).ok()?;
    let file: McpFile = serde_json::from_str(&text).ok()?;
    let server = file.chrome_devtools?;
    if !server.enabled || server.command.trim().is_empty() {
        return None;
    }
    Some(server)
}

pub fn chrome_available(app: &AppHandle) -> bool {
    chrome_server(app).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_disabled_or_empty_chrome_servers() {
        let disabled: McpFile = serde_json::from_str(
            r#"{"chrome-devtools":{"enabled":false,"command":"npx"}}"#,
        )
        .unwrap();
        assert!(disabled.chrome_devtools.is_some());

        let empty: McpFile = serde_json::from_str(
            r#"{"chrome-devtools":{"enabled":true,"command":" "}}"#,
        )
        .unwrap();
        let server = empty.chrome_devtools.unwrap();
        assert!(server.command.trim().is_empty());
    }
}
