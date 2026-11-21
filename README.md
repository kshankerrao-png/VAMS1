# VAMS — Visitors Appointment Management System

A working implementation of the T,R&B Department's visitor appointment workflow, built from
[`prd.md`](prd.md), [`tech-stack.md`](tech-stack.md) and [`implementation-plan.md`](implementation-plan.md).

It replaces the paper appointment slip and weekly batch review with a single digital register:
peshi intake with returning-visitor lookup, the Secretary's approve/reject queue with slot assignment,
automatic Email and WhatsApp confirmations with delivery tracking, and an append-only audit trail.

---

## Quick start

**Requirements:** Node.js 24+ (the project uses the built-in `node:sqlite` module). No database or
Docker installation is required for the local profile.

```powershell
npm install
npm run db:reset      # creates storage/vams.db and seeds the demonstration data
npm run build
npm start             # http://localhost:4000
```

For development with hot reload, run two terminals:

```powershell
npm run dev:api       # API on :4000
npm run dev:web       # Vite UI on :5173, proxying /api to :4000
```

Open `http://localhost:5173` in development or `http://localhost:4000` after a build.

### Demonstration accounts

| Role | Username | Password | Sees |
|---|---|---|---|
| Peshi Staff | `peshi` | `Peshi@123456` | Intake, visitors, register |
| Secretary, T,R&B | `secretary` | `Secretary@123` | Queue, decisions, register, reports, audit |
| System Administrator | `admin` | `Admin@123456` | Users, templates, settings, system status |

The accounts are created on first start (`ensureBaseline`). Change these passwords before any real
deployment; the login page's demo panel is presentational only and should be removed for production
use.

---

## What is implemented

### Visitor intake and smart lookup (PRD FR-1.1–1.5)

- Full digital replacement for the paper slip: name, designation, organization, address, mobile,
  email, purpose, accompanying persons, documents reference and remarks.
- Searchable lookup across name, designation, organization, mobile, email and address. Results are
  ranked (exact mobile/email → name → partial matches) and auto-select a profile when the match is
  unambiguous.
- Auto-fill of empty fields, an explicit "linked profile" indicator, profile chooser for ambiguous
  names, and a "start a new record" escape hatch.
- Complete prior-visit history under the form and on the request detail page; profiles are reused on
  later requests by mobile/email even if staff skip the search.
- Non-blocking duplicate warning for an existing open request; mobile numbers are normalized to
  `+91XXXXXXXXXX` and emails lowercased.

### Review, decision and scheduling (FR-2.1–2.4)

- Pending queue, oldest first, with per-request Approve and Reject actions.
- Approve dialog with date/time picker, future-slot validation, live slot-conflict/capacity warnings,
  optimistic UI, server-side idempotency (`Idempotency-Key`) and a single atomic transaction covering
  the decision, notification outbox and audit entry.
- Reject with a recorded reason.
- Reschedule for approved appointments; **Mark Materialized** becomes available after the slot and
  records the visitor's time-in.
- Status lifecycle enforced by an explicit state machine (`PENDING_APPROVAL → APPROVED / REJECTED`,
  `APPROVED → MATERIALIZED`, reschedule keeps approved). Illegal transitions return `409`.

### Multi-channel notifications (FR-3.1–3.4)

- Approval writes **two outbox rows** (Email and WhatsApp) in the same transaction as the decision —
  an approved request can never exist without notification records.
- Background worker processes due notifications with 3 attempts and exponential backoff
  (30 s → 2 min → 10 min), stores provider message ids, rendered content, errors and timestamps.
- Providers:
  - **SMTP** via Nodemailer when `SMTP_HOST` is configured; otherwise a file transport writes `.eml`
    files to `storage/outbox` and records simulated delivery.
  - **WhatsApp Cloud API** when `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_TOKEN` are configured;
    otherwise a simulated transport writes the payload as JSON.
- Delivery webhooks for WhatsApp (`GET` verification + signed `POST` status updates), manual resend,
  skipped-channel reasons, and a demo "simulate delivery" action (disabled in production).
- SMTP acceptance is recorded as **Sent** (SMTP has no delivery receipt); WhatsApp delivery reports
  update the record to **Delivered** through the signed webhook.
- Email/WhatsApp templates are versioned in the database, editable in Administration, and audited on
  every change. Defaults are seeded from `@vams/shared`.

### Search, reporting and audit (FR-4.x, FR-5.x)

- Register with combinable filters: free text, visitor name, designation, organization, mobile,
  email, status, request-date range, appointment-date range, decision-date range and entering staff;
  sortable columns and pagination.
- CSV export of the current filter set, role-gated and recorded in the audit log.
- Dashboard statistics, period summary, day-by-day activity, top organizations, upcoming
  appointments, notification success rate and a printable **daily appointment schedule**.
- Append-only `audit_log` with a SHA-256 hash chain, SQL-level triggers that reject UPDATE/DELETE, a
  chain verification endpoint/UI, and per-request audit timelines.
- RBAC enforced server-side per permission, with the Secretary-only decision/scheduling rights and
  the configurable staff-materialize setting.

### Administration

- User management (create, edit, role, enable/disable, password reset with session revocation).
- Notification template editor with variable insertion, preview and version tracking.
- Scheduling settings (slot capacity, venue, instructions, staff materialize permission).
- Read-only system status (environment, database file, worker, provider configuration, uptime).

---

## Architecture

```
apps/web        React 19 + TypeScript + Vite + Tailwind CSS 4
apps/api        NestJS 11 (TypeScript), REST /api/v1-style routes, OpenAPI-friendly DTOs
packages/shared Zod schemas, roles/permissions, status machine, types, templates
storage/        SQLite database + simulated email/WhatsApp outbox
docs/adr        Architecture decision records
```

Request path: browser → static SPA (served by the API in production) → NestJS → `node:sqlite`.
Approval transaction → outbox rows → in-process worker → SMTP / WhatsApp adapter → delivery state →
audit entries.

- **Auth:** server-side sessions (random token in an `httpOnly`, `SameSite=Lax` cookie, 30-minute idle
  / 8-hour absolute expiry), Argon2id password hashing (`@node-rs/argon2`, scrypt fallback), lockout
  after five failed attempts.
- **Data:** SQLite via Node 24's built-in `node:sqlite` (WAL mode, foreign keys), indexed on mobile,
  email, name, status and appointment date. The data-access layer is centralized in
  `DatabaseService`; see the runtime-profile ADR for the production PostgreSQL path.
- **Audit integrity:** each entry hashes the previous hash, entry id, actor, action, entity,
  before/after snapshots and timestamp. SQLite triggers raise on any update/delete attempt.

### API surface

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password` |
| Visitors | `GET /api/visitors/lookup?q=`, `GET /api/visitors/:id` |
| Requests | `GET/POST /api/requests`, `GET /api/requests/stats`, `GET /api/requests/duplicates`, `GET /api/requests/:id`, `GET /api/requests/:id/slot-check` |
| Decisions | `POST /api/requests/:id/approve`, `/reject`, `/reschedule`, `/materialize` |
| Register | `GET /api/register/export` (CSV) |
| Notifications | `GET /api/notifications?requestId=`, `POST /api/notifications/:id/resend`, `POST /api/notifications/:id/simulate-delivery` |
| Webhooks | `GET/POST /api/webhooks/whatsapp` |
| Reports | `GET /api/reports/summary?from=&to=`, `GET /api/reports/schedule?date=` |
| Audit | `GET /api/audit`, `GET /api/audit/verify` |
| Admin | `GET/POST /api/admin/users`, `PATCH /api/admin/users/:id`, `POST /api/admin/users/:id/reset-password`, `GET/PUT /api/admin/templates`, `GET/PUT /api/admin/settings`, `GET /api/admin/system` |
| Ops | `GET /api/health` |

Errors use `application/problem+json` with a stable `code` and optional field-level `errors`.

---

## Configuration

Copy `.env.example` to `.env` at the repository root (or `apps/api/.env`) and adjust.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | HTTP port |
| `DATABASE_URL` | unset | Postgres/Supabase connection string (Session Pooler, `sslmode=require`); unset = SQLite |
| `DB_PATH` | `storage/vams.db` | SQLite file, relative to the repo root |
| `COOKIE_SECURE` | `false` | Set `true` when serving over HTTPS |
| `WORKER_ENABLED` | `true` | Background notification dispatcher |
| `WORKER_INTERVAL_MS` | `3000` | Poll interval |
| `ALLOW_NOTIFICATION_SIMULATION` | `true` in dev | Enables the demo "simulate delivery" action |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | unset | Real email delivery; unset = file transport |
| `WHATSAPP_API_URL` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_TOKEN` | unset | Real WhatsApp delivery; unset = simulated |
| `WHATSAPP_VERIFY_TOKEN` / `WHATSAPP_APP_SECRET` | unset | Webhook verification and signature checking |
| `WHATSAPP_TEMPLATE_NAME` / `WHATSAPP_TEMPLATE_LANG` | unset | Send via an approved utility template instead of free text |
| `ZAVUDEV_API_KEY` (or `ZAVU_API_KEY`) | unset | Zavu API key; enables WhatsApp via `https://api.zavu.dev/v2` (takes precedence over Twilio and the Cloud API) |
| `ZAVU_API_URL` | `https://api.zavu.dev/v2` | Zavu API base URL |
| `ZAVU_WHATSAPP_FROM` | unset | Optional Zavu WhatsApp sender in E.164; unset = project default sender |
| `ZAVU_TEMPLATE_ID` | unset | Approved Zavu WhatsApp template ID; unset = free-form text (only inside the 24-hour window) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` | unset | Twilio WhatsApp (takes precedence over the Cloud API) |
| `TWILIO_CONTENT_SID` | unset | Pre-approved `HX…` template required on Twilio trial/sandbox accounts |
| `WHATSAPP_DEFAULT_COUNTRY_CODE` | `91` | Country code added to 10-digit mobile numbers |
| `SESSION_IDLE_MINUTES` / `SESSION_ABSOLUTE_HOURS` | `30` / `8` | Session policy |
| `APP_BASE_URL` | `http://localhost:4000` | Public base URL |

**Production notes**

- Set `NODE_ENV=production`, `COOKIE_SECURE=true` behind TLS, and `ALLOW_NOTIFICATION_SIMULATION=false`.
- Health endpoint: `GET /api/health` (public, no sensitive paths).
- Back up the SQLite file (and `-wal`/`-shm`) or migrate to PostgreSQL as described in the ADR.
- WhatsApp/Meta template approval and business-number provisioning are external dependencies; run
  on Email-only until they are ready (the UI shows the channel state).

**Vercel preview deployment**

`vercel.json` builds the web bundle and runs the API as a single Vercel Function (`api/index.js`).
On Vercel the background worker is disabled; approvals and manual resends dispatch due notifications
inline, but automatic retry backoff still needs a long-running process. Without
`DATABASE_URL` the SQLite database and notification outbox live in `/tmp` and reset on every cold
start; set `DATABASE_URL` to the Supabase Session Pooler URI for persistent data. Run `npm start` or
the Docker/PostgreSQL profile when you need the worker and real delivery.

---

## Scripts

| Command | Description |
|---|---|
| `npm install` | Install all workspaces |
| `npm run db:reset` | Delete the local database and reseed demonstration data (stop the server first; Postgres requires `-- --force`) |
| `npm run db:import` | Apply the Postgres schema and copy the local SQLite data into `DATABASE_URL` (`-- --force` replaces existing data) |
| `npm run seed` | Seed demo data only if the register is empty |
| `npm run build` | Build shared package, API and web bundle |
| `npm start` | Run the production build, serving the UI and API on `:4000` |
| `npm run notify:test -w @vams/api -- <email\|whatsapp> <recipient>` | Send one test notification with the configured provider |
| `npm run dev:api` / `npm run dev:web` | Development servers |
| `npm test` | Shared domain tests + API integration tests |
| `npm run typecheck` | Typecheck all workspaces |

**Test status:** 40 automated tests (11 domain + 29 API integration) covering the status machine,
permissions, intake validation, lookup/auto-fill, approval + idempotency, notification dispatch,
rejection/materialize guards, RBAC negative paths, audit immutability and hash-chain verification,
exports, admin operations and reports.

---

## Requirement coverage

| PRD requirement | Where |
|---|---|
| FR-1.1 structured intake | `apps/web/src/pages/IntakePage.tsx`, `requests.service.ts#create` |
| FR-1.2–1.4 lookup, auto-fill, no-match | `visitors.service.ts#lookup`, IntakePage lookup panel |
| FR-1.5 history persistence | visitor history endpoint + detail page |
| FR-2.1 pending queue | `QueuePage.tsx`, `RequestsService.list` |
| FR-2.2 approve/reject + slot | `ApproveDialog`, `RejectDialog`, `RequestsService.approve/reject` |
| FR-2.3 status lifecycle | `packages/shared/src/status.ts`, DB CHECK constraints, service guards |
| FR-2.4 request detail | `RequestDetailPage.tsx` |
| FR-3.1–3.3 automatic Email + WhatsApp | `NotificationService`, adapters, templates |
| FR-3.4 delivery tracking, retries, resend | `notifications` table, worker, webhooks, detail UI |
| FR-4.1–4.4 search, lists, export, traceability | Register page, export endpoint, reports |
| FR-5.1–5.2 audit logging | `AuditService`, immutable table, audit viewer |
| RBAC | `AccessGuard`, `AuthzService`, permission decorators |
| Security / privacy | Argon2id, sessions, origin check, PII-minimized logs, export audit |
| Performance targets | Indexed queries, keyset-style pagination, lightweight payloads |
| Backup / restore | File-based DB backup; documented production path |

---

## Local runtime profile (important)

The repository ships a **self-contained local runtime** so the complete product can be run and
verified without external infrastructure:

| Production target (`tech-stack.md`) | Local implementation here | Why |
|---|---|---|
| PostgreSQL 17 | SQLite (`node:sqlite`) by default; Postgres/Supabase when `DATABASE_URL` is set | SQLite keeps the demo one-command; the same SQL runs on both drivers |
| Redis + BullMQ | Durable outbox table + in-process poller worker | Same retry/backoff/delivery semantics without a broker; single-node deployment |
| MinIO/S3 attachments | Deferred — "documents for reference" is a text field | PRD OQ-5/D-5 is still an open decision |
| Playwright PDF service | Browser print stylesheet for the daily schedule and confirmation | No headless browser dependency |
| SMTP + WhatsApp providers | Real adapters when configured, file/simulated transports otherwise | End-to-end demo without credentials; production behavior unchanged |

Set `DATABASE_URL` to a Supabase Session Pooler URI to use Postgres; the schema is created on first
connection, and `npm run db:import` copies the existing SQLite rows into it.

The repository code is organized so these are infrastructure swaps, not product rewrites. See
[`docs/adr/0001-runtime-profile.md`](docs/adr/0001-runtime-profile.md).

---

## Known limitations / next steps

- **Attachments:** not implemented (blocked on PRD OQ-5). The MinIO/S3 adapter point is documented.
- **Rejection and reschedule notifications:** intentionally not sent; PRD OQ-3 and the plan scope
  decision. The UI states this explicitly.
- **Legacy paper migration:** not included (PRD OQ-1).
- **PostgreSQL/Redis migration:** schema and queue abstractions are centralized, but a production
  migration would add Postgres migrations, a Redis-backed queue and integration test parity.
- **PDF:** generated via the browser print dialog rather than a server-side rendering service.
- **CSP:** Helmet is enabled with CSP disabled to keep the Vite bundle simple; a nonce-based CSP
  should be added for production.
- **Rate limiting:** login lockout is implemented in-process; production deployments behind multiple
  instances should move this to Redis.
