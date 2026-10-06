/** Price as the brand book sets it: shekel sign first, western digits. */
export const formatPrice = (ils: number) => `₪ ${ils}`;

/** Card meta line: family (or the category name), then volume. */
export function metaLine(family: string | null, categoryName: string | undefined, volumeMl: number | null) {
  const parts = [family ?? categoryName, volumeMl ? `${volumeMl} مل` : null].filter(Boolean);
  return parts.join("، ");
}

/** Local paths ("/products/x.svg") are served from public/; anything else lives in the `products` Storage bucket. */
export function productImageSrc(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("/")) return path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/products/${path}`;
}
