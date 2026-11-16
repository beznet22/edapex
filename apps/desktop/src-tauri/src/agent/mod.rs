//! The native agent host: environment, transport, tools, approvals, commands.
//!
//! Nothing here reaches for a window or an Activity. `HostEnv` is the only
//! ambient dependency, which is what lets a turn resume inside a WorkManager
//! worker with no UI attached.

mod approvals;
pub(crate) mod commands;
mod env;
// The JNI entry point is what calls these; nothing in the process does until it
// lands, which is the next step. Remove both allows with that commit.
#[allow(dead_code)]
mod headless;
#[allow(dead_code)]
mod history;
mod journal;
mod provider;
mod session;
mod tools;

pub use approvals::ApprovalRegistry;
pub use env::HostEnv;
pub use session::AgentSession;
