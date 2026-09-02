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
- **Known gap, not yet built**: `subscription_expiry` is stored but nothing automatically deactivates a pharmacy once it passes — still a fully manual Super Admin action. Not addressed yet (came up in the subscription discussion but no decision was made to build it).

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
6. VPS deployment — NEXT UP

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

## Next up
Phase 6: VPS deployment — now unblocked (responsive work above was the explicit blocker). Still need
from the user before starting:
- **Domain/subdomain** to host the app under (drives the nginx `server_name` + SSL cert).
- **How code reaches the VPS** — set up a git repo (recommended: enables `git pull` for future
  updates) vs. manual transfer (e.g. WinSCP/scp from the Windows machine).

Once started: create a dedicated Postgres role + database (`pharmacy_erp` / `pharmacy_erp_db`,
matching the `onebilling`/`paybsc` convention already on the VPS — self-hosted Postgres was the
decision, not a managed/free-tier platform, and not SQLite — see below); never touch/restart any of
the VPS's existing pm2 processes (especially `gma-vault1`, `gma-vault3`, `gma-bridge` — unrelated
crypto/financial services already running there); set up automated **off-server** database backups
as a non-negotiable part of the deployment (no backup solution exists yet, self-hosted or not).

**Hosting/DB decisions already made** (VPS: `root@vmi3381718`, Node v22.23.1/npm 10.9.8, Postgres
already installed, nginx manages 9 other vhosts, 28GB/72GB disk free, ~5.7GB/7.8GB RAM free, 0B
swap):
- Self-hosted Postgres on the VPS, not a managed/free-tier DB platform — zero extra cost, matches the
  VPS's established per-app role/DB pattern, lower latency than a remote free-tier region, portable
  later via plain Postgres/Drizzle if ever needed. Real gap: no automated backups exist yet (see above).
- Postgres over SQLite, firmly — the built FIFO checkout (`sales.service.ts`) depends on
  `SELECT ... FOR UPDATE` row-level locking inside a transaction to stop two concurrent sales from
  double-allocating the same stock batch; SQLite only locks the whole database file, not individual
  rows, so it can't safely provide this guarantee. Also matches the original "shared DB, tenant-isolated
  rows" multi-tenancy decision from project start.

Also worth raising with the user before go-live:
- The UTC-day-boundary limitation on the dashboard's "today"/"yesterday" figures (see Phase 5 notes).
- `subscription_expiry` still isn't auto-enforced (see "Subscription & onboarding model" above) — purely manual today.
- Online payment collection (SSLCommerz or similar) was discussed but explicitly deferred — billing stays manual for now.

The user has not yet confirmed running any of this locally on their own machine end-to-end (npm install, migrations, seeding, `npm run dev`) — everything so far has been built and verified in the cloud build sandbox's throwaway database, then delivered as source.

---
_This file mirrors the "architecture-plan.md" doc kept in the attached Claude Project (readable from any Claude session on this project). It's also placed here, at the repo root, so a future agent working directly in this folder — including one without access to the Claude Project — can read the full history and current state without needing that context passed in separately. If the two ever drift, the Claude Project doc is the one actively kept up to date turn-by-turn; re-sync this copy from there periodically._
