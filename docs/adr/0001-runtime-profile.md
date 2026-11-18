# ADR-0001: Self-contained local runtime profile

**Status:** Accepted for this implementation
**Date:** 18 November 2026
**Supersedes:** none

## Context

`tech-stack.md` specifies PostgreSQL 17, Redis/BullMQ and MinIO/S3, deployed with Docker Compose.
The delivery environment for this build has Node.js 24 available but no Docker, PostgreSQL server,
Redis, or object storage, and the goal is a runnable, testable application rather than a deployment
skeleton.

The product requirements (approval workflow, durable notification dispatch, audit trail, search)
must be fully demonstrable, including the failure and retry paths.

## Decision

Ship the application with a self-contained runtime profile:

1. **Database:** SQLite through Node 24's built-in `node:sqlite` (`DatabaseSync`, WAL mode, foreign
   keys). Schema DDL lives in `apps/api/src/db/schema.ts`; all SQL is centralized in services through
   `DatabaseService`.
2. **Notification queue:** a transactional outbox table plus an in-process poller
   (`NotificationWorker`) with the specified 3-attempt exponential backoff, delivery records and audit
   entries. The outbox is written in the same transaction as the approval decision.
3. **Object storage:** not used. "Documents for reference" is a text field because PRD OQ-5/D-5 is
   unresolved.
4. **Document generation:** printable HTML/CSS views (daily schedule, confirmation) instead of a
   headless-browser PDF service.
5. **Providers:** real Nodemailer/WhatsApp Cloud API adapters when credentials are present; otherwise
   file-writing simulated transports that mark delivery immediately, so the workflow and tests are
   deterministic.

## Consequences

**Positive**

- `npm install && npm run db:reset && npm run build && npm start` yields a fully working system on a
  single machine with no external services.
- The outbox + worker design preserves the important reliability property: an approval and its
  notifications commit atomically, and failures are retried and observable.
- Integration tests run against a real (SQLite) database and real HTTP stack in ~2.5 seconds.
- The notification adapters are provider-neutral; switching to SMTP/WhatsApp requires configuration
  only.

**Negative / accepted trade-offs**

- SQLite is single-node and does not provide the operational characteristics of PostgreSQL (row-level
  concurrency, role separation, point-in-time recovery tooling).
- The poller is in-process; with multiple API instances each would poll the same outbox. A Redis/BullMQ
  queue or a DB advisory lock would be required before horizontal scaling.
- Some PostgreSQL-specific capabilities from the plan (trigram indexes, `tsvector`, generated columns)
  are approximated with `LIKE` + normalized columns and ranked scoring in application code.
- Production readiness still requires Postgres migrations, Redis-backed sessions/queue (or a single
  designated worker), object storage, and a real PDF pipeline.

## Migration path

1. Replace `DatabaseService` with a PostgreSQL-backed implementation (same method surface:
   `all/get/run/transaction/nextCounter`), add migrations and port the DDL to PG types/indexes
   (`pg_trgm`, `tsvector`, enums, `timestamptz`).
2. Move session storage and the notification queue to Redis; keep the `NotificationService`
   interface and worker semantics.
3. Introduce the storage adapter for attachments behind the existing feature flag.
4. Re-run the API integration suite against PostgreSQL (Testcontainers) as the acceptance gate.
