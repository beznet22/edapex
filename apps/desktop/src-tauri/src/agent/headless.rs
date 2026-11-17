//! What a WorkManager worker runs with no Activity attached.
//!
//! The worker drives the **same durable sessions** the window does. It opens the
//! one `agent.db`, claims every session that still has queued work, drains that
//! queue through the Infinity driver, and releases each lease on the way out.
//!
//! There is no second resume engine here: a session's queued messages and its
//! model context already live in the store, so "resume" is opening the driver and
//! asking it to continue.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use edapex_agent::{
    AgentConnectSettings, AgentEvent, ApprovalHandler, EventSink, NativeAgentDriver, StoreContext,
};
use edapex_store::MasterKey;

use super::pending::{group, pending_sessions};
use super::provider::ModelRouterProvider;
use super::tools::{to_host_error, HostTools};
use super::HostEnv;
use crate::state::{CaptureStore, HostError};

/// Bounded so one worker invocation cannot drain an arbitrary backlog.
const BATCH: usize = 4;
/// A worker must not hold the process open forever waiting for a model.
const MAX_WAIT: Duration = Duration::from_secs(120);
/// How long to wait for the first turn to start before concluding there was none.
const START_GRACE: Duration = Duration::from_secs(3);

/// Counts turns so the worker knows when to stop waiting.
#[derive(Default)]
struct Completion {
    started: AtomicUsize,
    finished: AtomicUsize,
    failures: Mutex<Vec<String>>,
}

impl EventSink for Completion {
    fn emit(&self, event: AgentEvent) {
        match event {
            AgentEvent::TurnStarted { .. } => {
                self.started.fetch_add(1, Ordering::SeqCst);
            }
            AgentEvent::TurnCompleted { .. } => {
                self.finished.fetch_add(1, Ordering::SeqCst);
            }
            AgentEvent::Error { error, .. } => {
                if let Ok(mut failures) = self.failures.lock() {
                    failures.push(error.message);
                }
            }
            _ => {}
        }
    }
}

impl Completion {
    fn drained(&self) -> bool {
        let started = self.started.load(Ordering::SeqCst);
        started > 0 && started == self.finished.load(Ordering::SeqCst)
    }
}

/// Drains every session this process may run. Returns how many turns completed.
pub async fn run_open_runs(
    env: &HostEnv,
    approvals: Arc<dyn ApprovalHandler>,
) -> Result<usize, HostError> {
    let session_token = crate::auth::session_token()?.ok_or_else(HostError::auth_required)?;
    let path = env
        .agent_db()
        .to_str()
        .map(str::to_string)
        .ok_or_else(|| {
            HostError::new("internal_error", "Agent database path is not UTF-8", false)
        })?;
    let master = super::env::agent_master_key()?;
    let pending = pending_sessions(&path, master, BATCH)?;
    if pending.is_empty() {
        return Ok(0);
    }

    let mut completed = 0;
    for (workspace_id, model, mobile_safe_tools, sessions) in group(pending) {
        let context = StoreContext::open(&path, &workspace_id, MasterKey::from_bytes(master))
            .map_err(|error| {
                HostError::new("storage_unavailable", error.to_string(), true)
            })?;
        let completion = Arc::new(Completion::default());
        let driver = NativeAgentDriver::connect(
            AgentConnectSettings {
                workspace_id: workspace_id.clone(),
                model,
                mobile_safe_tools,
            },
            context,
            Arc::new(ModelRouterProvider::new(session_token.clone())),
            Arc::new(HostTools {
                env: Arc::new(env.clone()),
                captures: Arc::new(CaptureStore::default()),
            }),
            approvals.clone(),
            completion.clone(),
        )
        .map_err(to_host_error)?;
        // A worker has no WebView: the transcript is durable in the store, so no
        // channel is attached and nothing here depends on one.

        for session_id in &sessions {
            driver
                .create_session(session_id)
                .await
                .map_err(to_host_error)?;
        }
        completed += wait_for_drain(&completion).await;
        driver.close().await.map_err(to_host_error)?;
    }
    Ok(completed)
}

async fn wait_for_drain(completion: &Completion) -> usize {
    let start = Instant::now();
    while start.elapsed() < MAX_WAIT {
        if completion.drained() {
            break;
        }
        if completion.started.load(Ordering::SeqCst) == 0 && start.elapsed() > START_GRACE {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    completion.finished.load(Ordering::SeqCst)
}

#[cfg(test)]
#[path = "headless_tests.rs"]
mod tests;
