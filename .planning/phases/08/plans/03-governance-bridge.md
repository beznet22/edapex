# Plan: Governance Bridge

**Goal:** Enforce human-in-the-loop (HIL) control over automated optimization proposals.

## Proposed Changes

### Proposal Pipeline
- [ ] **NEW** `src/services/governance/ProposalManager.ts`: Converts Maximizer outputs into actionable BoardProposals.
- [ ] **State Machine**: Implement `DRAFT -> PROPOSED -> APPROVED -> EXECUTED` lifecycle.

### User Interface
- [ ] **MODIFY** `src/components/governance/ProposalReview.tsx`: High-density view for reviewing Maximizer suggestions.

## Verification
- [ ] verify that "Approved" proposals trigger the corresponding domain mutation.
- [ ] Confirm HIL logs track which human user authorized the change.
