use crate::session_lease::SessionLease;
use crate::{crypto, Result, SqlDriver, SqlValue, Store, StoreError};

#[derive(Debug, Clone, PartialEq)]
pub struct SessionEventInput {
    pub session_id: String,
    pub event_id: String,
    pub workspace_id: String,
    pub device_id: String,
    pub holder_id: String,
    pub expected_fence: u64,
    pub kind: String,
    pub core_message_id: Option<String>,
    pub command_id: Option<String>,
    pub dedup_id: Option<String>,
    pub payload: Vec<u8>,
    pub created_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEventRecord {
    pub session_id: String,
    pub event_id: String,
    pub sequence: u64,
    pub kind: String,
    pub core_message_id: Option<String>,
    pub dedup_id: Option<String>,
    pub payload: Vec<u8>,
    pub created_at_ms: u64,
    pub relay_position: Option<u64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PendingSession {
    pub session_id: String,
    pub workspace_id: String,
    pub model: String,
    pub mobile_safe_tools: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionAppendOutcome {
    Appended(u64),
    Duplicate(u64),
}

impl<D: SqlDriver> Store<D> {
    pub(crate) fn agent_transaction<T>(
        &mut self,
        operation: impl FnOnce(&mut Self) -> Result<T>,
    ) -> Result<T> {
        self.driver.begin()?;
        match operation(self) {
            Ok(value) => {
                self.driver.commit()?;
                Ok(value)
            }
            Err(error) => {
                let _ = self.driver.rollback();
                Err(error)
            }
        }
    }

    pub fn ensure_agent_session(
        &mut self,
        session_id: &str,
        workspace_id: &str,
        device_id: &str,
        model: &str,
        mobile_safe_tools: bool,
    ) -> Result<()> {
        self.driver.execute(
            "INSERT INTO agent_sessions \
             (session_id, workspace_id, device_id, holder_id, fence, expires_at_ms, last_seq, deleted_at_ms, model, mobile_safe_tools, queued) \
             VALUES (?, ?, ?, NULL, 0, 0, 0, NULL, ?, ?, 0) \
             ON CONFLICT(session_id) DO UPDATE SET model = excluded.model, mobile_safe_tools = excluded.mobile_safe_tools",
            &[
                SqlValue::text(session_id),
                SqlValue::text(workspace_id),
                SqlValue::text(device_id),
                SqlValue::text(model),
                SqlValue::integer(i64::from(mobile_safe_tools)),
            ],
        )?;
        Ok(())
    }

    /// Sessions a worker may pick up: queued work, no live owner.
    pub fn agent_sessions_pending(
        &mut self,
        now_ms: u64,
        limit: usize,
    ) -> Result<Vec<PendingSession>> {
        let rows = self.driver.query(
            "SELECT session_id, workspace_id, model, mobile_safe_tools FROM agent_sessions \
             WHERE deleted_at_ms IS NULL AND queued > 0 \
             AND (holder_id IS NULL OR expires_at_ms < ?) \
             ORDER BY session_id LIMIT ?",
            &[to_sql_u64(now_ms)?, to_sql_u64(u64::try_from(limit).map_err(|error| StoreError::Serialisation(error.to_string()))?)?],
        )?;
        Ok(rows
            .iter()
            .map(|row| PendingSession {
                session_id: text_at(row, 0),
                workspace_id: text_at(row, 1),
                model: text_at(row, 2),
                mobile_safe_tools: row
                    .get(3)
                    .and_then(SqlValue::as_integer)
                    .unwrap_or(0)
                    != 0,
            })
            .collect())
    }

    pub fn append_agent_session_event(
        &mut self,
        input: SessionEventInput,
    ) -> Result<SessionAppendOutcome> {
        self.agent_transaction(|store| {
            store.reject_deleted_session(&input.session_id)?;
            if let Some(command_id) = &input.command_id {
                let rows = store.driver.query(
                    "SELECT event_id FROM agent_session_commands WHERE session_id = ? AND command_id = ?",
                    &[SqlValue::text(&input.session_id), SqlValue::text(command_id)],
                )?;
                if let Some(event_id) = rows
                    .first()
                    .and_then(|row| row.first())
                    .and_then(SqlValue::as_text)
                {
                    let sequence = store.agent_event_sequence(&input.session_id, event_id)?;
                    return Ok(SessionAppendOutcome::Duplicate(sequence));
                }
            }
            let lease = store.read_agent_lease(&input.session_id)?;
            if lease.holder_id.as_deref() != Some(&input.holder_id)
                || lease.fence != input.expected_fence
                || lease.expires_at_ms < input.created_at_ms
            {
                return Err(StoreError::LeaseLost);
            }
            let next = store.next_agent_sequence(&input.session_id)?;
            let device_seq = store.next_agent_device_sequence(&input.session_id, &input.device_id)?;
            let envelope = crypto::seal(
                &store.master,
                "agent_session_events",
                &input.event_id,
                crypto::random_nonce(),
                &input.payload,
            )?;
            store.driver.execute(
                "INSERT INTO agent_session_events \
                 (session_id, event_id, seq, kind, core_message_id, dedup_id, body, workspace_id, device_id, device_seq, created_at_ms, relay_position) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
                &[
                    SqlValue::text(&input.session_id),
                    SqlValue::text(&input.event_id),
                    to_sql_u64(next)?,
                    SqlValue::text(&input.kind),
                    input.core_message_id.as_ref().map(SqlValue::text).unwrap_or(SqlValue::Null),
                    input.dedup_id.as_ref().map(SqlValue::text).unwrap_or(SqlValue::Null),
                    SqlValue::Blob(envelope.clone()),
                    SqlValue::text(&input.workspace_id),
                    SqlValue::text(&input.device_id),
                    to_sql_u64(device_seq)?,
                    to_sql_u64(input.created_at_ms)?,
                ],
            )?;
            store.driver.execute(
                "INSERT INTO agent_session_outbox \
                 (session_id, event_id, kind, device_id, device_seq, ciphertext, created_at_ms) \
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                &[
                    SqlValue::text(&input.session_id),
                    SqlValue::text(&input.event_id),
                    SqlValue::text(&input.kind),
                    SqlValue::text(&input.device_id),
                    to_sql_u64(device_seq)?,
                    SqlValue::Blob(envelope),
                    to_sql_u64(input.created_at_ms)?,
                ],
            )?;
            if let Some(command_id) = &input.command_id {
                store.driver.execute(
                    "INSERT INTO agent_session_commands (session_id, command_id, event_id, created_at_ms) VALUES (?, ?, ?, ?)",
                    &[
                        SqlValue::text(&input.session_id),
                        SqlValue::text(command_id),
                        SqlValue::text(&input.event_id),
                        to_sql_u64(input.created_at_ms)?,
                    ],
                )?;
            }
            store.driver.execute(
                "UPDATE agent_sessions SET last_seq = ?, queued = MAX(queued + ?, 0) WHERE session_id = ?",
                &[
                    to_sql_u64(next)?,
                    SqlValue::integer(match input.kind.as_str() {
                        "message_queued" => 1,
                        "message_sent" => -1,
                        _ => 0,
                    }),
                    SqlValue::text(&input.session_id),
                ],
            )?;
            Ok(SessionAppendOutcome::Appended(next))
        })
    }

    pub fn agent_session_events(
        &mut self,
        session_id: &str,
        after_sequence: u64,
        limit: usize,
    ) -> Result<Vec<SessionEventRecord>> {
        let rows = self.driver.query(
            "SELECT session_id, event_id, seq, kind, core_message_id, dedup_id, body, created_at_ms, relay_position \
             FROM agent_session_events WHERE session_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?",
            &[
                SqlValue::text(session_id),
                to_sql_u64(after_sequence)?,
                to_sql_u64(u64::try_from(limit).map_err(|error| StoreError::Serialisation(error.to_string()))?)?,
            ],
        )?;
        let mut records = Vec::with_capacity(rows.len());
        for row in rows {
            let body = row
                .get(6)
                .and_then(SqlValue::as_blob)
                .ok_or(StoreError::Decrypt)?;
            let event_id = text_at(&row, 1);
            records.push(SessionEventRecord {
                session_id: text_at(&row, 0),
                event_id: event_id.clone(),
                sequence: sql_u64(&row, 2)?,
                kind: text_at(&row, 3),
                core_message_id: row
                    .get(4)
                    .and_then(SqlValue::as_text)
                    .map(ToString::to_string),
                dedup_id: row
                    .get(5)
                    .and_then(SqlValue::as_text)
                    .map(ToString::to_string),
                payload: crypto::open(&self.master, "agent_session_events", &event_id, body)?,
                created_at_ms: sql_u64(&row, 7)?,
                relay_position: row
                    .get(8)
                    .and_then(SqlValue::as_integer)
                    .map(|value| {
                        u64::try_from(value)
                            .map_err(|error| StoreError::Serialisation(error.to_string()))
                    })
                    .transpose()?,
            });
        }
        Ok(records)
    }

    pub fn delete_agent_session(&mut self, session_id: &str, deleted_at_ms: u64) -> Result<()> {
        self.agent_transaction(|store| {
            store.driver.execute(
                "UPDATE agent_sessions SET deleted_at_ms = ?, holder_id = NULL, expires_at_ms = 0 WHERE session_id = ?",
                &[to_sql_u64(deleted_at_ms)?, SqlValue::text(session_id)],
            )?;
            store.driver.execute(
                "DELETE FROM agent_session_outbox WHERE session_id = ?",
                &[SqlValue::text(session_id)],
            )?;
            store.driver.execute(
                "DELETE FROM agent_session_events WHERE session_id = ?",
                &[SqlValue::text(session_id)],
            )?;
            store.driver.execute(
                "DELETE FROM agent_thread_snapshots WHERE thread_id = ? OR root_thread_id = ?",
                &[SqlValue::text(session_id), SqlValue::text(session_id)],
            )?;
            Ok(())
        })
    }

    pub(crate) fn read_agent_lease(
        &mut self,
        session_id: &str,
    ) -> Result<crate::session_lease::SessionLease> {
        let rows = self.driver.query(
            "SELECT holder_id, fence, expires_at_ms FROM agent_sessions WHERE session_id = ? AND deleted_at_ms IS NULL",
            &[SqlValue::text(session_id)],
        )?;
        let row = rows.first().ok_or(StoreError::NotFound)?;
        Ok(SessionLease {
            holder_id: row
                .first()
                .and_then(SqlValue::as_text)
                .map(ToString::to_string),
            fence: sql_u64(row, 1)?,
            expires_at_ms: sql_u64(row, 2)?,
        })
    }

    pub(crate) fn reject_deleted_session(&mut self, session_id: &str) -> Result<()> {
        let rows = self.driver.query(
            "SELECT deleted_at_ms FROM agent_sessions WHERE session_id = ?",
            &[SqlValue::text(session_id)],
        )?;
        match rows
            .first()
            .and_then(|row| row.first())
            .and_then(SqlValue::as_integer)
        {
            Some(_) => Err(StoreError::SessionDeleted),
            None => Ok(()),
        }
    }

    fn agent_event_sequence(&mut self, session_id: &str, event_id: &str) -> Result<u64> {
        let rows = self.driver.query(
            "SELECT seq FROM agent_session_events WHERE session_id = ? AND event_id = ?",
            &[SqlValue::text(session_id), SqlValue::text(event_id)],
        )?;
        rows.first()
            .map(|row| sql_u64(row, 0))
            .ok_or(StoreError::NotFound)?
    }

    fn next_agent_sequence(&mut self, session_id: &str) -> Result<u64> {
        let rows = self.driver.query(
            "SELECT COALESCE(MAX(seq), 0) + 1 FROM agent_session_events WHERE session_id = ?",
            &[SqlValue::text(session_id)],
        )?;
        rows.first()
            .map(|row| sql_u64(row, 0))
            .ok_or(StoreError::NotFound)?
    }

    pub fn agent_session_latest_sequence(&mut self, session_id: &str) -> Result<u64> {
        let rows = self.driver.query(
            "SELECT last_seq FROM agent_sessions WHERE session_id = ?",
            &[SqlValue::text(session_id)],
        )?;
        match rows.first() {
            Some(row) => sql_u64(row, 0),
            None => Err(StoreError::NotFound),
        }
    }

    fn next_agent_device_sequence(&mut self, session_id: &str, device_id: &str) -> Result<u64> {
        let rows = self.driver.query(
            "SELECT COALESCE(MAX(device_seq), 0) + 1 FROM agent_session_events WHERE session_id = ? AND device_id = ?",
            &[SqlValue::text(session_id), SqlValue::text(device_id)],
        )?;
        rows.first()
            .map(|row| sql_u64(row, 0))
            .ok_or(StoreError::NotFound)?
    }
}

fn text_at(row: &[SqlValue], index: usize) -> String {
    row.get(index)
        .and_then(SqlValue::as_text)
        .unwrap_or_default()
        .to_string()
}

fn sql_u64(row: &[SqlValue], index: usize) -> Result<u64> {
    let value = row.get(index).and_then(SqlValue::as_integer).unwrap_or(0);
    u64::try_from(value).map_err(|error| StoreError::Serialisation(error.to_string()))
}

fn to_sql_u64(value: u64) -> Result<SqlValue> {
    Ok(SqlValue::integer(i64::try_from(value).map_err(
        |error| StoreError::Serialisation(error.to_string()),
    )?))
}
