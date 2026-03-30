# Finance & Accounting Domain Architecture

## Overview
The Finance & Accounting domain in EdApex V2 is built around a centralized, immutable **Universal Ledger** system. It replaces the fragmented legacy approach (where fees, expenses, and incomes lived in isolated tables) with a unified transactional model. This ensures strict multi-tenant isolation, auditability, and real-time financial health monitoring across all school operations.

### Key Business Logic
- **Transactional Duality**: Every financial movement (fee payment, salary disbursement, expense) is recorded as a standard ledger entry with specific `transaction_type`.
- **B2B Bulk Invoicing (Fee Lifecycle)**: Fees are categorized into Groups and Types, assigned to students via `fee_assignments`, and potentially split into `fee_installments`.
- **B2C Standalone Monetization**: Enables direct-to-consumer purchases (like Homeschool Subscriptions or single LMS Courses) via polymorphic `invoices` and an async `online_payments` gateway hub tracking Stripe/Paystack webhook intents.
- **Linked Ledger Reference**: Each ledger entry points back to its source (e.g., a fee assignment, standalone invoice, or an expense) via `reference_type` and `reference_id`.
- **Auto-Reconciliation**: Inventory sells/purchases and Payroll runs emit domain events that the Finance domain consumes to generate corresponding ledger entries automatically.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table (`schoolify`) | V2 Entity (`src/db/domain-finance.ts`) | Notes |
| :--- | :--- | :--- |
| `sm_fees_masters` | `fee_masters` | Fee amount definitions linked to types. |
| `sm_fees_groups` | `fee_groups` | High-level fee categories. |
| `sm_fees_types` | `fee_types` | Specific fee sub-categories. |
| `sm_fees_assign` | `fee_assignments` | Maps fees to students/enrollments. |
| `sm_fees_payments` | `ledger_entries` (Type: `fee_payment`) | Payments are now unified transaction records. |
| `sm_bank_accounts` | `bank_accounts` | Modern bank account management with balance tracking. |
| `sm_add_income` | `ledger_entries` (Type: `income`) | Direct income records. |
| `sm_add_expense` | `ledger_entries` (Type: `expense`) | Direct expense records. |
| `sm_chart_of_accounts` | Managed via `transaction_type` + `metadata` | Consolidated into the ledger structure. |
| `direct_fees_installments`| `fee_installments` | Structured payment plans. |

### Critical Logic Parity
- **Multi-Tenancy**: Legacy `school_id` is replaced by `tenantId`, verified at the middleware level to prevent cross-tenant data leaks.
- **Balance Enforcement**: In Legacy, `SmBankAccount` balance was updated manually in controllers. V2 uses ledger-triggered updates (or views) to ensure the `current_balance` in `bank_accounts` always reflects the sum of successful transactions.
- **Installment Sensitivity**: V2 explicitly tracks `fee_installments` to support partial payments and overdue alerting, which was often a source of calculation errors in V1.

---

## Technical Implementation

### Core Entities

#### [Ledger Entries](file:///home/beznet/Workspace/edapex/src/db/domain-finance.ts#L42)
The universal transaction log. 
> [!IMPORTANT]
> All financial mutations MUST result in a `ledger_entries` record. Direct balance manipulation is prohibited.

#### [Fee Assignments](file:///home/beznet/Workspace/edapex/src/db/domain-finance.ts#L112)
Tracks which student owes what. Replaces the legacy `sm_fees_assigns` with better student-enrollment linking.
- **Foreign Key Enforcement**: `ledger_entries` for fee payments reference `fee_assignments.id` to ensure no payment exists without a debt assignment.

#### [Bank Accounts](file:///home/beznet/Workspace/edapex/src/db/domain-finance.ts#L94)
Manages institutional funds. Linked to `ledger_entries` via metadata for tracking which transaction hit which bank.

#### [Fee Installments](file:///home/beznet/Workspace/edapex/src/db/domain-finance.ts#L146)
Enables complex payment plans. A student can pay a single `fee_assignment` across multiple installments.

#### Online Payments & Gateways (B2C Engine)
Dedicated tables (`online_payments` and `payment_gateways`) securely handle immediate digital checkouts. They capture webhook intents from providers (Stripe/Flutterwave) and once verified, resolve transactions directly onto the `ledger_entries` log. `invoices` utilize polymorphic `reference_type` and `reference_id` fields to instantly un-gate the purchased product (LMS Course, Subscriptions).

---

## Domain Event Integration

The Finance domain is highly reactive:
- **`inventory.item_sold`**: Automatically triggers a `ledger_entries` record (Type: `income`).
- **`inventory.item_received`**: Automatically triggers a `ledger_entries` record (Type: `expense`).
- **`hr.payroll_disbursed`**: Triggers `ledger_entries` (Type: `salary`).
- **`student.withdrawn`**: May trigger automatic `fee_assignments` cancellation or `ledger_entries` (Type: `refund`).

---

## Security & Isolation

### Ledger Immutability
Ledger entries once posted are immutable. Corrections must be made via reversal entries (Type: `refund` or `correction`) to maintain a clean audit trail.

### Tenant Isolation
The `tenant_id` is a primary index in almost all finance tables. AI agents and DB adapters MUST append a `tenantId` filter to every query to ensure privacy.

---

## Flexibility Recommendations (Ledger Evolution)

### 1. Robust Chart of Accounts (COA)
While currently handled via `transaction_type`, consider a dedicated `chart_of_accounts` table for schools requiring complex accounting hierarchies (Assets, Liabilities, Equity).

### 2. Digital Wallet Support
Extend the ledger to support a `wallet_balance` per user (Student/Staff) to allow for internal pre-payments (canteen, bookstore) without direct bank interaction for every micro-transaction.

---

## Hono API Routes

```
Routes → FinanceController → FinanceService → FinanceRepository
```

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/finance/ledger` | List ledger entries (paginated, filtered) | `TenantAdmin` |
| `POST` | `/api/v1/finance/ledger` | Create ledger entry | `TenantAdmin` |
| `GET` | `/api/v1/finance/fee-groups` | List fee groups | Authenticated |
| `POST` | `/api/v1/finance/fee-assignments` | Assign fees to students | `TenantAdmin` |
| `GET` | `/api/v1/finance/fee-assignments/:userId` | Get student fee status | Self + Admin |
| `POST` | `/api/v1/finance/payments` | Record fee payment | `TenantAdmin` |
| `GET` | `/api/v1/finance/bank-accounts` | List bank accounts | `TenantAdmin` |
| `GET` | `/api/v1/finance/installments/:assignmentId` | Get installment plan | Self + Admin |
| `GET` | `/api/v1/finance/reports/balance-sheet` | Balance sheet report | `TenantAdmin` |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| `finance_supervisor` | Supervisor | Routes financial tasks, enforces ledger immutability |
| `fee_calculator` | Task | Fee computation, installment generation |
| `fee_recovery_agent` | Task | Overdue reminders, payment pattern analysis |
| `ledger_agent` | Task | Auto-creates ledger entries from domain events |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `finance.payment_received` | `{ assignmentId, amount, method }` | Events (audit), Communication (receipt) |
| `finance.fee_overdue` | `{ assignmentId, userId, daysOverdue }` | Communication (reminder), AI (recovery agent) |
| `finance.ledger_posted` | `{ entryId, type, amount, direction }` | Events (audit) |
| `finance.installment_due` | `{ installmentId, dueDate, amount }` | Communication (reminder) |
