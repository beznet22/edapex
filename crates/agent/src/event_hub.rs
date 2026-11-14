//! Replayable event fan-out.
//!
//! A turn outlives the client that started it. If the WebView reloads mid-turn,
//! the desktop host re-attaches with `since_seq` and replays what it missed;
//! without this the stream is simply lost and the UI shows a turn that never
//! progresses.
//!
//! The ring is bounded on purpose. Replay is for a reconnecting client, not for
//! transcript storage — history lives in the thread state, and an unbounded
//! buffer here would leak for the life of the process.

use std::sync::Mutex;

use crate::protocol::AgentEvent;

/// How many events are retained for replay.
///
/// A long tool-heavy turn emits on the order of hundreds of events, so 1,024
/// covers a realistic reattach window without holding a large backlog per client.
pub const DEFAULT_CAPACITY: usize = 1_024;

#[derive(Debug, Clone)]
struct Sequenced {
    seq: u64,
    event: AgentEvent,
}

struct Inner {
    next_seq: u64,
    buffer: Vec<Sequenced>,
}

/// A bounded, sequence-numbered event log.
pub struct EventHub {
    capacity: usize,
    inner: Mutex<Inner>,
}

impl Default for EventHub {
    fn default() -> Self {
        Self::new(DEFAULT_CAPACITY)
    }
}

impl EventHub {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            inner: Mutex::new(Inner {
                next_seq: 0,
                buffer: Vec::new(),
            }),
        }
    }

    /// Record an event and return its sequence number.
    ///
    /// The oldest entry is dropped once the ring is full, so a client asking for
    /// a sequence older than the retained window gets everything still held
    /// rather than an error: a partial replay is more useful than none.
    pub fn push(&self, event: AgentEvent) -> u64 {
        let mut inner = self.inner.lock().expect("event hub");
        let seq = inner.next_seq;
        inner.next_seq += 1;
        inner.buffer.push(Sequenced { seq, event });
        if inner.buffer.len() > self.capacity {
            let excess = inner.buffer.len() - self.capacity;
            inner.buffer.drain(..excess);
        }
        seq
    }

    /// Every event after `since_seq`.
    ///
    /// Pass `0` to replay everything retained. The returned vector is ordered.
    pub fn since(&self, since_seq: u64) -> Vec<(u64, AgentEvent)> {
        let inner = self.inner.lock().expect("event hub");
        inner
            .buffer
            .iter()
            .filter(|entry| entry.seq >= since_seq)
            .map(|entry| (entry.seq, entry.event.clone()))
            .collect()
    }

    /// The sequence the next event will receive.
    ///
    /// A client stores this before disconnecting and reattaches with it; anything
    /// emitted in between is replayed exactly once.
    pub fn cursor(&self) -> u64 {
        self.inner.lock().expect("event hub").next_seq
    }

    pub fn len(&self) -> usize {
        self.inner.lock().expect("event hub").buffer.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::TurnCompletionStatus;

    fn delta(text: &str) -> AgentEvent {
        AgentEvent::MessageDelta {
            thread_id: "t".to_string(),
            turn_id: "r".to_string(),
            item_id: "m".to_string(),
            delta: text.to_string(),
        }
    }

    #[test]
    fn assigns_monotonic_sequences() {
        let hub = EventHub::default();
        assert_eq!(hub.push(delta("a")), 0);
        assert_eq!(hub.push(delta("b")), 1);
        assert_eq!(hub.cursor(), 2);
    }

    #[test]
    fn replays_everything_after_a_cursor() {
        let hub = EventHub::default();
        hub.push(delta("a"));
        hub.push(delta("b"));
        let cursor = hub.cursor();
        hub.push(delta("c"));

        let replayed = hub.since(cursor);
        assert_eq!(replayed.len(), 1);
        assert_eq!(replayed[0].0, 2);
    }

    #[test]
    fn a_cursor_of_zero_replays_the_whole_ring() {
        let hub = EventHub::default();
        hub.push(delta("a"));
        hub.push(delta("b"));
        assert_eq!(hub.since(0).len(), 2);
    }

    #[test]
    fn the_ring_drops_the_oldest_entries() {
        let hub = EventHub::new(3);
        for text in ["a", "b", "c", "d"] {
            hub.push(delta(text));
        }
        assert_eq!(hub.len(), 3);

        // The oldest was evicted; replay starts at the oldest retained sequence.
        let replayed = hub.since(0);
        assert_eq!(replayed.len(), 3);
        assert_eq!(replayed[0].0, 1);
    }

    #[test]
    fn replay_preserves_order() {
        let hub = EventHub::default();
        for text in ["one", "two", "three"] {
            hub.push(delta(text));
        }
        let texts: Vec<String> = hub
            .since(0)
            .into_iter()
            .map(|(_, event)| match event {
                AgentEvent::MessageDelta { delta, .. } => delta,
                other => panic!("unexpected event: {other:?}"),
            })
            .collect();
        assert_eq!(texts, vec!["one", "two", "three"]);
    }

    #[test]
    fn an_empty_hub_replays_nothing() {
        let hub = EventHub::default();
        assert!(hub.is_empty());
        assert!(hub.since(0).is_empty());
        assert_eq!(hub.cursor(), 0);
    }

    #[test]
    fn a_terminal_event_is_retained_for_reattach() {
        // The case that matters: a client reconnects after the turn finished and
        // must still learn how it ended.
        let hub = EventHub::default();
        hub.push(delta("done"));
        hub.push(AgentEvent::TurnCompleted {
            thread_id: "t".to_string(),
            turn_id: "r".to_string(),
            status: TurnCompletionStatus::Completed,
        });

        let replayed = hub.since(0);
        assert!(replayed
            .iter()
            .any(|(_, event)| matches!(event, AgentEvent::TurnCompleted { .. })));
    }
}
