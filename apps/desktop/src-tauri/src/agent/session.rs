use std::sync::{Arc, Mutex};

use edapex_agent::{
    AgentConnectSettings, AgentEvent, AgentStatus, EventSink, NativeAgentDriver,
};
use tauri::ipc::Channel;

use super::ApprovalRegistry;

/// A connected native agent: the driver, its approvals, and the channel a
/// WebView is reading.
///
/// The driver owns the `!Send` Infinity machinery on its own thread, so this
/// struct is a handle rather than the runtime itself. Cloning it is cheap and
/// does not start or stop a session.
#[derive(Clone)]
pub struct AgentSession {
    pub driver: Arc<NativeAgentDriver>,
    pub approvals: Arc<ApprovalRegistry>,
    pub sink: Arc<ChannelSink>,
    pub settings: AgentConnectSettings,
}

impl AgentSession {
    /// Swaps in a new channel and replays what the client missed.
    ///
    /// The channel is replaced **before** the replay so an event emitted during
    /// the replay reaches the new one rather than the dead one. Returns the
    /// cursor to resume from.
    pub fn attach(&self, since_seq: u64, channel: Channel<AgentEvent>) -> u64 {
        let replay = self.sink.hub.since(since_seq);
        let cursor = self.sink.hub.cursor();

        if let Ok(mut guard) = self.sink.channel.lock() {
            *guard = Some(channel.clone());
        }
        for (_, event) in replay {
            let _ = channel.send(event);
        }
        cursor
    }

    pub fn status(&self) -> AgentStatus {
        AgentStatus {
            connected: true,
            thread_id: None,
            model: self.settings.model.clone(),
            mobile_safe_tools: self.settings.mobile_safe_tools,
        }
    }
}

/// Publishes every event to the ring and, when one is attached, to the channel.
///
/// The channel is replaceable because a WebView reload destroys it while the
/// turn keeps running. `agent_attach` installs a new one and replays from the
/// last sequence the client saw.
pub struct ChannelSink {
    pub hub: Arc<edapex_agent::EventHub>,
    pub channel: Mutex<Option<Channel<AgentEvent>>>,
}

impl ChannelSink {
    pub fn new(channel: Option<Channel<AgentEvent>>) -> Self {
        ChannelSink {
            hub: Arc::new(edapex_agent::EventHub::default()),
            channel: Mutex::new(channel),
        }
    }
}

/// Delivers to the WebView and, when a journal exists, records the same event.
pub struct FanoutSink {
    pub primary: Arc<ChannelSink>,
    pub journal: Option<Arc<super::journal::RunJournal>>,
}

impl EventSink for ChannelSink {
    fn emit(&self, event: AgentEvent) {
        // Record first: the ring is the durable record, the channel is best-effort.
        let _ = self.hub.push(event.clone());
        if let Ok(guard) = self.channel.lock() {
            if let Some(channel) = guard.as_ref() {
                let _ = channel.send(event);
            }
        }
    }
}
