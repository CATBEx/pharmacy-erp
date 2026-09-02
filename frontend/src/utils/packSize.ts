// Shared helpers for the "Box / Strip / Pcs" packaging feature (see architecture-plan.md,
// "Super admin: pharmacy details..." history / bug #2). Used by the Products form (setting a
// product's own pack size), the Purchases form (stock-in quantity), the Sell/POS screen (sale
// quantity), and any stock-on-hand display.

// Common Bangladesh pharmacy retail pack sizes, curated from real packaging conventions (most
// tablets/capsules strip in 10s; syrups/bottles/vials are usually 1 -- sold loose). Used to
// populate the pack-size dropdowns so staff never have to type a number. Live cross-pharmacy
// suggestions (see packSizeDropdownOptions below) are shown first when available; this list
// fills in the rest.
export const PACK_SIZE_OPTIONS = [1, 2, 4, 5, 6, 8, 10, 12, 14, 15, 20, 24, 25, 30, 40, 50, 60, 100];

export interface PackSizeSuggestion {
  value: number;
  pharmacyCount: number;
}

// Merges live crowd-sourced suggestions (real values other pharmacies use for this exact
// medicine, most-used first) with the generic curated list (for anything nobody's reported yet),
// de-duplicated. Always dropdown-only -- no free typing anywhere in this feature.
export function packSizeDropdownOptions(suggestions: PackSizeSuggestion[]): { value: number; label: string }[] {
  const suggested = [...suggestions]
    .filter((s) => s.value > 0)
    .sort((a, b) => b.pharmacyCount - a.pharmacyCount)
    .map((s) => ({
      value: s.value,
      label: `${s.value} — used by ${s.pharmacyCount} pharmac${s.pharmacyCount === 1 ? 'y' : 'ies'}`,
    }));
  const suggestedValues = new Set(suggested.map((s) => s.value));
  const rest = PACK_SIZE_OPTIONS.filter((v) => !suggestedValues.has(v)).map((v) => ({ value: v, label: String(v) }));
  return [...suggested, ...rest];
}

// Splits a raw piece count into Box / Strip / Pcs for display, omitting any zero-value unit
// (e.g. exactly 200 pieces shows as "2 Box", not "2 Box, 0 Strip, 0 Pcs"). A product that isn't
// tracked in packs at all (piecesPerStrip and stripsPerBox both left at 1) just shows the plain
// number + its free-text unit, since a breakdown would be meaningless.
export function formatStock(qty: number, piecesPerStrip: number, stripsPerBox: number, unit: string): string {
  if (piecesPerStrip <= 1 && stripsPerBox <= 1) return `${qty} ${unit}`;

  const piecesPerBox = piecesPerStrip * stripsPerBox;
  let remaining = qty;
  const boxes = Math.floor(remaining / piecesPerBox);
  remaining -= boxes * piecesPerBox;
  const strips = Math.floor(remaining / piecesPerStrip);
  remaining -= strips * piecesPerStrip;
  const pcs = remaining;

  const parts: string[] = [];
  if (boxes > 0) parts.push(`${boxes} Box`);
  if (strips > 0) parts.push(`${strips} Strip`);
  if (pcs > 0) parts.push(`${pcs} Pcs`);
  return parts.length > 0 ? parts.join(', ') : '0 Pcs';
}

// Converts a Box/Strip/Pcs combination into a single piece count -- what's actually sent to and
// stored by the backend (stock/purchases/sales are all still tracked as one plain piece count
// underneath; this is purely a data-entry convenience on top).
export function toPieces(box: number, strip: number, pcs: number, piecesPerStrip: number, stripsPerBox: number): number {
  return box * stripsPerBox * piecesPerStrip + strip * piecesPerStrip + pcs;
}
