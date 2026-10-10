/** variant_id → its public availability (in / low / out); null when it couldn't be read. */
export type StockStates = Map<string, string> | null;

/** True when the shop's availability differs between the two snapshots (or either is missing: then expire). */
export function stockStatesChanged(before: StockStates, after: StockStates): boolean {
  if (!before || !after || before.size !== after.size) return true;
  for (const [id, state] of before) if (after.get(id) !== state) return true;
  return false;
}
