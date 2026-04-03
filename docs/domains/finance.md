# Finance & Accounting Domain Architecture

## Overview
The Finance domain in EdApex V2 is built around a centralized, immutable **Universal Ledger** system. All financial mutations must result in a `ledger_entries` record. It supports B2B institutional fee management and B2C standalone monetization (LMS/Homeschooling) via polymorphic invoices.

### Key Business Logic
- **Universal Ledger**: Immutable, double-entry (credit/debit) record of all fee payments, salaries, expenses, and refunds.
- **B2B Bulk Invoicing**: Fees assigned via `feeAssignments` with `feeInstallments` for payment plan support.
- **B2C Standalone Monetization**: Digital checkouts for LMS/Homeschooling via polymorphic `invoices` (`referenceType`: `school_fee`, `lms_course`, `homeschool_subscription`).
- **Auto-Reconciliation**: Cross-domain events automatically generate ledger entries (e.g., enrollment triggers fee assignment).
- **Online Payments**: Gateway integration (Stripe, Paystack, Flutterwave, PayPal) with webhook-driven status tracking.
- **[NEW] Professional Persona Flow (The Bursar)**: Mr. Okafor, the School Bursar, manages the "Third Term Fee Recovery" goal. He triggers the `fee_recovery_agent` to scan for 200 overdue installments. When a "Sibling Discount" is auto-detected by the `ledger_agent`, he approves the adjustment via the `aiApprovals` gate. He uses the Boneyard-powered "Universal Ledger" dashboard to verify that fractional rounding drift is handled before the `principal_assistant` emits the final fiscal WorkProduct.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table (`schoolify`) | V2 Entity (`src/db/domain-finance.ts`) | Notes |
| :--- | :--- | :--- |
| `sm_fees_masters` / `sm_fees_groups` / `sm_fees_types` | `feeMasters` / `feeGroups` / `feeTypes` | Hierarchical fee structure preserved. |
| `fm_fees_groups` / `fm_fees_types` | Merged into `feeGroups` / `feeTypes` | Eliminated parallel fee module tables. |
| `sm_fees_assigns` | `feeAssignments` | Per-student fee assignment with paid/waived tracking. |
| `sm_fees_payments` / `sm_bank_payment_slips` | `ledgerEntries` | Unified into immutable ledger entries. |
| `sm_add_incomes` / `sm_income_heads` | `ledgerEntries` (type: `income`) | Income tracked via ledger direction. |
| `sm_add_expenses` / `sm_expense_heads` | `ledgerEntries` (type: `expense`) | Expense tracked via ledger direction. |
| `sm_chart_of_accounts` | `ledgerEntries` (referenceType) | Replaced by reference-based categorization. |
| `wallet_transactions` | `ledgerEntries` (type: `wallet_topup`) | Wallet unified into ledger. |
| — (new) | `feeDiscounts` | Percentage/fixed discount definitions. |
| — (new) | `feeInstallments` | Payment plan support with due dates. |
| — (new) | `invoices` | Polymorphic invoicing (B2B + B2C). |
| — (new) | `bankAccounts` | School bank account management. |
| — (new) | `paymentGateways` | Online payment provider configuration. |
| — (new) | `onlinePayments` | Transaction tracking with provider fees. |
| — (new) | `aiSessions` | [GOVERNANCE] Traceability for fee adjustment discussions. |
| — (new) | `aiTasks` | [GOVERNANCE] Atomic ledger mutation and reconciliation tasks. |
| — (new) | `aiGoals` | [GOVERNANCE] Alignment with school financial targets. |
| — (new) | `aiApprovals` | [GOVERNANCE] Multi-sig sign-off for refunds and waivers. |
| — (new) | `aiCostEvents` | [FINANCE] Token/cent telemetry per agent execution. |

### Critical Logic Parity
- **Immutable Ledger**: Legacy allowed direct mutation of payment records. V2 enforces immutability — corrections happen via reversal entries only.
- **Polymorphic Invoicing**: `invoices.referenceType` supports `school_fee`, `lms_course`, `homeschool_subscription`, enabling unified billing across B2B and B2C.

---

## Technical Implementation

### Core Entities

#### [LedgerEntries](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-finance.ts#L30)
Universal double-entry ledger. `transactionType` enum: `fee_payment`, `fee_waiver`, `salary`, `expense`, `income`, `refund`, `wallet_topup`. Direction: `credit` or `debit`.

#### [FeeGroups / FeeTypes / FeeMasters](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-finance.ts#L55)
Hierarchical fee structure: Group → Type → Master (with academic year scoping and due dates).

#### [FeeAssignments](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-finance.ts#L103)
Per-student fee assignment tracking `assignedAmount`, `paidAmount`, `waivedAmount` with status enum.

#### [FeeInstallments](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-finance.ts#L137)
Payment plan support. Each installment tracks amount, due date, and payment status.

#### [FeeDiscounts](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-finance.ts#L124)
Percentage or fixed discount definitions (e.g., sibling discounts, scholarship).

#### [Invoices](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-finance.ts#L160)
Polymorphic invoicing with `referenceType` for B2B (school fees) and B2C (LMS courses, homeschool).

#### [PaymentGateways / OnlinePayments](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-finance.ts#L183)
Configurable payment provider integration with webhook-driven transaction status tracking.

#### [BankAccounts](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-finance.ts#L85)
School bank account management with balance tracking.

---

## AI Task Agents & Tools

### Operational Tools (Mastra)
- `bursar.calculateFees(studentId)`: Computes base tuition + arrears + late fees + discounts.
- `bursar.issueInvoice(studentId, amount)`: Creates a payment-link WorkProduct.
- `bursar.reconcilePayment(refId)`: Bridges third-party gateway signal to the Ledger.
- `bursar.generateAgingReport()`: Lists students with outstanding fees over 30 days.
- `finance.collectFees(studentId, amount)`: Records fee payment and updates ledger.
- `finance.processPayroll(cycleId)`: Calculates deductions and net pay via HR domain.
- `finance.auditLedger(startDate, endDate)`: Scans for un-reconciled debit/credit pairs.
- `finance.generateFiscalReport()`: Produces a P&L WorkProduct for the Board.
- `finance.approveExpense(requestId)`: Validates expense against domain budget policy.
- `generate_fee_assignment`: Bulk assigns fees to enrolled students based on class/section.
- `calculate_installment_plan`: Generates installment schedules based on total amount and tenant preferences.
- `reconcile_online_payment`: Matches webhook events to pending invoices and creates ledger entries.

### [STRESS DEFENSE] Tools
- `fractional_payment_engine`: Handles rounding drift across complex discount/scholarship stacks.
- `prorated_refund_calculator`: Atomic calculation of mid-term withdrawal refunds.
- `sibling_discount_scanner`: Detects and auto-applies cross-account sibling logic.
- `currency_stabilizer`: Protects ledger integrity from high-volatility rate shifts during regional payments.
- `fine_reconciliation_service`: Auto-reconciles library/equipment damage fines into student ledgers.
- `compulsory_tier_guard`: Prevents auto-billing of foundational education (e.g. UBE) based on structural skills.

---

## PBAC & Security
- **Ledger Immutability**: Corrections must happen via reversal entries — no direct mutations.
- **Tenant Isolation**: Mandatory `tenant_id` scoping for all financial data.
- **TenantAdmin**: Full financial access within tenant.
- **Parent**: Can view their children's fee assignments and make payments.
- **Student**: Read-only access to their own fee status.

---

## Hono API Routes

```
Routes → FinanceController → FinanceService → FinanceRepository
```

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/finance/ledger` | Query the universal ledger | `TenantAdmin` |
| `POST` | `/api/v1/finance/payments` | Record payment | `TenantAdmin` |
| `GET` | `/api/v1/finance/fee-groups` | List fee groups | `TenantAdmin` |
| `POST` | `/api/v1/finance/fee-assignments` | Assign fees to students | `TenantAdmin` |
| `GET` | `/api/v1/finance/fee-assignments/:userId` | Get student fee status | Self + `TenantAdmin` |
| `GET` | `/api/v1/finance/installments/:assignmentId` | Get installment plan | Self + `TenantAdmin` |
| `GET` | `/api/v1/finance/invoices` | List invoices | `TenantAdmin` |
| `POST` | `/api/v1/finance/invoices` | Generate invoice | `TenantAdmin` |
| `GET` | `/api/v1/finance/bank-accounts` | List bank accounts | `TenantAdmin` |
| `POST` | `/api/v1/finance/online-payments` | Initiate online payment | Authenticated |

---

## HMAS Agent Registry

| Agent | Type | Capabilities | Link |
|:---|:---|:---|:---|
| `finance_supervisor` | Supervisor | Ledger immutability, policy routing | [SOUL.md](../strategy/SOUL.md) |
| `fee_calculator` | Task | Fee/installment generation, fractional logic | [SOUL.md](../strategy/SOUL.md) |
| `fee_recovery_agent` | Task | Overdue reminders, pattern analysis | [SOUL.md](../strategy/SOUL.md) |
| `ledger_agent` | Task | Auto-creates entries, sibling scanning | [SOUL.md](../strategy/SOUL.md) |
| `payment_gateway_agent` | Task | Webhook reconciliation, refund processing | [SOUL.md](../strategy/SOUL.md) |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `finance.payment_received` | `{ assignmentId, amount, method }` | Communication (receipt), Events (audit) |
| `finance.fee_overdue` | `{ userId, daysOverdue, amount }` | Communication (reminder), PBAC (access restriction) |
| `finance.ledger_posted` | `{ entryId, type, amount, direction }` | Events (audit) |
| `finance.invoice_issued` | `{ invoiceId, userId, totalAmount }` | Communication (email), Events (audit) |
| `finance.fraud_alert` | `{ userId, reason, score }` | Finance (supervisor), PBAC (lockout) |
| `finance.refund_processed` | `{ entryId, originalEntryId, amount }` | Communication (notification), Events (audit) |

---

## UI Documentation (Boneyard)
- **Universal Ledger Dashboard**: All financial registers MUST implement `boneyard-js` skeletons for sub-100ms row-by-row immutable posting.
- **Invoice Viewer**: The digital checkout viewport must utilize "Refraction-Pro" glassmorphism cards for live payment status visualization.
