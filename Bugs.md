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

