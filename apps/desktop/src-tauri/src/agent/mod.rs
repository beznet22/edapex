//! The native agent host: environment, transport, tools, approvals, commands.
//!
//! Nothing here reaches for a window or an Activity. `HostEnv` is the only
//! ambient dependency, which is what lets a turn resume inside a WorkManager
//! worker with no UI attached.

mod approvals;
pub(crate) mod commands;
mod bridge;
mod env;
mod headless;
mod pending;
mod provider;
mod session;
mod tools;

pub use approvals::ApprovalRegistry;
pub use env::HostEnv;
pub use session::AgentSession;
