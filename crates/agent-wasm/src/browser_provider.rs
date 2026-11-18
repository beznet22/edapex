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
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

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
    queues: Arc<Mutex<HashMap<u32, Arc<ChunkQueue>>>>,
    next_stream: Arc<AtomicU32>,
    current_stream: Arc<AtomicU32>,
}

impl BrowserProvider {
    pub fn id(&self) -> u64 {
        self.id
    }

    pub fn new(id: u64, queue: Arc<ChunkQueue>) -> Self {
        let queues = Arc::new(Mutex::new(HashMap::from([(0, queue)])));
        Self {
            id,
            queues,
            next_stream: Arc::new(AtomicU32::new(1)),
            current_stream: Arc::new(AtomicU32::new(0)),
        }
    }

    /// Routes a chunk to the model call that asked for it.
    pub fn push(
        &self,
        stream_id: u32,
        item: Result<ProviderChunk, AgentError>,
    ) -> Result<(), AgentError> {
        let Some(queue) = self
            .queues
            .lock()
            .map_err(|_| AgentError::internal("The stream registry is unavailable"))?
            .get(&stream_id)
            .cloned()
        else {
            return Err(AgentError::provider(
                "The provider stream is not registered",
            ));
        };
        queue.push(item);
        Ok(())
    }

    pub fn current_stream_id(&self) -> u32 {
        self.current_stream.load(Ordering::Acquire)
    }

    pub fn end_stream(&self, stream_id: u32) {
        if let Ok(mut queues) = self.queues.lock() {
            if let Some(queue) = queues.remove(&stream_id) {
                queue.close();
            }
        }
    }

    pub fn close_all(&self) {
        if let Ok(peers) = self.queues.lock() {
            for queue in peers.values() {
                queue.close();
            }
        }
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
        
        crate::browser_trace::mark_global("provider.start");
        let encoded = serde_json::to_string(&ProviderRequestWire::from(&request))
            .map_err(|error| AgentError::provider(format!("Encode request: {error}")))?;

        let stream_id = self.next_stream.fetch_add(1, Ordering::Relaxed);
        self.current_stream.store(stream_id, Ordering::Release);
        let queue = Arc::new(ChunkQueue::default());
        self.queues
            .lock()
            .map_err(|_| AgentError::internal("The stream registry is unavailable"))?
            .insert(stream_id, Arc::clone(&queue));
        let callback = match lookup(self.id) {
            Some(callback) => callback,
            None => {
                self.end_stream(stream_id);
                return Err(AgentError::provider(
                    "The browser transport was closed before the turn started",
                ));
            }
        };
        crate::browser_trace::mark_global("provider.callback");
        callback
            .call2(
                &JsValue::NULL,
                &JsValue::from_str(&encoded),
                &JsValue::from_f64(f64::from(stream_id)),
            )
            .map_err(|_| AgentError::provider("The browser transport failed"))?;

        crate::browser_trace::mark_global("provider.invoked");
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

#[derive(Clone)]
pub struct BrowserModelSource {
    pub provider: Arc<BrowserProvider>,
    pub model: String,
}

#[async_trait(?Send)]
impl infinity_agent_core::system::ModelSource for BrowserModelSource {
    async fn resolve(
        &self,
        _thread_id: &rap_protocol::ThreadId<str>,
    ) -> Result<infinity_agent_core::system::ResolvedModel, BoxError> {
        Ok(infinity_agent_core::system::ResolvedModel {
            provider: self.provider.clone(),
            model_id: self.model.clone(),
            context_window: 0,
            supports_image_input: false,
        })
    }
}
