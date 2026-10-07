import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/*
  Layer 1 of 3. Refreshes the Supabase session cookie on every request and keeps signed-out visitors
  away from /account and /admin. It only checks "signed in"; roles are checked on the server
  (src/lib/auth/guards.ts) and in the database (RLS).
  Pages that depend on the session are marked `private, no-store` here (redirects included), so no CDN or browser
  cache keeps one person's page; the public pages are the same for everyone and are cached by Next.js.
*/

const PROTECTED = ["/account", "/admin"];
const PRIVATE = [...PROTECTED, "/auth", "/login", "/signup", "/api"];
const NO_STORE = "private, no-store, max-age=0";

const under = (pathname: string, prefixes: string[]) => prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

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
  return response;
}

export const config = {
  matcher: [
    // Everything except static files and images.
    "/((?!_next/static|_next/image|favicon.ico|brand/|hero/|products/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js)$).*)",
  ],
};
