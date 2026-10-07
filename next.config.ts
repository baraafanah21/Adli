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
  },
  images: {
    remotePatterns: supabaseUrl ? [new URL(`${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/products/**`)] : [],
  },
};

export default nextConfig;
