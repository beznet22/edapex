//! The browser's model provider.
//!
//! Infinity requires `ModelProvider: Send + Sync`, and a `JsValue` is neither.
//! The struct therefore holds a **numeric handle** into a thread-local registry and
//! looks the callback up at call time. Nothing `!Send` is ever stored in a
//! `Send + Sync` type, and the fetch it starts runs on the page's `LocalSet`.
//!
//! This is the pattern the pinned dependency documents for its own provider
//! (`infinity-wasm/src/browser.rs`, "the trait method only awaits a `Send`
//! receiver"): keep the `!Send` work on one side of a channel and cross it with a
//! `tokio::sync::mpsc`. It is what lets the browser satisfy the same trait the
//! native hosts implement.

use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use infinity_provider_protocol::{
    CompletionError, CompletionRequest, ModelEntry, ModelProvider, ModelStream,
};
use js_sys::Function;
use wasm_bindgen::prelude::*;

use edapex_agent::infinity_stream::{chunk_stream, completion_error, provider_request};
use edapex_agent::{AgentError, ProviderChunk, ProviderClient, ProviderRequest};

use crate::{ChunkQueue, ProviderRequestWire};

type BoxError = Box<dyn std::error::Error + Send + Sync>;

thread_local! {
    /// The callbacks themselves. Thread-local because a `Function` may only be
    /// touched from the thread that created it, which on wasm is the only thread.
    static CALLBACKS: RefCell<HashMap<u64, Function>> = RefCell::new(HashMap::new());
    static NEXT_ID: RefCell<u64> = const { RefCell::new(1) };
}

/// Stores a callback and returns the handle that identifies it.
pub(crate) fn register(on_request: Function) -> u64 {
    let id = NEXT_ID.with(|next| {
        let mut next = next.borrow_mut();
        let id = *next;
        *next += 1;
        id
    });
    CALLBACKS.with(|callbacks| {
        callbacks.borrow_mut().insert(id, on_request);
    });
    id
}

/// Drops a callback. A closed agent must not keep a page function alive.
pub(crate) fn release(id: u64) {
    CALLBACKS.with(|callbacks| {
        callbacks.borrow_mut().remove(&id);
    });
}

fn lookup(id: u64) -> Option<Function> {
    CALLBACKS.with(|callbacks| callbacks.borrow().get(&id).cloned())
}

/// A `Send + Sync` handle onto a page callback.
#[derive(Clone)]
pub struct BrowserProvider {
    id: u64,
    queue: Arc<ChunkQueue>,
}

impl BrowserProvider {
    pub fn new(id: u64, queue: Arc<ChunkQueue>) -> Self {
        Self { id, queue }
    }

    /// Hands the request to JavaScript and returns the channel it will fill.
    ///
    /// Deliberately synchronous: the caller's future never holds a `JsValue`, so
    /// it stays `Send` and Infinity's trait bound is satisfied. The fetch this
    /// starts calls back into `push_chunk`, so this must not wait for it.
    fn start(
        &self,
        request: ProviderRequest,
    ) -> Result<tokio::sync::mpsc::Receiver<ProviderChunk>, AgentError> {
        let encoded = serde_json::to_string(&ProviderRequestWire::from(&request))
            .map_err(|error| AgentError::provider(format!("Encode request: {error}")))?;

        let callback = lookup(self.id).ok_or_else(|| {
            AgentError::provider("The browser transport was closed before the turn started")
        })?;
        callback
            .call1(&JsValue::NULL, &JsValue::from_str(&encoded))
            .map_err(|_| AgentError::provider("The browser transport failed"))?;

        let queue = Arc::clone(&self.queue);
        let (sender, receiver) = tokio::sync::mpsc::channel::<ProviderChunk>(64);
        wasm_bindgen_futures::spawn_local(async move {
            while let Some(item) = queue.recv().await {
                match item {
                    Ok(chunk) => {
                        if sender.send(chunk).await.is_err() {
                            return;
                        }
                    }
                    Err(error) => {
                        let _ = sender.send(ProviderChunk::Failed(error)).await;
                        return;
                    }
                }
            }
        });
        Ok(receiver)
    }
}

/// EdApex's own seam, used by the legacy in-page runtime.
impl ProviderClient for BrowserProvider {
    fn stream_chat(
        &self,
        request: ProviderRequest,
    ) -> Result<tokio::sync::mpsc::Receiver<ProviderChunk>, AgentError> {
        self.start(request)
    }
}

/// Infinity's seam, used once a session runs on the pinned core.
#[async_trait]
impl ModelProvider for BrowserProvider {
    async fn list_models(&self) -> Result<Vec<ModelEntry>, BoxError> {
        Ok(vec![ModelEntry {
            model_id: String::new(),
            display_name: String::new(),
            context_window: 0,
            max_output_tokens: None,
            supports_image_input: false,
        }])
    }

    async fn invoke_model(
        &self,
        model_id: &str,
        request: CompletionRequest,
    ) -> Result<ModelStream, CompletionError> {
        let request = provider_request(request, model_id)?;
        // No `await` between here and the return: the receiver is the only thing
        // the stream holds, and it is `Send`.
        let receiver = self.start(request).map_err(completion_error)?;
        Ok(chunk_stream(receiver))
    }
}
