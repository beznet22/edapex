//! Task spawning, without assuming a runtime.
//!
//! `AgentHost::turn_start` must return as soon as the turn is accepted: a UI that
//! awaits the whole turn cannot show progress, and Stop has nothing to cancel
//! into. The turn therefore runs on a detached task.
//!
//! Native builds spawn onto the ambient tokio runtime. `wasm32-unknown-unknown`
//! is single-threaded and has no such runtime, so it uses
//! `wasm_bindgen_futures::spawn_local`. The core stays free of the specific
//! choice; hosts do not pass an executor in.

use std::future::Future;
use std::pin::Pin;

type Boxed = Pin<Box<dyn Future<Output = ()> + 'static>>;

/// Run a future to completion in the background.
#[cfg(not(target_arch = "wasm32"))]
pub fn spawn(future: impl Future<Output = ()> + Send + 'static) {
    tokio::spawn(future);
}

/// Run a future on the current task queue.
#[cfg(target_arch = "wasm32")]
pub fn spawn(future: impl Future<Output = ()> + 'static) {
    let boxed: Boxed = Box::pin(future);
    wasm_bindgen_futures::spawn_local(boxed);
}
