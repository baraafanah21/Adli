/*
  The gallery's three frames (U5.3), shared by the admin (ImageEditor, the upload routes) and the public section.
  The database stores the label ("9:16" …); the browser and sharp work with the ratio (width / height).
*/
import type { GalleryAspect } from "@/lib/gallery";

export const GALLERY_ASPECTS: { label: GalleryAspect; value: number; name: string }[] = [
  { label: "9:16", value: 9 / 16, name: "9:16 ريلز" },
  { label: "4:5", value: 4 / 5, name: "4:5" },
  { label: "1:1", value: 1, name: "1:1 مربع" },
];

/** The ImageEditor's frames for the gallery (photos and posters): 9:16 first, the default. */
export const GALLERY_EDITOR_ASPECTS = GALLERY_ASPECTS.map((a) => ({ value: a.value, label: a.name }));

/** The label for a ratio the editor returned (always one of the three). */
export function aspectLabel(value: number): GalleryAspect | null {
  return GALLERY_ASPECTS.find((a) => Math.abs(a.value - value) < 0.001)?.label ?? null;
}

export function aspectValue(label: string): number | null {
  return GALLERY_ASPECTS.find((a) => a.label === label)?.value ?? null;
}
