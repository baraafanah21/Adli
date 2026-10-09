import { getCatalog } from "@/lib/catalog";
import { toSearchItems } from "@/lib/search-items";

/**
 * The header search's index: every published product, light (SearchItem), from the same cached catalog as the shelf
 * (tag `catalog`, so every admin write that changes the shop renews it). Prerendered; the browser asks for it once,
 * when the search opens, and searches it as the customer types. No session is read here.
 */
export async function GET() {
  const catalog = await getCatalog();
  if (!catalog.data) return Response.json({ error: catalog.error }, { status: 503 });
  return Response.json({ items: toSearchItems(catalog.data.categories, catalog.data.products) });
}
