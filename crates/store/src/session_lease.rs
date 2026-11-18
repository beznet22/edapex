use crate::{Result, SqlDriver, SqlValue, Store, StoreError};

#[derive(Debug, Clone, PartialEq)]
pub struct SessionLease {
    pub holder_id: Option<String>,
    pub fence: u64,
    pub expires_at_ms: u64,
}

impl<D: SqlDriver> Store<D> {
    pub fn claim_agent_session(
        &mut self,
        session_id: &str,
        holder_id: &str,
        ttl_ms: u64,
        now_ms: u64,
    ) -> Result<SessionLease> {
        self.agent_transaction(|store| {
            store.reject_deleted_session(session_id)?;
            let current = store.read_agent_lease(session_id)?;
            let live = current.expires_at_ms >= now_ms && current.holder_id.is_some();
            if live && current.holder_id.as_deref() != Some(holder_id) {
                return Ok(current);
            }
            let same_holder = current.holder_id.as_deref() == Some(holder_id);
            let fence = if same_holder { current.fence } else { current.fence + 1 };
            let ttl = i64::try_from(ttl_ms)
                .map_err(|error| StoreError::Serialisation(error.to_string()))?;
            let now = i64::try_from(now_ms)
                .map_err(|error| StoreError::Serialisation(error.to_string()))?;
            store.driver.execute(
                "UPDATE agent_sessions SET holder_id = ?, fence = ?, expires_at_ms = ? WHERE session_id = ?",
                &[
                    SqlValue::text(holder_id),
                    SqlValue::integer(i64::try_from(fence).map_err(|error| {
                        StoreError::Serialisation(error.to_string())
                    })?),
                    SqlValue::integer(now + ttl),
                    SqlValue::text(session_id),
                ],
            )?;
            Ok(SessionLease {
                holder_id: Some(holder_id.to_string()),
                fence,
                expires_at_ms: now_ms + ttl_ms,
            })
        })
    }

    pub fn renew_agent_session(
        &mut self,
        session_id: &str,
        holder_id: &str,
        expected_fence: u64,
        ttl_ms: u64,
        now_ms: u64,
    ) -> Result<SessionLease> {
        self.agent_transaction(|store| {
            let current = store.read_agent_lease(session_id)?;
            if current.holder_id.as_deref() != Some(holder_id)
                || current.fence != expected_fence
                || current.expires_at_ms < now_ms
            {
                return Err(StoreError::LeaseLost);
            }
            let expiry = now_ms + ttl_ms;
            store.driver.execute(
                "UPDATE agent_sessions SET expires_at_ms = ? WHERE session_id = ? AND holder_id = ? AND fence = ?",
                &[
                    to_sql_u64(expiry)?,
                    SqlValue::text(session_id),
                    SqlValue::text(holder_id),
                    to_sql_u64(expected_fence)?,
                ],
            )?;
            Ok(SessionLease {
                holder_id: Some(holder_id.to_string()),
                fence: expected_fence,
                expires_at_ms: expiry,
            })
        })
    }

    pub fn release_agent_session(
        &mut self,
        session_id: &str,
        holder_id: &str,
        expected_fence: u64,
    ) -> Result<()> {
        self.agent_transaction(|store| {
            let changed = store.driver.execute(
                "UPDATE agent_sessions SET holder_id = NULL, expires_at_ms = 0 \
                 WHERE session_id = ? AND holder_id = ? AND fence = ? AND deleted_at_ms IS NULL",
                &[
                    SqlValue::text(session_id),
                    SqlValue::text(holder_id),
                    to_sql_u64(expected_fence)?,
                ],
            )?;
            if changed != 1 {
                return Err(StoreError::LeaseLost);
            }
            Ok(())
        })
    }
}

fn to_sql_u64(value: u64) -> Result<SqlValue> {
    Ok(SqlValue::integer(i64::try_from(value).map_err(
        |error| StoreError::Serialisation(error.to_string()),
    )?))
}
