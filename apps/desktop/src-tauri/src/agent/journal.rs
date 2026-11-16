//! The store-backed recorder: what makes a turn survive its own process.
//!
//! Every write is sealed by `edapex-store`, so a checkpoint on disk is the
//! conversation as ciphertext. The key lives in the OS keychain under its own
//! entry — losing the entry loses resumability, not the app, and nothing here
//! ever reaches the WebView.

use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use edapex_agent::{AgentEvent, ChatMessage, EventSink, RunStart, TurnCompletionStatus, TurnRecorder};
use edapex_store::{MasterKey, RusqliteDriver, Store};
use rand::RngCore;
use serde_json::{json, Value};

use super::HostEnv;
use crate::state::HostError;

const KEYRING_SERVICE: &str = "com.bronotek.edapex";
const KEYRING_USER: &str = "agent-db";

/// Events are written on the same window as the IPC channel: one transaction
/// per flush, never one insert per token.
const FLUSH_WINDOW: Duration = Duration::from_millis(16);
const FLUSH_COUNT: usize = 64;

struct Pending {
    rows: Vec<(String, String, Vec<u8>)>,
    last_flush: Instant,
}

impl Default for Pending {
    fn default() -> Self {
        Pending {
            rows: Vec::new(),
            last_flush: Instant::now(),
        }
    }
}

pub struct RunJournal {
    store: Mutex<Store<RusqliteDriver>>,
    workspace_id: String,
    pending: Mutex<Pending>,
}

impl RunJournal {
    pub fn open(env: &HostEnv, workspace_id: &str) -> Result<Self, HostError> {
        let path = env
            .agent_db()
            .to_str()
            .map(str::to_string)
            .ok_or_else(|| HostError::new("internal_error", "Agent database path is not UTF-8", false))?;
        let mut store = Store::new(
            RusqliteDriver::open(&path).map_err(store_error)?,
            MasterKey::from_bytes(master_key()?),
        );
        store.migrate().map_err(store_error)?;
        Ok(RunJournal {
            store: Mutex::new(store),
            workspace_id: workspace_id.to_string(),
            pending: Mutex::new(Pending::default()),
        })
    }
}

impl TurnRecorder for RunJournal {
    fn started(&self, run: RunStart<'_>) {
        // A journal write must never take a turn down with it: losing a
        // checkpoint costs durability after the fact, aborting costs the work.
        let result = self.lock(|store| {
            store.begin_run(
                run.run_id,
                run.thread_id,
                &self.workspace_id,
                run.input.as_bytes(),
                now(),
            )
        });
        if let Err(error) = result {
            eprintln!("run journal: could not record a start: {}", error.message);
        }
    }

    fn checkpoint(&self, run_id: &str, messages: &[ChatMessage]) {
        let Ok(payload) = serde_json::to_vec(&messages_json(messages)) else {
            eprintln!("run journal: could not serialise a checkpoint");
            return;
        };
        let result = self.lock(|store| store.checkpoint_run(run_id, &payload, now()));
        if let Err(error) = result {
            eprintln!("run journal: could not write a checkpoint: {}", error.message);
        }
    }

    fn finished(&self, run_id: &str, status: TurnCompletionStatus, error: Option<&str>) {
        // The terminal events belong before the status: a resume must see why a
        // run stopped, and a settled row is what stops it being offered again.
        self.flush();
        let status = match status {
            TurnCompletionStatus::Completed => "done",
            TurnCompletionStatus::Stopped => "interrupted",
            TurnCompletionStatus::Error => "failed",
        };
        let result = self.lock(|store| store.settle_run(run_id, status, error, now()));
        if let Err(error) = result {
            eprintln!("run journal: could not settle a run: {}", error.message);
        }
    }
}

impl RunJournal {
    fn lock<T>(
        &self,
        use_store: impl FnOnce(&mut Store<RusqliteDriver>) -> edapex_store::Result<T>,
    ) -> Result<T, HostError> {
        let mut store = self
            .store
            .lock()
            .map_err(|_| HostError::new("internal_error", "Run journal is unavailable", true))?;
        use_store(&mut store).map_err(store_error)
    }
}

fn store_error(error: edapex_store::StoreError) -> HostError {
    HostError::new("internal_error", format!("Run journal: {error}"), true)
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

/// The transcript as stored, in the same field names the runtime uses on the wire.
fn messages_json(messages: &[ChatMessage]) -> Value {
    Value::Array(
        messages
            .iter()
            .map(|message| {
                let calls: Vec<Value> = message
                    .tool_calls
                    .iter()
                    .map(|call| {
                        json!({
                            "id": call.id,
                            "name": call.name,
                            "arguments": call.arguments,
                        })
                    })
                    .collect();
                json!({
                    "role": message.role.as_str(),
                    "content": message.content.as_deref(),
                    "tool_calls": calls,
                    "tool_call_id": message.tool_call_id,
                })
            })
            .collect(),
    )
}

/// Reads the journal key from the OS keychain, creating it once.
fn master_key() -> Result<[u8; 32], HostError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| HostError::new("internal_error", format!("Keychain: {error}"), true))?;

    use base64::Engine as _;
    let engine = base64::engine::general_purpose::STANDARD;

    match entry.get_password() {
        Ok(stored) => {
            let bytes = engine
                .decode(stored)
                .map_err(|error| HostError::new("internal_error", format!("Journal key: {error}"), true))?;
            let mut key = [0u8; 32];
            if bytes.len() != key.len() {
                return Err(HostError::new(
                    "internal_error",
                    "The journal key in the keychain is the wrong length",
                    false,
                ));
            }
            key.copy_from_slice(&bytes);
            Ok(key)
        }
        Err(keyring::Error::NoEntry) => {
            let mut key = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut key);
            entry.set_password(&engine.encode(key)).map_err(|error| {
                HostError::new("internal_error", format!("Store journal key: {error}"), true)
            })?;
            Ok(key)
        }
        Err(error) => Err(HostError::new(
            "internal_error",
            format!("Read journal key: {error}"),
            true,
        )),
    }
}

impl EventSink for RunJournal {
    fn emit(&self, event: AgentEvent) {
        let Ok(value) = serde_json::to_value(&event) else {
            return;
        };
        let run_id = value.get("turnId").and_then(Value::as_str).unwrap_or_default();
        let kind = value.get("type").and_then(Value::as_str).unwrap_or_default();
        if run_id.is_empty() || kind.is_empty() {
            return;
        }
        let Ok(payload) = serde_json::to_vec(&value) else {
            return;
        };
        let Ok(mut pending) = self.pending.lock() else {
            return;
        };
        pending
            .rows
            .push((run_id.to_string(), kind.to_string(), payload));
        if pending.rows.len() >= FLUSH_COUNT || pending.last_flush.elapsed() >= FLUSH_WINDOW {
            self.write_batch(&mut pending);
        }
    }
}

impl RunJournal {
    /// Writes everything buffered, grouped so each run is one transaction.
    pub fn flush(&self) {
        if let Ok(mut pending) = self.pending.lock() {
            self.write_batch(&mut pending);
        }
    }

    fn write_batch(&self, pending: &mut Pending) {
        pending.last_flush = Instant::now();
        if pending.rows.is_empty() {
            return;
        }
        let rows = std::mem::take(&mut pending.rows);
        let mut by_run: BTreeMap<String, Vec<(String, Vec<u8>)>> = BTreeMap::new();
        for (run_id, kind, payload) in rows {
            by_run.entry(run_id).or_default().push((kind, payload));
        }
        for (run_id, events) in by_run {
            let borrowed: Vec<(&str, &[u8])> = events
                .iter()
                .map(|(kind, payload)| (kind.as_str(), payload.as_slice()))
                .collect();
            if let Err(error) = self.lock(|store| store.append_run_events(&run_id, &borrowed, now())) {
                eprintln!("run journal: could not append events: {}", error.message);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn journal() -> RunJournal {
        let mut store = Store::new(
            RusqliteDriver::in_memory().expect("memory store"),
            MasterKey::from_bytes([3u8; 32]),
        );
        store.migrate().expect("migrate");
        RunJournal {
            store: Mutex::new(store),
            workspace_id: "ws".to_string(),
            pending: Mutex::new(Pending::default()),
        }
    }

    fn delta(text: &str) -> AgentEvent {
        AgentEvent::MessageDelta {
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            item_id: "message-1".to_string(),
            delta: text.to_string(),
        }
    }

    #[test]
    fn events_are_written_in_order_under_their_run() {
        let journal = journal();
        journal
            .lock(|store| store.begin_run("turn-1", "thread-1", "ws", b"{}", 1))
            .expect("run");

        journal.emit(delta("Chidi"));
        journal.emit(AgentEvent::TurnStarted {
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
        });
        journal.flush();

        let events = journal
            .lock(|store| store.run_events("turn-1"))
            .expect("events");
        let kinds: Vec<&str> = events.iter().map(|(_, kind, _)| kind.as_str()).collect();
        assert_eq!(kinds, vec!["message_delta", "turn_started"]);
        // The payload is the event as the UI receives it, so a resume can replay it.
        assert!(events[0].2.windows(5).any(|window| window == b"Chidi"));
    }

    #[test]
    fn an_event_without_a_turn_is_not_recorded() {
        let journal = journal();
        // `Error` carries no turn: it is a provider failure before a turn exists.
        journal.emit(AgentEvent::Error {
            thread_id: None,
            turn_id: None,
            error: edapex_agent::AgentError::internal("no route"),
        });
        journal.flush();

        let rows = journal
            .lock(|store| store.run_events("turn-1"))
            .expect("events");
        assert!(rows.is_empty(), "a turn-less event found a run");
    }
}
