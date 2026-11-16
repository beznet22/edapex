//! The seam a durable host implements to survive its own process.
//!
//! The runtime knows how to run a turn; it does not know where a checkpoint
//! goes, and it must not care. A recorder receives the three moments worth
//! persisting — the run starting, each tool-round boundary, and the end — and
//! everything else (SQLite, sealing, leases) stays outside this crate.
//!
//! **A recorder failure must not fail a turn.** The trait returns nothing
//! because there is no useful recovery mid-turn: losing a checkpoint degrades
//! durability after the fact, while aborting the turn loses the work entirely.
//! An implementation reports its own errors where its host can see them.

use crate::provider::ChatMessage;
use crate::protocol::TurnCompletionStatus;

/// What the runtime knows about a run when it starts.
pub struct RunStart<'a> {
    pub run_id: &'a str,
    pub thread_id: &'a str,
    /// The person's message, verbatim. The recorder seals it with the rest.
    pub input: &'a str,
    /// Everything a worker needs to rebuild the same request with no session
    /// in memory. Without these a resumed run has a transcript and no model.
    pub model: &'a str,
    pub workspace_id: &'a str,
    pub mobile_safe_tools: bool,
}

pub trait TurnRecorder: Send + Sync {
    fn started(&self, run: RunStart<'_>);

    /// Called **after a tool round completes**, never per token: a round is the
    /// unit a resume can safely restart from.
    fn checkpoint(&self, run_id: &str, messages: &[ChatMessage]);

    fn finished(&self, run_id: &str, status: TurnCompletionStatus, error: Option<&str>);
}
