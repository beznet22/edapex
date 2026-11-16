use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Mutex;

use edapex_agent::{ApprovalDecision, ApprovalHandler, ApprovalRequest};
use tokio::sync::oneshot;

use crate::state::HostError;

/// The approvals a turn is waiting on, one waiter per request.
///
/// A turn blocks here until a person answers, so a request that nobody answers
/// must not hold the thread indefinitely — the deadline is added in the
/// durability work, not here.
#[derive(Default)]
pub struct ApprovalRegistry {
    pending: Mutex<HashMap<String, oneshot::Sender<ApprovalDecision>>>,
}

impl ApprovalHandler for ApprovalRegistry {
    fn request(
        &self,
        request: ApprovalRequest,
    ) -> Pin<Box<dyn Future<Output = ApprovalDecision> + Send>> {
        let (sender, receiver) = oneshot::channel();
        if let Ok(mut pending) = self.pending.lock() {
            pending.insert(request.approval_request_id, sender);
        }
        Box::pin(async move { receiver.await.unwrap_or(ApprovalDecision::Deny) })
    }
}

impl ApprovalRegistry {
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
}
