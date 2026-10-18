# Shayvera Inventory

Inventory management for Shayvera: raw materials with quality inspection, ready products with batch-wise expiry and low-stock control, e-commerce dispatches and returns, and reports across all of it.

**Stack:** Next.js 15 (App Router, server actions) · TypeScript · PostgreSQL · Prisma 6 · Tailwind CSS 4 + shadcn/ui · Zod validation on the server for every input (plus inline client-side checks) · Recharts · Vitest.

---

## What's in the box

| Module             | Pages                                                                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**      | Live stock snapshot (active products, available units, pending inspections, low stock, expired and expiring batches), activity for any date range, dispatch-vs-return and store-wise charts, recent activity lists. Every card links to the filtered page behind it. |
| **Raw Materials**  | Material entries (with bill upload), quality inspection queue (approve / reject / controlled reversal), raw material stock and per-material ledger, bill register, 10 reports.                                                                                       |
| **Ready Products** | Product master (per-product low-stock threshold and expiry alert period), product detail with batches per stock bucket, stock receipts, admin adjustments, quarantine decisions, stock overview, alerts (low stock / expiry / quarantine), 7 reports.                |
| **E-commerce**     | Stores, multi-line dispatches (FEFO batch allocation or a chosen batch), returns with condition, store-reported sales, unified transaction history, document register, 10 reports including reconciliation.                                                          |
| **Master Data**    | One place to set up the lists everything else uses: an overview with counts and quick-add for each, plus Products, Raw materials (pre-defined so staff pick instead of typing), Suppliers, Stores, Units and Categories.                                             |
| **Administration** | Users, roles and per-user permissions, business settings (timezone, date format, upload limits and file types, expired-dispatch exception), CSV import, audit log.                                                                                                   |

Every report supports search, sorting, pagination, date range and dropdown filters, CSV export (with the applied filters written into the file) and a print layout.

## Inventory rules and how they are enforced

| Rule                                             | Mechanism                                                                                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw material counts as stock only after approval | Entries start `PENDING_INSPECTION`; stock is posted only by `approveEntry`.                                                                                                       |
| Approval adds stock exactly once                 | Conditional status update (`PENDING → APPROVED`) plus a unique `(inspectionId, type)` key on the ledger.                                                                          |
| Decisions are corrected, never overwritten       | `reverseInspection` marks the decision reversed, posts a reversal transaction and returns the entry to pending. A partial unique index allows one live decision per entry.        |
| No negative stock, even under concurrency        | Dispatches lock the affected balance rows (`SELECT … FOR UPDATE`), balance updates are guarded (`quantity + Δ >= 0`), and `CHECK (quantity >= 0)` constraints back this up.       |
| No double posting                                | Every posting form carries an idempotency key that is unique in the database; a repeated submit returns the original document.                                                    |
| Expired stock is never dispatched                | FEFO allocation skips batches past their expiry date (an optional admin-only exception exists in Settings, off by default).                                                       |
| Damaged / expired returns never become saleable  | Returns post into separate stock buckets: `SALEABLE`, `QUARANTINE` (pending inspection), `DAMAGED`, `EXPIRED`. Only an authorized quarantine decision can move goods to saleable. |
| Returns never exceed what was dispatched         | Dispatch lines are row-locked during a return; `CHECK (returnedQty <= quantity)` at line and batch level.                                                                         |
| Posted transactions are immutable                | Database triggers reject `UPDATE`/`DELETE` on both ledgers and on the audit log. Corrections are reversal or adjustment entries with a mandatory reason.                          |
| Balances are reconcilable                        | Cached balances are updated in the same transaction as the ledger row. `reconcileRawMaterials()`, `reconcileProducts()` and the **Reconciliation report** compare them.           |
| Raw materials and ready products stay separate   | Separate tables and ledgers; the schema reserves `PRODUCTION_ISSUE` / `PRODUCTION_RECEIPT` for a future production module.                                                        |
| kg and pieces never mix                          | A raw material is keyed by (name, unit); `pieces` only accepts whole numbers; reports group by unit.                                                                              |
| Decimal-safe                                     | All quantities are `DECIMAL(18,3)` and handled with `Prisma.Decimal`, never JavaScript floats.                                                                                    |

### Editing and deleting records

| Record             | Edit                                                     | Delete                                                               |
| ------------------ | -------------------------------------------------------- | -------------------------------------------------------------------- |
| Raw material entry | While **pending inspection** only; a reason is required. | While pending only; a reason is required.                            |
| Product (master)   | Any time (unit locked once stock exists); optional note. | Only when it holds **no stock** in any bucket; a reason is required. |

- Every edit stores each changed field's old and new value, the user, the time and the reason. These show in the record's **Activity / Change history** and in the audit log.
- Deletes are **soft**: the record is marked deleted (who, when, why), hidden from lists, counts, stock figures and pickers, and kept for history. Choose **Status → Deleted** in the list to find them, and use **Restore** to undo.
- Approved or rejected entries are locked because they are part of the stock history. To correct one, an administrator reverses the inspection decision (recorded with a reason). The entry then returns to pending and can be edited, deleted or re-inspected.
- Permissions: _Edit pending raw material entries_ and _Delete pending raw material entries_ can be granted to staff. Product edits and deletes are administrator-only.

**Dispatch ≠ sale.** "Net sent out" (dispatched − returned) is a stock movement measure. Store-reported sales are recorded separately (no stock impact) and shown beside it for reconciliation.

## Permissions

- **Administrator:** everything.
- **Staff:** only the permissions an admin ticks for that user (e.g. record entries, inspect, dispatch, return, upload bills, view reports). Admin-only permissions (users, settings, masters, adjustments, reversals, import, audit) can never be granted to staff.

Permissions are checked inside every service function. Page guards and hidden buttons are only for convenience, so a crafted request cannot bypass them. Sessions are re-validated against the database on every request, so a role change or deactivation takes effect immediately.

## Local setup

Requirements: Node.js 20.9+ and PostgreSQL 14+.

```bash
# 1. Install dependencies
npm install

# 2. Create databases (example with a local superuser)
createdb shayvera
createdb shayvera_test

# 3. Configure environment
cp .env.example .env            # fill in DATABASE_URL and SESSION_SECRET
cp .env.test.example .env.test  # point at shayvera_test

# 4. Apply migrations and create the first admin
npm run db:deploy
npm run db:seed                 # prints a temporary admin password if SEED_ADMIN_PASSWORD is empty

# 5. Start
npm run dev                     # http://localhost:3000
```

Set `SEED_DEMO=true` (development only) to load sample suppliers, stores, products, batches, dispatches and returns. Demo data goes through the same services as the UI, so every number is backed by ledger rows.

### Scripts

| Command                                                       | Purpose                                               |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| `npm run dev`                                                 | Development server                                    |
| `npm run build` / `npm start`                                 | Production build / server                             |
| `npm test`                                                    | Integration tests against the database in `.env.test` |
| `npm run lint` · `npm run typecheck` · `npm run format:check` | Static checks                                         |
| `npm run db:migrate`                                          | Create a new migration during development             |
| `npm run db:deploy`                                           | Apply migrations (CI / production)                    |
| `npm run db:seed`                                             | Units, first admin, optional demo data                |
| `npm run db:studio`                                           | Prisma Studio                                         |

## Environment variables

See `.env.example`. Summary:

| Variable                                                                                                   | Required  | Notes                                               |
| ---------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------- |
| `DATABASE_URL`                                                                                             | yes       | PostgreSQL connection string                        |
| `SESSION_SECRET`                                                                                           | yes       | ≥ 32 random characters; used to hash session tokens |
| `APP_TIMEZONE`                                                                                             | no        | Default business timezone (changeable in Settings)  |
| `STORAGE_DRIVER`                                                                                           | no        | `local` (default) or `s3`                           |
| `STORAGE_LOCAL_DIR`                                                                                        | no        | Private folder for `local`; never inside `/public`  |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | for `s3`  | Any S3-compatible private bucket                    |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO`                                  | seed only | First administrator and demo data                   |

## Documents and file security

- Bills, invoices, shipment and return documents are stored privately. Every download goes through `/api/files/:id`, which checks the session and the permission for that document type.
- Files are validated by their actual content (PDF / JPG / PNG / WEBP magic bytes), not the extension, against the size limit and file types configured in Settings.
- Replacing a document keeps the original, marks it _Replaced_ and records who replaced it and why.

## Time and dates

Timestamps are stored in UTC. Business days ("today", report ranges, expiry checks) use the timezone set in **Settings**. Date filters are inclusive: _from_ starts at 00:00 and _to_ runs to the end of that day. Expiry dates are calendar dates; a batch is usable through the end of its expiry date.

## Testing

```bash
npm test
```

The suite (71 tests) runs the real services against PostgreSQL. It covers approval-once under concurrent requests, rejection, reversal and re-inspection, immutable ledgers, bill access control, per-product thresholds and expiry periods, batch separation, FEFO, oversell protection under six parallel dispatches, duplicate submissions, return caps under concurrency, return conditions and quarantine decisions, store and date filters, reconciliation, permission enforcement, CSV formula-injection protection, the CSV importer, dashboard totals, and edit/delete rules with their audit trail.

## Deploying to Netlify

The repo is ready for Netlify: `netlify.toml` uses the official Next.js runtime, and `scripts/netlify-build.sh` applies database migrations, seeds units and the first admin, then builds.

**1. Import the site.** In Netlify, choose _Add new project → Import an existing project → GitHub_ and pick this repository. The build settings come from `netlify.toml`. The very first deploy fails with _"no database configured"_ until steps 2 and 3 are done; that's expected.

**2. Add a database (Netlify DB).** In the site's dashboard, add **Netlify DB** (powered by Neon). It sets `NETLIFY_DATABASE_URL` and `NETLIFY_DATABASE_URL_UNPOOLED` for you. **Claim the database** when Netlify offers it (this links it to a free Neon account); unclaimed databases are temporary.
_Using your own PostgreSQL instead?_ Set `DATABASE_URL` (pooled connection) and `DIRECT_DATABASE_URL` (direct connection, used for migrations).

**3. Set environment variables** under _Site configuration → Environment variables_:

| Variable              | Value                                                           |
| --------------------- | --------------------------------------------------------------- |
| `SESSION_SECRET`      | 64 random characters, e.g. the output of `openssl rand -hex 32` |
| `STORAGE_DRIVER`      | `netlify` (bills and images go to private Netlify Blobs)        |
| `APP_TIMEZONE`        | `Asia/Kolkata` (or your business timezone)                      |
| `SEED_ADMIN_EMAIL`    | the first administrator's email                                 |
| `SEED_ADMIN_NAME`     | their name                                                      |
| `SEED_ADMIN_PASSWORD` | a strong password, at least 10 characters                       |

**4. Deploy.** _Deploys → Trigger deploy → Deploy site._ The build log shows the migrations and _Created administrator …_.

**5. Sign in, then tidy up.** Sign in with the admin account and change the password (user menu → Change password). Then delete `SEED_ADMIN_PASSWORD` from the environment variables; later deploys leave existing admins unchanged.

Notes:

- Every push to `main` redeploys automatically. Migrations run on each deploy and are safe to re-run.
- Uploads are capped at **4 MB per file** on Netlify (its functions accept requests up to 6 MB). Settings shows the limit.
- `GET /api/health` checks the app and database connection.

## Deployment

1. Provision PostgreSQL (e.g. a managed instance) and, for multi-instance or serverless hosting, an S3-compatible private bucket with `STORAGE_DRIVER=s3`. Local disk storage only suits a single long-running server with a persistent volume.
2. Set the environment variables above in the host. Never commit `.env`.
3. Build and migrate:
   ```bash
   npm ci
   npm run db:deploy
   npm run build
   npm start
   ```
4. Run `npm run db:seed` once to create the first administrator, then sign in and change the password (user menu → Change password).
5. Serve over HTTPS. Session cookies are `Secure` in production.
6. Monitor `GET /api/health` (checks database connectivity).
7. Back up the database and the document storage together.

## Project structure

```
prisma/                 schema, migrations (incl. CHECK constraints, partial indexes, immutability triggers), seed
src/server/             server-only code
  services/             business logic: raw-materials, products, ecommerce, attachments, masters, importer, dashboard
  reports/              report definitions (shared by list pages, report pages and CSV export)
  auth.ts, permissions.ts, audit.ts, sequence.ts, settings.ts, storage/
src/app/(auth)/login    sign-in
src/app/(app)/          application pages by module
src/app/api/            CSV export, private file access, health check
src/components/         layout, reports engine UI, forms, document widgets, shadcn/ui
tests/                  Vitest integration tests
```
