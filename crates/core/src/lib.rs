//! Shared EdApex local core.
//!
//! This crate owns platform-neutral local state and capabilities. School data
//! remains authoritative in the Cloudflare Worker; this crate never stores it.

use serde::Serialize;

pub const CORE_VERSION: &str = "0.1.0";
pub const LOCAL_STATE_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CoreHealth {
    pub core_version: &'static str,
    pub local_state_schema: u32,
    pub agent_connected: bool,
}

/// The initial local core surface. Needle and local documents attach here in a
/// later chunk.
pub fn health() -> CoreHealth {
    CoreHealth {
        core_version: CORE_VERSION,
        local_state_schema: LOCAL_STATE_SCHEMA_VERSION,
        agent_connected: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_is_offline_and_versioned() {
        let health = health();
        assert!(!health.agent_connected);
        assert_eq!(health.local_state_schema, 1);
        assert_eq!(health.core_version, "0.1.0");
    }
}
