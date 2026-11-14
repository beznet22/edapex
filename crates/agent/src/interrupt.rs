//! Cancellation primitive for a running turn.
//!
//! Combines a synchronously-readable flag with an async wakeup, plus a monotonic
//! epoch. The epoch exists because a deferred reset (for example a timer that
//! clears the flag after a detached turn finishes) must not erase a *newer*
//! cancellation that the target has not observed yet.
//!
//! Ported from `jcode-agent-runtime`, where it encodes three races that are easy
//! to reintroduce: a lost wakeup when `notify_one` fires before the waiter
//! registers, a deferred reset clearing a newer cancel, and a reset racing a
//! concurrent fire.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use tokio::sync::Notify;

#[derive(Debug, Clone)]
pub struct InterruptSignal {
    flag: Arc<AtomicBool>,
    epoch: Arc<AtomicU64>,
    notify: Arc<Notify>,
}

impl Default for InterruptSignal {
    fn default() -> Self {
        Self::new()
    }
}

impl InterruptSignal {
    pub fn new() -> Self {
        Self {
            flag: Arc::new(AtomicBool::new(false)),
            epoch: Arc::new(AtomicU64::new(0)),
            notify: Arc::new(Notify::new()),
        }
    }

    /// Raise the signal. Bumps the epoch so a pending reset cannot erase it.
    pub fn fire(&self) {
        self.flag.store(true, Ordering::SeqCst);
        self.epoch.fetch_add(1, Ordering::SeqCst);
        self.notify.notify_waiters();
    }

    pub fn is_set(&self) -> bool {
        self.flag.load(Ordering::SeqCst)
    }

    pub fn epoch(&self) -> u64 {
        self.epoch.load(Ordering::SeqCst)
    }

    /// Clear the flag unconditionally.
    pub fn reset(&self) {
        self.flag.store(false, Ordering::SeqCst);
        self.epoch.fetch_add(1, Ordering::SeqCst);
    }

    /// Clear the flag only if no new cancellation arrived since `epoch` was read.
    ///
    /// Returns `true` when the reset was applied. Returns `false` when a newer
    /// `fire` won the race, leaving the flag set.
    pub fn reset_if_epoch(&self, epoch: u64) -> bool {
        if self.epoch() != epoch {
            return false;
        }
        self.flag.store(false, Ordering::SeqCst);
        self.epoch.fetch_add(1, Ordering::SeqCst);
        // A `fire` that landed between the check and the store above must win.
        if self.epoch() != epoch + 1 {
            self.flag.store(true, Ordering::SeqCst);
            return false;
        }
        true
    }

    /// Resolve when the signal is raised, or immediately if it already was.
    pub async fn notified(&self) {
        // Register before checking so a concurrent `fire` cannot be lost.
        let notified = self.notify.notified();
        if self.is_set() {
            return;
        }
        notified.await;
    }

    pub fn as_atomic(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.flag)
    }

    pub fn same_instance(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.flag, &other.flag)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fire_sets_and_reset_clears() {
        let signal = InterruptSignal::new();
        assert!(!signal.is_set());
        signal.fire();
        assert!(signal.is_set());
        signal.reset();
        assert!(!signal.is_set());
    }

    #[test]
    fn clones_share_one_signal() {
        let a = InterruptSignal::new();
        let b = a.clone();
        assert!(a.same_instance(&b));
        b.fire();
        assert!(a.is_set());
        assert!(!a.same_instance(&InterruptSignal::new()));
    }

    #[test]
    fn reset_if_epoch_ignores_a_newer_cancellation() {
        let signal = InterruptSignal::new();
        signal.fire();
        let stale_epoch = signal.epoch();
        signal.reset();

        // A newer fire lands after the observer read the epoch.
        signal.fire();
        assert!(!signal.reset_if_epoch(stale_epoch));
        assert!(signal.is_set(), "a newer cancel must survive a stale reset");
    }

    #[test]
    fn reset_if_epoch_applies_when_unchanged() {
        let signal = InterruptSignal::new();
        signal.fire();
        let epoch = signal.epoch();
        assert!(signal.reset_if_epoch(epoch));
        assert!(!signal.is_set());
    }

    #[tokio::test]
    async fn notified_returns_immediately_when_already_set() {
        let signal = InterruptSignal::new();
        signal.fire();
        tokio::time::timeout(std::time::Duration::from_millis(50), signal.notified())
            .await
            .expect("must resolve without waiting");
    }

    #[tokio::test]
    async fn notified_wakes_on_fire() {
        let signal = InterruptSignal::new();
        let waiter = signal.clone();
        let handle = tokio::spawn(async move { waiter.notified().await });
        tokio::task::yield_now().await;
        signal.fire();
        tokio::time::timeout(std::time::Duration::from_millis(200), handle)
            .await
            .expect("must wake")
            .expect("waiter must not panic");
    }
}
