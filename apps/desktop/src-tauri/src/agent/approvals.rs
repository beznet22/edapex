use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Mutex;
use std::time::Duration;

use edapex_agent::{ApprovalDecision, ApprovalFailure, ApprovalHandler, ApprovalRequest};
use tokio::sync::oneshot;

use crate::state::HostError;

/// How long a turn waits for a person before deciding not to act.
///
/// Ten minutes is long enough that a teacher who stepped away can still answer
/// and short enough that a WebView which died in the background stops holding
/// the thread. Today a lost WebView blocks it forever, and every later turn is
/// then refused with "a turn is already active".
const APPROVAL_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// Told about every request the moment it is asked, so a surface that is not
/// the WebView — a notification, in practice — can put it in front of a person.
pub type ApprovalNotifier = Box<dyn Fn(&ApprovalRequest) + Send + Sync>;

/// The approvals a turn is waiting on, one waiter per request.
pub struct ApprovalRegistry {
    pending: Mutex<HashMap<String, oneshot::Sender<ApprovalDecision>>>,
    failures: Mutex<HashMap<String, ApprovalFailure>>,
    notifier: Option<ApprovalNotifier>,
    timeout: Duration,
}

impl Default for ApprovalRegistry {
    fn default() -> Self {
        ApprovalRegistry::with_timeout(APPROVAL_TIMEOUT)
    }
}

impl ApprovalRegistry {
    pub fn with_timeout(timeout: Duration) -> Self {
        ApprovalRegistry {
            pending: Mutex::new(HashMap::new()),
            failures: Mutex::new(HashMap::new()),
            notifier: None,
            timeout,
        }
    }

    /// With somewhere to announce requests that is not the WebView.
    pub fn with_notifier(notifier: ApprovalNotifier) -> Self {
        ApprovalRegistry {
            notifier: Some(notifier),
            ..ApprovalRegistry::with_timeout(APPROVAL_TIMEOUT)
        }
    }

    pub fn resolve(
        &self,
        approval_request_id: &str,
        decision: ApprovalDecision,
    ) -> Result<(), HostError> {
        let sender = self
            .pending
            .lock()
            .map_err(|_| HostError::new("internal_error", "Approval state is unavailable", true))?
            .remove(approval_request_id)
            .ok_or_else(|| {
                HostError::new(
                    "invalid_input",
                    "Approval request is no longer pending",
                    false,
                )
            })?;
        sender.send(decision).map_err(|_| {
            HostError::new(
                "internal_error",
                "Approval request was already resolved",
                false,
            )
        })
    }

    fn record_timeout(&self, approval_request_id: &str) {
        if let Ok(mut failures) = self.failures.lock() {
            failures.insert(approval_request_id.to_string(), ApprovalFailure::Timeout);
        }
        // The sender is dead once the future has returned; keeping it would leak
        // one entry per expired approval for the life of the process.
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(approval_request_id);
        }
    }
}

impl ApprovalHandler for ApprovalRegistry {
    fn request(
        &self,
        request: ApprovalRequest,
    ) -> Pin<Box<dyn Future<Output = ApprovalDecision> + Send + '_>> {
        let approval_request_id = request.approval_request_id.clone();
        let (sender, receiver) = oneshot::channel();
        if let Ok(mut pending) = self.pending.lock() {
            pending.insert(approval_request_id.clone(), sender);
        }
        if let Some(notifier) = self.notifier.as_ref() {
            notifier(&request);
        }
        Box::pin(async move {
            match tokio::time::timeout(self.timeout, receiver).await {
                Ok(Ok(decision)) => decision,
                // The sender was dropped without a decision: fail closed.
                Ok(Err(_)) => ApprovalDecision::Deny,
                Err(_) => {
                    self.record_timeout(&approval_request_id);
                    ApprovalDecision::Deny
                }
            }
        })
    }

    fn failure(&self, approval_request_id: &str) -> Option<ApprovalFailure> {
        self.failures
            .lock()
            .ok()
            .and_then(|failures| failures.get(approval_request_id).copied())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use edapex_agent::CapabilityRisk;

    fn request(id: &str) -> ApprovalRequest {
        ApprovalRequest {
            approval_request_id: id.to_string(),
            title: "Run web_search".to_string(),
            description: "Allow web_search for this turn?".to_string(),
            risk: CapabilityRisk::Read,
            decisions: Vec::new(),
        }
    }

    /// `tokio::test` needs the `macros` feature, which this crate does not carry
    /// for its three tests; a current-thread runtime is the same thing spelled out.
    fn block_on<T>(future: impl std::future::Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(future)
    }

    #[test]
    fn an_unanswered_request_denies_and_says_why() {
        block_on(async {
        let registry = ApprovalRegistry::with_timeout(Duration::from_millis(10));

        let decision = registry.request(request("approval-1")).await;

        assert_eq!(decision, ApprovalDecision::Deny);
        assert_eq!(registry.failure("approval-1"), Some(ApprovalFailure::Timeout));
        })
    }

    #[test]
    fn a_person_answering_beats_the_deadline() {
        block_on(async {
        let registry = std::sync::Arc::new(ApprovalRegistry::with_timeout(Duration::from_secs(60)));
        let asked = {
            let registry = registry.clone();
            tokio::spawn(async move { registry.request(request("approval-2")).await })
        };
        // Resolve after the waiter has registered.
        tokio::time::sleep(Duration::from_millis(20)).await;
        registry
            .resolve("approval-2", ApprovalDecision::AllowOnce)
            .expect("resolves");

        assert_eq!(asked.await.expect("joined"), ApprovalDecision::AllowOnce);
        assert_eq!(registry.failure("approval-2"), None);
        })
    }

    #[test]
    fn an_expired_request_cannot_be_resolved_later() {
        block_on(async {
        let registry = ApprovalRegistry::with_timeout(Duration::from_millis(10));
        let _ = registry.request(request("approval-3")).await;

        assert!(
            registry.resolve("approval-3", ApprovalDecision::AllowOnce).is_err(),
            "a late answer must not resurrect a request the turn already gave up on"
        );
        })
    }
}
