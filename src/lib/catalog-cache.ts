import { revalidateTag, updateTag } from "next/cache";

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
