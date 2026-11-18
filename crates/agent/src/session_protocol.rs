use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionMessageRole {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessageVersion {
    pub event_id: String,
    pub message_id: String,
    pub text: String,
    pub created_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessage {
    pub event_id: String,
    pub message_id: String,
    pub dedup_id: Option<String>,
    pub role: SessionMessageRole,
    pub text: String,
    pub versions: Vec<SessionMessageVersion>,
    pub reply_to: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionQueueItem {
    pub event_id: String,
    pub command_id: String,
    pub dedup_id: String,
    pub text: String,
    pub enqueued_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTruncation {
    pub id: String,
    #[serde(rename = "from")]
    pub from_event_id: String,
    pub active: bool,
}

/// The relay's lease as the service returns it.
///
/// The fence is assigned by the service, so a client cannot choose one: a
/// reconnecting device proves it is current by echoing the fence it was granted.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLeaseRecord {
    pub session_id: String,
    pub holder_id: String,
    pub fence: u64,
    pub expires_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub session_id: String,
    pub thread_id: String,
    pub device_id: String,
    pub client_id: String,
    pub read_only: bool,
    pub holder_id: Option<String>,
    pub fence: u64,
    pub last_seq: u64,
    pub messages: Vec<SessionMessage>,
    pub queue: Vec<SessionQueueItem>,
    pub truncations: Vec<SessionTruncation>,
    pub next_cursor: Option<String>,
}

impl SessionView {
    pub fn has_stable_identity(&self) -> bool {
        !self.session_id.is_empty() && self.session_id == self.thread_id
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum SessionCommand {
    EnqueueText {
        command_id: String,
        session_id: String,
        client_id: String,
        thread_id: String,
        dedup_id: String,
        text: String,
    },
    CancelTurn {
        command_id: String,
        session_id: String,
        client_id: String,
        turn_id: String,
    },
    EditMessage {
        command_id: String,
        session_id: String,
        client_id: String,
        event_id: String,
        replacement_message_id: String,
        replacement_dedup_id: String,
        text: String,
    },
    Truncate {
        command_id: String,
        session_id: String,
        client_id: String,
        truncation_id: String,
        from_event_id: String,
    },
    Restore {
        command_id: String,
        session_id: String,
        client_id: String,
        truncation_id: String,
    },
    DeleteSession {
        command_id: String,
        session_id: String,
        client_id: String,
    },
    AcquireLease {
        command_id: String,
        session_id: String,
        client_id: String,
        lease_ttl_ms: u64,
    },
    RenewLease {
        command_id: String,
        session_id: String,
        client_id: String,
        expected_fence: u64,
    },
    ReleaseLease {
        command_id: String,
        session_id: String,
        client_id: String,
        expected_fence: u64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionSyncEventKind {
    Projection,
    CoreSnapshot,
    Deletion,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSyncEvent {
    pub event_id: String,
    pub session_id: String,
    pub device_id: String,
    pub device_seq: u64,
    pub kind: SessionSyncEventKind,
    pub ciphertext: String,
    pub checksum: String,
    pub created_at_ms: u64,
    pub relay_position: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSyncPush {
    pub workspace_id: String,
    pub session_id: String,
    pub device_id: String,
    pub client_id: String,
    pub fence: u64,
    pub events: Vec<SessionSyncEvent>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionSyncAcknowledgementStatus {
    Accepted,
    Duplicate,
    Stale,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSyncAcknowledgement {
    pub event_id: String,
    pub status: SessionSyncAcknowledgementStatus,
    pub position: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSyncPushResult {
    pub acknowledgements: Vec<SessionSyncAcknowledgement>,
    pub next_position: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDeletion {
    pub session_id: String,
    pub deletion_event_id: String,
    pub deleted_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSyncPullResult {
    pub events: Vec<SessionSyncEvent>,
    pub next_position: u64,
    pub deletion: Option<SessionDeletion>,
}
