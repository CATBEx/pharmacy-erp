# Bugs

Tracking list of bugs reported by the user, one at a time. Each entry gets a status
so we can work through them together and see what's left.

Status legend: 🔴 Open · 🟡 In progress · 🟢 Fixed (pending deploy) · ✅ Deployed & verified

---

## 1. ✅ Medicine search doesn't rank results — substring matches beat the real match

**Reported:** searching "Napa" in the Add Product medicine search returns "Lonapam" (all 3
strengths) before "Napa" itself.

**Root cause:** `MedicineMasterService.search()` (`backend/src/medicine-master/medicine-master.service.ts`)
filters with `WHERE name ILIKE '%query%'` but has no `ORDER BY` at all. "Lonapam" contains "napa"
as a substring (Lo**napa**m), so it passes the same filter as "Napa" — with no ranking, Postgres
returns rows in whatever order is cheapest for it, not by relevance.

**Fix — applied:** added a relevance `ORDER BY`: exact match first, then names that *start
with* the query, then names where the query starts a word within the name, then everything else
(mid-word matches like "Lonapam") last — alphabetical as the tiebreaker within each tier. Filter
stays the same (`ILIKE '%query%'`), only the ordering changes.

**Verified:** searching "Napa" now returns all Napa* variants before Lonapam/Tenapam (checked via
direct API call). **Deployed 2026-09-02** to http://161.97.154.211:8085.

---

## 2. ✅ No pack/piece conversion — salesman always has to type quantity in individual pieces

**Reported:** medicine is usually sold by the pack (strip/box) and sometimes as single pieces;
typing everything in pcs every time isn't efficient. Needs to know how many pieces are in one
pack per medicine.

**Root cause:** `products.unit` is currently just a free-text label ("pcs", "box", "bottle") with
no actual conversion factor. Every quantity in the system — purchase qty, stock on hand
(`qtyRemaining`), and sale qty — is tracked as one plain number of pieces, so there's no way today
to say "1 strip = 10 tablets" and let staff enter packs instead of pieces.

**Proposed fix (not yet applied):**
1. Add a **pieces-per-pack** field to each product (default 1, for loose/unpacked items). Set by
   the pharmacy admin when creating/editing a product.
2. On the **Sell (POS)** screen: a product with pack size > 1 gets a **Pack / Piece** toggle next
   to its quantity field. Entering "2" in Pack mode adds 20 pcs to the cart (shown as "2 packs
   (20 pcs)"); Piece mode behaves exactly as it does today.
3. Stock stays tracked in pieces underneath — no change to purchases, FIFO cost allocation, or
   reporting. This is a data-entry convenience layered on top, not a data-model change to how
   stock is counted.

**Open question for the build:** should the same Pack/Piece toggle also apply to stock-in
(Purchases), or just Sell? Leaning toward yes for consistency — confirm before building.

**Checked 2026-09-02: does the medicine CSV/dataset have real pack-size data?** Inspected the
actual `medicine.csv` on the user's machine — it does have a `package container` / `Package Size`
column, but it's not usable as a pack-size source:
- It's the **manufacturer's wholesale carton size**, not the retail strip size a pharmacy sells —
  e.g. Napa 500mg shows `(510's pack: ৳ 612.00)`, Ace 500mg shows `(500's pack: ৳ 400.00)`. Auto-filling
  from this would set Napa's pack size to 510 instead of the real 10-tablet strip, which is worse
  than leaving it blank.
- Free-text, inconsistent format across dosage forms (tablets: "N's pack", liquids: "N ml bottle",
  injectables: per-vial) and carries stale scraped pricing alongside the count.
- **Conclusion**: pack size has to be set by the pharmacy admin per product (as planned above) —
  there's no reliable way to derive it from the imported catalog.

**Checked 2026-09-02: is there a better live source?** medex.com.bd's actual product pages (the
same site the CSV was scraped from) show a cleaner breakdown than the static CSV — e.g. Napa
500mg's live page reads "Unit Price: ৳1.20 (**51 x 10**: ৳612.00)", i.e. 51 strips × 10
tablets/strip = the 510 the CSV flattened into one number. ePharma.com.bd shows the same thing as
two separate listings ("10pcs" strip vs "510pcs" box). So the real strip size does exist online —
but only live, one product page at a time, with no bulk export/API on either site. Bulk-scraping
~21,264 pages to backfill the whole catalog would be slow, fragile (no bulk endpoint, easy to get
rate-limited), and still needs per-dosage-form logic (liquids/injectables don't have "strips" at
all).

**Recommendation**: skip building a scraper. A pharmacy only stocks a few hundred of the 21k
catalog products, so having the admin set pack size once per product *they* add (bug #2's original
plan) is small, always accurate for what they actually sell, and needs no scraping
infrastructure.

**Also checked 2026-09-02: DGHS "Shared Health Record" Medication API** (Bangladesh government,
`en.info.shr.dghs.gov.bd`) — user suggested this as an alternative. Ruled out: it's a *clinical
terminology* lookup (drug name → ATC code + dose form, for identifying medications consistently in
patient records/e-prescriptions), not a retail/commercial catalog — its `Medication` resource has
no pack-size, strip-size, or pricing field at all. Access also requires Basic Auth credentials
obtained directly from DGHS (no public self-serve signup), gated toward registered health
facilities/EHR vendors.

**Also checked 2026-09-02: Hugging Face "Mahadih534/all-Bangladeshi-medicines" dataset** — same
underlying medex.com.bd scrape as the Kaggle CSV already imported (identical columns/row count/
`package container` values, e.g. "(100's pack: ৳ 598.00)"), just mirrored to a different hosting
platform. Same wholesale-carton-size limitation as the original CSV — adds nothing new.

**Conclusion after checking 4 sources (Kaggle CSV, medex.com.bd live, DGHS Medication API,
Hugging Face mirror)**: no bulk, reliable retail-pack-size dataset for Bangladesh medicines exists
publicly. Settled plan: pharmacy admin sets pack size once per product when they add it to their
own inventory — see the build plan above.

**CONFIRMED by user 2026-09-02**: whoever adds/edits the product on the Products page sets the
pieces-per-pack field — that's both **Pharmacy Admin** and **Manager** (both already have Products
page access in this app; Manager just can't touch staff or the till), not Admin-only. Plan locked
in, ready to build.

**UI decision 2026-09-02**: user wants no free-typing for the pack-size field — a dropdown only.
Proposed, awaiting confirmation:
- **Product form** — "Sold in packs of" **dropdown** (no typing): 1 (single pieces) · 2 · 4 · 5 ·
  6 · 8 · 10 · 12 · 14 · 15 · 20 · 24 · 25 · 30 · 50 · 100. Defaults to 1, so anything sold loose
  (syrups, bottles, vials) needs no change — admin only touches it for strip-packed items.
- **POS Sell screen** — Pack/Piece is a 2-option toggle (no typing either way), but *how many*
  packs/pieces to sell per sale stays a typed number field, same as every other quantity field in
  the app — sale quantities are open-ended (could be 3 or 37) so a fixed dropdown can't cover it.

**User follow-up 2026-09-02**: felt select-per-pharmacy is still "slightly harder for all" and
proposed scraping medex.com.bd to build our own complete pack-size datasheet once, citing a
Facebook dev thread where others discussed scraping it. **Checked the thread the user linked**:
the original poster in it says outright *"I attempted scraping using GitHub repositories, but
Cloudflare's human verification blocked all attempts"* — medex.com.bd is actively defended against
bots (confirmed independently, not just their claim). The thread's suggested workarounds are paid
third-party Cloudflare-bypass scraping services — ongoing cost, fragile (breaks on site changes),
and legally shakier than anything else in this app (systematically extracting a third party's
proprietary database at scale for a commercial product).

**Proposed alternative (avoids scraping entirely)**: move the pieces-per-pack field onto the
**shared `medicine_master` catalog** (already shared across every pharmacy on the platform)
instead of the per-pharmacy `products` table. Whichever pharmacy is first to add a given medicine
sets its pack size once (via the dropdown); every pharmacy after that — including future signups —
sees it pre-filled automatically, no re-entry. Same "set it once for everyone" benefit the user
wants, sourced from real pharmacy staff instead of scraping a site that's actively blocking that.

**User concern 2026-09-02**: what if the first pharmacy to add a medicine picks the wrong pack
size by mistake — does that bad value now propagate to every pharmacy after them?

**Design to make it self-correcting (two-level value, not single-source-of-truth)**:
- `medicine_master.suggestedPiecesPerPack` — a shared, platform-wide **suggestion only**, used to
  pre-fill the dropdown when a pharmacy adds that medicine.
- `products.piecesPerPack` (per-pharmacy, already the existing plan) — the **actual value** that
  pharmacy's own stock/sales math uses. Pre-filled from the shared suggestion but always a normal
  editable dropdown selection, never locked.
- Whenever any pharmacy sets/changes their own product's value, it **also overwrites the shared
  suggestion** — so it's "whoever touched it most recently," not "whoever set it first, forever."
- Net effect: a mistake can affect the *default the next pharmacy sees*, but never silently
  corrupts any pharmacy's own already-saved data (each pharmacy's own value is independent once
  set), and it self-heals the moment any one pharmacy notices and corrects it.

**User's refined design 2026-09-02 (final — supersedes the "last write wins" idea above)**:
- Every pharmacy still sees/uses their **own** dataset (`products.piecesPerPack`) for their own
  stock — unaffected by anyone else.
- If a pharmacy hasn't set a value for a given medicine yet, they get a **suggested number from
  the shared dataset**.
- The shared dataset isn't a single value — it **records every unique number reported and how many
  pharmacies chose each one** (e.g. 10 pharmacies → 5 pcs, 1 pharmacy → 4 pcs — show both, not just
  the majority).

**How this gets built — no new table needed.** Computed live from data that already exists, same
"computed, not stored" principle already used for stock-on-hand/supplier balances elsewhere in
this app:
- `products.piecesPerPack` stays exactly as planned — each pharmacy's own real, independent value.
- New query (not a stored aggregate): for a given medicine, `SELECT piecesPerPack, COUNT(DISTINCT
  pharmacyId) FROM products WHERE medicineMasterId = X GROUP BY piecesPerPack ORDER BY count DESC`
  — this is safe to compute across all pharmacies (just a count + a number, no pharmacy identity or
  business data exposed), matching how `medicine_master` is already a shared, platform-wide table.
- When a pharmacy adds a medicine they haven't stocked before, the dropdown shows those
  crowd-reported values first, each labeled with its pharmacy count (e.g. "5 pcs — used by 10
  pharmacies"), then the rest of the standard list below for anything not yet reported by anyone.
  Nobody has stocked it yet anywhere → plain standard list, no counts, same as before.
- Self-correcting by construction: a wrong minority value never hides or overwrites the correct
  majority one, it just shows up honestly as its own low-count option.

**User decision 2026-09-02: 3 packaging levels, not 2** — Piece → Strip → Box, matching the real
wholesale/retail hierarchy seen on medex.com.bd (e.g. Napa: 1 box = 51 strips = 510 tablets).
Supersedes the earlier single `piecesPerPack` field.

**Final schema (`products` table)**:
- `piecesPerStrip` (int, default 1) — individual pieces in one strip
- `stripsPerBox` (int, default 1) — strips in one box/carton

**Where each level applies**:
- **Sell (POS)**: Piece / Strip toggle only — boxes aren't sold to a walk-in customer, so this
  matches the original ask exactly (salesman picks Piece or Strip, types the count).
- **Purchases (stock-in)**: Piece / Strip / **Box** toggle — this is where the 3rd level earns its
  keep: the pharmacy buys wholesale in boxes from a supplier, so entering "3 boxes" and having it
  auto-convert to the right piece count (3 × stripsPerBox × piecesPerStrip) saves the same kind of
  manual math the original bug was about, on the purchasing side.
- **Product form**: two dropdowns — "Pieces per strip" and "Strips per box" — each defaulting to
  1, each independently pre-filled from the crowd-sourced shared data design above (its own count
  per field, e.g. "10 pcs/strip — used by 42 pharmacies" and "51 strips/box — used by 12
  pharmacies"). The live cross-pharmacy suggestion query runs separately for each field.

**LOCKED IN — ready to build.**

**Built — applied:**
- `products.piecesPerStrip` / `products.stripsPerBox` columns added (migration
  `0001_add_product_pack_sizes.sql`), both default 1.
- `GET /products/pack-size-suggestions?medicineMasterId=X` — live cross-pharmacy query, most-used
  value first, each with its pharmacy count. No new table — computed on demand.
- **Product form**: two dropdown-only fields ("Pieces per strip", "Strips per box"), pre-filled
  from the crowd suggestion the moment a catalog match is picked, curated fallback list
  (1,2,4,5,6,8,10,12,14,15,20,24,25,30,40,50,60,100) when nothing's been reported yet.
- **Sell (POS)**: Strip/Pcs toggle per cart line, defaults to Strip when a product has
  `piecesPerStrip > 1`, shows a "= N pcs" caption. `salePrice` semantics unchanged (still
  price-per-piece) — only entry, not pricing, changed.
- **Purchases**: see bug #3 below (built together).

**Verified:**
- Backend: suggestion aggregation returns correct per-value pharmacy counts; piece-count math
  checked via direct API calls.
- Products page: dropdown pre-fill confirmed for both a never-before-stocked medicine (plain
  curated list) and one with prior data (crowd-labeled suggestions), via browser automation
  including a network-response-level check.
- POS: adding a strip-packed product defaults to Strip mode with correct "= 10 pcs" caption;
  switching to Pcs mode updates correctly (browser automation).
- Responsive: Product form dropdowns and POS Strip/Pcs toggle checked at 390px/768px/1440px — all
  render cleanly. (POS cart table needs a horizontal swipe to reach the Line Total/remove-button
  columns at 390px — pre-existing `table-scroll` pattern already used elsewhere in the app, not a
  new regression; noted for future polish, not blocking.)

**Deployed 2026-09-02** to http://161.97.154.211:8085 — migration applied, `pieces_per_strip`/
`strips_per_box` columns confirmed live in production via `\d products`.

---

## 3. ✅ Purchases (stock-in) form: no product search, and quantity is a single plain number

**Reported:** the "Record Purchase" form's Product field is a plain dropdown with no way to
search, and Quantity is one input box — should instead be 3 separate integer boxes (Box / Strip /
Pcs) that combine, e.g. "2 Box + 5 Strip" or "2 Strip + 5 Pcs".

**Confirmed in code** (`frontend/src/pages/pharmacyadmin/PurchasesPage.tsx`): Product is a plain
`<select>` populated from the full `products` list with no filtering — unusable once a pharmacy has
more than a screenful of products. Quantity is a single `<input type="number">`.

**Fix (depends on bug #2's schema — not yet applied)**:
1. **Product picker**: replace the `<select>` with the same search-as-you-type pattern already
   used on the Sell (POS) screen — the pharmacy's product list is already loaded on this page, so
   it's a client-side filter, no new backend call.
2. **Box / Strip / Pcs inputs**: three integer boxes shown together, freely combinable. Once a
   product is selected, convert using *that product's own* `piecesPerStrip`/`stripsPerBox` (bug
   #2): total pieces = (Box × stripsPerBox × piecesPerStrip) + (Strip × piecesPerStrip) + Pcs —
   shown live as "= N pieces total" so the exact amount being recorded is never a guess. Backend
   still stores one plain piece count, unchanged.

**Build order**: bug #2 first (adds `piecesPerStrip`/`stripsPerBox` to products), then this one on
top of it.

**User addition 2026-09-02: stock displays should show Box/Strip/Pcs too, not a raw piece count.**
Confirmed in code — `ProductsPage.tsx`'s "On hand" column currently renders the plain
`qtyOnHand` number with no breakdown.

**Fix**: format stock as Box / Strip / Pcs using that product's own `piecesPerStrip`/
`stripsPerBox`, **omitting any zero-value unit** — e.g. 205 pieces (10/strip, 10 strips/box) shows
as "2 Box, 1 Strip, 5 Pcs"; exactly 200 pieces shows as "2 Box" (not "2 Box, 0 Strip, 0 Pcs"). A
product with no pack tracking set (`piecesPerStrip`/`stripsPerBox` both left at 1 — syrups,
bottles) just shows the plain number as it does today, since a breakdown would be meaningless.
Applies to: Products page "On hand" column, and the Dashboard low-stock list (same kind of raw
stock figure).

**Built — applied:**
- `frontend/src/utils/packSize.ts` — shared `formatStock()` helper (Box/Strip/Pcs breakdown,
  omitting zero-value units) and `toPieces()` conversion, used across all four screens below.
- **Purchases form**: `<select>` replaced with a client-side search-as-you-type product picker
  (mirrors the existing POS/Products search pattern); single Quantity field replaced with three
  combinable Box/Strip/Pcs integer inputs plus a live "= N pieces total" readout; purchase history
  table's Qty column now shows the Box/Strip/Pcs breakdown too.
- **Stock displays**: Products page "On hand" column, Dashboard low-stock list, POS search-result
  stock figures, and Purchases history all use `formatStock()`.

**Verified:**
- Purchases: 1 Box + 3 Strip + 2 Pcs on a 10 pcs/strip, 10 strips/box product correctly computes
  132 pieces (browser automation, screenshot-checked math).
- Stock formatting: Products page "On hand" shows "2 Box, 5 Strip" for 250 pieces at that same pack
  size; other screens spot-checked the same way.
- Responsive: Purchases form (search picker + Box/Strip/Pcs inputs, both empty and filled states)
  and Products/Dashboard stock displays checked at 390px/768px/1440px — all render cleanly, no
  overlap or cut-off content.

**Deployed 2026-09-02** to http://161.97.154.211:8085.

---

## 4. 🟢 Product name doesn't include strength — "Napa" instead of "Napa (500mg)"

**Reported:** after adding a product from the catalog search, the Products list shows just "Napa",
not "Napa (500mg)".

**Root cause:** `medicine_master` stores `name` and `strength` as separate columns (its unique
index is on `name + strength + manufacturerId`, precisely *because* the same name can have several
strength variants — e.g. Napa 500mg, Napa Extra 665mg, Napa syrup all share `name = "Napa"`).
`ProductsPage.tsx`'s `pickSuggestion()` does `setName(hit.name)` — only the bare name, dropping
`hit.strength` on the floor. The suggestion dropdown itself already shows strength (in the muted
line under each result), so the data is right there; it just isn't carried into the saved product
name.

**Fix (not yet applied):** when a catalog suggestion is picked, compose the name as `${hit.name}
(${hit.strength})` when `strength` is set, else just `hit.name` (some entries — syrups, some
devices — have no strength value). This only changes what gets pre-filled into the editable name
field, so the admin can still hand-edit it before saving if they want something different.

**Built & verified:** `pickSuggestion()` now sets the name to `"${hit.name} (${hit.strength})"`
when a strength is present. Confirmed via browser automation: picking "Napa · 500 mg" from the
catalog fills the name field with "Napa (500 mg)".

---

## 5. 🔴 Dropdown fade on mobile — opening a `<select>` slightly dims the screen

**Reported:** opening a dropdown on mobile makes the screen fade out slightly.

**Diagnosis (needs confirmation before treating as a real bug):** nothing in this app's CSS dims
or overlays the page when a `<select>` opens — no backdrop, no opacity transition tied to focus
(checked `index.css`; the only dimming/backdrop in the app is `.sidebar-backdrop`, which only
appears behind the mobile nav drawer, unrelated to form dropdowns). A native `<select>` on mobile
Safari/Chrome opens the OS's own picker UI (an iOS wheel sheet, an Android bottom sheet) and *that
native picker* dims the page behind it — that's the browser's own chrome, not something a web
page's CSS controls.

**If that's what's being seen**, it's expected native behavior, not a bug in this app — every
plain `<select>` on any site does this. **If it looks different from that** (e.g. dimming that
lingers after closing the dropdown, or shows on a custom in-app dropdown like the medicine-search
suggestions rather than a native `<select>`), that would be a real, fixable bug — but needs a
screenshot or screen recording to pin down which dropdown and what exactly happens, since I
couldn't reproduce anything unusual from the code. Fixing "make it never dim" for a *native*
`<select>` would mean replacing every plain dropdown in the app with a fully custom-built one (like
the search-suggestion pattern already used elsewhere) — a real scope increase, only worth doing
once we know that's actually what's wanted.

**No code change made this round** — there's nothing in this app to fix if it's the native picker
(every plain `<select>` everywhere does the same thing), and guessing at a different cause without
being able to reproduce it risks changing something unrelated. Still open pending a screenshot/
recording, or confirmation that it's just the native picker and not something to chase further.

---

## 6. 🟢 "Unit" field on Add Product should be a dropdown (Pcs/Bottle/Box) with a custom option

**Reported:** the Unit box should be a dropdown with Pcs/Bottle/Box choices, plus the ability to
type a custom value.

**Confirmed in code** (`ProductsPage.tsx`): `unit` is currently a free-text `<input>` with a
placeholder hint ("pcs, box, bottle…") — nothing stops typos or inconsistent casing ("Pcs" vs
"pcs" vs "PCS") across products, which matters since `unit` is just a display label shown next to
every quantity.

**Fix (not yet applied):** replace the input with a `<select>` — Pcs / Bottle / Box / **Custom…** —
where picking "Custom…" reveals a text input right below it for anything not in the list (vials,
tubes, sachets, etc.), same reveal-on-demand pattern as elsewhere in the app. (There's no product
*edit* UI yet — only Add Product — so the "pre-fill Custom… on edit" concern doesn't apply to
anything built today; worth remembering if/when an edit form gets built.)

**Built & verified:** `<select>` with Pcs / Bottle / Box / Custom…; picking Custom… reveals a
required free-text input right below it. Confirmed via browser automation (options list matches,
input appears and accepts text) and a phone-width (390px) screenshot — full-width, no overlap.

---

## 7. 🟢 "Pieces per strip" / "Strips per box" should be free-typed, not dropdown-only

**Reported:** these two fields shouldn't be dropdowns — the user wants to type the number by hand.

**Context — this reverses part of bug #2's original design.** The dropdown-only rule was the
user's own explicit call at the time ("I don't want the user will type anything, I want the User
will select By Dropdown") specifically so a typo couldn't corrupt the shared crowd-sourced
suggestion data. This new ask supersedes that for these two fields specifically.

**Fix (not yet applied):** swap both `<select>` fields for plain `<input type="number" min="1">`,
free-typed. To not throw away the crowd-sourcing benefit (bug #2's whole point — most pharmacies
shouldn't have to know the strip size at all), keep showing the live cross-pharmacy suggestions as
clickable **chips** below each input instead of as the only way to set the value — e.g. "10 (used
by 42 pharmacies)" / "8 (used by 3 pharmacies)" as tappable pills that fill the field, alongside
free typing. Best of both: a pharmacy that already knows a shared value taps it in one touch, and
nobody is ever blocked from entering an uncommon one by hand. Since it's now a plain number input,
there's no need for the curated fallback list (1,2,4,5,6,8,10,12,14,15,20,24,25,30,40,50,60,100)
either — that was only there to populate a dropdown with *something* when no pharmacy had reported
a value yet; a bare number field doesn't need it.

**Built & verified:** both fields are now `<input type="number" min="1">`, still pre-filled from
the top live suggestion when a catalog match is picked, with every reported value shown as a
tappable chip below (e.g. "10 — used by 1 pharmacy") that fills the input on click. Removed
`PACK_SIZE_OPTIONS`/`packSizeDropdownOptions` from `packSize.ts` (no longer needed) in favor of a
small `sortedSuggestions()` helper. Confirmed via browser automation: chips render with real
cross-pharmacy data, tapping one fills the field, and it still renders cleanly at 390px.

---

## 8. 🟢 Purchases: Batch number should auto-generate if left blank

**Reported:** on Add Stock, the batch number should auto-generate if the user doesn't type one.

**Confirmed in code** (`backend/src/purchases/purchases.service.ts`): `batchNumber` is passed
straight through from the DTO with no fallback — an omitted batch number is just stored as
`null`/empty.

**Fix (not yet applied):** generate one server-side when `dto.batchNumber` is empty, in
`PurchasesService.create()` — same idea as the existing `generatePassword()`/pharmacy-`code`
helpers in `pharmacies.service.ts` (small, self-contained, no new dependency). Proposed format:
`B-YYMMDD-XXXX` (today's date + a 4-character random suffix from the same ambiguity-free charset
already used for generated passwords, e.g. `B-260902-K7QX`) — human-scannable on a printed
label, sorts roughly chronologically, and never collides with a batch number the pharmacy typed by
hand (their own batch numbers won't happen to start with `B-YYMMDD-` from today unless they copy
the format themselves, which is fine). The frontend's Purchases form keeps the Batch number field
optional exactly as it is now — no UI change needed there, just don't force the user to fill it in.

**Built & verified:** `PurchasesService.create()` generates `B-YYMMDD-XXXX` server-side when
`batchNumber` is blank. Confirmed via direct API calls: an omitted batch number comes back as
`"B-260902-NMPD"`-style; a manually-supplied one (`"MY-CUSTOM-123"`) passes through unchanged.

---

## 9. 🟢 Purchases: enter total amount paid, not per-unit price

**Reported:** the "Purchase price (per unit)" field should instead be "Purchase Amount" — the
total paid for the whole batch — with the backend working out the per-unit cost.

**Confirmed in code**: `CreatePurchaseDto.purchasePrice` is per-unit (`numeric(12,2)`, comment says
"per unit"), and `PurchasesPage.tsx`'s form collects it directly that way. Makes sense as the
*stored* value (FIFO cost allocation and dashboard profit math both key off "cost per unit of this
batch"), but it's the wrong thing to make the pharmacy admin do the dividing for — if 3 boxes of
something cost ৳1,500 total, they shouldn't have to first work out ৳/piece by hand.

**Fix (not yet applied):**
- Frontend: replace "Purchase price (per unit)" with **"Purchase Amount"** (what was actually
  paid, total).
- Backend (`PurchasesService.create()`): compute `purchasePrice = (amount / qty).toFixed(2)`
  server-side (never trust client-computed math, same principle used for subscription-expiry dates
  elsewhere) and store that, same as today — no schema change, `purchases.purchasePrice` keeps
  meaning exactly what it always has, so FIFO/profit code downstream needs zero changes.
- DTO: rename `purchasePrice` → `purchaseAmount` on `CreatePurchaseDto` (total, still a validated
  numeric string).

**Honest caveat — worth knowing before this ships:** dividing a total by an odd quantity can leave
a remainder (e.g. ৳1,000 ÷ 3 pcs = ৳333.333...). Stored per-unit is rounded to 2 decimal places
(৳333.33), so recomputing qty × stored-per-unit lands 1 poisha under what was actually paid. That's
inherent to storing a per-unit cost at 2 decimal places at all — not something this change
introduces, but worth flagging since it'll be a little more *visible* now that "the total" is what
the admin actually typed. In practice this is a sub-cent rounding artifact per batch, standard in
retail software, and not worth a bigger schema change (e.g. a higher-precision column) unless it
turns out to matter in practice.

**Built & verified:** `CreatePurchaseDto.purchaseAmount` (total), `PurchasesService.create()`
computes `purchasePrice = (Number(amount) / qty).toFixed(2)` before storing. Confirmed via direct
API call: qty=3, amount="1000" → stored per-unit `333.33`. Frontend form now shows "Purchase
Amount (total paid)" with a live "≈ X.XX per piece" hint underneath.

---

## 10. 🟢 Products page needs a search box and more catalog detail per row

**Reported:** the Products list should have a search box, and show Brand/Generic/Pharma
(manufacturer) plus Strip-per-box/Pcs-per-strip per row — "what do you think?"

**Confirmed in code**: `ProductsPage.tsx`'s table has no search/filter at all (just lists every
product, unusable once a pharmacy has more than a screenful — the same class of problem bug #3
already fixed for the Purchases product picker). `ProductsService.listWithStock()` also doesn't
join `medicine_master`/`manufacturers`, so generic name/manufacturer aren't even in the API
response yet, even though every catalog-linked product already has a `medicineMasterId` pointing
at that data — and `piecesPerStrip`/`stripsPerBox` ARE already returned, just not shown as their
own columns in the table (only baked into the "On hand" breakdown).

**My take, since you asked**: yes, worth doing — a pharmacy stocking a few hundred SKUs needs to
find one fast, and generic name matters for that in practice (staff often know "paracetamol" before
they know which of the 5 brands of it they carry). I'd scope it as:

**Fix (not yet applied):**
- `ProductsService.listWithStock()`: left-join `medicineMaster` + `manufacturers` (same join
  `MedicineMasterService.search()` already does), add `genericName`/`form`/`manufacturerName` to
  the response — `null` for a product not linked to the catalog (typed in fresh, no `medicineMasterId`).
  This is the shared groundwork bug #11 (Purchases history) also needs, so it's one backend change
  serving both.
- `ProductsPage.tsx`: add a search input above the table, client-side filtering across name **and**
  the new generic/manufacturer fields (list is already loaded in full; no new endpoint needed, same
  pattern as the Purchases/POS product pickers).
- Table gains **Generic** and **Manufacturer** columns; **Pcs/Strip** and **Strips/Box** shown as
  their own columns too (currently only visible baked into "On hand"'s breakdown, not as the
  product's actual configured pack size). Table's already wrapped in `.table-scroll`, so more
  columns just means more horizontal scroll on a phone — consistent with how every other data table
  in the app already handles width.

**Open question**: "etc" in the report — anything else you want on this row (e.g. Form/dosage type,
already available from the same join) or is Generic + Manufacturer + pack size the right set?

**Built & verified:** `listWithStock()` left-joins `medicineMaster`/`manufacturers`, returning
`genericName`/`form`/`manufacturerName` (every page loading `/products` gets this automatically —
Products, Purchases, Sell). Products page gained a search box (filters name/generic/manufacturer)
and Generic/Manufacturer/Pcs-per-Strip/Strips-per-Box columns. Confirmed via browser automation:
searching "Paracetamol" (a generic name, not a product name) correctly matches Napa; a no-match
query shows the right empty state; renders cleanly at 390px (table scrolls horizontally, same
established pattern as every other data table).

---

## 11. 🟢 Purchases history also needs a search box and more detail

**Reported:** the Purchases (stock-in) history table should also show more detail and have a
search box.

**Confirmed in code**: `PurchasesPage.tsx`'s history table (Product/Qty/Unit price/Batch/Date) has
no search/filter — note this is different from the *Record Purchase* form's product picker (bug #3
already added search there); this is about the read-only history list below it, which has none.

**Fix (not yet applied)**, building on bug #10's backend groundwork (enriched `/products` response
— `PurchasesPage.tsx` already loads the full product list, so no new API call needed):
- Add a search input above the history table, filtering by matching the query against each
  purchase's linked product's name/generic/manufacturer (via the existing `productById()` lookup).
- Add **Generic** and **Manufacturer** columns to the history table alongside the existing
  Product/Qty/Unit price/Batch/Date, using the same enriched product data.

**Built & verified:** search box added above the history table, filtering via the existing
`productById()` lookup against name/generic/manufacturer; Generic/Manufacturer columns added.
Confirmed present via browser automation and the 390px screenshot (table scrolls horizontally,
same as every other data table).

---

## 12. 🟢 Sell (POS): show full product detail, and take total price instead of per-unit

**Reported:** two asks — (1) the Sales page should include all details [of the product being sold],
and (2) the salesman should type the **total price** for that line item, not a per-unit price.

**Part 1 — product detail.** `SalesPOS.tsx`'s search-suggestion dropdown currently shows only the
product name and stock-left; the cart line shows only the name. Same fix as bug #10: once
`/products` returns generic/manufacturer, show them as a muted subtitle under the product name in
both the search suggestions and each cart row (mirrors how the Add-Product catalog search already
displays generic/strength/form/manufacturer under each result) — a salesman serving a customer who
asks for "the Square one" or "the paracetamol, not the ibuprofen" can actually tell products apart.

**Part 2 — total price instead of per-unit.** `SaleItemDto.salePrice` is per-unit; the POS cart's
"Price/unit" field collects it directly that way, same shape of problem as bug #9's purchase price.

**Fix (not yet applied):**
- Frontend: cart row's "Price/unit" input becomes **"Total price"** for that line (what the
  customer's actually being charged for that item, whatever quantity is in the row) — line total
  display becomes just an echo of what was typed rather than a separate qty×price computation.
- DTO: `SaleItemDto.salePrice` → `saleAmount` (total for the line, still a validated numeric
  string).
- `SalesService.checkout()`: compute `salePrice = (amount / qty).toFixed(2)` server-side per line
  (stored exactly as today — FIFO/profit code unchanged) **but** compute the invoice's
  `totalAmount` as the exact **sum of the typed line amounts**, not `qty × rounded-per-unit`. This
  sidesteps bug #9's rounding caveat at the level customers actually see (the receipt/invoice
  total): what the salesman typed across all lines is exactly what the invoice says, penny for
  penny — only the internal per-unit cost/profit bookkeeping carries the sub-cent rounding, same as
  every other retail POS.

**Built & verified:** `SaleItemDto.saleAmount` (total per line); `SalesService.checkout()` computes
`salePrice = (amount/qty).toFixed(2)` for FIFO/profit storage, while the invoice's `totalAmount` is
the exact sum of typed amounts. Confirmed via direct API call: qty=3, saleAmount="100" → invoice
`totalAmount` "100.00" exactly, stored line `sale_price` "33.33" (checked directly against the DB).
Frontend: search suggestions and cart rows now show generic/manufacturer as a subtitle; "Price/unit"
column renamed "Total price"; the separate "Line total" column was removed since it's now identical
to what's typed (a nice side-effect: the cart table is one column narrower, which also means it no
longer needs horizontal scroll at 390px — cleanly fixes the phone-width scroll note from the
previous round). Verified via browser automation and a 390px screenshot.

---

## 13. 🟢 Sales history / Recent sales don't show which items were sold

**Reported:** the Dashboard's "Recent sales" widget shows Date / Sold by / Items (a count) / Total
— e.g. "1 | 25.00" — with no way to tell which product that was or how many units. "Do we need to
update the sell history? Which Item Sold and How Many Unit??"

**Yes, since you asked** — an invoice row that only says "1 item, ৳25" isn't useful for actually
checking a transaction (a customer dispute, a shift reconciliation, spotting a mis-typed sale). This
gap exists in two places, both keyed off the same shape of query:

**Confirmed in code:**
- `SalesService.list()` (powers the dedicated **Sales** history page) and
  `DashboardService.recentSales()` (powers the Dashboard's **Recent sales** widget, the one in the
  report) both query `saleInvoices` joined to `sales` **only to count rows**
  (`count(${sales.id})::int` as `itemCount`) — the actual line items (which product, how many units)
  are fetched from the DB and then thrown away, never included in the response.
- `SalesHistoryPage.tsx` and `DashboardPage.tsx` both just render that count in an "Items" column.

**Fix (not yet applied):**
- Both backend queries: after fetching the invoice list, fetch the matching `sales` rows (joined to
  `products` for the name) for those invoice ids in one extra query, group them by `invoiceId` in
  application code, and attach as `items: { productName: string; qty: number }[]` on each invoice —
  replaces the now-redundant `itemCount` (`items.length` covers that).
- **Sales history page**: replace the "Items" count column with the actual line items, e.g. "Napa
  ×20, Ibuprofen ×5" — most checkouts are a handful of items, so inline text is enough; the table
  already scrolls horizontally (`.table-scroll`) if a cart ever has many.
- **Dashboard's Recent sales widget**: same idea, but capped (e.g. first 2 items + "+N more") since
  it's a glance-view widget with limited width, not the full report — clicking through to the full
  Sales page is where the complete breakdown lives.
- **Scope note**: shows the raw quantity sold (pieces), not a Box/Strip/Pcs breakdown like the
  stock-on-hand displays — that would need also loading each product's pack size into this view,
  which neither page currently does. Happy to add if you want it, but raw units already answers
  "which item, how many" directly; flagging so it's a deliberate choice, not an oversight.

**Follow-up 2026-09-02**: confirmed this also applies to the dedicated **Sales** history page
specifically (not just the Dashboard widget) — same "1 | 290.00" gap. Already in scope above
(`SalesHistoryPage.tsx` is explicitly one of the two places this fix touches); no new root cause,
just confirms both places matter.

**Also noticed while looking at this page**: its subtitle still reads *"Full revenue/profit
reporting lands in the Phase 5 dashboard"* — leftover copy from before the dashboard existed. The
dashboard has been live since Phase 5 (see architecture-plan.md), so this now reads as an unfulfilled
promise instead of a pointer to something that already exists. Small fix, folding it into this same
round: reword to something like "Recent checkouts — see the Dashboard for revenue and profit
reporting," or drop the sentence entirely since the nav already has a Dashboard link.

**Confirmed 2026-09-02**: all three — the base items/qty + subtitle fix, **plus** search/filter,
**plus** pagination. Since pagination was explicitly asked for (the list "could grow long over
time"), the search/filter has to be **server-side**, not the client-side "load everything, filter
in the browser" pattern used on Products/Purchases — those pages load a pharmacy's full product
list (a few hundred rows, fine to hold in memory); a pharmacy's sales history grows one invoice per
checkout and could run into the thousands over months, so paging server-side only to then still
`GET` every invoice for client-side filtering would defeat the point of paging at all.

**Design:**
- `GET /sales` gains query params: `limit`/`offset` (page size, default 20), `search` (matches
  salesman name **or** any line item's product name), `dateFrom`/`dateTo` (ISO dates, inclusive).
  Response becomes `{ items: Invoice[], total: number }` instead of a bare array, so the frontend
  knows how many pages exist.
- Matching by product name needs an extra step server-side: first resolve which invoice ids have a
  matching line item or salesman (a join + `ilike` against `sales`+`products`+`users`, or a plain
  salesman-name match with no join needed when the search doesn't hit any product), **then** run the
  existing invoice-list query filtered to those ids plus the date range, with `limit`/`offset` and
  `count(*) over()` (or a second count query) for `total`. Same "resolve matching ids, then fetch
  the real rows" two-step shape already used for #13's items enrichment above — reused, not a new
  pattern.
- `SalesHistoryPage.tsx`: search box (debounced, re-queries the server — not an in-browser filter)
  + two date inputs (From/To) + Prev/Next pagination controls with a "Page X of Y" indicator, same
  page-size (20) as the backend default.
- **Dashboard's Recent sales widget** is unaffected by this — it's already inherently paginated by
  virtue of only ever asking for the latest 5, so it keeps its own simpler `recentSales()` query
  (with the items-array fix from above, but no search/filter/pagination — that's what the full Sales
  page is for).

**Built & verified:** `SalesService.fetchItemsFor()` (a new static helper, shared by `list()` and
`DashboardService.recentSales()`) resolves each invoice's real line items in one extra query.
`GET /sales` now takes `search`/`dateFrom`/`dateTo`/`limit`/`offset` and returns `{ items, total }`
(search matches invoice ids from a salesman-name join OR a product-name join, then filters the main
query to those ids — same two-step shape as the items fix). `SalesHistoryPage.tsx` gained a debounced
search box, From/To date inputs, and Prev/Next pagination with a "Page X of Y" indicator; the stale
"Phase 5 dashboard" subtitle is reworded. `DashboardPage.tsx`'s Recent sales widget shows the first 2
items + "+N more", no search/pagination (as designed). Verified end-to-end via the API directly
(search-by-product, search-by-salesman, no-match, date range in/out of window, pagination pages
correctly) and via browser automation: both pages render real item/qty text ("Napa ×20") instead of a
bare count, the subtitle reads correctly, and the search box filters live.

---

## 14. 🟢 Sell (POS): Qty box defaults to 1 — should start blank

**Reported:** the cart's Qty input defaults to 1 when a product is added; should start blank and
make the user type a value.

**Confirmed in code** (`SalesPOS.tsx`): `addToCart()` sets `count: 1` for a newly-added line, and
the Qty `<input type="number">` is bound directly to that number with `Math.max(1, ...)` on every
keystroke — so it's not just a pre-filled 1, the field actively refuses to go below 1, which also
means it can never be cleared to type a fresh number (e.g. typing "20" by deleting first goes
through an invalid empty/0 state that immediately snaps back to 1, fighting the input).

**Fix (not yet applied):**
- `CartLine.count` changes from `number` to `string` (same pattern already used for `saleAmount`,
  and for Box/Strip/Pcs on the Purchases form) — starts `''` when a product is added, so the field
  is genuinely blank rather than a 1 the user has to notice and clear.
- Qty input just mirrors what's typed (no `Math.max` fighting the keystroke); quantity is parsed as
  `Number(count) || 0` wherever it's used (the pieces conversion, the line's contribution to the
  cart total).
- Switching a line between Strip/Pcs mode also resets its count to blank (currently resets to `1`)
  — consistent with "the user types the value," rather than silently carrying over a number that
  meant something different in the other unit.
- `completeSale()` gains a check alongside the existing "missing price" one: block checkout with a
  clear per-product message ("Enter a quantity for 'X'") if a line's count is blank or zero, instead
  of letting a 0-qty line reach the backend and come back as a generic error.
- Adding the *same* product again via search (already in the cart) still increments by 1 as today —
  just computed as `(Number(current) || 0) + 1` now that count is a string.

**Built & verified:** `CartLine.count` is now a `string`, starts `''`; the Qty input shows a greyed
placeholder "0" instead of an actual pre-filled value; switching Strip/Pcs resets to blank;
`completeSale()` blocks with "Enter a quantity for '<product>'" when a line's count is blank/zero.
Verified via browser automation: adding a product to the cart leaves the Qty field's actual value
empty (confirmed via `inputValue()`, not just visually), attempting checkout with a price but no
qty shows the new error and does not hit the API, and a normal sale (qty typed, price typed)
completes exactly as before.

---

## 15. 🔴 No password reset/recovery path for staff (salesman/manager), or for the Super Admin

**Reported:** "if Staff password will forget??" — what happens when a salesman or manager forgets
their login password.

**Confirmed in code:** password recovery exists at exactly one level, and nowhere else:

| Role | Who can reset it today | How |
|---|---|---|
| Salesman / Manager | **Nobody** — no endpoint exists | none — direct DB edit is the only fix |
| Pharmacy Admin | Super Admin | `POST /pharmacies/:id/regenerate-password` (built this session, "Super admin: pharmacy details + password regeneration") |
| Super Admin | Nobody | none — same gap, one level up |

`UsersController`/`UsersService` (`backend/src/users/`) only has `list` and `create` for staff — no
reset/regenerate route at all. So a Pharmacy Admin, who creates and otherwise fully manages their
own staff, has no button to press if a salesman or manager forgets their password; today that
requires someone with direct database access to update `password_hash` by hand.

**Proposed fix (not yet built):**
- Backend: `POST /users/staff/:id/regenerate-password` (pharmacy_admin only, scoped to their own
  `pharmacyId` — mirrors the tenant-isolation pattern already used by `listStaff`/`createStaff`) —
  generates a new password with the same `generatePassword()` helper already used for pharmacy
  admins, bcrypt-hashes it, overwrites `passwordHash`, returns `{ email, generatedPassword }` once.
  Same one-time-display contract as the existing Super Admin flow — reused, not a new pattern.
- Frontend: `StaffPage.tsx` gains a "Reset password" action per staff row, confirms inline (no
  browser `confirm()` dialog, matching the pharmacy Details panel's pattern), then shows the new
  password in the same tap-to-copy `CredentialsBox` component already factored out for pharmacy
  creation/regeneration — a third reuse of that component.
- **Super Admin's own password** is a separate, smaller gap (only one account, created once by
  `seed.ts`) — out of scope for this fix unless you want it too; flagging so it doesn't get
  silently forgotten. Cheapest real fix there would be a `db:seed` re-run path or a one-off CLI
  script rather than a full UI, since there's exactly one such account per deployment.

Say "Implement" when you want this built (staff-level reset, Super-Admin-level, or both).

**User follow-up 2026-09-03**: "Still the Pharmacy Admin can't view and regenerate staff password,
or delete account." Two asks — one already covered above, one genuinely new, and one that needs a
correction before it can be built as literally worded:

- **"Regenerate" staff password** — this is exactly the fix already proposed above. Still not built
  (nothing under this bug has shipped yet; only the *Super Admin → Pharmacy Admin* regenerate-password
  flow exists today, from an earlier round). No change to the plan — just confirming it's still the
  right fix.
- **"View" staff password — not actually possible, and worth explaining why.** `users.passwordHash`
  stores a **bcrypt hash**, a one-way function — there is no operation that turns a bcrypt hash back
  into the plaintext password, by design (that's the entire point of hashing instead of storing
  passwords directly). `createStaff()` receives the plaintext in the request, hashes it immediately,
  and never stores or logs the plaintext anywhere, even temporarily — so there is no "the password"
  sitting in the database to view. The *existing* one-time-reveal pattern (pharmacy creation, Super
  Admin's regenerate-password) only works because it shows a **freshly generated** password at the
  moment it's created — that's the only time a plaintext password ever exists in memory, and only
  once. Practical effect: "view password" and "regenerate password" have to be the same button —
  there's no way to show the staff member's *current* password on demand, only to issue them a new
  one. Not a limitation of this app specifically — this is how essentially every properly-built login
  system works (Super Admin's own account has the exact same property).
- **"Delete account" — new, not previously scoped.** Confirmed in code: no delete/deactivate endpoint
  exists for staff at all (`UsersController` only has `list`/`create`); the `active` column already
  exists on the `users` table but nothing currently writes to it. Proposed as a **deactivate**, not a
  hard `DELETE FROM users`, for the same reason pharmacy subscriptions are deactivated rather than
  deleted elsewhere in this app: a salesman/manager's past sales/purchases still reference their
  `userId` (sales history, "sold by" columns, audit trail) — hard-deleting the row would either orphan
  that history or require cascading deletes that destroy real transaction records. A deactivated
  account simply can no longer log in (`AuthService.login()` gains an `active` check alongside the
  existing password check) but its name still shows correctly on every past sale. `StaffPage.tsx`
  would show inactive staff greyed out / badged "Inactive" rather than disappearing from the list
  entirely, with a "Reactivate" action to undo it — mirrors the Super Admin's active/inactive pattern
  on the Pharmacies list.

**Proposed backend addition**: `POST /users/staff/:id/regenerate-password` (as already planned above)
plus `PATCH /users/staff/:id` accepting `{ active: boolean }` (pharmacy_admin only, scoped to their
own `pharmacyId`, same tenant-isolation pattern as `listStaff`). A Pharmacy Admin can't deactivate
themselves through this route (there's no "staff" row for their own account to target).

Say "Implement" when ready — this folds into the same build as the original regenerate-password fix
above, since both touch `StaffPage.tsx`'s currently action-less table in one pass.

---

## 16. 🟢 Mobile experience feels rough, not "app-grade" / luxurious

**Reported:** "The Desktop Version is Okay... But I see the Mobile View isn't Smooth and Professional
APP Grade... People wants Luxurious and Smooth Design."

This was a feeling, not a specific reproduction step, so before writing anything up I actually drove
the app at a real phone viewport (390px, iPhone-class) via browser automation and looked at what's
there — both the rendered screens and the CSS behind them. Found five concrete, fixable interaction
problems and one bigger, genuinely subjective design gap. Screenshots and a live interaction test
(not just reading the CSS) back all five.

**Confirmed, concrete problems:**

1. **Data tables don't adapt to mobile at all — they squeeze and wrap instead of laying out cleanly.**
   The Products page at 390px: "Beximco Pharmaceuticals Ltd." wraps across 3 lines inside its cell,
   every row balloons to a different, ugly height, columns fight each other for space. `.table-scroll`
   only adds horizontal *scroll* — it does nothing about a cell's text wrapping before the scrollbar
   ever kicks in. Every list page (Products, Purchases, Sales history, Staff, Suppliers) uses the same
   plain `<table>` pattern, so this almost certainly affects all of them, not just Products. This is
   the single biggest contributor to "not professional" — a real app-grade mobile screen turns each
   row into a stacked card (label: value pairs) below a breakpoint; it doesn't try to fit a desktop
   table into a phone.
2. **Every text input/select is 14px font-size.** iOS Safari auto-zooms the whole page in when you
   focus any input/select smaller than 16px — so on a real iPhone, tapping *any* field (search boxes,
   qty, price, batch number, every form) makes the page visibly jump/zoom before you can type. This
   can't be demonstrated in a Chromium screenshot (WebKit-specific behavior) but it's deterministic
   and well-documented — and would alone explain a lot of "this doesn't feel smooth."
3. **The hamburger drawer isn't actually a toggle.** Confirmed by direct interaction, not just reading
   the CSS: tapping ☰ opens the drawer fine, but tapping the same ☰ spot again to close it does
   nothing — the open drawer (`z-index: 110`) physically sits on top of the topbar (`z-index: 60`),
   so the button that's supposed to close it is covered by the thing it's supposed to close. The only
   way to close it is tapping the dimmed backdrop to the drawer's right, which isn't how a hamburger
   button is expected to behave (tap to open, tap again to close).
4. **No tap/press feedback anywhere.** No `:active` state exists on buttons, nav links, or clickable
   table rows anywhere in `index.css` — a tap does its thing with zero visual acknowledgment in the
   instant before the result appears, which reads as unresponsive/laggy even when the app is actually
   fast. Native and well-built web apps almost always dip opacity/scale briefly on press.
5. **The drawer's backdrop snaps instead of fading.** The drawer itself slides in with a
   `transition: transform 0.2s ease`, but the dark backdrop behind it is a plain `display: none` →
   `display: block` — no opacity transition — so open/close reads as two disconnected animations
   instead of one smooth coordinated one.

**Proposed fix — split into two tiers, since they're very different sizes of work:**

**Tier 1 — CSS/interaction fixes, small and mechanical (a focused pass, no visual redesign needed):**
- Bump all `input`/`select` font-size to 16px — kills the iOS zoom-jump everywhere at once.
- Fix the hamburger to actually toggle — raise the topbar/hamburger above the drawer's stacking
  context (or move the button outside where the drawer can ever cover it) so tapping it always closes
  what it opened.
- Add real `:active` press states (a brief scale/opacity dip) to buttons, nav links, and clickable
  rows app-wide.
- Fade the backdrop's opacity in step with the drawer's slide, instead of an instant `display` flip.
- Add `env(safe-area-inset-*)` padding so content doesn't sit under an iPhone's notch/home-indicator.

**Tier 2 — turning tables into mobile-friendly cards, real design work:**
- Below the existing table breakpoint, each list page's rows render as stacked cards (product name as
  the card title, other columns as label: value lines) instead of a squeezed table — this is the
  actual fix for problem #1 above, and it touches every list page, not just Products.
- The deeper ask — "luxurious," elevation/shadows, a more considered type scale, maybe icons in the
  nav — is a real visual-design pass, not a bug fix, and "luxurious" means something different to
  everyone. Mocked up three real-content directions on the actual Sell (POS) screen (color/tone as the
  only variable) grounded in retail color psychology research — same approach used for the Phase 5
  dashboard mockup, sign-off before touching component code:
  https://claude.ai/code/artifact/2220a30b-b0d4-4d8a-96c7-81b62f18880c

**Confirmed 2026-09-03 — direction picked:** use the first two mockup directions together, as the
app's **Light and Dark modes** — Option A "Trust Teal" as light mode, Option B "Midnight Premium" as
dark mode. Option C "Warm Navy & Gold" is dropped.

**Design (both tiers now folded into one visual pass, since Tier 1's CSS changes and Tier 2's card
layout touch the same files):**
- New CSS design-token layer in `index.css`: light tokens (`:root`) from the Trust Teal mockup —
  `--bg #F3F6F5`, `--surface #FFFFFF`, `--primary #0B6E64` (deepened from the current `#0f766e`),
  card shadow instead of flat 1px borders, 20px/14px radius scale. Dark tokens (`[data-theme="dark"]`,
  and `prefers-color-scheme: dark` when no explicit choice is stored) from the Midnight Premium mockup
  — `--bg #0C0F14`, `--surface #151920`, `--primary #2FD6B8` (bright mint, the one accent that "pops"
  against dark per the dark-mode-premium research). Every existing `var(--x)` reference in the app
  keeps working unchanged — only the token *values* swap per theme, same pattern already used for
  `--success`/`--danger`/etc.
- **Theme switching**: defaults to the device's OS-level light/dark setting (`prefers-color-scheme`),
  with a manual sun/moon toggle (in the sidebar, near the user info/Log out block) that overrides and
  persists to `localStorage` — the standard modern pattern (Notion/Linear-style), not asked about
  separately since it's low-risk to adjust later either way.
- Typography: Plus Jakarta Sans (headings/numbers) + Manrope (body) via Google Fonts, replacing the
  plain system-font stack — matches the mockups, still 1-2 fonts, not the overused Inter/Roboto/Arial.
- Tier 1's five fixes ship as part of this same pass: 16px inputs (kills iOS zoom-jump), the hamburger
  toggle bug fixed, real `:active` press states app-wide, the backdrop fade, safe-area padding.
- Tier 2's table→card conversion is **mobile-only** (the existing `<=900px`/`<=640px` breakpoints) —
  you said desktop is fine as-is ("we can see Full View at Once"), so desktop keeps its tables
  unchanged; only the phone-width layout of Products/Purchases/Sales history/Staff/Suppliers switches
  to stacked cards.
- Icons: inline SVG (search, trash/remove, hamburger, qty +/−, checkmark) replacing the current plain
  text/☰ glyphs, matching the mockups — never emoji.

Say "Implement" whenever you want this built — it's one combined pass (Tier 1 + Tier 2 + the A/B
theme system), not staged separately, since the interaction fixes and the card layout touch the same
CSS either way.

**Built & verified 2026-09-03:**
- **Design tokens** (`frontend/src/index.css`): light theme on `:root` (Trust Teal — `--bg #F3F6F5`,
  `--surface #FFFFFF`, `--primary #0B6E64`) and dark theme on `[data-theme="dark"]` (Midnight Premium
  — `--bg #0C0F14`, `--surface #151920`, `--primary #2FD6B8`), with a `prefers-color-scheme: dark`
  fallback for the split-second before JS/localStorage decides. Every token name the app already used
  (`--bg`, `--border`, `--danger`, `--primary`, `--primary-hover`, `--radius`, `--success`, `--surface`,
  `--text`, `--text-muted`, `--warning`) kept working unchanged — no component needed touching for the
  color system itself. New tokens added: `--surface-2`, `--primary-tint`, `--danger-tint`,
  `--shadow-card`, `--shadow-cta`, `--radius-lg`, `--on-primary` (replaces every hardcoded `white`/`'white'`
  that was going to become illegible against dark mode's bright-mint primary — fixed 6 spots across
  `AppShell.tsx`, `PharmaciesPage.tsx`, `SalesPOS.tsx`, `DashboardPage.tsx`), `--tooltip-bg`/
  `--tooltip-text` (the Dashboard chart tooltip no longer misuses `var(--text)` as a background), and
  theme-aware `--badge-*` tokens (replacing hardcoded pastel hex backgrounds that didn't work in dark
  mode). Plus Jakarta Sans (headings) + Manrope (body) loaded via Google Fonts in `index.html`.
- **Theme switching**: `frontend/src/theme.ts` (read/write/apply, backed by `localStorage` key
  `pharmacy-erp-theme`) plus a synchronous inline script in `index.html <head>` that sets `data-theme`
  on `<html>` before first paint (reads localStorage, falls back to the OS `prefers-color-scheme`) — no
  flash of the wrong theme on load. Sun/moon toggle button added to both the sidebar header and the
  mobile topbar (`AppShell.tsx`).
- **Tier 1 fixes** — all five shipped: `input`/`select` font-size bumped 14px→16px (kills the iOS
  zoom-jump); hamburger drawer now has its own dedicated close (✕) button rendered *inside* the drawer
  itself (shown only below the 900px breakpoint) instead of fighting the drawer's higher z-index — the
  old ☰ button visually covered by the open drawer is no longer the only way to close it; real `:active`
  press states (scale/opacity dip) added to `.btn`, `.btn-secondary`, the hamburger, the theme toggle,
  and table rows; the sidebar backdrop now fades its opacity in step with the drawer's slide instead of
  an instant `display` flip; `env(safe-area-inset-*)` padding added to the sidebar/topbar/main content.
- **Tier 2 — tables → mobile cards**: a `table.responsive` + `data-label="<Column>"` CSS pattern (pure
  CSS, no markup rewrite needed beyond the label attributes) that turns each row into a stacked
  label:value card below 640px, with no change at all above that width. Applied to all seven data
  tables: Products, Purchases (history), Sales history, Staff, Suppliers (main table only, not the
  ledger side-panel), Dashboard (Recent sales), and Super Admin's Pharmacies list.
- **Icons**: new `frontend/src/components/icons.tsx` (inline stroke-based SVGs, `currentColor` by
  default so they auto-follow the theme) — replaced the plain ☰/✕ text glyphs in `AppShell.tsx`
  (hamburger + new drawer-close button), the POS cart's ✕ remove-line button, and the Pharmacies
  details-panel's ✕ close button; added a search icon to the Sell (POS) search box to match the
  mockups.

**Verified:** `npm run build` (tsc -b + vite build) passes clean with no type errors. Browser
automation at 390×844 confirmed: theme starts on the OS default and switches/persists across a reload
via the toggle; the Products table renders as headerless label:value cards (`thead { display: none }`,
`::before` content resolves to each column name) with no cell-wrapping; the hamburger opens the drawer,
the new in-drawer ✕ closes it, and the backdrop's opacity is `1` while open (fading, not snapping);
input font-size confirmed `16px` via computed style. At 1440×900 (desktop): the same tables render as
normal `<table>`/`<tr>` (`display: table-header-group` / `table-row`, not cards) — confirming zero
regression on the "desktop is fine as-is" requirement — and the Trust Teal light theme, `--on-primary`
active-nav-item contrast, and the tooltip token fix all render correctly.

---

## 17. 🔴 "Tap to copy" credentials box shows "Copied ✓" but doesn't actually copy anything

**Reported:** Super Admin's Generate Pharmacy Credentials and Regenerate Password screens — clicking
the credentials box shows "Copied" but nothing actually lands on the clipboard.

**Confirmed in code** (`frontend/src/pages/superadmin/PharmaciesPage.tsx`, `CredentialsBox.copy()`,
the shared tap-to-copy component used by both the "pharmacy just created" flow and the "regenerated
password" flow):

```js
function copy() {
  navigator.clipboard?.writeText(text);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
}
```

Three compounding problems in these 5 lines:
1. **The Clipboard API only exists in a "secure context"** (HTTPS, or `localhost`). The app is
   deployed at `http://161.97.154.211:8085` — plain HTTP, on a bare IP, not localhost — so
   `navigator.clipboard` is simply `undefined` there in any standards-compliant browser. This app has
   no HTTPS yet (flagged previously in architecture-plan.md's "Next up" — no domain/SSL set up).
2. `navigator.clipboard?.writeText(text)` optional-chains straight past that `undefined`, so the call
   silently does nothing instead of throwing.
3. **`setCopied(true)` runs unconditionally**, immediately after, with no `await`, no `.then()`, and
   no `.catch()` — so the UI shows "Copied ✓" regardless of whether anything was actually written to
   the clipboard. The success message is disconnected from the actual outcome.

**Fix (not yet applied):**
- Make `copy()` `async`, `await navigator.clipboard.writeText(text)`, and only call `setCopied(true)`
  inside a `try` block on success.
- **Fallback for the no-HTTPS case** (this is the actual production scenario right now, not just an
  edge case): when `navigator.clipboard` is unavailable or `writeText()` rejects, fall back to the
  older `document.execCommand('copy')` technique (create a hidden, focused, selected `<textarea>` with
  the text, run the deprecated-but-still-universally-supported command, remove it) — this one *does*
  still work over plain HTTP. On success either way, show "Copied ✓"; on failure (both methods
  unavailable/blocked), show something honest instead, e.g. "Couldn't copy — select and copy manually"
  so the pharmacy owner/staff member isn't handed a credential that was never actually captured.
- **Real fix, longer-term**: this app has no TLS yet (see architecture-plan.md's outstanding SSL/domain
  item) — once that's in place, the Clipboard API works natively with no fallback needed. The
  `execCommand` fallback above is the right fix for *today's* HTTP deployment either way, and stays
  harmless/unused once HTTPS is added (the primary `navigator.clipboard` path would just start
  succeeding instead of falling through).

Say "Implement" when you want this built — small, self-contained, likely bundled with bug #15's staff
password/delete work above since both touch credential-handling UI.

---

## 18. 🔴 Salesman can't see their own sales history — "is it fair?"

**Reported:** "Sales Page, salesman can't see sales history, is it fair?"

**Confirmed in code — this is deliberate, not an oversight, but it's worth re-examining:**
- Backend: `GET /sales` (`backend/src/sales/sales.controller.ts` line 20) is `@Roles('pharmacy_admin',
  'manager')` — `salesman` is not in the list at all, so even a direct API call from a logged-in
  salesman is rejected by the role guard before it reaches `SalesService.list()`.
- Frontend: `/sales-history`'s route (`App.tsx` line 38) is wrapped in the same
  `ProtectedRoute allow={['pharmacy_admin', 'manager']}`, and `AppShell.tsx`'s nav map for `salesman`
  only lists one item — Sell (`{ to: '/', label: 'Sell' }`) — so there's no link to it anywhere in
  their UI either. A salesman is completely locked out, not even of their own transactions.

**Was this intentional?** Partly — the existing pattern elsewhere in the app is "salesman sells only,
never sees cost/profit" (see the comment in `sales.controller.ts` restricting checkout access, and the
Staff-add form's own role description: *"Salesman — sells only, never sees cost/profit"*). But the
current `list()` endpoint returns **every** salesman's invoices pharmacy-wide with no per-user
filtering at all — so simply adding `salesman` to the `@Roles(...)` list as-is would let a salesman see
every other salesman's sales too (and by extension, a rough sense of the pharmacy's total daily
revenue by summing invoice totals) — that's a real overreach, not what "is it fair" is asking for.

**What seems fair, and matches what a salesman already sees at checkout anyway:** a salesman typing a
sale's price and completing it already sees that invoice's total (they typed it) — there's no *new*
information exposure in letting them look back at **their own** past invoices specifically; what's
missing is a way to review/reprint/double-check what they personally sold, not a window into the whole
pharmacy's revenue.

**Proposed fix (not yet applied) — scope to "my sales", not full history:**
- Backend: add `salesman` to `GET /sales`'s allowed roles, but when the caller's role is `salesman`,
  force an additional `eq(saleInvoices.salesmanUserId, user.sub)` condition inside `SalesService.list()`
  regardless of any other filter — so a salesman can never see or search across other salesmen's
  invoices, only their own, no matter what's passed in `search`/`dateFrom`/`dateTo`. This is enforced
  server-side (not just hidden in the UI), same "never trust the client" principle used everywhere else
  in this app (e.g. purchase price computed server-side, not client-supplied).
- Frontend: `AppShell.tsx`'s salesman nav gains a second item — "My Sales" — pointing at a dedicated,
  **plain chronological list** (no search box, no date filters) of that salesman's own invoices, still
  showing each invoice's items/qty/total (same detail bug #13 already added), just without the search/
  date-range/pagination controls built for the admin/manager version. `App.tsx` gets a new route (kept
  separate from `/sales-history` rather than reusing that page with a role-conditional UI, since the
  admin version's search/date/pagination controls don't apply here at all) restricted to `salesman`.

**CONFIRMED by user 2026-09-03: plain list, no search/filter UI.** Locked in, ready to build.

Say "Implement" when you want this built.

---

