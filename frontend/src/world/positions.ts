// Deterministic slot assignment so an agent's spot in its campus stays put
// as long as the campus roster is unchanged. Collisions are resolved by
// linear-probing in id-sorted order, so the outcome never depends on fetch
// order or render timing — only on which agents are actually in this campus.
const COLS = 6;
const ROWS = 5;
const TOTAL_SLOTS = COLS * ROWS;

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function slotToPct(slot: number): { leftPct: number; topPct: number } {
  const col = slot % COLS;
  const row = Math.floor(slot / COLS);
  return {
    leftPct: 12 + (col / (COLS - 1)) * 76,
    topPct: 28 + (row / (ROWS - 1)) * 62,
  };
}

export function layoutSlots(ids: string[]): Map<string, { leftPct: number; topPct: number }> {
  const taken = new Set<number>();
  const result = new Map<string, { leftPct: number; topPct: number }>();
  for (const id of [...ids].sort()) {
    let slot = hashId(id) % TOTAL_SLOTS;
    while (taken.has(slot)) slot = (slot + 1) % TOTAL_SLOTS;
    taken.add(slot);
    result.set(id, slotToPct(slot));
  }
  return result;
}
