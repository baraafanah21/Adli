import type { NextConfig } from "next";

// Product photos uploaded from the admin live in the public `products` bucket of this Supabase project.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  // Phase G: public pages are prerendered from "use cache" data (src/lib/supabase/public.ts only) and refreshed by
  // updateTag() from the admin's Server Actions; anything that reads the session sits behind <Suspense>.
  cacheComponents: true,
  cacheLife: {
    // Hours, services, barbers: they change only from «الصالون», which calls updateTag("salon") at once. The times
    // below are a safety net for a change made elsewhere (SQL Editor): at most an hour, plus one visit.
    salon: { stale: 300, revalidate: 3600, expire: 86400 },
    // Categories, products, prices, photos, availability: every admin write (and every stock movement from an order
    // or «المخزون») calls updateTag("catalog"). Safety net for anything else: 5 minutes, plus one visit.
    catalog: { stale: 60, revalidate: 300, expire: 86400 },
  },
  images: {
    remotePatterns: supabaseUrl ? [new URL(`${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/products/**`)] : [],
    // Only the product page's large photo (and salon photos) go through Vercel's optimizer: cards use the 480×600
    // .sm.webp and the hero poster as they are (unoptimized), so few transformations are ever made (Hobby limit).
    // The sources are WebP already, so WebP out; a photo path never changes (uuid), so keep results a month.
    deviceSizes: [640, 828, 1080, 1600],
    imageSizes: [256, 512],
    formats: ["image/webp"],
    minimumCacheTTL: 2678400,
  },
  async headers() {
    return [
      // Hero frames are versioned by folder (public/hero/v1, v2…): a new set gets a new path.
      { source: "/hero/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};

export default nextConfig;
