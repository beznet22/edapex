//! Browser SQL driver.
//!
//! The engine runs in JavaScript (OPFS SQLite WASM), so this driver forwards
//! every operation across the wasm-bindgen boundary. The calls are synchronous in
//! both directions: `sqlite3.oo1` is a blocking API, which is what lets it
//! implement `SqlDriver` without an executor.
//!
//! Crypto, schema and the outbox live in `edapex-store`; only the statement
//! execution crosses into JavaScript. That is what keeps one storage scheme
//! across native and web.

use edapex_store::{MasterKey, Operation, PushItem, Result, SqlDriver, SqlValue, Store, StoreError};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

/// Calls a method on the JavaScript driver object.
fn call(driver: &JsValue, method: &str, args: &[JsValue]) -> Result<JsValue> {
    let function = js_sys::Reflect::get(driver, &JsValue::from_str(method))
        .map_err(|error| StoreError::Sqlite(format!("{method} missing: {error:?}")))?;
    let function: js_sys::Function = function
        .dyn_into()
        .map_err(|_| StoreError::Sqlite(format!("{method} is not a function")))?;
    function
        .apply(driver, &js_sys::Array::from_iter(args.iter().cloned()))
        .map_err(|error| StoreError::Sqlite(format!("{method} failed: {error:?}")))
}

fn to_js(value: &SqlValue) -> JsValue {
    match value {
        SqlValue::Null => JsValue::NULL,
        SqlValue::Integer(inner) => JsValue::from_f64(*inner as f64),
        SqlValue::Text(inner) => JsValue::from_str(inner),
        SqlValue::Blob(inner) => js_sys::Uint8Array::from(inner.as_slice()).into(),
    }
}

fn from_js(value: &JsValue) -> SqlValue {
    if value.is_null() || value.is_undefined() {
        return SqlValue::Null;
    }
    if let Some(number) = value.as_f64() {
        return SqlValue::Integer(number as i64);
    }
    if let Some(text) = value.as_string() {
        return SqlValue::Text(text);
    }
    if let Ok(bytes) = value.clone().dyn_into::<js_sys::Uint8Array>() {
        return SqlValue::Blob(bytes.to_vec());
    }
    // Objects and booleans should not appear in these columns; storing their
    // textual form is better than silently dropping a value.
    SqlValue::Text(format!("{value:?}"))
}

/// `SqlDriver` backed by the JavaScript engine.
pub struct JsSqlDriver {
    handle: JsValue,
}

impl JsSqlDriver {
    pub fn new(handle: JsValue) -> Self {
        JsSqlDriver { handle }
    }
}

impl SqlDriver for JsSqlDriver {
    fn execute_batch(&mut self, sql: &str) -> Result<()> {
        call(
            &self.handle,
            "executeBatch",
            &[JsValue::from_str(sql)],
        )
        .map(|_| ())
    }

    fn execute(&mut self, sql: &str, params: &[SqlValue]) -> Result<usize> {
        let values = js_sys::Array::new();
        for value in params {
            values.push(&to_js(value));
        }
        let result = call(
            &self.handle,
            "execute",
            &[JsValue::from_str(sql), values.into()],
        )?;
        Ok(result.as_f64().unwrap_or(0.0) as usize)
    }

    fn query(&mut self, sql: &str, params: &[SqlValue]) -> Result<Vec<Vec<SqlValue>>> {
        let values = js_sys::Array::new();
        for value in params {
            values.push(&to_js(value));
        }
        let result = call(
            &self.handle,
            "query",
            &[JsValue::from_str(sql), values.into()],
        )?;

        let rows: js_sys::Array = result
            .dyn_into()
            .map_err(|_| StoreError::Sqlite("query did not return an array".to_string()))?;

        Ok(rows
            .iter()
            .map(|row| {
                let cells: js_sys::Array = row
                    .dyn_into()
                    .unwrap_or_else(|_| js_sys::Array::new());
                cells.iter().map(|cell| from_js(&cell)).collect()
            })
            .collect())
    }

    fn begin(&mut self) -> Result<()> {
        call(&self.handle, "begin", &[]).map(|_| ())
    }

    fn commit(&mut self) -> Result<()> {
        call(&self.handle, "commit", &[]).map(|_| ())
    }

    fn rollback(&mut self) -> Result<()> {
        call(&self.handle, "rollback", &[]).map(|_| ())
    }
}

/// The store as the browser uses it.
///
/// Thin by design: every method delegates to `edapex_store`, so a rule enforced
/// natively (outbox atomicity, data-class exclusion, per-record keys) is enforced
/// here without a second implementation.
#[wasm_bindgen]
pub struct SqlStore {
    inner: Store<JsSqlDriver>,
}

#[wasm_bindgen]
impl SqlStore {
    /// `driver` is the object produced by `openBrowserSqlite()`.
    /// `master_key` must be exactly 32 bytes.
    #[wasm_bindgen(constructor)]
    pub fn new(driver: JsValue, master_key: &[u8]) -> std::result::Result<SqlStore, JsValue> {
        let key: [u8; 32] = master_key.try_into().map_err(|_| {
            JsValue::from_str("the master key must be exactly 32 bytes")
        })?;
        Ok(SqlStore {
            inner: Store::new(JsSqlDriver::new(driver), MasterKey::from_bytes(key)),
        })
    }

    pub fn migrate(&mut self) -> std::result::Result<(), JsValue> {
        self.inner.migrate().map_err(to_js_error)
    }

    pub fn version(&mut self) -> std::result::Result<f64, JsValue> {
        self.inner
            .version()
            .map(|version| version as f64)
            .map_err(to_js_error)
    }

    /// Writes a sealed record plus its outbox row in one transaction.
    #[wasm_bindgen(js_name = writeRecord)]
    #[allow(clippy::too_many_arguments)]
    pub fn write_record(
        &mut self,
        entity_type: &str,
        entity_id: &str,
        workspace_id: &str,
        operation: &str,
        extra_json: &str,
        plaintext: &[u8],
        search_text: Option<String>,
        device_id: &str,
        created_at: f64,
    ) -> std::result::Result<String, JsValue> {
        let extra = parse_extra(extra_json)?;
        let entry = self
            .inner
            .write_record(
                entity_type,
                entity_id,
                workspace_id,
                parse_operation(operation),
                &extra,
                plaintext,
                search_text.as_deref(),
                device_id,
                created_at as i64,
            )
            .map_err(to_js_error)?;

        Ok(serde_json::json!({
            "id": entry.id,
            "deviceSeq": entry.device_seq,
        })
        .to_string())
    }

    pub fn read_record(
        &mut self,
        entity_type: &str,
        entity_id: &str,
    ) -> std::result::Result<Vec<u8>, JsValue> {
        self.inner
            .read_record(entity_type, entity_id)
            .map_err(to_js_error)
    }

    /// The wire payload for the next batch, as JSON.
    #[wasm_bindgen(js_name = pushBatch)]
    pub fn push_batch(
        &mut self,
        device_id: &str,
        limit: f64,
    ) -> std::result::Result<String, JsValue> {
        let items: Vec<PushItem> = self
            .inner
            .push_batch(device_id, limit as usize)
            .map_err(to_js_error)?;
        serde_json::to_string(&items).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn acknowledge(
        &mut self,
        device_id: &str,
        workspace_id: &str,
        scope: &str,
        through_seq: f64,
    ) -> std::result::Result<(), JsValue> {
        self.inner
            .acknowledge(device_id, workspace_id, scope, through_seq as u64)
            .map_err(to_js_error)
    }

    pub fn cursor(
        &mut self,
        device_id: &str,
        workspace_id: &str,
        scope: &str,
    ) -> std::result::Result<f64, JsValue> {
        self.inner
            .cursor(device_id, workspace_id, scope)
            .map(|value| value as f64)
            .map_err(to_js_error)
    }

    pub fn search(&mut self, query: &str, limit: f64) -> std::result::Result<String, JsValue> {
        let ids = self
            .inner
            .search(query, limit as usize)
            .map_err(to_js_error)?;
        serde_json::to_string(&ids).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = rebuildSearchIndex)]
    pub fn rebuild_search_index(&mut self) -> std::result::Result<f64, JsValue> {
        self.inner
            .rebuild_search_index()
            .map(|count| count as f64)
            .map_err(to_js_error)
    }
}

fn parse_operation(value: &str) -> Operation {
    match value {
        "create" => Operation::Create,
        "delete" => Operation::Delete,
        "tombstone" => Operation::Tombstone,
        _ => Operation::Update,
    }
}

/// `extra_json` is `[["thread_id", {"text": "t-1"}], ["device_seq", {"integer": 1}]]`.
fn parse_extra(json: &str) -> std::result::Result<Vec<(&'static str, SqlValue)>, JsValue> {
    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|error| JsValue::from_str(&error.to_string()))?;
    let array = value
        .as_array()
        .ok_or_else(|| JsValue::from_str("extra must be an array"))?;

    let mut out = Vec::with_capacity(array.len());
    for entry in array {
        let pair = entry
            .as_array()
            .filter(|pair| pair.len() == 2)
            .ok_or_else(|| JsValue::from_str("each extra entry must be [name, value]"))?;
        let name = pair[0]
            .as_str()
            .ok_or_else(|| JsValue::from_str("extra column name must be a string"))?;
        let value = &pair[1];

        let parsed = if let Some(text) = value.get("text").and_then(|inner| inner.as_str()) {
            SqlValue::Text(text.to_string())
        } else if let Some(integer) = value.get("integer").and_then(|inner| inner.as_i64()) {
            SqlValue::Integer(integer)
        } else if let Some(blob) = value.get("blob").and_then(|inner| inner.as_str()) {
            SqlValue::Blob(blob.as_bytes().to_vec())
        } else {
            SqlValue::Null
        };

        // The column name reaches SQL directly, so only names the store already
        // treats as metadata are allowed through.
        const ALLOWED: &[&str] = &[
            "thread_id",
            "role",
            "device_seq",
            "updated_at",
            "status",
            "risk",
            "kind",
            "version",
        ];
        let name = ALLOWED
            .iter()
            .find(|candidate| **candidate == name)
            .ok_or_else(|| JsValue::from_str(&format!("column {name} is not allowed")))?;

        out.push((*name, parsed));
    }
    Ok(out)
}

fn to_js_error(error: StoreError) -> JsValue {
    JsValue::from_str(&error.to_string())
}
