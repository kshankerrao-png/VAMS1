# Product Requirements Document (PRD)

## Visitors Appointment Management System (VAMS)

**Client:** Transport, Roads & Buildings (T,R&B) Department
**Document type:** Product Requirements Document
**Source:** Application Requirement Brief — VAMS, and Visitor's Appointment Slip (Peshi form)
**Status:** Draft v1.0
**Date:** 17 November 2026

---

## 1. Executive Summary

VAMS is a centralized web application for the T,R&B Department that digitizes the intake, review, scheduling, and notification of visitor appointment requests for the Secretary, T,R&B.

Today, visitors fill out paper slips at the peshi. Slips are compiled and presented to the Secretary once a week for review and date allocation. VAMS replaces this with a single system of record covering:

1. Structured visitor intake with automatic duplicate/history lookup and auto-fill.
2. A pending-requests queue for the Secretary with one-click approve/reject and slot assignment.
3. Automatic Email and WhatsApp confirmations on approval.
4. Status-based tracking (Pending, Approved, Rejected, Materialized).
5. Multi-criteria search, filtering, and audit-ready reporting across the full appointment register.

**Objective:** Reduce the weekly review cycle to an on-demand approval workflow, eliminate manual re-entry of returning visitor data, and make every visitor and appointment traceable and auditable.

---

## 2. Background & Problem Statement

**Current workflow**

- Visitor arrives at the T,R&B peshi and fills a paper appointment slip (name, designation, organization, address, mobile, email, purpose, accompanying persons, documents, remarks).
- Slips are collected, compiled manually, and bundled for a once-a-week review.
- The Secretary reviews the batch and allocates dates/times by hand.
- Confirmation to the visitor is informal/manual.

**Pain points**

| Pain point | Impact |
|---|---|
| Manual data entry and physical slip handling | High staff effort, transcription errors, illegible records |
| Weekly batch review | Multi-day delay between request and decision |
| No reliable retrieval of historical records | Returning visitors re-entered from scratch; no continuity |
| No audit trail | Decisions and notifications cannot be traced or verified |
| No automated confirmation channel | Visitors unaware of slot; follow-up calls burden the peshi |

---

## 3. Goals & Success Metrics

**Goals**

- G1: Single digital register of all visitor appointment requests.
- G2: Secretary can approve/reject and schedule in a single action, at any time — not only weekly.
- G3: Returning visitors are recognized and their profile auto-filled from one key identifier.
- G4: Approved appointments trigger Email + WhatsApp confirmations automatically.
- G5: Every record, decision, schedule change, and notification has an auditable trail.

**Success metrics (proposed, to be confirmed)**

| Metric | Target |
|---|---|
| Time from request entry to Secretary decision | < 2 working days (from weekly batch) |
| Re-entry effort for returning visitors | ≥ 80% fields auto-filled, near-zero manual typing |
| Approval notifications delivered (Email + WhatsApp) | ≥ 98% delivered; failures visible and retryable |
| Historical search response (any filter combination) | < 2 seconds for typical register size |
| Records missing required audit fields | 0 |

---

## 4. Users, Roles & Permissions

| Role | Responsibilities | System access |
|---|---|---|
| **Peshi Staff / Data Entry Operator** | Enter appointment requests, verify returning visitor details, attach visit particulars, monitor request status, search the register | Create/read visitor & request records, search/filter/export, view notification status. **No** approve/reject, no slot assignment, no user administration |
| **Secretary, T,R&B (Approving Authority)** | Review pending queue, approve/reject, assign exact date & time, reschedule, mark visit as materialized | Full read, approve/reject, schedule/reschedule, mark materialized, view audit log and reports |
| **Visitors (External Stakeholders)** | Provide details at the peshi; receive confirmations | No login. Receive Email and WhatsApp messages containing appointment details |
| **System Administrator (recommended)** *(role implied by RBAC/audit requirements; confirm)* | Manage users, roles, master data, notification gateway configuration | User/role management, configuration, full audit access. No business decision authority by default |

RBAC is mandatory: approval, rejection, and slot-allocation controls are strictly limited to the Secretary's authorized login.

---

## 5. Scope

### 5.1 In scope

- Visitor intake form (digital replacement of the paper slip).
- Smart lookup, auto-fill, and history display on the intake form.
- Pending-requests review queue with approve/reject and date-time assignment.
- Automatic status lifecycle and status-based lists.
- Email and WhatsApp notification on approval, with delivery tracking.
- Register-wide multi-criteria search, filtering, and reporting/export.
- Role-based access control and audit logging.

### 5.2 Out of scope (v1)

- Visitor self-service portal or mobile app.
- Visitor-side rescheduling or cancellation requests.
- Calendar sync with external calendars (may be proposed as a follow-up).
- Gate/pass issuance, badge printing, or physical access control integration.
- SMS channel (Email + WhatsApp only per brief).
- Analytics/BI dashboards beyond operational reporting.

---

## 6. Functional Requirements

Requirement IDs are referenced by acceptance criteria and test cases.

### 6.1 Visitor Data Entry & Smart Lookup

**FR-1.1 Structured intake form**
A dedicated data entry interface that saves directly into the centralized "Visitor's Appointment Register".

Fields (derived from the paper slip plus brief):

| Field | Type | Required | Notes |
|---|---|---|---|
| Visitor Name | Text | Yes | Key identifier for lookup |
| Designation | Text | No | Key identifier |
| Organization | Text | No | Key identifier |
| Address | Multiline text | No | Present on paper slip |
| Mobile Number | Text, validated (10-digit IN mobile, normalized) | Yes | Key identifier; WhatsApp destination |
| Email ID | Email, validated | Yes | Key identifier; Email destination |
| Purpose of Visit / Particulars | Multiline text, spacious input | Yes | |
| Number of persons accompanying + names | Text/structured list | No | Present on paper slip |
| Documents for reference (if any) | Text / optional attachment reference | No | Present on paper slip |
| Remarks | Multiline text | No | Staff-side notes |
| Request date/time | System-generated timestamp | Yes (auto) | Intake timestamp |
| Peshi staff (entered by) | System from session | Yes (auto) | Audit |

Visitors may also supply **Last Visited Date** and **Purpose of Last Visit** on the paper slip; the system should populate these automatically from history when a match is found (see FR-1.3) and allow manual entry only when no history exists.

- Spacious, clearly labeled inputs; inline validation for mobile/email; no data loss on validation errors.
- Duplicate mobile/email warning before save (same visitor already has an open request) without blocking legitimate re-requests.

**FR-1.2 Lookup on key identifier**
Upon entry of any key identifier — Name, Designation, Organization, Mobile No., or Email ID — the system queries existing visitor records with partial/fuzzy matching and debounced search.

- **FR-1.3 Match found → auto-fill + history**
  - The remaining empty fields are populated from the stored visitor profile (latest values win; fields already typed by staff are not overwritten without confirmation).
  - All historical matching entries are displayed directly beneath the form as a table (past request date, purpose, status, assigned slot/decision, decided by).
  - Staff can select a specific historical profile when multiple visitors share a name/organization.
- **FR-1.4 No match → manual entry**
  - All fields remain editable and saving creates a new visitor record.
  - A profile is created (not just a request) so future lookups match.
- **FR-1.5 History persistence**
  - Each saved request is linked to the visitor profile, so history survives edits and additions.

**Acceptance criteria (representative)**

- Entering a mobile number present in the register auto-fills name/email/designation/organization and shows ≥ the matched visitor's previous requests beneath the form.
- Entering an unknown email shows no history, leaves fields empty, and saving creates exactly one new visitor profile.
- Editing an auto-filled field does not silently alter the stored visitor master profile until the request is saved and the change is confirmed.

---

### 6.2 Executive Review & Approval Workflow

**FR-2.1 Pending requests queue**
A dashboard for the Secretary listing all requests in **Pending Approval**, newest-first by default, showing at minimum: visitor name, designation, organization, purpose (truncated with expand), mobile, email, request timestamp, and entering staff. Sortable and filterable.

**FR-2.2 Decision & scheduling controls**
- **Approve** — opens a date + time picker; on confirm, the request moves to **Appointment Approved** with the assigned slot.
- **Reject** — requires/permits a rejection remark; moves the request to **Appointment Rejected**.
- Both actions are available only to the Secretary role.
- Slot picker: date and time, no past dates/times, optional conflict warning when the same slot is already booked.
- Actions are single-click-committable but guarded by a confirmation step (irreversible decision + notification dispatch).

**FR-2.3 Status lifecycle**
Records transition automatically:

| Status | Entered when | Who triggers |
|---|---|---|
| **Pending Approval** | Request saved at peshi | System |
| **Appointment Approved** | Secretary approves and assigns date/time | Secretary |
| **Appointment Rejected** | Secretary rejects | Secretary |
| **Appointment Materialized** | Visit completed / marked as attended | Secretary (or staff, per RBAC decision) |

Lifecycle rules:

- Transitions are forward-only except **reschedule** (Approved → Approved with new slot) and **undo/mark materialized** where permitted; every transition writes an audit entry.
- **Mark as Materialized** is available only on Approved appointments whose slot has arrived/passed; the action records actual "Time In" if captured.
- Rejected and Materialized are terminal.
- Each status has its own list view; the register shows a status column and status filter.

**FR-2.4 Request detail view**
Full request record, visitor profile summary, complete visit history, decision history, and notification delivery status in one screen.

**Acceptance criteria**

- Approving with a valid future slot sets status to Approved and creates exactly one Email and one WhatsApp dispatch attempt.
- Rejecting moves the request to Rejected and sends no booking email/WhatsApp (see open question OQ-3).
- A request cannot be materialized before the assigned slot date.
- Non-Secretary roles receive 403 on decision and scheduling endpoints, and the controls are hidden in the UI.

---

### 6.3 Automated Multi-Channel Notifications

**FR-3.1 Trigger**
Immediately upon the Secretary approving an appointment and assigning a date and time (the single trigger point for both channels).

**FR-3.2 Email channel**
- Send to the visitor's registered Email ID via SMTP/email gateway.
- Message includes: visitor name, purpose, assigned date, assigned time, venue/department, reference/request ID, and any standard instructions (template-managed).
- Supports configurable sender identity and template.

**FR-3.3 WhatsApp channel**
- Send to the visitor's registered Mobile Number via an official WhatsApp Business API provider (pre-approved message template required by Meta).
- Same core content as the email, formatted for WhatsApp.

**FR-3.4 Delivery tracking & resilience**
- Each notification attempt stores: channel, recipient, template, request/approval reference, timestamp, provider message ID, status (queued/sent/delivered/failed), failure reason, retry count.
- Automatic retry with backoff on transient failures; manual resend from the request detail view.
- Delivery status visible to staff and the Secretary on the request.
- Invalid/missing contact data is surfaced at approval time with an option to proceed (Email-only/WhatsApp-only) or correct the visitor record.
- Sending is asynchronous — the approval action must not block on provider latency.

**Acceptance criteria**

- Approval produces two notification records (one per channel) with provider message IDs when successful.
- A forced provider failure marks the attempt Failed with a reason and allows manual resend; approval itself remains successful.
- Missing email blocks Email dispatch with a clear warning but does not block WhatsApp dispatch.

---

### 6.4 Search, Tracking & Reporting

**FR-4.1 Multi-criteria search & filtering**
Search/filter across the entire register by any column header or metadata field, including at minimum:

- Visitor name (partial), designation, organization, mobile number, email ID
- Status (multi-select), request date range, assigned appointment date range
- Entering staff, decision date range
- Free-text search across purpose/remarks (full-text)

Behavior: combinable filters, debounced as-you-type, clear-all, result count, column sorting, pagination.

**FR-4.2 Register views**
- Default register view: all requests with status, request date, assigned slot, and visitor summary.
- Saved status lists: Pending Approval, Appointment Approved, Appointment Rejected, Appointment Materialized.
- Per-visitor history drill-down from any result row.

**FR-4.3 Export & reporting**
- Export current filtered result set to CSV/XLSX (role-gated, audit-logged).
- Operational report: requests by status, by period, decisions per day, notification delivery success rate.
- Printable/PDF appointment confirmation or daily appointment schedule for the Secretary's office (recommended).

**FR-4.4 Rapid traceability**
Any record must be reachable in ≤ 2 filter/search actions from the register; search results must show enough context (status, visit date, purpose) to identify the record without opening it.

---

### 6.5 Audit Logging (functional requirement per brief)

**FR-5.1** Immutable, append-only audit entries for:

- Data creation and updates (visitor profile, request)
- Approval / rejection decisions (who, when, from/to status, slot assigned)
- Reschedule and materialize actions
- Notification dispatch attempts and delivery status changes
- Exports, logins, and user/role administration

**FR-5.2** Each entry stores actor, action, entity, entity ID, timestamp, and before/after values where applicable. Audit log is viewable by the Secretary and Administrator and is not editable or deletable by business roles.

---

## 7. Data Model (initial)

**VisitorProfile**
`id, name, designation, organization, address, mobile (normalized, indexed), email (normalized, indexed), created_at, updated_at, last_visit_date, last_visit_purpose`

**AppointmentRequest**
`id (human-readable reference), visitor_id, purpose, accompanying_persons (names, count), documents_reference, remarks, request_date, entered_by_user_id, status, assigned_date, assigned_time, decided_by_user_id, decision_at, rejection_reason, materialized_at, time_in, created_at, updated_at`

**Notification**
`id, request_id, channel (EMAIL|WHATSAPP), recipient, template_id, provider_message_id, status, attempt_no, error_message, sent_at, delivered_at`

**AuditLog**
`id, actor_user_id, action, entity_type, entity_id, before_json, after_json, timestamp, ip`

**User**
`id, name, role (PESHI_STAFF|SECRETARY|ADMIN), login identifiers, status, last_login`

**Status enum:** `PENDING_APPROVAL, APPROVED, REJECTED, MATERIALIZED`

**Data integrity rules**

- One visitor profile may have many requests; history is derived from requests ordered by `request_date`.
- Approving requires a non-null `assigned_date` and `assigned_time`.
- `MATERIALIZED` requires `assigned_date` in the past/present.
- Notifications reference exactly one request and one approval decision.

---

## 8. Non-Functional Requirements

| Area | Requirement |
|---|---|
| **RBAC** | Server-side enforcement, not UI-only. Secretary-only: approve/reject, schedule/reschedule, materialize. Peshi staff: intake and search. Admin: configuration and users |
| **Audit** | Append-only audit log with actor, action, before/after, timestamp; retained per government record policy |
| **Security** | Authenticated staff access, session expiry, password policy, encrypted transport (HTTPS), least-privilege data access, no PII in logs beyond what is necessary |
| **Privacy** | Mobile and email are PII; access limited to authorized roles; export is audit-logged |
| **Performance** | Search results < 2s for typical register volume; intake lookup < 500ms debounced; approval action returns < 1s (notifications async) |
| **Availability** | Business-hours availability target ≥ 99% (confirm if a formal SLA applies) |
| **Reliability** | Notification retry with backoff; idempotent approval to prevent duplicate dispatches |
| **Scalability** | Designed for department-scale volume (thousands of records; single-digit concurrent staff) with indexes on mobile, email, name, status, assigned_date |
| **Compatibility** | Modern evergreen browsers; responsive layout usable on a desk phone/tablet; printable outputs |
| **Localization** | English UI for v1; date format `DD-MM-YYYY`, 24h or `AM/PM` per office preference; IST timezone |
| **Accessibility** | Keyboard-operable forms and dialogs, labeled inputs, visible focus (recommended) |
| **Integrations** | SMTP/Email gateway and official WhatsApp Business API provider; credentials configurable by Administrator outside code |
| **Data retention/backup** | Daily backup of the register; restore procedure documented |

---

## 9. Key User Flows

**Flow A — New visitor request (peshi)**
Visitor arrives → staff opens intake → types name/mobile → no match → all fields manual → save → status Pending Approval → appears in Secretary queue.

**Flow B — Returning visitor request**
Staff types mobile → match found → remaining fields auto-filled → history shown → staff confirms purpose and documents → save → linked to existing profile → Pending Approval.

**Flow C — Approval and notification**
Secretary opens queue → selects request → reviews history → Approve → picks future date and time → confirm → status Approved → Email + WhatsApp dispatched asynchronously → delivery status recorded → confirmation visible on request.

**Flow D — Rejection**
Secretary selects request → Reject with reason → status Rejected → visitor notified per OQ-3 decision.

**Flow E — Visit completion**
After the slot, Secretary/staff opens the Approved request → Mark Materialized (optionally record Time In) → status Materialized → appears in completed list and reports.

**Flow F — Historical trace**
Staff or Secretary searches by organization + date range → results identify the record → drill into visitor history → full request, decision, and notification trail visible.

---

## 10. Assumptions

1. Peshi staff have department-issued devices and network access at the peshi counter.
2. Visitors are not given system logins; all contact is outbound Email/WhatsApp.
3. The Secretary's account is a single authoritative approver role (delegation via multiple users with the Secretary role is possible).
4. WhatsApp Business API sender number/template will be provisioned by the department.
5. A request can be entered for a visitor without an accompanying-persons list.
6. Existing paper slips are not bulk-migrated in v1 unless separately requested (see OQ-1).

## 11. Open Questions

| ID | Question | Impact |
|---|---|---|
| OQ-1 | Should historical paper slips / legacy registers be digitized and migrated into VAMS? | Data model, effort, launch scope |
| OQ-2 | Should visitors be able to self-register or self-reschedule? | v1 scope, security |
| OQ-3 | On rejection, should the visitor be notified (Email/WhatsApp), and with what wording? | Notification rules and templates |
| OQ-4 | Who is permitted to mark an appointment **Materialized** — Secretary only, or peshi staff too? | RBAC matrix |
| OQ-5 | Is attachment upload required for "Documents for Reference", or is a text note sufficient? | Intake form, storage |
| OQ-6 | Should a formal availability/calendar constraint exist (max appointments per day/slot)? | Scheduling UX and conflict rules |
| OQ-7 | Retention period and archival policy for visitor PII and audit logs? | Storage, compliance |
| OQ-8 | Which WhatsApp Business API provider and SMTP gateway are approved for department use? | Integration and procurement |

## 12. Release Milestones (indicative)

| Milestone | Contents |
|---|---|
| **M1 — Foundation** | Auth, RBAC, visitor profile + intake form, register, audit skeleton |
| **M2 — Lookup & Review** | Smart lookup/auto-fill/history, pending queue, approve/reject + scheduling, status lifecycle |
| **M3 — Notifications** | Email and WhatsApp integration, templates, delivery tracking, retry/resend |
| **M4 — Search & Reporting** | Multi-criteria search, status lists, exports, operational reports |
| **M5 — Hardening** | Audit completeness, performance, security review, UAT with peshi staff and Secretary's office |

## 13. Acceptance Summary (product-level)

VAMS is accepted for release when:

1. A peshi staff member can enter a new and a returning visitor request, with returning data auto-filled and history visible, in under 2 minutes.
2. The Secretary can review a pending request and approve with a date/time, and both Email and WhatsApp confirmations are dispatched and tracked.
3. All four statuses are enforced by automatic transitions and visible in their respective lists.
4. Any register record is retrievable using any documented filter in ≤ 2 actions.
5. Approval controls are provably inaccessible to non-Secretary roles.
6. Every create/update/decision/reschedule/notification event appears in the audit log.
