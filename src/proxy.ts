import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/*
  Layer 1 of 3. Refreshes the Supabase session cookie on every request and keeps signed-out visitors
  away from /account and /admin. It only checks "signed in"; roles are checked on the server
  (src/lib/auth/guards.ts) and in the database (RLS).
  Pages that depend on the session are marked `private, no-store` here (redirects included), so no CDN or browser
  cache keeps one person's page; the public pages are the same for everyone and are cached by Next.js.

  Real 404s for /p/<slug> and /c/<slug>. With cacheComponents a page streams its prerendered shell first, so a
  notFound() inside it can only give a 200 with noindex (a "soft 404"). The status has to be decided here, before
  rendering: a slug that isn't a live product / category (read as anon, so hidden and archived ones count as
  missing) is rewritten to the not-found page with 404. Slugs found are remembered per instance for 5 minutes; an
  unknown one is always asked again, so a product shown a second ago never 404s. Signed-in visitors skip the check
  (staff open hidden products from the admin); for them the page's own notFound() still renders the 404 page.
*/

const PROTECTED = ["/account", "/admin"];
const PRIVATE = [...PROTECTED, "/auth", "/login", "/signup", "/api"];
const NO_STORE = "private, no-store, max-age=0";

const under = (pathname: string, prefixes: string[]) => prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

const CATALOG_PAGE = /^\/(p|c)\/([^/]+)\/?$/;
const SLUG = /^[a-z0-9-]{2,80}$/;
const KNOWN_FOR_MS = 5 * 60 * 1000;
const known = new Map<string, number>(); // "p:oud-malaki" → when it was last found

/** A malformed %-escape is just a missing page. */
const safeDecode = (part: string) => {
  try {
    return decodeURIComponent(part);
  } catch {
    return "";
  }
};

/** Is this a live product (p) or active category (c)? true on a database error: then the page decides. */
async function catalogSlugExists(kind: "p" | "c", slug: string): Promise<boolean> {
  if (!SLUG.test(slug)) return false;
  const key = `${kind}:${slug}`;
  const seen = known.get(key);
  if (seen && Date.now() - seen < KNOWN_FOR_MS) return true;
  const table = kind === "p" ? "products" : "categories";
  // RLS gives anon only active rows; categories also carry is_active for the staff policy, so filter it here.
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=slug&slug=eq.${slug}${kind === "c" ? "&is_active=eq.true" : ""}&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return true;
    const rows = (await res.json()) as unknown[];
    if (rows.length === 0) return false;
    if (known.size > 2000) known.clear();
    known.set(key, Date.now());
    return true;
  } catch {
    return true;
  }
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Don't run code between createServerClient and getClaims(): it refreshes the session if needed.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;
  const isPrivate = under(pathname, PRIVATE);
  if (!signedIn && under(pathname, PROTECTED)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(url);
    // Keep any cookies the refresh just wrote (e.g. clearing an expired session).
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    redirect.headers.set("Cache-Control", NO_STORE);
    return redirect;
  }

  if (isPrivate) response.headers.set("Cache-Control", NO_STORE);

  const catalog = !signedIn && CATALOG_PAGE.exec(pathname);
  if (catalog && !(await catalogSlugExists(catalog[1] as "p" | "c", safeDecode(catalog[2])))) {
    // An unmatched path renders the site's not-found page (app/not-found.tsx) with a real 404 status.
    const missing = NextResponse.rewrite(new URL("/_missing", request.url), { status: 404 });
    response.cookies.getAll().forEach((c) => missing.cookies.set(c));
    return missing;
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static files and images.
    "/((?!_next/static|_next/image|favicon.ico|brand/|hero/|products/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js)$).*)",
  ],
};
