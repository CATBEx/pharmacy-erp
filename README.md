# Pharmacy ERP (Phases 1-3: auth, super-admin, inventory, sales/POS)

A multi-tenant SaaS ERP for retail pharmacies. See `claude/architecture-plan.md` in the
attached Claude Project for the full architecture and build roadmap.

## Stack
- Backend: Node.js + TypeScript, NestJS, Drizzle ORM, PostgreSQL
- Frontend: React + TypeScript, Vite

## What's built so far
**Phase 1**
- Multi-tenant data model (every table scoped by `pharmacy_id`)
- JWT auth with roles: `super_admin`, `pharmacy_admin`, `manager`, `salesman`
- Super-admin panel: create pharmacies (+ their first admin user), activate/deactivate subscriptions
- Pharmacy-admin panel: add staff (salesman or manager)
- Subscription gating: an inactive pharmacy's users can't log in

**Phase 2**
- Products: add per-pharmacy items, either linked to the shared medicine catalog (autocomplete) or fully custom
- Shared medicine master catalog, seeded from the Bangladesh medicine dataset (21k+ brand names) — see "Importing the medicine catalog" below
- Stock-in (purchases): admin/manager only, records qty + purchase price per batch, hidden from salesmen
- Low-stock alerts (dashboard widget + endpoint)
- Suppliers with a real ledger: running balance (purchases minus payments), full transaction history, record-payment action

**Phase 3**
- **Manager role**: added so a trusted staff member can receive stock and see cost without being able to manage other staff. Salesmen still never see cost/profit.
- **Sales/POS ("Sell" screen)**: cart-based checkout built for speed — search a product, hit Enter to add it, type the price, Enter again returns focus to search for the next item, one "Complete Sale" button finishes the whole transaction. No mouse required for a normal sale.
- Sales are recorded as **invoices with line items** (like a real till receipt) — one checkout can hold several products, not one row per item.
- **FIFO stock allocation**: a sale draws from the oldest purchase batch first; if a product was bought at different prices over time, each sale's cost is tracked against the exact batches it came from (via `sale_allocations`) — this is what will make Phase 5's profit numbers accurate instead of using a flat average cost.
- The whole checkout is one database transaction: if stock runs short partway through, nothing is saved — no half-completed sales, no oversold stock.
- Sales history page (admin/manager): recent transactions, who sold them, item count, total.

## Local setup (Windows)

### 1. Prerequisites
- [Node.js 22+](https://nodejs.org)
- PostgreSQL 16 running locally, OR Docker Desktop (then run
  `docker run --name pharmacy-erp-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16`)

### 2. Install dependencies
```
npm install
```
(this installs both `backend` and `frontend` via npm workspaces)

### 3. Configure the backend
Copy `backend/.env.example` to `backend/.env` and fill in:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pharmacy_erp
JWT_SECRET=<generate a long random string>
JWT_EXPIRES_IN=8h
PORT=3001
```
Create the database once: `createdb pharmacy_erp` (or via a Postgres GUI / `psql`).

### 4. Run migrations and seed the super admin
```
cd backend
npm run db:migrate
npm run db:seed
```
This prints the super-admin login (`admin@pharmacy-erp.local` / a generated password unless
you set `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` env vars first). **Change this password
after first login** — there's no "change password" screen yet, so for now that means updating
the `users` row directly; a proper account-settings screen is a fast-follow.

(Note: migration history was reset to a single clean file during Phase 3 since nobody had run
the earlier ones yet — if you'd already run `db:migrate` before, drop and recreate the
`pharmacy_erp` database once, then run this step again.)

### 5. Import the medicine catalog (recommended, one-time)
The `Medicine Data/` folder next to this README (manufacturer.csv, medicine.csv, etc. — the
"Assorted Medicine Dataset of Bangladesh") seeds the shared medicine catalog that every
pharmacy's product-search autocomplete draws from. From `backend/`:
```
npm run db:import-medicines
```
This is idempotent — safe to re-run any time (e.g. after downloading an updated dataset).
It only uses `manufacturer.csv` and `medicine.csv`; `generic.csv`, `dosage form.csv`,
`drug class.csv` and `indication.csv` aren't imported (medicine.csv already carries generic
name and dosage form per row) but are kept in that folder for future reference.

### 6. Configure the frontend
Copy `frontend/.env.example` to `frontend/.env` (default already points at
`http://localhost:3001/api`, which matches the backend default).

### 7. Run both apps
```
npm run dev:backend    # http://localhost:3001
npm run dev:frontend   # http://localhost:5173
```

## Roles at a glance
| Role | Sees cost/profit | Can do |
|---|---|---|
| Super Admin | — | Onboard pharmacies, manage subscriptions |
| Pharmacy Admin | Yes | Everything within their pharmacy: staff, products, stock-in, suppliers, sell, view sales |
| Manager | Yes | Products, stock-in, suppliers, view sales — cannot manage staff, cannot sell |
| Salesman | No | Sell only (the "Sell" screen) |

## Project layout
```
backend/
  src/
    db/           Drizzle schema, client, migrations, seed + medicine-catalog import scripts
    auth/         JWT login, roles guard, tenant-scoping guard
    pharmacies/   Super-admin: onboard pharmacies, toggle subscriptions
    users/        Pharmacy-admin: manage staff (salesman or manager)
    suppliers/    Suppliers + ledger (balance, payments, transaction history)
    products/     Per-pharmacy inventory items, low-stock alerts
    purchases/    Stock-in (admin/manager, records cost)
    medicine-master/  Read-only search over the shared medicine catalog
    sales/        POS checkout (FIFO stock allocation) + sales history
frontend/
  src/
    auth/         Auth context, protected routes
    pages/        Login, super-admin, pharmacy-admin/manager (dashboard, products, stock-in,
                   suppliers, sales history, staff), salesman POS screen
```

## Next phases
1. ~~Auth + super-admin panel~~ (done)
2. ~~Inventory: products, stock-in, low-stock alerts, medicine catalog~~ (done)
3. ~~Sales/POS: cart-based checkout, FIFO stock allocation, manager role~~ (done)
4. ~~Supplier ledger~~ (done, folded into Phase 2)
5. Dashboard: real-time cash flow, inventory value, daily revenue/profit, 7/30-day trends
6. VPS deployment
