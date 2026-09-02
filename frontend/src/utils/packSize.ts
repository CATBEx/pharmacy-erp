// Shared helpers for the "Box / Strip / Pcs" packaging feature (see architecture-plan.md,
// "Super admin: pharmacy details..." history / bug #2). Used by the Products form (setting a
// product's own pack size), the Purchases form (stock-in quantity), the Sell/POS screen (sale
// quantity), and any stock-on-hand display.

export interface PackSizeSuggestion {
  value: number;
  pharmacyCount: number;
}

// Pieces-per-strip / strips-per-box are free-typed number inputs (bug #7 -- reversed the earlier
// dropdown-only design). The live cross-pharmacy suggestion data is still useful, so it's shown as
// tappable chips next to the input instead of being the only way to set the value: most-used
// first, filtered to real positive values. A pharmacy that already knows a shared number taps it
// in one touch; nobody is blocked from typing something nobody's reported yet.
export function sortedSuggestions(suggestions: PackSizeSuggestion[]): PackSizeSuggestion[] {
  return [...suggestions].filter((s) => s.value > 0).sort((a, b) => b.pharmacyCount - a.pharmacyCount);
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
