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
mod tests {
    use super::*;
    use super::super::pending::now_ms;
    use std::time::{SystemTime, UNIX_EPOCH};
    use edapex_store::{RusqliteDriver, Store};

    /// The driver's default lease; the tests advance past it to simulate a dead holder.
    const LEASE_MS: u64 = 60_000;
    use edapex_agent::StoreContext;
    use edapex_store::session_events::SessionEventInput;

    fn scratch(name: &str) -> String {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir()
            .join(format!(
                "edapex-headless-{name}-{}-{unique}.sqlite",
                std::process::id()
            ))
            .to_string_lossy()
            .into_owned()
    }

    fn queued_session(path: &str, key: MasterKey) {
        let context = StoreContext::open(path, "ws-1", key).expect("open");
        let mut store = context.lock().expect("store");
        store
            .ensure_agent_session("root-1", "ws-1", "device-1", "test/model", false)
            .expect("session");
        store
            .claim_agent_session("root-1", "client-1", LEASE_MS, now_ms())
            .expect("lease");
        store
            .append_agent_session_event(SessionEventInput {
                session_id: "root-1".to_string(),
                event_id: "event-1".to_string(),
                workspace_id: "ws-1".to_string(),
                device_id: "device-1".to_string(),
                holder_id: "client-1".to_string(),
                expected_fence: 1,
                kind: "message_queued".to_string(),
                core_message_id: None,
                command_id: Some("command-1".to_string()),
                dedup_id: Some("dedup-1".to_string()),
                payload: b"{}".to_vec(),
                created_at_ms: now_ms(),
            })
            .expect("queue");
    }

    /// A committed queue must be visible to a worker with fresh handles, and the
    /// worker must not pick it up while another live holder owns it.
    #[test]
    fn only_an_unowned_session_with_queued_work_is_offered() {
        let path = scratch("pending");
        let key = MasterKey::from_bytes([51u8; 32]);
        queued_session(&path, key.clone());

        let offered = {
            let mut store = Store::new(
                RusqliteDriver::open(&path).expect("open"),
                key.clone(),
            );
            store.migrate().expect("migrate");
            store
                .agent_sessions_pending(now_ms(), BATCH)
                .expect("query")
        };
        assert!(offered.is_empty(), "a live holder was offered to the worker");

        let offered_after_expiry = {
            let mut store = Store::new(RusqliteDriver::open(&path).expect("open"), key);
            store.migrate().expect("migrate");
            store
                .agent_sessions_pending(now_ms() + LEASE_MS + 1, BATCH)
                .expect("query")
        };
        assert_eq!(offered_after_expiry.len(), 1);
        assert_eq!(offered_after_expiry[0].session_id, "root-1");
        assert_eq!(offered_after_expiry[0].model, "test/model");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_queued_message_stops_being_offered_once_it_is_sent() {
        use edapex_store::session_events::SessionAppendOutcome;

        let path = scratch("drain");
        let key = MasterKey::from_bytes([52u8; 32]);
        let context = StoreContext::open(&path, "ws-1", key.clone()).expect("open");
        {
            let mut store = context.lock().expect("store");
            store
                .ensure_agent_session("root-1", "ws-1", "device-1", "test/model", false)
                .expect("session");
            let lease = store
                .claim_agent_session("root-1", "client-1", LEASE_MS, now_ms())
                .expect("lease");
            let event = |id: &str, kind: &str| SessionEventInput {
                session_id: "root-1".to_string(),
                event_id: id.to_string(),
                workspace_id: "ws-1".to_string(),
                device_id: "device-1".to_string(),
                holder_id: "client-1".to_string(),
                expected_fence: lease.fence,
                kind: kind.to_string(),
                core_message_id: None,
                command_id: None,
                dedup_id: None,
                payload: b"{}".to_vec(),
                created_at_ms: now_ms(),
            };
            assert_eq!(
                store
                    .append_agent_session_event(event("event-q", "message_queued"))
                    .expect("queued"),
                SessionAppendOutcome::Appended(1)
            );
            store
                .append_agent_session_event(event("event-s", "message_sent"))
                .expect("sent");
        }

        let mut store = Store::new(
            RusqliteDriver::open(&path).expect("open"),
            key,
        );
        store.migrate().expect("migrate");
        assert!(
            store
                .agent_sessions_pending(now_ms() + LEASE_MS + 1, BATCH)
                .expect("query")
                .is_empty(),
            "a drained session was offered again"
        );

        let _ = std::fs::remove_file(&path);
    }
}
