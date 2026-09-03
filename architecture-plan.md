# Pharmacy ERP — Architecture & Plan

## What this is
A multi-tenant SaaS ERP for retail pharmacies, hosted on a VPS, sold as a subscription. Each pharmacy is a tenant with isolated data.

## Stack (locked 2026-09-02)
- Frontend: React + TypeScript + Vite
- Backend: Node.js + TypeScript, NestJS
- Database: PostgreSQL — shared DB, every table carries `pharmacy_id` for tenant isolation
- ORM: Drizzle (switched from Prisma — Prisma's engine-binary download is blocked by the build sandbox's network allowlist; Drizzle is pure TypeScript with no native binaries, same capabilities)
- Auth: JWT, roles: Super Admin > Pharmacy Admin > Manager > Salesman (manager added Phase 3 — see below)
- Billing: manual for v1 (super-admin activates/deactivates a pharmacy's subscription; no payment gateway yet) — see "Subscription & onboarding model" below for the fuller discussion

## Roles (as built)
- **Super Admin**: platform owner, onboards pharmacies, manages subscriptions. `pharmacyId` is null.
- **Pharmacy Admin**: full access within their pharmacy — staff, products, stock-in, suppliers, sell, view sales, dashboard.
- **Manager** (added Phase 3): can do everything inventory-related an admin can (products, stock-in/purchases, suppliers, view sales history, dashboard) — sees cost/purchase price. Cannot manage staff, cannot sell (not on the till).
- **Salesman**: sells only, via the POS screen. Never sees purchase price or profit — enforced at the endpoint level (403 on cost-bearing routes, including all `/dashboard/*` routes), not just hidden in the UI.

## Subscription & onboarding model (discussed and decided 2026-09-02)
- **Unit of billing/access is the pharmacy, not a device** — this is a web app, nothing to activate per-device. One `subscription_status` flag per pharmacy controls all its users at once.
- **Credential hierarchy**: Super Admin creates each pharmacy + its first Pharmacy Admin login; that Admin then creates their own Manager/Salesman logins from their Staff page. Super Admin is never involved in staff-level accounts.
- **Deactivation cutoff**: new logins are blocked immediately when a pharmacy is deactivated; anyone already logged in keeps working until their token naturally expires (max 8h) — user explicitly chose NOT to add real-time mid-session cutoff, so this stays as-is.
- **Login identity**: real email + password per person, globally unique across the whole platform (not just per pharmacy) — user confirmed this is fine, no per-pharmacy username system needed.
- **Pharmacy code**: every pharmacy gets a human-readable code (`PH-0001`, `PH-0002`, ...) for invoices/support — computed live from the row id (not stored, same "computed not stored" principle as stock/balances), shown in the Super Admin panel and returned from both `list` and `create`.
- **Pharmacy onboarding form** (Super Admin → "+ New Pharmacy"), redesigned 2026-09-02 to exactly 4 fields: Business Name, Email (used to log in), Mobile Number, Address. No separate "owner name" field — the admin user's `name` reuses the business name. No password field — the backend generates one and returns it once in the create response. The frontend shows it in a one-time "Your Credentials" tap-to-copy block (formatted for pasting straight into WhatsApp) — it's never recoverable after that (only reset), matching how a normal password works.
- **Generated password format**: `generatePassword()` in `pharmacies.service.ts` — one continuous 8-character string from an ambiguity-free charset (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, no 0/O/1/I/L). Originally formatted `XXXX-XXXX` with a hyphen for phone dictation; user pointed out the hyphen only adds an extra keyboard-switch tap when typing on a phone and doesn't help now that delivery is copy/paste (not dictation) — removed 2026-09-02.
- **Password delivery is manual in v1**: no email/SMS integration exists. Super Admin relays the generated password to the pharmacy owner themselves (call/WhatsApp/SMS) using the tap-to-copy "Your Credentials" block. Explicitly decided against building automated email/SMS delivery for now — that's real new integration scope (picking a provider, credentials) to revisit later if manual relay becomes a bottleneck.
- **Billing collection stays manual for now** (bKash/Nagad/bank transfer collected offline, Super Admin flips status in the panel) — user deferred the online-payment-gateway question (SSLCommerz was discussed as the likely BD option, covering bKash/Nagad/cards/bank in one integration) until manual collection is actually painful at higher pharmacy counts.
- **Auto-expiring activation — done 2026-09-02** (see "Auto-expiring subscriptions" section below): the former gap here (`subscription_expiry` stored but never auto-enforced) is closed. Super Admin picks a duration (1/7/30/90/365 days) when activating; a background job deactivates it automatically once that day arrives. Activating with no duration still works and leaves it active indefinitely (no auto-cutoff) for pharmacies that don't want a timer.

## Core data model (as built)
- Pharmacy (tenant): id, name, address, phone, subscription_status, subscription_expiry — `code` (e.g. `PH-0001`) is computed from `id`, not stored
- User: id, pharmacy_id, role, name, email, password_hash
- Manufacturer (global master): id, name — 240 rows, seeded
- MedicineMaster (global shared catalog, not per-pharmacy): id, name, generic_name, strength, form, type (allopathic/herbal), manufacturer_id, unique on (name, strength, manufacturer_id) so re-imports are idempotent — 21,264 rows, seeded from the real Bangladesh medicine dataset
- Product (per-pharmacy): id, pharmacy_id, medicine_master_id (nullable), name, unit, reorder_level
- Purchase (stock-in batch): id, pharmacy_id, product_id, supplier_id, qty, qty_remaining, purchase_price, batch_number, expiry_date, purchase_date
- Supplier: id, pharmacy_id, name, contact (balance is NOT stored — computed live from purchases minus supplier_payments)
- SupplierPayment: id, pharmacy_id, supplier_id, amount, note, payment_date — the supplier ledger's transaction history
- SaleInvoice (added Phase 3): id, pharmacy_id, salesman_user_id, total_amount, sale_date — one checkout = one invoice, like a real till receipt
- Sale (line item, redesigned Phase 3): id, pharmacy_id, invoice_id, product_id, qty, sale_price — one row per item within a checkout
- SaleAllocation: id, sale_id, purchase_id, qty, unit_cost — links each sale line item to the exact purchase batch(es) it FIFO-drew stock from; this is what makes Phase 5 profit reporting accurate instead of a flat average cost
- qtyOnHand, supplier balance, and pharmacy code are never stored — always computed live from the underlying rows, so they can't drift out of sync.

## v1 feature scope (as decided by user)
- Low-stock alerts — done (Phase 2)
- Salesman-restricted view — enforced via NestJS role guards: cost-bearing endpoints (purchases, dashboard, and product cost which is simply never returned to any role) reject salesman with 403
- Supplier ledger — done (Phase 2): running balance + full purchase/payment transaction history per supplier
- Batch/expiry tracking deferred out of v1 UI (schema still records batch_number/expiry_date per purchase; no alerts/UI yet)
- Manager role — done (Phase 3, added at user's request): lets a trusted staff member handle stock-in without being able to manage other staff or sell

## Build phases
1. ✅ Project scaffold + multi-tenant auth + super-admin panel — DONE 2026-09-02
2. ✅ Inventory: products, shared medicine master catalog (21k+ real medicines seeded), stock-in, low-stock alerts, supplier ledger — DONE 2026-09-02
3. ✅ Sales/POS: manager role, invoice+line-item sales model, FIFO checkout, cart-based POS screen — DONE 2026-09-02
4. ~~Supplier ledger~~ (folded into Phase 2, done early)
5. ✅ Dashboard: real-time cash flow, inventory value, available stock, daily revenue, daily profit, 7/30-day sales trend — DONE 2026-09-02
6. ✅ VPS deployment — LIVE 2026-09-02 at http://161.97.154.211:8085 (IP only, no domain/SSL yet)

Also done, outside the phase numbering: pharmacy onboarding polish (pharmacy code, generated password, tap-to-copy credential delivery) — see "Subscription & onboarding model" above.

## Working location
User's local folder `C:\Users\BH3240\Claude\Projects\Pharmcy ERP` (device-linked). Code is built and tested in the cloud container, then packaged and delivered to this folder (source only, not node_modules — reinstall locally with `npm install`). See README.md there for full local setup steps (Windows).

**Migration history was reset once** (Phase 3): since the user hadn't run `db:migrate` locally yet, four incremental migration files were consolidated into a single clean `0000_steep_maddog.sql` rather than fighting drizzle-kit's interactive rename-detection prompt (which needs a TTY the build sandbox doesn't have). If the user ever runs `db:migrate` again after having run an earlier version, they'll need to drop and recreate the `pharmacy_erp` database first — noted in README.md.

## Phase 1 status: complete and verified 2026-09-02
- Login (JWT), role-based route/action guards
- Tenant isolation: pharmacyId always derived from the verified JWT server-side, never from client input
- Super-admin panel: create pharmacy + its first admin user, activate/deactivate subscription
- Subscription gating confirmed: deactivating a pharmacy blocks its users from logging in

## Phase 2 status: complete and verified 2026-09-02
- Suppliers: create, list with live-computed balance owed, ledger, record payment
- Products: create (custom or linked to medicine_master), list with live-computed qtyOnHand
- Medicine master search endpoint (autocomplete) — verified against real imported data
- Purchases (stock-in): hides purchase price from salesmen, increments product stock, updates supplier balance automatically
- Low-stock alerts: endpoint + dashboard widget

## Phase 3 status: complete and verified 2026-09-02
Backend (NestJS) + frontend (React) built and smoke-tested end-to-end via real browser automation, plus direct DB verification of the FIFO logic:
- Manager role added: can manage products/purchases/suppliers/view sales, cannot manage staff or sell — confirmed via 403s in both directions
- Sales schema redesigned: SaleInvoice (checkout) + Sale (line items) + SaleAllocation (FIFO cost tracking)
- FIFO checkout verified directly against the DB: a product bought in two batches (10@1.00, then 10@1.50) sold 15 units correctly drew 10 from the first batch and 5 from the second, with sale_allocations recording the exact split and cost per batch
- Insufficient-stock rejection verified: selling more than available correctly fails with a clear error AND rolls back completely (no partial stock deduction) — confirmed the whole checkout is one DB transaction
- POS screen ("Sell"): search-and-Enter-to-add, auto-focus flow (search → price → back to search) so a sale needs no mouse, running cart with editable qty/price, one-click checkout
- Sales history page for admin/manager (recent transactions, who sold them, item count, total)
- Role-restricted nav confirmed in the browser: salesman sees only "Sell"; manager sees inventory pages but not Staff or Sell; only pharmacy_admin sees Staff

## Medicine master catalog — imported 2026-09-02
Source: Kaggle "Assorted Medicine Dataset of Bangladesh" by ahmedshahriarsakib —
https://www.kaggle.com/datasets/ahmedshahriarsakib/assorted-medicine-dataset-of-bangladesh
(scraper: https://github.com/ahmedshahriar/bd-medicine-scraper, scraped from medex.com.bd)
User downloaded it and placed the CSVs in `Medicine Data/` inside the project folder (sibling of backend/frontend).

Importer: `backend/src/db/import-medicine-master.ts`, run via `npm run db:import-medicines`
(from `backend/`, defaults to reading `../Medicine Data`). Idempotent. Tested against the real
files: 240 manufacturers, 21,264 medicines, spot-checked against known brands (Napa → Paracetamol
500mg → Beximco). **Only run so far in the build sandbox's throwaway test database** — the user
still needs to run `db:migrate` then `db:import-medicines` themselves once their own local
Postgres is set up (see README.md).

## Phase 5 — Dashboard: design + build, both done 2026-09-02
Design mockup approved by the user before any code was written:
https://claude.ai/code/artifact/e43895b6-8d13-4d5c-a512-0c12a31139db

**Backend** — new `dashboard` module (`backend/src/dashboard/`), `pharmacy_admin`/`manager` only
(403 for salesman, confirmed):
- `GET /dashboard/summary` — cashFlowToday (revenue − supplier payments made today), dailyRevenue,
  dailyProfit (revenue − COGS, using the real FIFO `sale_allocations` cost, not average cost),
  profitMarginPct, inventoryValue (live sum of `qty_remaining × purchase_price`), availableStockUnits/Skus,
  lowStockCount. Each money metric also returns a `*DeltaPct` vs yesterday (`null` = "new", not a
  misleading +∞%).
- `GET /dashboard/trend?days=7|30` — daily revenue series, oldest first, zero-filled for days with
  no sales (never a gap in the chart).
- `GET /dashboard/recent-sales` — latest 5 invoices (reuses the same shape as `/sales`).
- **Known v1 limitation**: "today"/"yesterday" boundaries are UTC calendar days — there's no
  per-pharmacy timezone setting yet. Deploying the VPS with `TZ=Asia/Dhaka`, or adding a
  `pharmacy.timezone` column later, would make "today" match the pharmacy's actual day. Worth
  fixing before go-live since a UTC day boundary lands mid-afternoon in Bangladesh.
- Verified directly against the sandbox DB: correct revenue/profit/cash-flow math, correct
  zero-filled 7-day and 30-day trend arrays, 403 for salesman / 200 for admin+manager.

**Frontend** — `frontend/src/pages/pharmacyadmin/DashboardPage.tsx` replaces the old
`DashboardPlaceholder.tsx` (deleted) on the `/` route for admin+manager. KPI row, sales-trend
chart (hand-built inline SVG line+area chart with a working 7/30-day toggle and hover
crosshair/tooltip — no charting library dependency), low-stock list, recent-sales table. Polls
`/dashboard/summary` + `/dashboard/recent-sales` + low-stock every 30s for the "Live" indicator.
Browser-tested end-to-end (login → real dashboard render → 30-day toggle → chart hover tooltip),
all matching the approved design.

Delivered to the user's local folder 2026-09-02 (`backend/src/dashboard/`, updated
`backend/src/app.module.ts`, `frontend/src/App.tsx`, new `DashboardPage.tsx`, old placeholder
removed on their machine too).

## Pharmacy onboarding — pharmacy code + generated password, done 2026-09-02
Grew out of a subscription/login model discussion with the user (see "Subscription & onboarding
model" above). Changes, delivered and browser-verified:
- `PharmaciesService`: added computed `code` (`PH-0001`-style, derived from row id) on
  `list`/`create`/`updateSubscription` responses.
- `CreatePharmacyDto` simplified to `pharmacyName`, `address`, `phone`, `adminEmail` — `adminName`
  and `adminPassword` removed entirely (old shape now correctly rejected by validation).
- `PharmaciesService.create()`: admin's `name` reuses `pharmacyName`; password is generated
  server-side (`generatePassword()`) and returned once in the response as `generatedPassword` —
  never stored in plaintext, only its bcrypt hash.
- `PharmaciesPage.tsx`: form is now exactly Business Name / Email / Mobile Number / Address; on
  success shows a one-time tap-to-copy "Your Credentials" block (Email / Password, formatted for
  pasting straight into WhatsApp) — the password can't be recovered after that (only reset).
- **Follow-up 2026-09-02**: dropped the `XXXX-XXXX` hyphen from the generated password (was for
  phone dictation; unnecessary and mildly annoying to type now that delivery is copy/paste) — now
  one continuous 8-character string.
- Verified: generated password successfully logs the new admin in; old 4-field-plus-password
  request shape is correctly rejected; clipboard content after tapping the credentials block
  matches exactly; UI screenshots (including a phone-width viewport) confirm the form and the
  one-time credential panel render and copy as intended.

## Responsive design (desktop/tablet/mobile) — done 2026-09-02
User asked, before deployment: is every page designed for desktop/tablet/mobile and is every screen
optimized? A direct code check (`grep -rn "@media" src/`) showed zero real media queries anywhere in
the app — several layouts used fixed pixel widths and forced side-by-side flex that would break on a
phone. User explicitly scoped the fix: **before deploying**, **all pages, all roles** (Super Admin,
Pharmacy Admin/Manager, Salesman).

Approach: moved every structural width/flex layout that needed to respond to a breakpoint out of
inline React styles (which can't hold `@media`) and into CSS classes in `frontend/src/index.css`,
under a new "Responsive layout" section. Breakpoints: ≤900px collapses the sidebar, ≤640-720px stacks
two-column splits and drops fixed max-widths.

- **`AppShell.tsx`** — sidebar (`.app-sidebar`, was a fixed 220px `<aside>`) becomes an off-canvas
  drawer below 900px: a topbar with a ☰ hamburger (`.app-topbar`, `.hamburger-btn`) toggles it, a
  `.sidebar-backdrop` closes it on tap-outside, and each `NavLink` closes it on navigate. Above 900px
  the CSS keeps the old always-visible sidebar behavior, so desktop is pixel-identical to before.
- **`.table-scroll`** (`overflow-x:auto`) wraps every data table across every page (Staff, Products,
  Purchases, Sales history, Suppliers, super-admin Pharmacies, Dashboard recent-sales, POS cart) —
  none had a horizontal-scroll wrapper before, so a table wider than the viewport would have forced
  the whole page to scroll sideways.
- **`.page-header`** (flex, `flex-wrap:wrap`) replaces the repeated inline title+action-button header
  row on every list page, so the button wraps under the title instead of squeezing it on a phone.
- **`.form-card`** (max-width 420px, `none` below 480px) replaces each page's own inline
  `maxWidth: 380` / `420` on its create-record form card — unified to one width, full-bleed on phones.
- **Dashboard** (`DashboardPage.tsx`): `.kpi-row`/`.kpi-tile` (was a plain flex row, 5 tiles) now wraps
  onto 2-3 lines on a phone instead of squeezing to unreadable widths; `.split-row`/`.split-main`/
  `.split-side` (was a fixed `flex:1.9` chart + fixed-width low-stock side panel) stacks the low-stock
  panel below the chart under 700px.
- **`SuppliersPage.tsx`**: `.suppliers-row`/`.suppliers-table`/`.suppliers-ledger` (was a fixed 320px
  side-by-side ledger panel) stacks the ledger below the table under 720px.
- **`LoginPage.tsx`**: `.login-card` (was a fixed `width: 340`) caps at `calc(100vw - 32px)` so it
  never overflows a narrow phone.
- **`SalesPOS.tsx`** (salesman "Sell" screen): `.pos-page` (was `maxWidth: 640`) drops the cap below
  680px; cart table wrapped in `.table-scroll` so its 5 columns (Product/Qty/Price/Total/remove) can
  scroll sideways rather than clipping on a phone; total+checkout row gets `flexWrap` so the button
  drops below the total instead of squeezing.

**Verified** with a real headless-browser pass (Playwright, `chromium-1194`) at three viewports — 390px
(phone), 768px (tablet), 1440px (desktop) — across Login, both roles' nav (including opening the
mobile hamburger drawer), Dashboard (KPI wrap + chart/low-stock stacking), Suppliers (table+ledger
stacking, both collapsed and with the ledger open), Sell/POS, Staff, and the super-admin Pharmacies
page including the "+ New Pharmacy" form and the tap-to-copy credentials panel on a phone-width
screen — all render and stack correctly, no clipped or overlapping content. `tsc -b` clean.
Delivered to the user's local folder.

## Phase 6 — VPS deployment: LIVE, 2026-09-02
The app is deployed and serving real traffic at **http://161.97.154.211:8085** (IP only — user chose
"just use the VPS IP for now" over buying/pointing a domain, so there's no SSL yet; see "Next up").

**Code delivery**: a private GitHub repo, `https://github.com/CATBEx/pharmacy-erp` (user: CATBEx) —
user chose git over manual transfer specifically to get `git pull` for future updates. Since this
session has no direct network access to the VPS (or to arbitrary hosts at all — only an allow-listed
set that happens to include GitHub), the workflow is: commit + push from the device-linked Windows
folder using a short-lived fine-grained PAT (Contents: Read/write, user generates it in GitHub
Settings when needed) → the VPS does a plain `git pull` using the same token embedded in its `origin`
remote URL (`/var/www/pharmacy-erp/.git/config`). **That token expires ~7 days from creation
(2026-09-02)** — future pulls will fail once it does; regenerate a token (ideally a separate
longer-lived read-only one dedicated to the VPS) and update the VPS's remote URL when that happens.
`.gitignore` had a bug fixed as part of this (see "Pharmacy onboarding" section) — `drizzle/meta/`
was being excluded, which would have broken `drizzle-kit migrate` on a fresh clone; also delivered
`package-lock.json` and `backend/drizzle/meta/*` to the user's folder, since neither had ever been
sent before this phase despite existing in the build sandbox.

**VPS layout**:
- Code: `/var/www/pharmacy-erp` (git working tree, `origin` = the GitHub repo above)
- Database: `pharmacy_erp` role / `pharmacy_erp_db` database, self-hosted Postgres already on the box
  — matches the `onebilling`/`paybsc` per-app convention. Migrated + seeded + full 21,264-row medicine
  catalog imported, all successful on first attempt.
- Backend: pm2 process `pharmacy-erp-backend`, `node dist/main.js`, **port 4001** (internal only,
  not firewall-exposed) — originally tried the documented default of 3001, but that was already
  bound by an unrelated Next.js app on this box (crashed the first `pm2 start` in a ~50-restart loop
  until caught via `pm2 logs` and fixed by moving to 4001 in `backend/.env` + `pm2 restart --update-env`).
  Confirmed via `pm2 status` that this box's other 11 pm2 processes — including the crypto/financial
  ones (`gma-vault1`, `gma-vault3`, `gma-bridge`, etc.) — were never touched.
- Frontend: static `vite build` output at `/var/www/pharmacy-erp/frontend/dist`, served directly by
  nginx. `VITE_API_URL=/api` (relative, not `localhost`) so the browser calls same-origin — avoids
  CORS entirely regardless of IP/domain.
- nginx: new vhost `/etc/nginx/sites-available/pharmacy-erp` (symlinked into `sites-enabled`),
  **listening on port 8085** — chosen because the box's existing default vhost already claims
  `80 default_server`, and 8085 didn't collide with anything in `ss -tlnp` (which is a long list on
  this box: mail, several other web apps, geth, redis, mariadb, etc.). `location /api/` proxies to
  `http://127.0.0.1:4001` (no path rewrite — the backend's own Nest global prefix is already `api`,
  so the URI passes through unchanged); `location /` does SPA fallback (`try_files $uri /index.html`)
  for React Router. Opened in the firewall with `ufw allow 8085/tcp`.
- Backups: `/usr/local/bin/pharmacy-erp-backup.sh` (`pg_dump -Fc`, 14-day rotation via `find -mtime`),
  cron `30 2 * * *`. Confirmed working — first dump ran successfully (337KB). **This is on-server
  only** (same disk as the DB) — real protection against bad migrations/accidental deletes, but not
  against the VPS itself failing. True off-server backup (object storage, or periodic copy to the
  user's Windows folder) was raised with the user and is still an open follow-up, not yet built.

Verified end-to-end on the live deployment (not just in the build sandbox): login, full nav render,
and — after the auto-expiring-subscriptions feature below — a real activate-for-N-days API call
against production data.

## Auto-expiring subscriptions — done 2026-09-02
User request, right after go-live: let the Super Admin activate a pharmacy for a chosen number of
days (1/7/30/365, etc.) and have it auto-deactivate once that day arrives — this is exactly the gap
flagged earlier under "Subscription & onboarding model."
- `UpdateSubscriptionDto` gained an optional `days` field (`@IsInt() @Min(1)`); `expiry` (an exact
  ISO date) stays as a secondary escape hatch, ignored when `days` is given.
- `PharmaciesService.updateSubscription`: when `days` is given, computes `subscriptionExpiry =
  now + days` server-side (never trusts a client-computed date). No `days`/`expiry` given → expiry is
  cleared (`null`) — lets a pharmacy be activated with no auto-cutoff, same as before this feature.
- `PharmaciesService.deactivateExpiredSubscriptions()`: new `@Cron(CronExpression.EVERY_10_MINUTES)`
  job — flips any pharmacy from `active` to `inactive` once `subscription_expiry <= now()`. Added
  `@nestjs/schedule` as a dependency; `ScheduleModule.forRoot()` registered once in `AppModule`. Runs
  inside the existing NestJS process (no separate OS-level cron needed) — same pm2 process, same
  deploy. Deactivation behaves exactly like a manual one: blocks new logins immediately, anyone
  already logged in keeps working until their token naturally expires (max 8h) — this was already
  the login-time-only enforcement in `AuthService`, unchanged by this feature.
- `PharmaciesPage.tsx` (Super Admin): the old single Activate/Deactivate toggle button is now a
  duration `<select>` (1 day / 7 days / 30 days / 90 days / 1 year) + "Activate" button when a
  pharmacy isn't active, and a plain "Deactivate" button when it is. New "Expires" column shows the
  computed date plus a "Xd left" countdown (turns warning-colored at ≤3 days), "—" when there's no
  expiry set.
- Verified: typecheck clean on both workspaces; the exact Drizzle query the cron runs was executed
  directly against the sandbox DB (not just hand-checked SQL) and correctly flipped a backdated test
  row; browser-tested the full UI flow (pick duration → Activate → expiry+countdown appears in the
  table). Shipped through the same GitHub → VPS `git pull` → `npm ci` → rebuild → `pm2 restart
  --update-env` pipeline as the initial deploy, and re-verified live via a real activate-for-1-day API
  call against the actual production pharmacy (Seba Pharma, PH-0001) — that pharmacy is now really
  set to auto-deactivate 2026-09-03; flagged to the user to re-activate it for whatever duration they
  actually want.

## Super admin: pharmacy details + password regeneration — done 2026-09-02
User feedback right after the auto-expiring-subscriptions ship: the Pharmacies table only ever
showed Code/Name/Status/Expires/Created — no way to see a pharmacy's address/phone/admin login, and
no way to recover a lost admin password (the generated password is only ever shown once, at
creation).
- `PharmaciesService.getDetails(id)` — new `GET /pharmacies/:id`: returns the pharmacy row (code,
  address, phone, subscription status/expiry, created date) plus everyone who works there, split
  into `admin` (the `pharmacy_admin` user) and `staff` (managers/salesmen) — reuses the same
  `users` table query pattern as `UsersService.listStaff`, but parameterized by the route's `:id`
  instead of the JWT's `pharmacyId`, since only Super Admin can look at *any* pharmacy this way.
- `PharmaciesService.regeneratePassword(id)` — new `POST /pharmacies/:id/regenerate-password`:
  finds that pharmacy's admin user, generates a new password with the same `generatePassword()`
  helper used at creation, bcrypt-hashes it, overwrites `passwordHash` (immediately invalidating the
  old one), and returns `{ email, generatedPassword }` once — same one-time-display contract as
  pharmacy creation; only the hash survives after the response.
- `PharmaciesPage.tsx`: each row now has a "Details" button opening a side panel (reuses the
  `.split-row`/`.split-main`/`.split-side` layout already built for the Dashboard, which already
  stacks correctly on mobile) showing address, phone, admin login email, status/expiry, created
  date, and the staff roster. A "Regenerate password" button there asks for confirmation inline (no
  browser `confirm()` dialog) since it invalidates the current password immediately, then shows the
  new one in the same tap-to-copy `CredentialsBox` component used at pharmacy creation (factored out
  so both flows share it).
- Verified: typecheck clean on both workspaces; full flow tested against the sandbox DB with a
  throwaway test pharmacy (not the real Seba Pharma) — old password confirmed working, regenerated,
  old password then correctly rejected (401) and new one accepted (200), 404 on a nonexistent
  pharmacy id on both new routes, 403 confirmed for a pharmacy_admin trying either route (still
  super-admin-only). Browser-tested at both desktop and phone (390px) viewports — details panel and
  regenerated-credentials box render and stack correctly on both.

## Bug-tracking workflow — started 2026-09-02
User asked for reported issues to be logged one at a time in `Bugs.md` (repo root) with root-cause
analysis and a proposed fix, worked through together rather than fixed on the fly. Each entry
carries a status marker (🔴 Open · 🟡 In progress · 🟢 Fixed, pending deploy · ✅ Deployed &
verified) so both sides can see what's outstanding. See `Bugs.md` for the full log — the sections
below summarize what shipped from it.

## Medicine search relevance ranking — done 2026-09-02
Reported: searching "Napa" returned "Lonapam" (contains "napa" as a mid-word substring) before
"Napa" itself — the search had a filter but no relevance ordering.
- `MedicineMasterService.search()` (`backend/src/medicine-master/medicine-master.service.ts`): added
  a Drizzle raw-`sql` `ORDER BY` tier (`CASE WHEN ... THEN 0/1/2 ELSE 3 END`) — exact match, then
  starts-with, then word-start match, then everything else (mid-word substrings) last, alphabetical
  within each tier. Filter itself (`ILIKE '%query%'`) unchanged.
- Verified via direct API call: "Napa" now returns all Napa* variants before Lonapam/Tenapam.

## Pack/piece conversion (Piece → Strip → Box) — done 2026-09-02
Reported: medicine is sold mostly by strip/box and sometimes as loose pieces; salesmen shouldn't
have to type every sale quantity in individual pieces. Full research trail (why the imported
medicine CSV/medex.com.bd/DGHS API/Hugging Face mirror all turned out unusable as bulk pack-size
sources, and the self-correcting crowd-sourced design that resulted) is in `Bugs.md` bug #2 — kept
there rather than duplicated here since it's a discussion record, not just a build summary.

**Schema** (`products` table, migration `0001_add_product_pack_sizes.sql`): `piecesPerStrip` and
`stripsPerBox`, both `integer default 1 not null` — a product left at the default is untracked
(sold loose: syrups, bottles, vials).

**Crowd-sourced suggestions, computed not stored**: `ProductsService.packSizeSuggestions()` +
`GET /products/pack-size-suggestions?medicineMasterId=X` — a live `GROUP BY piecesPerStrip/
stripsPerBox` across every pharmacy's own `products` rows for that shared catalog medicine, most-
used value first with its pharmacy count (e.g. "10 pcs/strip — used by 42 pharmacies"). No new
aggregate table, same "computed, not stored" principle used for stock-on-hand/supplier balances
elsewhere in this app — a pharmacy's own value is never overwritten by another pharmacy's, so one
bad entry can't silently propagate; it just shows up honestly as its own low-count option.
Dropdown-only entry (no free-typing), curated fallback list
(1,2,4,5,6,8,10,12,14,15,20,24,25,30,40,50,60,100) when nothing's been reported yet for that
medicine.

**Where it shows up**:
- **Product form** (`ProductsPage.tsx`): two dropdowns, "Pieces per strip" / "Strips per box",
  pre-filled from the live suggestion the moment a catalog match is picked.
- **Sell (POS)** (`SalesPOS.tsx`): Piece/Strip toggle per cart line (no Box — a walk-in customer
  never buys a whole box), defaults to Strip when `piecesPerStrip > 1`, "= N pcs" caption.
  `salePrice` stays price-per-piece, unchanged — this only changes how quantity is entered.
- **Purchases (stock-in)** (`PurchasesPage.tsx`): all three levels — see next section, built
  together with this.
- **Stock display everywhere** (`frontend/src/utils/packSize.ts`'s `formatStock()`): Products page
  "On hand" column, Dashboard low-stock list, POS search-result stock figures, and Purchases
  history all show the Box/Strip/Pcs breakdown instead of a raw piece count, omitting any
  zero-value unit (e.g. 200 pieces at 10/strip, 10 strips/box shows as "2 Box", not "2 Box, 0
  Strip, 0 Pcs"). A product with no pack tracking set just shows the plain number, unchanged.

## Purchases (stock-in) form: product search + Box/Strip/Pcs entry — done 2026-09-02
Reported: the Product field was a plain `<select>` with no search (unusable once a pharmacy has
more than a screenful of products), and Quantity was a single number field requiring manual
pack-to-piece math.
- `PurchasesPage.tsx` rewritten: the `<select>` replaced with a client-side search-as-you-type
  product picker (same pattern as POS/Products medicine search — no new backend call, filters the
  already-loaded product list); the single Quantity field replaced with three combinable Box/
  Strip/Pcs integer inputs, converted via that product's own `piecesPerStrip`/`stripsPerBox`
  (`toPieces()` in `packSize.ts`) with a live "= N pieces total" readout. Backend still stores one
  plain piece count — unchanged.
- Verified: 1 Box + 3 Strip + 2 Pcs on a 10 pcs/strip, 10 strips/box product correctly totals 132
  pieces (browser-automation screenshot check).

## Verification — this batch, 2026-09-02
- Backend: direct API checks for search ranking, suggestion aggregation (correct per-value
  pharmacy counts), and piece-count math.
- Frontend: browser automation (Playwright) confirmed the Products-page dropdown pre-fill for both
  a never-stocked and a previously-stocked medicine, the POS Strip/Pcs toggle default and switch
  behavior, and the Purchases form's live total.
- Responsive: all four changed screens (Products form, Purchases form, POS cart, Dashboard) checked
  at 390px/768px/1440px — render cleanly at every size. One pre-existing pattern noted, not a new
  regression: the POS cart table needs a horizontal swipe to reach its rightmost columns at 390px,
  same `table-scroll` behavior already used by every data table in the app.
- Both workspaces (`npm run --workspace=backend build`, `npm run --workspace=frontend build`)
  typecheck/build clean.
- **Deployed 2026-09-02** to http://161.97.154.211:8085 via the usual GitHub → VPS `git pull` →
  `npm ci` → `db:migrate` → rebuild both workspaces → `pm2 restart --update-env` pipeline. Migration
  confirmed applied directly against the production DB (`\d products` shows `pieces_per_strip`/
  `strips_per_box`, both `not null default 1`).

## Second bug-fix round — done 2026-09-02
Five more issues reported right after the first batch shipped, logged as bugs #4–#8 in `Bugs.md`
and built together on "Implement":

- **#4 Product name drops strength** — `medicine_master` stores `name`/`strength` as separate
  columns (several strength variants can share one name, e.g. Napa 500mg vs Napa Extra 665mg).
  `ProductsPage.tsx`'s `pickSuggestion()` now composes `"${name} (${strength})"` when picking a
  catalog match, instead of saving the bare name. Verified: picking "Napa · 500 mg" fills the name
  field with "Napa (500 mg)".
- **#5 Mobile dropdown fade** — investigated, no code change made. Nothing in this app's CSS dims
  the page on `<select>` open; this is almost certainly the native mobile browser picker's own
  chrome (iOS wheel sheet / Android bottom sheet), which every plain `<select>` on any site does.
  Left open in `Bugs.md` pending a screenshot/recording in case it's actually something else.
- **#6 Unit field → dropdown + custom** — `ProductsPage.tsx`'s free-text Unit input replaced with a
  `<select>` (Pcs / Bottle / Box / Custom…) that reveals a required text input when Custom… is
  picked. No product-edit UI exists yet (only Add Product), so there's nothing to pre-fill on edit
  yet — noted for whenever that gets built.
- **#7 Pack-size fields reverted to free-typed** — the dropdown-only design from the
  first batch (bug #2, an explicit user choice at the time) is reversed for `piecesPerStrip`/
  `stripsPerBox` specifically: both are now plain `<input type="number" min="1">`. The
  crowd-sourcing benefit stays: live cross-pharmacy suggestions render as tappable chips below each
  input (e.g. "10 — used by 42 pharmacies") that fill the field on click, rather than being the
  only way to set a value. `packSize.ts`'s `PACK_SIZE_OPTIONS`/`packSizeDropdownOptions` (only
  needed to populate a dropdown) removed in favor of a small `sortedSuggestions()` helper.
- **#8 Auto-generated batch numbers** — `PurchasesService.create()` generates `B-YYMMDD-XXXX`
  server-side (e.g. `B-260902-K7QX`) when `batchNumber` is left blank, same charset/style as the
  existing `generatePassword()`/pharmacy-`code` helpers. A manually-typed batch number still passes
  through unchanged.

**Verified**: both workspaces typecheck/build clean; #4/#6/#7 checked via browser automation
(including a phone-width screenshot of the whole form); #8 checked via direct API calls (both the
auto-generated and manually-typed paths). Delivered to the user's local folder, committed, and
pushed — not yet deployed to the VPS as of this write-up.

## Third bug-fix round — done 2026-09-02
Four more reports (A1–A4), logged as bugs #9–#12 in `Bugs.md` and built together on "Implement".
The backbone of three of the four is one shared backend change:

**Catalog enrichment, one join serving three pages** — `ProductsService.listWithStock()` now
left-joins `medicineMaster` + `manufacturers` (same join `MedicineMasterService.search()` already
does), adding `genericName`/`form`/`manufacturerName` to every `/products` response — `null` for a
product with no catalog link. Since Products, Purchases, and Sell all already load the full
`/products` list client-side, all three pages picked up generic name and manufacturer for free with
this one backend change — no new endpoint, no per-page API call.

- **#9 Purchase Amount, not per-unit price** — `CreatePurchaseDto.purchasePrice` renamed
  `purchaseAmount` (total paid for the batch); `PurchasesService.create()` divides by qty and
  stores the per-unit cost server-side, same column/meaning as before so FIFO/profit code needed no
  changes. Frontend form: "Purchase price (per unit)" → "Purchase Amount (total paid)", with a live
  "≈ X.XX per piece" hint. Known, accepted rounding artifact: dividing an odd total by qty and
  storing at 2 decimal places can be a poisha under the typed amount — standard for retail
  software, not worth a higher-precision column unless it turns out to matter.
- **#10 Products page: search + detail** — new search box (client-side, matches name/generic/
  manufacturer); table gained Generic, Manufacturer, Pcs/Strip, and Strips/Box columns (the pack
  size was already returned, just not shown as its own column before — only baked into the "On
  hand" breakdown).
- **#11 Purchases history: search + detail** — same shape as #10, applied to the read-only history
  table (distinct from the Record Purchase form's product picker, which already had search from bug
  #3): search box + Generic/Manufacturer columns.
- **#12 Sell (POS): full detail + total price** — search suggestions and cart rows now show
  generic/manufacturer as a subtitle. `SaleItemDto.salePrice` → `saleAmount` (total for that cart
  line); `SalesService.checkout()` computes the per-line `salePrice` the same way as #9, **but**
  computes the invoice's `totalAmount` as the exact sum of the typed line amounts rather than
  `qty × rounded-per-unit` — so what the salesman types across all lines is exactly what the invoice
  says, penny for penny; only the internal per-unit cost/profit bookkeeping carries the same
  sub-cent rounding as #9. Side effect: removing the now-redundant "Line total" column (Total price
  *is* the line total) made the cart table one column narrower, which also means it no longer needs
  horizontal scroll at 390px — incidentally fixes the phone-width scroll note flagged in the
  previous round.

**Verified**: both workspaces typecheck/build clean. #9 and #12's amount→per-unit math checked via
direct API calls (#9: qty=3, amount="1000" → stored per-unit "333.33"; #12: qty=3, saleAmount="100"
→ invoice totalAmount "100.00" exactly, stored line sale_price "33.33", checked directly against the
DB). #10–#12's search/detail UI checked via browser automation (including a generic-name search
actually matching a product by brand) and 390px screenshots of all three changed pages. Delivered to
the user's local folder, committed, and pushed — not yet deployed to the VPS as of this write-up
(same as the second round above — both rounds are outstanding on the VPS as of now).

## Fourth bug-fix round — done 2026-09-02

Bugs #13 and #14. Both fully designed in Bugs.md before "Implement" was given, per the established
workflow.

- **#13 Sales history / Recent sales missing item detail, plus expanded scope** — the Dashboard's
  Recent sales widget and the dedicated Sales page both queried line items only to `count()` them;
  the actual product/qty data was fetched and discarded before reaching the response. New shared
  static helper `SalesService.fetchItemsFor(db, invoiceIds)` resolves the real `{ productName, qty
  }[]` for a batch of invoice ids in one extra query, grouped in application code — used by both
  `SalesService.list()` and `DashboardService.recentSales()` (a plain cross-service import of the
  static method, not a Nest DI dependency, so no module wiring needed).
  - When the user's answer to a scope-clarification question selected all three options (base fix +
    pagination + search/filter), the dedicated Sales page's `GET /sales` was expanded to
    **server-side** search/date-range/pagination — deliberately not the client-side "load
    everything, filter in the browser" pattern used on Products/Purchases, since those pages load a
    bounded few-hundred-row product list while sales history grows one invoice per checkout and
    could run into the thousands. `search` matches salesman name OR any line item's product name by
    resolving matching invoice ids first (two small `ilike` queries, one per join) and then filtering
    the main paginated query to those ids — same "resolve ids, then fetch real rows" shape as the
    items-array fix itself, reused rather than a new pattern. Response shape changed from a bare
    array to `{ items, total }` so the frontend can compute page count.
  - `SalesHistoryPage.tsx`: debounced search box, From/To date inputs, Prev/Next pagination with a
    "Page X of Y" indicator (page size 20, matches the backend default). The stale "Full
    revenue/profit reporting lands in the Phase 5 dashboard" subtitle (leftover from before the
    dashboard existed) was reworded to point at the Dashboard instead of promising something
    unbuilt.
  - `DashboardPage.tsx`'s Recent sales widget shows the first 2 items + "+N more" (a compact
    glance-view, not the full breakdown) and deliberately got **no** search/pagination — it already
    only ever asks for the latest 5, so it stays its own simpler query; the full Sales page is where
    a complete breakdown/search belongs.
- **#14 Sell (POS): Qty box starts blank** — `CartLine.count` changed from `number` to `string`
  (same string-typed pattern already used for `saleAmount` and the Purchases form's Box/Strip/Pcs
  fields), starting `''` instead of `1`. The old `Math.max(1, ...)` on every keystroke didn't just
  pre-fill a 1, it actively refused to go below 1 — fighting anyone trying to clear the field to
  type a fresh number. Qty input now just mirrors what's typed, with a greyed `placeholder="0"` so
  the field still reads clearly when empty; quantity is parsed as `Number(count) || 0` wherever it's
  used. Switching a line between Strip/Pcs mode also resets its count to blank now (previously reset
  to `1`), consistent with "the user always types the value." `completeSale()` gained a check
  alongside the existing missing-price one: blocks checkout with `Enter a quantity for "<product>"`
  if a line's count is blank/zero, instead of letting it reach the backend as a generic error.

**Verified**: both workspaces typecheck/build clean. Backend checked via direct API calls — search
by product name, search by salesman name, no-match search, date range in/out of the invoice's
window, and `limit`/`offset` paging all returned the expected `{ items, total }` shapes. Frontend
checked via browser automation: Sales history and Dashboard both render real item/qty text ("Napa
×20") instead of a bare count, the reworded subtitle is live, the search box filters the table, and
on the Sell page a newly-added cart line's Qty field is confirmed genuinely empty via
`inputValue()` (not just visually blank) — attempting checkout with a price but no qty is blocked
with the new error and never reaches the API, while a normal qty+price checkout still completes
exactly as before. Delivered to the user's local folder, committed, and pushed — not yet deployed to
the VPS (rounds 2 and 3 remain outstanding on the VPS too, as of this write-up).

## Fifth round — mobile "app-grade" redesign (bug #16) — done 2026-09-03

The user's feeling ("mobile isn't smooth and professional, people want luxurious design") wasn't a
reproduction step, so before proposing anything it was driven live at a 390px phone viewport via
browser automation, turning up five concrete interaction bugs plus one genuinely subjective design
gap. The subjective half was handled the same way the Phase 5 dashboard was: a 3-direction color
mockup on real content (the Sell/POS screen), grounded in retail color-psychology research, published
for sign-off *before* any component code was touched. The user picked two of the three directions to
serve as the app's **Light and Dark theme pair** rather than a single choice — Option A "Trust Teal"
as light, Option B "Midnight Premium" as dark; Option C "Warm Navy & Gold" was dropped. "Implement
now" then triggered one combined pass (the interaction fixes and the card-layout conversion touch the
same CSS as the theme system, so they weren't staged separately).

- **Design tokens** (`frontend/src/index.css`): light values on `:root`, dark values on
  `[data-theme="dark"]` (plus a `prefers-color-scheme: dark` fallback for the instant before
  JS/localStorage decides). Every token name already used app-wide (`--bg`, `--border`, `--danger`,
  `--primary`, `--primary-hover`, `--radius`, `--success`, `--surface`, `--text`, `--text-muted`,
  `--warning` — enumerated via `grep -rohE "var\(--[a-zA-Z0-9-]+" frontend/src` before touching
  anything) kept its exact name, only its per-theme value changed, so no component needed editing
  just for the color system to work. New tokens are additive: `--surface-2`, `--primary-tint`,
  `--danger-tint`, `--shadow-card`, `--shadow-cta`, `--radius-lg`, `--on-primary`, `--tooltip-bg`/
  `--tooltip-text`, and theme-aware `--badge-*` pairs. `--on-primary` in particular fixed a real
  bug-in-waiting: six spots across the app (`AppShell.tsx`'s active nav item, `PharmaciesPage.tsx`'s
  day quick-pick buttons, `SalesPOS.tsx`'s Strip/Pcs toggle, `DashboardPage.tsx`'s tooltip and 7/30-day
  toggle) hardcoded literal `'white'` text against `var(--primary)`, which would have gone illegible
  the moment dark mode's `--primary` became a bright mint instead of the old dark teal.
- **No-flash theme switching**: `frontend/src/theme.ts` (read/write/apply against `localStorage` key
  `pharmacy-erp-theme`) plus a synchronous inline `<script>` duplicated in `index.html <head>` — it has
  to run before React mounts and before the stylesheet paints, which a module can't do, so the same
  read-localStorage-or-fall-back-to-`prefers-color-scheme` logic exists in both places deliberately.
  A sun/moon toggle button (`frontend/src/components/icons.tsx`'s new `IconSun`/`IconMoon`) sits in
  both the sidebar header and the mobile topbar.
- **Tier 1 interaction fixes** (all five from the diagnosis): `input`/`select` font-size 14px→16px
  (the iOS Safari auto-zoom-on-focus bug is real and deterministic even though it can't be screenshot
  in Chromium); the hamburger drawer's close problem — the open drawer sat at a higher `z-index` than
  the topbar, so its own hamburger button was physically covered and non-functional as a toggle,
  confirmed by a failing Playwright click before the fix — solved with a dedicated close (✕) button
  rendered *inside* the drawer, shown only below the 900px breakpoint, rather than fighting the
  stacking order; real `:active` press states (scale/opacity dip) on buttons, nav links, and table
  rows; the sidebar backdrop now fades its opacity in step with the slide instead of an instant
  `display` flip; `env(safe-area-inset-*)` padding for notch/home-indicator devices.
- **Tables → mobile cards**: a pure-CSS `table.responsive` + `data-label="<Column>"` pattern — keeps
  the existing semantic `<table>` markup everywhere (no bespoke card components to write or maintain
  per page), and below 640px reflows each row into a stacked label:value card via `display:flex` +
  `content:attr(data-label)`. Applied to all seven data tables app-wide: Products, Purchases history,
  Sales history, Staff, Suppliers (main table only — its ledger side-panel already uses flex divs, not
  a table), Dashboard's Recent sales widget, and Super Admin's Pharmacies list. Desktop is completely
  unaffected by design — the CSS rule only exists inside the `max-width: 640px` media block, and this
  was explicitly verified (see below), since the user was clear desktop is fine as-is.
- **Icons**: new shared `frontend/src/components/icons.tsx` (small stroke-based inline SVGs,
  `currentColor` by default so they auto-follow theme with no extra wiring) replaced the plain ☰/✕
  text glyphs app-wide, plus a search icon added to the Sell (POS) search box to match the mockups.
- **Typography**: Plus Jakarta Sans (headings) + Manrope (body) via Google Fonts, replacing the plain
  system-font stack, loaded in `index.html`.

**Verified**: `npm run build` (tsc -b + vite build) passes with zero type errors. Browser automation
at 390×844 confirmed the full loop — theme starts on the OS default with no stored preference, the
Products table renders as headerless label:value cards with correct `data-label` text resolving via
`::before`, the hamburger opens the drawer and the new in-drawer close button actually closes it
(with the backdrop's opacity genuinely animating to `1`, not snapping), the theme toggle switches to
dark and the choice survives a full page reload, and input font-size computes to exactly `16px`. At
1440×900 the same tables render as ordinary `<table>`/`<tr>` (`display: table-header-group` /
`table-row`, confirmed via computed style, not cards) — the explicit no-regression check for "desktop
is fine as-is." Delivered to the user's local folder, committed, and pushed — not yet deployed to the
VPS (rounds 2–4 remain outstanding there too, as of this write-up).

## Sixth round — staff account management, clipboard fix, salesman's own sales (bugs #15, #17, #18) — done 2026-09-03

Three independent bugs, all designed in Bugs.md and confirmed before "Implement all of this" was
given, built together since two of them (#15, #17) touch the same `StaffPage.tsx`/`CredentialsBox`
surface.

- **#15 Staff password reset + deactivate/reactivate (not delete).** `generatePassword()` — previously
  private to `PharmaciesService` — was pulled out to a shared `backend/src/common/utils/
  generate-password.ts` the moment `UsersService` needed the identical behavior. `UsersService` gained
  `regeneratePassword()` and `setActive()`, both routed through a shared `findOwnStaff()` lookup scoped
  to the caller's own `pharmacyId` **and** `role in ('salesman', 'manager')` — the same role filter
  `listStaff()` already used — so this can never reach another pharmacy's staff or a pharmacy_admin's
  own row (there's no "staff" row for their own account, so self-lockout isn't possible through this
  route). Deactivation is deliberately not deletion: a staff member's past sales still reference their
  `userId` for "sold by"/audit purposes, so hard-deleting would either orphan that history or force a
  cascading delete of real transaction records; `AuthService.login()` already refused `active: false`
  rows, so no auth-layer change was needed for deactivation to actually block login. `StaffPage.tsx`
  gained a Status column and per-row actions, both password reset and deactivate confirming inline (no
  browser `confirm()` dialog) before the API call.
  - **Drive-by fix found during verification, not in the original report**: `listStaff()` had no `ORDER
    BY` at all. Harmless while the list was read-only, but the moment actions on this same page started
    re-fetching after a mutation, Postgres returning rows in a different order between two SELECTs
    surfaced as "the whole staff list randomly reshuffles after clicking anything." Added
    `.orderBy(users.name)` for a stable, alphabetical list.
- **#17 Clipboard copy silently failing.** Root cause: the Clipboard API only exists in a "secure
  context" (HTTPS or localhost), and this app is still deployed over plain HTTP
  (`http://161.97.154.211:8085`, no TLS — see the outstanding SSL/domain item below) — so
  `navigator.clipboard` was simply `undefined` there, and the old `copy()` showed "Copied ✓"
  unconditionally regardless of whether anything actually happened. Fixed by pulling `CredentialsBox`
  out of `PharmaciesPage.tsx` into a shared `frontend/src/components/CredentialsBox.tsx` (bug #15's
  staff-reset flow needed the identical component anyway) with an `async copy()` that tries
  `navigator.clipboard.writeText()` when `window.isSecureContext`, falling back to the older
  `document.execCommand('copy')` technique (a temporary off-screen, focused, selected `<textarea>`)
  when that's unavailable — which is what actually runs on today's HTTP deployment. The UI now reflects
  the real outcome (a genuine failure state exists) instead of always claiming success.
- **#18 Salesman had zero access to their own sales history.** `GET /sales` was, and remains,
  `pharmacy_admin`/`manager`-only — opening it to salesmen as-is would have let any one salesman see
  every other salesman's invoices and back into the pharmacy's total revenue, which is more than "let
  me check what I sold" and inconsistent with the existing "salesman never sees cost/profit" boundary
  elsewhere in the app. Instead, `SalesService.list()` gained an optional `salesmanUserId` filter that
  force-scopes the query regardless of any other filter (set only by the controller from the verified
  JWT), backing a new `GET /sales/mine` route restricted to `salesman`. Per the user's explicit choice
  ("Just Plain List"), the frontend got a deliberately stripped-down `MySalesPage.tsx` — no search box,
  no date filters, no pagination — rather than reusing `SalesHistoryPage.tsx` with role-conditional UI.

**Verified**: both workspaces build/typecheck clean. Backend checked via direct API calls for all
three: staff password regeneration invalidates the old password and the new one works; deactivate
blocks login (401) and reactivate restores it; a regenerate/deactivate call against a non-staff or
cross-tenant id 404s; two different salesman accounts each see only their own invoices via
`/sales/mine` and still get 403 from the full `/sales` history. Frontend checked via browser automation
including a real clipboard read-back (`navigator.clipboard.readText()`, not just the UI's own claim)
confirming the copied text actually matches what was shown. Delivered to the user's local folder,
committed, and pushed — not yet deployed to the VPS (rounds 2–5 remain outstanding there too, as of
this write-up).

## Next up
- **VPS deploy** is now five rounds behind `main` (bugs #4 through #18 are all built/pushed but
  unconfirmed live on http://161.97.154.211:8085) — this has been flagged repeatedly and remains true.
- **Bug #5** (mobile dropdown fade) remains open, unreproduced — needs a screenshot/recording from the
  user before it can be diagnosed further; likely just the native `<select>` picker's own OS chrome,
  not a bug in the app.
- **Off-server backups** — raised with the user, not yet decided/built (see Phase 6 above).
- **GitHub token rotation** — a fresh PAT was issued and used for both the local push and the VPS's
  `origin` remote during this batch's deploy (2026-09-02); it expires ~7 days out same as before —
  regenerate again when it does.
- **SSL/domain** — currently IP+port only (`http://161.97.154.211:8085`, no TLS). User explicitly
  deferred buying/pointing a domain; revisit nginx `server_name` + certbot once they have one.
- The UTC-day-boundary limitation on the dashboard's "today"/"yesterday" figures (see Phase 5 notes) —
  now live in production, so this is no longer a someday-fix; consider `TZ=Asia/Dhaka` on the pm2
  process or a `pharmacy.timezone` column.
- Online payment collection (SSLCommerz or similar) was discussed but explicitly deferred — billing
  stays manual for now (Super Admin activates/deactivates by hand, now with an optional auto-expiry).
- No self-service "change my own password" UI exists yet for anyone. A pharmacy admin's password
  can now be reset *for them* by the Super Admin (see "pharmacy details + password regeneration"
  above); the seeded super admin (`admin@pharmacy-erp.local`) still has no reset path at all short
  of editing the DB directly.

---
_This file mirrors the "architecture-plan.md" doc kept in the attached Claude Project (readable from any Claude session on this project). It's also placed here, at the repo root, so a future agent working directly in this folder — including one without access to the Claude Project — can read the full history and current state without needing that context passed in separately. If the two ever drift, the Claude Project doc is the one actively kept up to date turn-by-turn; re-sync this copy from there periodically._
