//! Which sessions a worker may pick up, and how they group by host settings.
//!
//! Kept out of the orchestration module so the worker's policy — claim what has
//! queued work and no live owner — reads in one pass.

use std::time::{SystemTime, UNIX_EPOCH};

use edapex_store::{MasterKey, RusqliteDriver, Store};

use crate::state::HostError;

pub(super) fn pending_sessions(
    path: &str,
    master: [u8; 32],
    limit: usize,
) -> Result<Vec<edapex_store::session_events::PendingSession>, HostError> {
    let mut store = Store::new(
        RusqliteDriver::open(path).map_err(store_error)?,
        MasterKey::from_bytes(master),
    );
    store.migrate().map_err(store_error)?;
    store
        .agent_sessions_pending(now_ms(), limit)
        .map_err(store_error)
}

pub(super) type Group = (String, String, bool, Vec<String>);

pub(super) fn group(
    pending: Vec<edapex_store::session_events::PendingSession>,
) -> Vec<Group> {
    let mut groups: Vec<Group> = Vec::new();
    for session in pending {
        match groups
            .iter_mut()
            .find(|(workspace, model, safe, _)| {
                *workspace == session.workspace_id
                    && *model == session.model
                    && *safe == session.mobile_safe_tools
            }) {
            Some((_, _, _, sessions)) => sessions.push(session.session_id),
            None => groups.push((
                session.workspace_id,
                session.model,
                session.mobile_safe_tools,
                vec![session.session_id],
            )),
        }
    }
    groups
}

pub(super) fn store_error(error: edapex_store::StoreError) -> HostError {
    HostError::new("storage_unavailable", error.to_string(), true)
}

pub(super) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}
