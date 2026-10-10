import { revalidateTag, updateTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { stockStatesChanged, type StockStates } from "@/lib/stock-states";

/*
  Expiring the cached catalog (src/lib/catalog.ts). Called only after the admin RPC succeeded.
  The whole `catalog` tag every time: the shelf shows every product's name, price, photo and availability, and a
  bundle's availability depends on its pieces, so a narrower tag would leave something stale. The category /
  product tags named alongside are for the record (and for narrowing later); `catalog` already covers them.

    Server Actions  → expireCatalog():   updateTag, the next visit waits for fresh data (never the old copy)
    Route Handlers  → expireCatalogNow(): revalidateTag(…, { expire: 0 }), the same effect where updateTag isn't allowed
*/

export function expireCatalog(...tags: string[]) {
  updateTag("catalog");
  for (const tag of tags) updateTag(tag);
}

export function expireCatalogNow(...tags: string[]) {
  revalidateTag("catalog", { expire: 0 });
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
}

/*
  Stock moves (an order confirmed or cancelled, «المخزون») change quantities, but the shop shows only availability
  (in / low / out, bundles from their pieces). So these actions read every variant's public availability before and
  after the RPC, as the shop reads it (anon, the variant_availability view), and expire the catalog only when one of
  them changed. Each expiry re-renders every catalog page; one that changed is an ISR write (docs/PERFORMANCE.md «ISR»).
  Any read that fails counts as a change: the catalog is expired, as before.
*/

/** Every public variant's availability (variant_id → in / low / out), or null if it couldn't be read. */
export async function publicStockStates(): Promise<StockStates> {
  const { data, error } = await createPublicClient()
    .from("variant_availability")
    .select("variant_id, stock_state")
    .order("variant_id")
    .limit(10000);
  if (error) {
    console.error("variant_availability", error.code, error.message);
    return null;
  }
  return new Map((data as { variant_id: string; stock_state: string }[]).map((r) => [r.variant_id, r.stock_state]));
}

/** After a stock move in a Server Action: expire the catalog only if the shop's availability changed. */
export async function expireCatalogIfStockChanged(before: StockStates): Promise<boolean> {
  const changed = stockStatesChanged(before, await publicStockStates());
  if (changed) expireCatalog();
  return changed;
}
