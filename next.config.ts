import type { NextConfig } from "next";

// Product photos uploaded from the admin live in the public `products` bucket of this Supabase project.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  // Phase G: public pages are prerendered from "use cache" data (src/lib/supabase/public.ts only) and refreshed by
  // updateTag() from the admin's Server Actions; anything that reads the session sits behind <Suspense>.
  cacheComponents: true,
  // Every admin write expires its tag at once (updateTag), so the times below are only a safety net for a change
  // made outside the admin (SQL Editor): it shows within a day, plus one visit. Kept long because each regeneration
  // whose output changed is an ISR write (Vercel Hobby: 200,000 a month; docs/PERFORMANCE.md «ISR»).
  cacheLife: {
    // Hours, services, barbers: they change only from «الصالون», which calls updateTag("salon").
    salon: { stale: 300, revalidate: 86400, expire: 604800 },
    // Categories, products, prices, photos, availability: every admin write (and every stock movement from an order
    // or «المخزون») calls updateTag("catalog").
    catalog: { stale: 300, revalidate: 86400, expire: 604800 },
    // «زبايننا المرتّبين»: changes only from the admin's gallery page, which calls updateTag("gallery").
    gallery: { stale: 300, revalidate: 86400, expire: 604800 },
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
  // The hero's DrawnLogo reads public/brand/adli-logo-mono.svg on the server (src/lib/brand-paths.ts): keep the file
  // in every server bundle, so a page rebuilt after a revalidation finds it too.
  outputFileTracingIncludes: {
    "/*": ["./public/brand/adli-logo-mono.svg"],
    // The home page's shared picture composes the seal file (app/share/home.jpg) when the gallery changes.
    "/share/home.jpg": ["./public/brand/adli-seal.svg"],
  },
  async headers() {
    return [
      // Hero frames are versioned by folder (public/hero/v1, v2…): a new set gets a new path.
      { source: "/hero/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // The shears' frames too (public/shears/v1, a re-render goes to v2).
      { source: "/shears/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
  async rewrites() {
    // The logo's favicon stays in public/brand/icons/ (the one source). Its PNGs are RGB, which app/favicon.ico
    // can't decode, so /favicon.ico (asked for by browsers without reading the <link>) is served from there.
    return [{ source: "/favicon.ico", destination: "/brand/icons/favicon.ico" }];
  },
};

export default nextConfig;
