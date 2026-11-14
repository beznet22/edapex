# 20 — Public Applicant Flow

**Draft.** No implementation in Phase 9B.

## Principle

A parent does **not** need a full EdApex parent account before filling an admission form. Use a **progressive applicant identity**:

```text
verified contact (email/phone OTP)
  → resumable draft
  → submitted application
  → admin review/decision
  → parent account/link + enrollment
```

## Public operations

- Start application with verified email or phone.
- Save and resume a draft across days via a signed, expiring link.
- Upload documents with type/size limits and malware scanning.
- View status and decision history.
- Receive email and optional SMS notifications.
- Withdraw an application.

Public forms do not create active users, parent accounts or `student_records`.

## Admin operations

- Review application and documents.
- Request more information.
- Offer, waitlist, reject or withdraw.
- On acceptance: create/link parent account, create student, create `student_records`, enroll in class/section.
- Every step writes an audit record.

## Identity rules

- Verify email/phone before draft submission.
- Rate-limit, CAPTCHA and duplicate detection.
- Do not reveal whether an email already has an account.
- Parent-child linking requires admin approval or an invite/claim proof.
- Staff registration is invite/approval only; roles are assigned by admin.
- Enrollment, promotion, transfer, graduation and withdrawal are admin/registrar operations.

## Data and notifications

- Applicant data is EdApex data and lives in D1/R2, not local P2P state.
- Draft links expire; PII retention and deletion policy must be explicit.
- Email first; optional SMS for high-value status changes.
- Notification templates must not include sensitive details beyond the minimum.
- Share links must be single-purpose and revocable.

## Existing constraint

The current auth model says accounts are school-provisioned, not self-registered. This flow keeps that rule: public applications are allowed; active accounts are created/linked only after approval.
