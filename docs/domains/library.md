# Library Domain Architecture (Technical Specification)

The **Library** domain in EdApex V2 manages non-consumable tracking within physical and digital libraries. It replaces the fragmented legacy implementation with a unified, tenant-isolated system that leverages the platform's core identity layer for seamless member management.

---

## 1. Domain Overview

The Library domain is responsible for:
- **Inventory Management**: Tracking books, their categories, and physical location (rack numbers).
- **Circulation**: Managing the issuance and return of library resources to students, staff, and parents.
- **Financial Compliance**: Recording fines for overdue, lost, or damaged items.
- **AI-Driven Insights**: Leveraging borrowing history to provide personalized recommendations.

### Key Logic (Legacy Parity)
- **Quantity Tracking**: Ensures books are only issued if stock is available (`books.quantity > 0`).
- **Due Date Enforcement**: Automatic flagging of overdue items based on `due_date`.
- **Status Workflow**: Tracks the lifecycle of an issue from `issued` to `returned`, `lost`, or `damaged`.

---

## 2. Entity Mapping (V1 -> V2)

The V2 schema shifts from persona-based membership to a **Unified Identity** model, where library interactions are linked directly to platform `users`.

| Legacy Table (V1) | Modern Entity (V2) | Structural Improvement |
| :--- | :--- | :--- |
| `sm_books` | `books` | ISBN and Author formalized; added `metadata` (JSON) for flexible attributes (edition, language, tags). |
| `sm_book_categories` | `book_categories` | Simplified tenant-isolated categories. |
| `sm_book_issues` | `book_issues` | Links directly to `userId`; status handled via `mysqlEnum`; includes `fineAmount` tracking. |
| `sm_library_members` | **Unified Identity** (`users`) | **REMOVED**. Every platform user is a potential library member. Legacy `member_ud_id` is migrated to `users.metadata.library_card_number`. |

### Legacy Table: `sm_library_members`
In V1, this acted as a bridge between books and different persona tables (`sm_students`, `sm_staffs`). In V2, the `users` table already consolidates these personas, making the specific "Member" table redundant.

---

## 3. AI Agent & Tool Integration

The Library domain is integrated into the **Hierarchical Multi-Agent System (HMAS)** to automate administrative tasks and enhance the user experience.

### Layer 2: Library Supervisor
The `library_supervisor` coordinates library task agents and ensures that operations comply with tenant policies.

### Layer 3: Task Agents
- **`book_recommendation_agent`**: 
  - **Logic**: Analyzes a user's `book_issues` history and cross-references with their academic domain data (subjects, courses).
  - **Tool**: `get_user_borrowing_history.tool`, `search_available_books.tool`.
- **`library_audit_agent`**:
  - **Logic**: Periodically reconciles physical stock with high-latency transaction logs. Flags discrepancies for manual review.
  - **Tool**: `reconcile_inventory.tool`.

---

## 4. PBAC & Security

Access to library records is strictly governed by **Policy-Based Access Control (PBAC)**.

| Role | Action | Resource | Condition |
| :--- | :--- | :--- | :--- |
| `Librarian` | `all` | `books`, `book_issues` | Must belong to the same `tenant_id`. |
| `Student` | `read` | `books` | Can browse all available books in the tenant. |
| `Student` | `read` | `book_issues` | Limited to records where `userId == CurrentUser.id`. |
| `Parent` | `read` | `book_issues` | Limited to records where `userId == ChildUser.id`. |

---

## 5. Recommendations & Justifications

### 5.1 Library Profiles Entity
**Proposal**: Add a `library_profiles` table or extend `users.metadata` to store library-specific constraints.
- **Fields**: `max_books_allowed`, `default_issue_duration_days`.
- **Justification**: Currently, these limits are hardcoded or managed externally. Formalizing them allows the `library_supervisor` to enforce borrowing policies autonomously.

### 5.2 Event-Driven Fines
**Proposal**: Trigger a `finance.create_ledger_entry` event when a book is marked as `lost` or returned after the `due_date`.
- **Justification**: Integration with the Finance domain ensures that library fines are automatically reflected in the student's ledger, reducing manual administrative entry.

### 5.3 Digital Resource Metadata
**Proposal**: Expand `BookMetadata` to include `digital_asset_url` and `is_digital`.
- **Justification**: Prepares the Library domain for Hybrid libraries (Physical + PDF/E-book) where "issuing" for a digital asset simply involves unlocking access for a period.
