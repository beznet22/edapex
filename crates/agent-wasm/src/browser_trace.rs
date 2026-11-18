//! Bounded execution diagnostics for the browser session.
//!
//! Worker console output does not reach a page's `on("console")` listener, so a
//! silent stall inside a detached task is otherwise unobservable. Recording
//! stages in the worker itself lets the client retrieve the last point reached
//! *and* the first operation that never completed.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

#[derive(Clone, Default)]
pub struct Trace {
    inner: Arc<Mutex<VecDeque<TraceMark>>>,
}

#[derive(Clone, serde::Serialize)]
struct TraceMark {
    stage: String,
    elapsed_ms: u64,
}

impl Trace {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn mark(&self, stage: &'static str) {
        let Ok(mut marks) = self.inner.lock() else {
            return;
        };
        if marks.len() >= 64 {
            marks.pop_front();
        }
        marks.push_back(TraceMark {
            stage: stage.to_string(),
            elapsed_ms: js_sys::Date::now() as u64,
        });
    }

    /// A mark that carries a value, e.g. the size of the queue it observed.
    pub fn note(&self, stage: String) {
        let Ok(mut marks) = self.inner.lock() else {
            return;
        };
        if marks.len() >= 64 {
            marks.pop_front();
        }
        marks.push_back(TraceMark {
            stage,
            elapsed_ms: js_sys::Date::now() as u64,
        });
    }

    pub fn json(&self) -> String {
        match self.inner.lock() {
            Ok(marks) => serde_json::to_string(&marks.iter().collect::<Vec<_>>())
                .unwrap_or_else(|_| "[]".to_string()),
            Err(_) => "[]".to_string(),
        }
    }
}

static GLOBAL: Mutex<Option<Trace>> = Mutex::new(None);

/// The provider has no handle to the session's trace, so the session publishes
/// one here at connect time and the provider records through it.
pub fn install(trace: &Trace) {
    if let Ok(mut slot) = GLOBAL.lock() {
        *slot = Some(trace.clone());
    }
}

pub fn note_global(stage: String) {
    if let Ok(slot) = GLOBAL.lock() {
        if let Some(trace) = slot.as_ref() {
            trace.note(stage);
        }
    }
}

pub fn mark_global(stage: &'static str) {
    if let Ok(slot) = GLOBAL.lock() {
        if let Some(trace) = slot.as_ref() {
            trace.mark(stage);
        }
    }
}
