# Library Domain Architecture

## Overview
The Library domain manages physical and digital book catalogs, borrower profiles, and book issue/return transactions. It enforces per-user borrowing limits and tracks fines for overdue, lost, or damaged items, with automatic reconciliation to the Finance ledger.

### Key Business Logic
- **Book Catalog**: Categories → Books hierarchy with ISBN, author, publisher, rack location, and quantity tracking.
- **Borrower Profiles**: Per-user library membership with configurable `maxBooksAllowed`, real-time `currentBorrowed` count, and accumulated fines.
- **Issue/Return Lifecycle**: `issued` → `returned` / `lost` / `damaged`. Overdue and damage fines auto-calculated.
- **Auto-Fine Reconciliation**: Fines flow to the Finance ledger via the `fine_reconciliation_service` stress defense tool.
- **[NEW] Professional Persona Flow (The Librarian)**: Mrs. Balogun, the School Librarian, manages the "Annual Catalog Audit" goal. She triggers the `inventory_auditor` to reconcile 1,000 physical books against active `bookIssues`. When `quantity_integrity_checker` flags a phantom stock, she uses the `reading_advisor` to analyze borrowing patterns and suggest replacements. She approves the "Damaged Book" fine via the `aiApprovals` gate, which the `fine_reconciliation_service` then posts to the student's Finance ledger, visualized through Boneyard skeletons.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table (`schoolify`) | V2 Entity (`src/db/domain-library.ts`) | Notes |
| :--- | :--- | :--- |
| `sm_book_categories` / `library_subjects` | `bookCategories` | Category definitions per tenant. |
| `sm_books` | `books` | ISBN, author, publisher, quantity, price, rack. JSON metadata. |
| `sm_book_issues` | `bookIssues` | Issue/return lifecycle with fine tracking. |
| — (new) | `libraryProfiles` | Per-user membership with borrowing limits and fine totals. |
| — (new) | `aiSessions` | [GOVERNANCE] Traceability for fine waivers and reading advice. |
| — (new) | `aiTasks` | [GOVERNANCE] Atomic issue/return and audit tasks. |
| — (new) | `aiGoals` | [GOVERNANCE] Alignment with institutional literacy targets. |
| — (new) | `aiApprovals` | [GOVERNANCE] Senior Librarian sign-off for book disposals. |

---

## Technical Implementation

### Core Entities

#### [BookCategories](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-library.ts#L21)
Category taxonomy for organizing the book catalog.

#### [Books](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-library.ts#L38)
Book records with ISBN, author, publisher, `quantity`, `price`, `rackNo`. JSON `metadata` for edition, language, pages, tags.

#### [BookIssues](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-library.ts#L57)
Transaction log: `issued` → `returned`/`lost`/`damaged`. Tracks `issueDate`, `dueDate`, `returnDate`, `fineAmount`, `isFinePaid`.

#### [LibraryProfiles](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-library.ts#L83)
Per-user borrower profile with `maxBooksAllowed`, `currentBorrowed`, `totalFinesAccrued`. Membership status: `active`/`suspended`/`expired`. Unique constraint on `(tenantId, userId)`.

---

## AI Task Agents & Tools

### Operational Tools (Mastra)
- `library.searchBooks(query)`: Unified search across physical and digital assets.
- `library.issueBook(bookId, userId)`: Records checkout and sets atomic return deadline.
- `library.checkOverdue(tenantId)`: Scans for expired returns and triggers fine calculation.
- `library.returnBook(issueId)`: Records return and updates `books.quantity` atomically.
- `check_availability`: Verifies book availability before issuing.
- `calculate_overdue_fine`: Computes fine based on days overdue and tenant fine policy.
- `generate_catalog_report`: Exports catalog with stock levels and popular titles.
- `recommend_reading`: AI-driven reading recommendations based on grade and history.
- `auto_suspend_delinquent`: Suspends library membership for unpaid fines beyond quota.

### [STRESS DEFENSE] Tools
- `concurrent_issue_guard`: Prevents race conditions when multiple users request the same last-copy book.
- `quantity_integrity_checker`: Reconciles `books.quantity` against active `bookIssues` to detect phantom stocks.
- `fine_reconciliation_service`: Auto-reconciles library fines into student Finance ledgers.

---

## PBAC & Security
- **TenantAdmin**: Full library access.
- **Librarian (Staff)**: Issue/return books, manage catalog, view all profiles.
- **Student/Staff**: Can view catalog, view own borrowing history and fines.
- **Parent**: Can view their child's borrowing history.

---

## Hono API Routes

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/library/categories` | List categories | Authenticated |
| `GET` | `/api/v1/library/books` | Search/list books | Authenticated |
| `POST` | `/api/v1/library/books` | Add book | Librarian+ |
| `POST` | `/api/v1/library/issues` | Issue book | Librarian |
| `PATCH` | `/api/v1/library/issues/:id/return` | Return book | Librarian |
| `GET` | `/api/v1/library/issues/:userId` | Get borrowing history | Self + Librarian |
| `GET` | `/api/v1/library/profiles/:userId` | Get borrower profile | Self + Librarian |

---

## HMAS Agent Registry

| Agent | Type | Capabilities | Link |
|:---|:---|:---|:---|
| `librarian_agent` | Task | Issue/return, fine calculation, catalog | [SOUL.md](../strategy/SOUL.md) |
| `reading_advisor` | Task | AI-powered reading recommendations | [SOUL.md](../strategy/SOUL.md) |
| `inventory_auditor` | Task | Stock reconciliation, quantity integrity | [SOUL.md](../strategy/SOUL.md) |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `library.book_issued` | `{ issueId, bookId, userId }` | Events (audit) |
| `library.book_returned` | `{ issueId, bookId, fineAmount }` | Finance (fine entry), Events (audit) |
| `library.book_overdue` | `{ issueId, userId, daysOverdue }` | Communication (reminder) |
| `library.membership_suspended` | `{ userId, reason }` | Communication (notification), PBAC (access restriction) |

---

## UI Documentation (Boneyard)
- **Book Search & Issue**: The library catalog MUST implement `boneyard-js` skeletons for sub-100ms real-time availability checks.
- **Borrower Profile**: High-density transaction logs must utilize "Refraction-Pro" glassmorphism cards for scannable fine-history visualization.
