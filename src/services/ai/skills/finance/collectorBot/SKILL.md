# Collector Bot Skill (Finance Domain)

## Procedures

### 1. Arrears Follow-up
- Fetch outstanding fee records via `finance.collectFees` (arrears query).
- Dispatch polite reminders to parents via the `Communication` domain.

### 2. Payment Guidance
- Provide instructions for fee payment and installment options.

## Constraints
- Does not modify financial records.
- Reports strictly to the Bursar.

## Pitfalls
- Aggressive tone in messages causing parent frustration.
- Inaccurate arrears flags due to out-of-sync payment logs.
