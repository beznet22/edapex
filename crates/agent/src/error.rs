use thiserror::Error;

#[derive(Debug, Error)]
pub enum AgentError {
    #[error("agent configuration is invalid: {0}")]
    Config(String),
    #[error("agent transport is unavailable: {0}")]
    Transport(String),
    #[error("agent request failed: {0}")]
    Request(String),
    #[error("agent is not connected")]
    NotConnected,
}

impl From<std::io::Error> for AgentError {
    fn from(error: std::io::Error) -> Self {
        Self::Transport(error.to_string())
    }
}
