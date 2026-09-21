// Deterministic slot assignment so an agent's spot in its campus stays put
// as long as the set of agents in that slot pool (e.g. "idle in Research")
// is unchanged. Collisions are resolved by linear-probing in id-sorted
// order, so the outcome never depends on fetch order or render timing.
const COLS = 6;
const ROWS = 5;
const TOTAL_SLOTS = COLS * ROWS;

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export type Band = { topMin: number; topMax: number };

export const YARD_BAND: Band = { topMin: 40, topMax: 92 };
export const DESK_BAND: Band = { topMin: 22, topMax: 34 };

function slotToPct(slot: number, band: Band): { leftPct: number; topPct: number } {
  const col = slot % COLS;
  const row = Math.floor(slot / COLS);
  return {
    leftPct: 10 + (col / (COLS - 1)) * 80,
    topPct: band.topMin + (row / (ROWS - 1)) * (band.topMax - band.topMin),
  };
}

export function layoutSlots(ids: string[], band: Band): Map<string, { leftPct: number; topPct: number }> {
  const taken = new Set<number>();
  const result = new Map<string, { leftPct: number; topPct: number }>();
  for (const id of [...ids].sort()) {
    let slot = hashId(id) % TOTAL_SLOTS;
    while (taken.has(slot)) slot = (slot + 1) % TOTAL_SLOTS;
    taken.add(slot);
    result.set(id, slotToPct(slot, band));
  }
  return result;
}
