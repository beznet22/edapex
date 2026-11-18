use crate::{now, Result, SqlDriver, SqlValue, Store};

fn secure_id(prefix: &str) -> String {
    let nonce = crate::crypto::random_nonce();
    let encoded = nonce
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("{prefix}-{encoded}")
}

pub fn new_client_id() -> String {
    secure_id("client")
}

impl<D: SqlDriver> Store<D> {
    pub fn agent_device_id(&mut self, workspace_id: &str) -> Result<String> {
        self.agent_transaction(|store| {
            let rows = store.driver.query(
                "SELECT device_id FROM agent_identity WHERE workspace_id = ?",
                &[SqlValue::text(workspace_id)],
            )?;
            if let Some(value) = rows
                .first()
                .and_then(|row| row.first())
                .and_then(SqlValue::as_text)
            {
                return Ok(value.to_string());
            }
            let device_id = secure_id("device");
            store.driver.execute(
                "INSERT INTO agent_identity (workspace_id, device_id, created_at) VALUES (?, ?, ?)",
                &[
                    SqlValue::text(workspace_id),
                    SqlValue::text(&device_id),
                    SqlValue::integer(now()),
                ],
            )?;
            Ok(device_id)
        })
    }
}
