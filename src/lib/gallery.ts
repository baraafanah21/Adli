import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

/*
  «زبايننا المرتّبين» (U5.3): the published gallery, photos and short silent videos, in the owner's order. Display only:
  no caption, no name. Read as anon (createPublicClient), so RLS returns published rows only, the same for every
  visitor; named columns only (created_by is never granted).

  Cached ("use cache", tag `gallery`, profile `gallery` in next.config.ts). Every admin write (admin_gallery_*) calls
  expireGallery() / expireGalleryNow() (src/lib/gallery-cache.ts) after it succeeds, so a change shows at once. A
  read error is thrown inside the cached function (never cached) and becomes null in getGallery().
*/

export type GalleryAspect = "9:16" | "4:5" | "1:1";

/** The home page shows the section only from this many published items. */
export const GALLERY_MIN = 3;

export type GalleryItem = {
  id: string;
  kind: "image" | "video";
  aspect: GalleryAspect;
  /** The photo (1600px WebP) or the video (H.264 MP4, silent). */
  src: string;
  /** Video only: its poster (1080px WebP). */
  poster: string | null;
  /** 480px WebP: the photo, or the video's poster (cards, phones). */
  sm: string;
  width: number;
  height: number;
  durationMs: number | null;
  /** The one video in «مرآة الصالون». */
  featured: boolean;
  /** «خلفية»: a photo shown behind the section (GalleryBackdrop), not as a card in the row. */
  backdrop: boolean;
};

type Row = {
  id: string;
  kind: "image" | "video";
  aspect: GalleryAspect;
  storage_path: string;
  poster_path: string | null;
  sm_path: string;
  width: number;
  height: number;
  duration_ms: number | null;
  is_featured: boolean;
  is_backdrop: boolean;
};

/** A file in the public `gallery` bucket. */
export const galleryFileUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gallery/${path}`;

async function galleryData(): Promise<GalleryItem[]> {
  "use cache";
  cacheTag("gallery");
  cacheLife("gallery");
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("gallery_items")
    .select("id, kind, aspect, storage_path, poster_path, sm_path, width, height, duration_ms, is_featured, is_backdrop")
    .order("sort_order")
    .order("created_at");
  if (error) {
    console.error("gallery_items", error.code, error.message);
    throw new Error("gallery_items");
  }
  return (data as Row[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    aspect: r.aspect,
    src: galleryFileUrl(r.storage_path),
    poster: r.poster_path ? galleryFileUrl(r.poster_path) : null,
    sm: galleryFileUrl(r.sm_path),
    width: r.width,
    height: r.height,
    durationMs: r.duration_ms,
    featured: r.is_featured,
    backdrop: r.is_backdrop,
  }));
}

/** The published gallery in order, or null if it couldn't be read (the section then stays hidden). */
export async function getGallery(): Promise<GalleryItem[] | null> {
  try {
    return await galleryData();
  } catch {
    return null;
  }
}
