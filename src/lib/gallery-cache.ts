import { revalidateTag, updateTag } from "next/cache";

/*
  Expiring the cached gallery (src/lib/gallery.ts). Called only after an admin_gallery_* call succeeded.

    Server Actions  → expireGallery():    updateTag, the next visit waits for fresh data (never the old copy)
    Route Handlers  → expireGalleryNow(): revalidateTag(…, { expire: 0 }), the same where updateTag isn't allowed
*/

export function expireGallery() {
  updateTag("gallery");
}

export function expireGalleryNow() {
  revalidateTag("gallery", { expire: 0 });
}
