//! The store-backed recorder: what makes a turn survive its own process.
//!
//! Every write is sealed by `edapex-store`, so a checkpoint on disk is the
//! conversation as ciphertext. The key lives in the OS keychain under its own
//! entry — losing the entry loses resumability, not the app, and nothing here
//! ever reaches the WebView.

use std::sync::Mutex;

use edapex_agent::{ChatMessage, RunStart, TurnCompletionStatus, TurnRecorder};
use edapex_store::{MasterKey, RusqliteDriver, Store};
use rand::RngCore;
use serde_json::{json, Value};

use super::HostEnv;
use crate::state::HostError;

const KEYRING_SERVICE: &str = "com.bronotek.edapex";
const KEYRING_USER: &str = "agent-db";

pub struct RunJournal {
    store: Mutex<Store<RusqliteDriver>>,
    workspace_id: String,
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
