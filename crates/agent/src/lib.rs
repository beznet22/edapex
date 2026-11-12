//! Native agent host.
//!
//! The host keeps every app-server protocol object inside this process. The
//! Tauri adapter converts the typed event channel into WebView events; no
//! app-server socket or sidecar is used.

pub mod error;
pub mod host;
pub mod protocol;

pub use error::AgentError;
pub use host::{AgentHost, AgentHostOptions};
