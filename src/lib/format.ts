/** Price as the brand book sets it: shekel sign first, western digits. */
export const formatPrice = (ils: number) => `₪ ${ils}`;

/** Card meta line: family (or the category name), then volume. */
export function metaLine(family: string | null, categoryName: string | undefined, volumeMl: number | null) {
  const parts = [family ?? categoryName, volumeMl ? `${volumeMl} مل` : null].filter(Boolean);
  return parts.join("، ");
}

/**
 * Local paths ("/products/x.svg") are served from public/; anything else lives in the `products` Storage bucket.
 * A Storage photo's two files: <uuid>.webp (1600px) and <uuid>.sm.webp beside it (covers the 4:5 card at 2×).
 * Only the large one is recorded in products.image_path. Null for no photo or a file in public/ (demo SVGs).
 */
export function productImagePaths(path: string | null): { large: string; small: string } | null {
  if (!path || path.startsWith("/")) return null;
  return { large: path, small: path.replace(/\.webp$/, ".sm.webp") };
}

/** "sm" for cards and admin thumbnails, "lg" for the product page. */
export function productImageSrc(path: string | null, size: "sm" | "lg" = "lg"): string | null {
  if (!path) return null;
  const files = productImagePaths(path);
  if (!files) return path;
  const file = size === "sm" && path.endsWith(".webp") ? files.small : files.large;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/products/${file}`;
}

/** «أ، ب وج»: Arabic list joining, the last item with «و». Empty list: «النسخة». */
export function joinAnd(items: string[]) {
  if (items.length === 0) return "النسخة";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join("، ")} و${items[items.length - 1]}`;
}
