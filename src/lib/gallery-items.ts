import type { GalleryItem } from "@/lib/gallery";

/*
  Splitting the published gallery, on the server (the home page's GALLERY_MIN) and in the browser (ChairGallery).
  Types only from lib/gallery.ts, so nothing server-side ("use cache", the Supabase client) reaches the browser.
*/

/** The cards in the row (and the reels viewer): everything but the «خلفية» photos. GALLERY_MIN counts these. */
export const rowItems = (items: GalleryItem[]) => items.filter((i) => !i.backdrop);

/** The «خلفية» photos behind the section (GalleryBackdrop). */
export const backdropPhotos = (items: GalleryItem[]) => items.filter((i) => i.backdrop && i.kind === "image");

/** Every gallery photo's alt text (cards, backdrop): what it shows and where, the same words for each (no caption). */
export const GALLERY_ALT = "قصة شعر في صالون عدلي، قلقيلية";
