# Implementation Plan

## Visitors Appointment Management System (VAMS)

**Client:** Transport, Roads & Buildings (T,R&B) Department
**Inputs:** `prd.md` v1.0 (product requirements), `tech-stack.md` v1.0 (architecture & stack)
**Document type:** Delivery plan — schedule, work breakdown, gates, rollout
**Status:** Draft v1.0 — pending decision sign-off (D-1…D-10 in `tech-stack.md` §14)
**Plan baseline:** 23 November 2026
**Indicative go-live:** 2 April 2027, with 2-week hypercare

---

## 1. Purpose

This plan converts the product requirements (`prd.md`) and the architecture decisions (`tech-stack.md`) into an executable delivery schedule: what gets built in what order, by whom, with what acceptance gates, and how the system is cut over and supported.

It assumes the recommended stack in `tech-stack.md` §2 and the milestone structure in `prd.md` §12 / `tech-stack.md` §15. If decision **D-1** (platform standard) changes the stack, the phase sequencing below still holds; the task-level estimates in M1–M3 would be re-baselined.

---

## 2. Delivery Approach

| Aspect | Approach |
|---|---|
| **Method** | 2-week sprints, sprint review/demo with the department at the end of each sprint, milestone exit reviews at phase boundaries |
| **Architecture** | Modular monolith + worker, built phase-by-phase along `tech-stack.md` §3 module boundaries — no big-bang integration |
| **Vertical slices** | Each sprint delivers a demoable, deployed slice to staging (never a layer-only sprint) |
| **Environments** | Local → Staging from Sprint 1 → UAT from Sprint 5 → Production at go-live (§13) |
| **Releases to staging** | Every merge to `main` (automated), so the department can see progress continuously |
| **Scope control** | PRD open questions (OQ-1…OQ-8) are answered in Sprint 0; anything unresolved is explicitly deferred, not silently absorbed |
| **Parallel track** | WhatsApp BSP/number/template procurement and egress approval run from Sprint 0 — they are external critical-path items, not M3 work |
| **Risk posture** | Fail fast on the two genuinely uncertain integrations (WhatsApp delivery webhooks, provider failure handling) by exercising them in Sprint 5–6 with sandbox credentials |

**Working agreements**

- `main` is always deployable to staging; feature branches + PR review by the Solution Reviewer.
- No PR merges unless CI gates (§12) pass.
- Every requirement is traceable to a task ID and at least one automated test (§15).
- Decisions that change architecture are recorded as short ADRs in `docs/adr/`.

---

## 3. Team, Capacity & Responsibilities

| Role | Allocation | Responsibility |
|---|---|---|
| **Product Owner (dept.)** | ~2 h/week | Scope priority, open-question decisions, UAT sign-off |
| **Full-stack Developer** | 5 days/week (1 FTE) | All implementation, CI, deployment automation, technical documentation |
| **Solution Reviewer / Architect** | 1 day/week (0.2 FTE) | PR review, schema/RBAC/security review, milestone gate sign-off |
| **QA Engineer** | 0.5 FTE from Sprint 5; 1 FTE in Sprint 9 | Test plans, E2E automation pairing, UAT scripts, defect triage |
| **Domain SME (Peshi supervisor)** | ~2 h/week (more in Sprint 0 and 9) | Form field validation, workflow realism, UAT participation |
| **Secretary's office representative** | ~2 h/week from Sprint 4 | Queue UX, decision flow, UAT acceptance |
| **IT Ops / Procurement** | As needed | VMs, network egress, TLS, SMTP relay, WhatsApp BSP contract, backups |

**RACI (condensed)**

| Activity | PO | Dev | Reviewer | QA | SME | IT Ops |
|---|---|---|---|---|---|---|
| Open-question decisions | A | C | C | I | R | I |
| Schema & RBAC design | I | R | A | C | C | I |
| Implementation | I | R/A | C | C | I | I |
| Security & milestone gates | I | C | A/R | C | I | C |
| UAT | A | C | I | R | R | I |
| Go-live / cutover | A | R | C | C | C | R |
| Hypercare | I | R | C | R | C | C |

*R = responsible, A = accountable, C = consulted, I = informed.*

**Capacity note:** at 1 FTE developer, the schedule has ~15% embedded contingency (buffer inside M2, M4 and M5) plus a holiday allowance in Sprint 2. Two parallel developers would compress M1–M4 by roughly 5 weeks, but is not assumed here.

---

## 4. Timeline at a Glance

| Phase | Milestone | Sprints | Dates (indicative) | Duration |
|---|---|---|---|---|
| **P0** | Decisions & setup | Sprint 0 | Mon 23 – Fri 27 Nov 2026 | 1 week |
| **P1** | M1 — Foundation | S1–S2 | Mon 30 Nov – Thu 24 Dec 2026 | 4 weeks |
| **P2** | M2 — Lookup & Review | S3–S4 | Mon 28 Dec 2026 – Fri 22 Jan 2027 | 4 weeks |
| **P3** | M3 — Notifications | S5–S6 | Mon 25 Jan – Fri 19 Feb 2027 | 4 weeks |
| **P4** | M4 — Search & Reporting | S7–S8 | Mon 22 Feb – Fri 19 Mar 2027 | 4 weeks |
| **P5** | M5 — Hardening, UAT, Go-live | S9 + hypercare | Mon 22 Mar – Fri 2 Apr 2027; hypercare 5–16 Apr | 2 weeks + 2 |
| **Total** | | 0 + 9 sprints | | **19 weeks to go-live** |

Calendar assumptions: IST working days, department holidays excluded in practice — Sprint 2 ends 24 Dec and the 28 Dec sprint start absorbs the year-end slowdown. Any slip to **D-4 (WhatsApp procurement)** beyond 19 Feb moves go-live 1:1 unless WhatsApp launches behind a flag and Email-only goes live first (fallback documented in §9).

---

## 5. Phase 0 — Decisions & Setup (Sprint 0, 23–27 Nov 2026)

**Objective:** remove every external blocker that could stall M1–M3, and stand up the delivery skeleton.

| ID | Task | Est. | Depends on | Output |
|---|---|---|---|---|
| P0-01 | Resolve `tech-stack.md` §14 decisions D-1…D-10 with PO; record outcomes in ADR-0001 | 1 | — | Signed decision log |
| P0-02 | Initiate WhatsApp BSP selection, business number, Meta template drafting; initiate SMTP relay request | 1 | PO | Procurement tickets open |
| P0-03 | Confirm hosting, VM sizing, network egress to SMTP/BSP (D-3) | 1 | IT Ops | Approved network diagram |
| P0-04 | Confirm identity approach (D-2) and user list for peshi/Secretary/Admin | 0.5 | PO | User provisioning list |
| P0-05 | Monorepo scaffold (`apps/api`, `apps/web`, `packages/shared`, `infra/`), lint/typecheck/test config | 1 | D-1 | CI green on empty apps |
| P0-06 | Docker Compose dev stack (Postgres, Redis, MinIO, API, web, worker) | 1 | P0-05 | `docker compose up` works |
| P0-07 | Domain review of intake fields against the paper slip (address, accompanying persons, documents, time-in, remarks) | 0.5 | SME | Field list signed off |

**Exit criteria:** D-1, D-2, D-3, D-5, D-6 recorded; repo builds in CI; local stack runs; procurement tickets exist with owners and target dates.

---

## 6. Phase 1 — M1 Foundation (Sprints 1–2)

**Objective:** authenticated, audited skeleton with the digital intake form and register — usable end-to-end on staging with no lookup or notifications yet.

### Sprint 1 (30 Nov – 11 Dec): data, identity, audit

| ID | Task | Est. | Depends on | Acceptance |
|---|---|---|---|---|
| T1-01 | Prisma schema: `VisitorProfile`, `AppointmentRequest`, `Notification`, `AuditLog`, `User`; enums; UUIDv7 + human reference generator | 2 | P0-06 | Migration applies cleanly forward/backward |
| T1-02 | Indexes: mobile/email unique-lookup, name trigram, status, request/assigned dates | 1 | T1-01 | `EXPLAIN` shows index use on lookup/status queries |
| T1-03 | Auth: login, Argon2id, Redis session, httpOnly cookie, idle/absolute timeout, lockout | 3 | T1-01 | Login/logout/timeout tests pass |
| T1-04 | RBAC: permission matrix + global guard + service-level checks for all 7 permissions | 2 | T1-03 | Non-Secretary gets 403 on decide/schedule endpoints |
| T1-05 | Audit module: interceptor, append-only table with `BEFORE UPDATE/DELETE` trigger, SHA-256 hash chain | 2 | T1-01 | Manual UPDATE/DELETE on audit row rejected; chain verifies in test |
| T1-06 | API scaffold: versioned `/api/v1`, problem+json errors, request-ID propagation, OpenAPI generation | 1 | P0-05 | Spec published to artifact |
| T1-07 | Shared Zod schemas for visitor/request fields (mobile/email normalization, required rules) | 1 | T1-01 | Used by API DTOs; unit tests on edge formats |
| T1-08 | Staging deployment pipeline (images, Trivy scan, migrations job, health endpoints) | 3 | P0-06 | One-click deploy + rollback drill |
| T1-09 | CI gates: lint, typecheck, unit, integration (Testcontainers), OpenAPI diff | 1 | P0-05 | PR blocked on failure |

*Sprint 1 effort: 16 dev-days (capacity 10).* **Sequencing note:** T1-08 (pipeline) and T1-01/03 are the only hard Sprint 1 commitments; T1-02/04/05/06/07 split across S1–S2 as capacity allows. The phase, not the sprint, is the commitment.

### Sprint 2 (14–24 Dec): intake form + register

| ID | Task | Est. | Depends on | Acceptance |
|---|---|---|---|---|
| T2-01 | Intake screen: all slip fields, spacious layout, inline validation, no data loss on error | 3 | T1-07 | PRD FR-1.1 checklist; keyboard-only completion |
| T2-02 | Create-visitor + create-request endpoints (transactional) with duplicate mobile/email warning (non-blocking) | 2 | T1-01, T2-01 | Duplicate warning shown; both records saved on confirm |
| T2-03 | Register list: default columns, status badge, sorting, pagination (keyset) | 2 | T2-02 | FR-4.2 default view |
| T2-04 | Request detail read view (profile summary, no decision controls yet) | 1 | T2-02 | Deep link by reference ID |
| T2-05 | Peshi-staff dashboard: my recent entries + status visibility | 1 | T2-03 | FR §4 staff access |
| T2-06 | User admin: create/deactivate users, assign roles, force password reset | 2 | T1-04 | Audit entry per admin action |
| T2-07 | Seed/dev fixtures (anonymized) + staging data refresh script | 1 | T1-01 | Repeatable staging reset |

**M1 exit review (24 Dec 2026) — Gate 1:**
- A peshi user can log in, enter a request, and see it in the register on staging.
- Secretary login can read but cannot yet decide (controls absent) — RBAC proven.
- Create/update events appear in the audit log; audit rows are immutable.
- CI gates green; staging deploy + rollback demonstrated.
- **Sign-off:** Solution Reviewer + PO.

---

## 7. Phase 2 — M2 Lookup & Review (Sprints 3–4)

**Objective:** make returning visitors effortless and give the Secretary the full decide/schedule workflow with the four-status lifecycle.

### Sprint 3 (28 Dec 2026 – 8 Jan 2027): smart lookup

| ID | Task | Est. | Depends on | Acceptance |
|---|---|---|---|---|
| T3-01 | Lookup service: ranked multi-field search (name/designation/organization/mobile/email) using trigram + normalized identifiers; debounce/abort contract | 3 | T1-02 | p95 < 500ms on 50k-row fixture |
| T3-02 | Auto-fill: populate empty fields from best match; never overwrite typed values without confirmation; multi-profile chooser on ties | 3 | T3-01 | FR-1.3 acceptance criteria pass |
| T3-03 | History panel beneath form: all matching requests with date, purpose, status, slot, decision | 2 | T3-01 | FR-1.3 history columns match PRD |
| T3-04 | Manual-entry path: no match leaves form untouched; save creates exactly one profile | 1 | T3-02 | FR-1.4 test |
| T3-05 | Last-visited date/purpose auto-population from history | 1 | T3-03 | Matches paper-slip fields |
| T3-06 | Lookup abuse protection + rate limit + audit of lookups (IDs only, no PII in logs) | 1 | T3-01 | Load/security test |

### Sprint 4 (11–22 Jan 2027): decisions & scheduling

| ID | Task | Est. | Depends on | Acceptance |
|---|---|---|---|---|
| T4-01 | Status state machine (`PENDING_APPROVAL → APPROVED/REJECTED`, `APPROVED → MATERIALIZED`, reschedule) with 409 on illegal transitions | 3 | T3-03 | Unit matrix covers every transition |
| T4-02 | Secretary pending queue: newest-first, sortable/filterable, expandable purpose | 2 | T3-03 | FR-2.1 |
| T4-03 | Approve flow: date+time picker, no past slots, optional same-slot conflict warning, idempotency key, optimistic locking | 3 | T4-01 | Double-submit creates one decision; 409 on stale version |
| T4-04 | Reject flow with optional reason + confirmation dialog | 1 | T4-01 | Status + audit + reason stored |
| T4-05 | Request detail with decision controls, history, notification placeholder area | 2 | T4-03 | FR-2.4 |
| T4-06 | Status lists: Pending / Approved / Rejected / Materialized tabs | 2 | T4-01 | FR-2.3 |
| T4-07 | Mark Materialized (permission-gated by D-6), future-slot guard, optional Time In | 1 | T4-01 | Cannot materialize before slot date |
| T4-08 | E2E + RBAC negative suite (peshi blocked from decisions/scheduling in API and UI) | 2 | T4-05 | CI E2E green |
| T4-09 | Secretary's-office demo & UX feedback round | 1 | T4-05 | Feedback triaged into S5 backlog |

**M2 exit review (22 Jan 2027) — Gate 2:**
- PRD FR-1.1–1.5 and FR-2.1–2.4 acceptance criteria pass as automated tests.
- Approve/reject/schedule/materialize all produce the correct status and audit entries.
- No notification side effects exist yet — outbox is empty (proves decision and dispatch are decoupled).
- **Sign-off:** Reviewer, PO, Secretary's office representative.

---

## 8. Phase 3 — M3 Notifications (Sprints 5–6)

**Objective:** Email and WhatsApp confirmations with tracked delivery, retries, and manual resend — the highest-external-risk phase.

### Sprint 5 (25 Jan – 5 Feb 2027): outbox, email, tracking

| ID | Task | Est. | Depends on | Acceptance |
|---|---|---|---|---|
| T5-01 | Notification + outbox schema finalization and atomic approval write (decision + 2 outbox rows) | 2 | T4-03 | No approval commits without outbox rows |
| T5-02 | BullMQ worker + channel adapter interface (`EMAIL`, `WHATSAPP`), attempt records, exponential backoff | 3 | T5-01 | Transient failure retried 3×; permanent failure surfaced |
| T5-03 | Email adapter (Nodemailer/SMTP relay) + sender identity + STARTTLS | 2 | T5-02 | Sandbox email received |
| T5-04 | Template management: versioned DB templates with variables, admin edit, audit on change | 2 | T5-02 | Rendered output snapshot-tested |
| T5-05 | Approval dialog contact validation: missing/invalid email or mobile → explicit Email-only/WhatsApp-only warning path | 1 | T5-03 | PRD FR-3.4 partial-channel rule |
| T5-06 | Notification status on request detail (per channel, timestamps, provider ID, reason) | 1 | T5-02 | Staff + Secretary can see delivery state |
| T5-07 | BSP sandbox integration spike: outbound message + webhook signature verification | 3 | P0-02 | Sandbox WhatsApp message delivered and receipt recorded |

### Sprint 6 (8–19 Feb 2027): WhatsApp, resilience, alerts

| ID | Task | Est. | Depends on | Acceptance |
|---|---|---|---|---|
| T6-01 | WhatsApp adapter against approved BSP/template; failure mapping (invalid number, template rejection, rate limit) | 2 | T5-07 | Each failure code has a user-visible reason |
| T6-02 | Delivery webhooks for both channels; unmatched/late receipts logged, not dropped | 2 | T6-01 | Delivered/failed transitions update attempt rows |
| T6-03 | Manual resend + audit entry; duplicate-send protection | 2 | T6-02 | Resend does not duplicate provider dispatch on retry |
| T6-04 | Metrics/alerts: queue depth, success/failure by channel, backlog alert to ops | 1 | T6-02 | Grafana panel + alert rule |
| T6-05 | 2-week simulated soak (sandbox): ≥ 50 approvals, ≥ 98% delivery, failure injection | 3 | T6-03 | Soak report attached to gate |
| T6-06 | Provider credential/secrets handling review (Docker secrets, no secrets in images) | 1 | T6-01 | Review sign-off |
| T6-07 | Notification runbook (retry, resend, BSP outage, template change) | 1 | T6-04 | Ops can execute unaided |

**M3 exit review (19 Feb 2027) — Gate 3:**
- Every approval produces exactly two tracked attempts; Email reaches sandbox inbox, WhatsApp reaches a test handset.
- Failure injection: approval still succeeds; failed channel is retryable and visible.
- Delivery success ≥ 98% over the soak; alerting verified.
- **Hard dependency check:** if D-4 is not complete by 19 Feb, invoke the Email-only fallback (§9) and re-baseline WhatsApp to a post-go-live release.

---

## 9. Fallback: WhatsApp-Delayed Launch

If BSP procurement, number verification, or Meta template approval is late:

1. Ship Email notifications at M3 with the WhatsApp adapter present but feature-flagged off.
2. UI shows "WhatsApp: not configured" rather than a silent failure; audit records the skip reason.
3. Peshi staff use the printed/PDF confirmation as the interim second channel.
4. WhatsApp activates post-go-live as a configuration + template change, with a 3-day sandbox soak — no code release required.
5. Go-live proceeds on the original date; PRD success metric for WhatsApp delivery moves to "after activation".

This is the only scope fallback pre-approved by this plan; all others require change control (§18).

---

## 10. Phase 4 — M4 Search & Reporting (Sprints 7–8)

**Objective:** register-wide traceability and the day-to-day paperwork the Secretary's office still needs.

### Sprint 7 (22 Feb – 5 Mar 2027)

| ID | Task | Est. | Depends on | Acceptance |
|---|---|---|---|---|
| T7-01 | Query layer: combinable filters (name, designation, organization, mobile, email, status multi-select, request-date range, assigned-date range, staff, decision-date range) + full-text over purpose/remarks | 3 | T3-01 | All FR-4.1 filters combinable with correct counts |
| T7-02 | Search UI: column-header filters, debounced as-you-type, clear-all, sort, pagination, result count | 2 | T7-01 | ≤ 2 actions to any record from register (FR-4.4) |
| T7-03 | Per-visitor drill-down from any result row | 1 | T7-02 | History + decisions + notification trail in one view |
| T7-04 | XLSX/CSV export of current filtered set, role-gated, audit-logged, streamed | 2 | T7-01 | Export audit entry for every file |
| T7-05 | Saved status list views finalized (Pending/Approved/Rejected/Materialized) with filters persisted in URL | 1 | T4-06 | Shareable filter URLs |
| T7-06 | Performance fixture: 100k requests + k6 search scenario | 2 | T7-01 | p95 < 2s recorded |

### Sprint 8 (8–19 Mar 2027)

| ID | Task | Est. | Depends on | Acceptance |
|---|---|---|---|---|
| T8-01 | PDF: daily appointment schedule for Secretary's office (headless Chromium) | 2 | T7-02 | Office reviews print layout |
| T8-02 | PDF: appointment confirmation document (optional attachment to email) | 1 | T8-01 | Matches approved template |
| T8-03 | Operational report: requests by status/period, decisions per day, notification success rate | 2 | T6-04 | Values reconcile with register counts |
| T8-04 | Audit log viewer: filters (actor, action, entity, date), read-only, chain-verification indicator | 2 | T1-05 | No edit/delete paths in API |
| T8-05 | Privacy review: PII in logs/exports check, column-encryption verification, access review | 2 | T8-04 | Review checklist signed |
| T8-06 | Load test at 100k rows; index tuning; keyset pagination checks | 2 | T7-06 | Search p95 < 2s, lookup p95 < 500ms on staging |

**M4 exit review (19 Mar 2027) — Gate 4:** FR-4.1–4.4 pass; export + audit viewer demonstrated; performance targets met on a 100k-row staging copy.

---

## 11. Phase 5 — M5 Hardening, UAT & Go-Live (Sprint 9, 22 Mar – 2 Apr 2027)

| ID | Task | Est./Window | Acceptance |
|---|---|---|---|
| T9-01 | Security pass: ASVS L2 checklist, DAST, dependency/image scan triage; fix all high/critical | 4 | Zero high/critical open |
| T9-02 | Backup + restore drill (pgBackRest PITR into staging, MinIO restore, audit chain verify) | 1 | Restore verified with row counts |
| T9-03 | UAT with peshi staff + Secretary's office using PRD §13 acceptance script | 5 (parallel) | Signed UAT sheet, defects triaged |
| T9-04 | Training: peshi (2 h), Secretary's office (1 h), admin (1 h); 1-page quick reference; SOP | 2 | Attendance + materials delivered |
| T9-05 | Runbook finalization: deploy/rollback, backup, provider outage, incident contacts | 1 | Ops walkthrough completed |
| T9-06 | Data/production readiness: prod users, prod secrets, TLS, SMTP/BSP prod credentials, retention config | 1 | Go-live checklist complete |
| T9-07 | Defect burn-down window | 2 | No Sev-1/Sev-2 open at cutover |
| T9-08 | Cutover: freeze → final backup → migrations → smoke test → parallel paper run (1 week) → full switch | 2 | Cutover checklist signed |

**Go-live sequence**

1. **Mon 29 Mar:** production deployment, smoke test, parallel operation — peshi enters requests in VAMS *and* keeps paper for one week; Secretary uses VAMS.
2. **Thu 1 Apr:** parallel-run review; confirm no blocker.
3. **Fri 2 Apr 2027:** paper intake retired; VAMS is the system of record.
4. **5–16 Apr:** hypercare (§14).

**Gate 5 (go-live):** PRD §13 acceptance summary passes, UAT signed, no open Sev-1/Sev-2, restore drill evidence, training complete, go/no-go by PO + Reviewer + IT Ops.

---

## 12. Quality Gates & CI

| Gate | Applied to | Criteria |
|---|---|---|
| PR gate | Every change | Lint, typecheck, unit, API integration (Testcontainers), OpenAPI diff, build, image scan |
| Sprint gate | End of every sprint | Demoed on staging, acceptance tests green, no P1 defects, audit assertions pass |
| Milestone gate | M1–M5 | Phase exit criteria (§6–§11) + Reviewer sign-off + PO acceptance |
| Release gate | Staging/production | Migration backward-compat check, rollback rehearsed, secrets/config verified |
| Security gate | M5 | ASVS L2 checklist, DAST, no high/critical dependencies |

**Definition of Ready (per task):** requirement ID, acceptance criteria, field/API contract agreed, dependencies identified.

**Definition of Done (per task):** code reviewed, tests written and green, audit/telemetry emitted where applicable, OpenAPI updated, deployed to staging, acceptance criteria demonstrated.

**Traceability rule:** every FR-1.1…FR-5.2 and every PRD NFR has at least one automated test or an explicit manual UAT step, recorded in the traceability matrix (§15).

---

## 13. Environments & Release Management

| Environment | Available from | Purpose | Data |
|---|---|---|---|
| Local (Docker Compose) | Sprint 0 | Development | Fixtures |
| Staging | Sprint 1 | Continuous demo, integration, load tests | Anonymized fixtures |
| UAT | Sprint 5 (email), Sprint 6 (WhatsApp sandbox) | Department acceptance | Anonymized copy; sandbox providers only |
| Production | 29 Mar 2027 | Live | Real data |

- Staging auto-deploys from `main`; UAT and production deploy from tagged releases.
- Production access limited to named ops/dev accounts; every admin action audited.
- Migrations: expand-and-contract only; no destructive migration after go-live without a documented backout.
- Rollback: previous image digest + reversible migration path rehearsed at Gate 1 and again at cutover.
- Config/secrets: environment-specific, never in images; `.env.example` kept current.

---

## 14. Hypercare & Support (5–16 April 2027)

| Item | Commitment |
|---|---|
| Triage | Daily 30-min stand-up with peshi + Secretary's office during Weeks 1–2 |
| Coverage | Developer on call during business hours; escalation contact for IT Ops |
| Monitoring review | Daily check of delivery success, queue depth, error rate, search latency |
| Defect policy | Sev-1 (no intake/decisions) fix same day; Sev-2 next business day; Sev-3 backlogged |
| Hypercare exit criteria | No Sev-1 for 5 consecutive working days, delivery success ≥ 98%, queue backlog zero at day end, peshi using VAMS without paper |
| Handover | Runbook, SOP, architecture/ADRs, credentials custody, backup schedule, open-defect list |
| Warranty | 30 days post-hypercare for defect fixes (recommended; confirm with PO) |

---

## 15. Requirements Traceability (Summary)

| PRD requirement | Phase / tasks | Verification |
|---|---|---|
| FR-1.1 intake form | T1-07, T2-01, T2-02 | E2E + field checklist |
| FR-1.2–1.4 lookup, auto-fill, no-match | T3-01…T3-04 | E2E, lookup perf test |
| FR-1.5 history persistence | T3-03, T3-05, T7-03 | Integration test |
| FR-2.1 pending queue | T4-02 | E2E |
| FR-2.2 approve/reject + slot | T4-03, T4-04 | Integration + E2E |
| FR-2.3 status lifecycle | T4-01, T4-06, T4-07 | State-machine unit matrix |
| FR-2.4 detail view | T4-05 | E2E |
| FR-3.1–3.3 trigger + Email + WhatsApp | T5-01…T5-07, T6-01 | Sandbox delivery evidence |
| FR-3.4 delivery tracking, retry, resend | T5-02, T5-06, T6-02, T6-03 | Failure-injection soak |
| FR-4.1–4.4 search, lists, export, traceability | T7-01…T7-05, T8-01, T8-03 | k6 + E2E + export audit |
| FR-5.1–5.2 audit logging | T1-05, T8-04 | Immutability test + review |
| RBAC NFR | T1-04, T4-08 | Negative API/UI tests |
| Security/privacy NFR | T1-03, T8-05, T9-01 | ASVS + DAST |
| Performance NFR | T3-01, T7-06, T8-06 | k6 thresholds |
| Backup/restore NFR | T9-02 | Restore drill |
| Integrations NFR | T5-03, T5-07, T6-01, T6-07 | Sandbox soak + runbook |

---

## 16. Effort Summary

| Phase | Build effort (dev-days) | Calendar |
|---|---|---|
| P0 Setup | 5 | 1 week |
| M1 Foundation | 20 | 4 weeks |
| M2 Lookup & Review | 17 (+3 buffer) | 4 weeks |
| M3 Notifications | 18 (+2 buffer) | 4 weeks |
| M4 Search & Reporting | 16 (+4 buffer) | 4 weeks |
| M5 Hardening & UAT | 16 (+4 buffer) | 2 weeks |
| **Total build** | **~92 dev-days** | **19 weeks** |

Excludes QA (≈ 25 days, partly parallel), reviewer time (≈ 19 days), SME/Secretary participation, and procurement lead time. At 2 FTE developers, M1–M4 compress by ~5 weeks; M5 and external dependencies do not compress.

---

## 17. Critical Path & Dependencies

**Critical path**

`D-1 platform decision` → `T1-01 schema` → `T3-01 lookup` → `T4-01 state machine` → `T5-01 outbox` → `T6-02 webhooks` → `T7-01 query layer` → `T9-03 UAT` → `T9-08 cutover`.

**External dependencies (must be tracked weekly)**

| Dependency | Owner | Needed by | Consequence if late |
|---|---|---|---|
| D-1 platform standard confirmed | PO / department IT | 27 Nov 2026 | M1 re-baseline |
| D-3 network egress to SMTP/BSP | IT Ops | 5 Feb 2027 | M3 WhatsApp blocked |
| D-4 BSP contract, number, template approval | Procurement | 19 Feb 2027 | Email-only fallback (§9) |
| Production VMs, TLS, SMTP credentials | IT Ops | 15 Mar 2027 | Cutover slips |
| UAT participants (peshi + Secretary's office) | PO | 22 Mar 2027 | Gate 5 slips |
| D-5…D-10 answers | PO | 27 Nov 2026 | Scope churn, rework |

**Weekly governance:** 30-min status (progress vs plan, blockers, decisions needed), dependency tracker reviewed, risks re-scored. Monthly milestone confidence report to the department.

---

## 18. Change Control

1. Change request states the requirement delta, reason, and PRD/NFR impact.
2. Developer + Reviewer estimate effort and schedule effect within 2 working days.
3. PO decides: accept (re-baseline milestone), defer (backlog), or reject.
4. Accepted changes update `prd.md`, this plan's traceability table, and the sprint backlog; audit of scope changes is kept in the decision log.

Change is expected in exactly two places: PRD OQ-1 (legacy slip migration) and OQ-2 (visitor self-service). Neither is planned in v1; both would be a new phase, not a sprint insert.

---

## 19. Risk Register (delivery-specific)

| ID | Risk | Likelihood | Impact | Mitigation / trigger | Owner |
|---|---|---|---|---|---|
| R1 | WhatsApp procurement/template approval late | Med | High | Start Sprint 0; Email-only fallback (§9); weekly tracker | PO / Procurement |
| R2 | Platform decision (D-1) delayed or reversed | Low | High | Decisions due Sprint 0; contracts (OpenAPI/Zod) isolate UI from API | Reviewer |
| R3 | Secretary's office availability for feedback/UAT | Med | Med | Book recurring 2 h/week from Sprint 4; async review fallback | PO |
| R4 | Year-end/holiday slippage in Sprint 2 | High | Low | Sprint 2 ends 24 Dec; buffer absorbed in M2 | Dev |
| R5 | Lookup quality poor with Indian names/abbreviations | Med | Med | Trigram tuning + SME test set in Sprint 3; manual profile picker | Dev / SME |
| R6 | Delivery webhook edge cases (late/duplicate/unsigned) | Med | High | Sprint 5 spike, failure-injection soak, runbook | Dev |
| R7 | PII leakage in logs/exports found late | Low | High | Privacy review in M4 (T8-05), ASVS in M5, log allowlist from M1 | Reviewer |
| R8 | Single-developer bus factor | Med | High | PR review every change, ADRs, runbook, CI-enforced standards | Reviewer |
| R9 | UAT defect volume exceeds buffer | Med | Med | Reserve T9-07; triage by severity; defer Sev-3 | PO / QA |
| R10 | Egress/network restrictions discovered at M3 | Low | High | Confirm D-3 in Sprint 0; test early SPIKE T5-07 | IT Ops |

---

## 20. Deliverables Checklist (by handover)

- [ ] Source monorepo with CI configuration and passing pipeline
- [ ] `docs/adr/` decision records (platform, identity, notifications, hosting)
- [ ] OpenAPI 3.1 specification + generated client
- [ ] Database migrations + seed/refresh scripts
- [ ] Deployment artifacts: Dockerfiles, Compose files, environment templates
- [ ] Test suites: unit, integration, E2E, load scripts, failure-injection evidence
- [ ] Security evidence: ASVS checklist, DAST report, dependency scan triage
- [ ] Backup/restore drill report
- [ ] UAT plan, scripts, signed acceptance sheet
- [ ] Training materials, 1-page quick reference, SOP
- [ ] Operations runbook (deploy, rollback, backup, provider outage, escalation)
- [ ] Hypercare log + handover sign-off
