import type { NextConfig } from "next";

// Product photos uploaded from the admin live in the public `products` bucket of this Supabase project.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseUrl ? [new URL(`${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/products/**`)] : [],
  },
};

export default nextConfig;
