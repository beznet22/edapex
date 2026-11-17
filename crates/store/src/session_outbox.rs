use crate::{Result, SqlDriver, SqlValue, Store, StoreError};

#[derive(Debug, Clone, PartialEq)]
pub struct SessionOutboxEvent {
    pub session_id: String,
    pub event_id: String,
    pub kind: String,
    pub device_seq: u64,
    pub ciphertext: Vec<u8>,
    pub created_at_ms: u64,
}

impl<D: SqlDriver> Store<D> {
    pub fn pending_session_events(
        &mut self,
        device_id: &str,
        limit: usize,
    ) -> Result<Vec<SessionOutboxEvent>> {
        let limit =
            i64::try_from(limit).map_err(|error| StoreError::Serialisation(error.to_string()))?;
        let rows = self.driver.query(
            "SELECT session_id, event_id, kind, device_seq, ciphertext, created_at_ms \
             FROM agent_session_outbox WHERE device_id = ? ORDER BY device_seq ASC LIMIT ?",
            &[SqlValue::text(device_id), SqlValue::integer(limit)],
        )?;
        let mut pending = Vec::with_capacity(rows.len());
        for row in rows {
            let device_seq = row.get(3).and_then(SqlValue::as_integer).unwrap_or(0);
            let created_at_ms = row.get(5).and_then(SqlValue::as_integer).unwrap_or(0);
            pending.push(SessionOutboxEvent {
                session_id: text_at(&row, 0),
                event_id: text_at(&row, 1),
                kind: text_at(&row, 2),
                device_seq: u64::try_from(device_seq)
                    .map_err(|error| StoreError::Serialisation(error.to_string()))?,
                ciphertext: row
                    .get(4)
                    .and_then(SqlValue::as_blob)
                    .ok_or(StoreError::Decrypt)?
                    .to_vec(),
                created_at_ms: u64::try_from(created_at_ms)
                    .map_err(|error| StoreError::Serialisation(error.to_string()))?,
            });
        }
        Ok(pending)
    }

    pub fn acknowledge_session_events(
        &mut self,
        device_id: &str,
        accepted: &[(String, u64)],
    ) -> Result<()> {
        self.agent_transaction(|store| {
            for (event_id, position) in accepted {
                let position = i64::try_from(*position)
                    .map_err(|error| StoreError::Serialisation(error.to_string()))?;
                let rows = store.driver.query(
                    "SELECT session_id FROM agent_session_outbox WHERE event_id = ? AND device_id = ?",
                    &[SqlValue::text(event_id), SqlValue::text(device_id)],
                )?;
                let Some(session_id) = rows
                    .first()
                    .and_then(|row| row.first())
                    .and_then(SqlValue::as_text)
                    .map(ToString::to_string)
                else {
                    continue;
                };
                store.driver.execute(
                    "UPDATE agent_session_events SET relay_position = ? WHERE session_id = ? AND event_id = ?",
                    &[
                        SqlValue::integer(position),
                        SqlValue::text(&session_id),
                        SqlValue::text(event_id),
                    ],
                )?;
                store.driver.execute(
                    "DELETE FROM agent_session_outbox WHERE event_id = ? AND device_id = ?",
                    &[SqlValue::text(event_id), SqlValue::text(device_id)],
                )?;
            }
            Ok(())
        })
    }
}

fn text_at(row: &[SqlValue], index: usize) -> String {
    row.get(index)
        .and_then(SqlValue::as_text)
        .unwrap_or_default()
        .to_string()
}
