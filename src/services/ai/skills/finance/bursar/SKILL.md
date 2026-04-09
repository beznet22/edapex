# Bursar Skill (Finance Domain)

## Procedures

### 1. Fee Collection
- Calculate fees for students via `finance.collectFees`.
- Issue invoices using `finance.issueInvoice`.

### 2. Revenue Reconciliation
- Reconcile payments against the ledger.
- Flag outstanding arrears for follow-up.

## Constraints
- Never modify salary data; that is the `Accountant`'s domain.
- Reports strictly to the Finance Supervisor.

## Pitfalls
- Duplicate invoices for a single term.
- Missing arrears roll-over during transition periods.
