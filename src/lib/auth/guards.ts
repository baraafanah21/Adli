/*
  Server-side identity and role checks. Every Server Component and Server Action that needs a user or a
  role calls these. Identity comes from getClaims() (a verified JWT), never from getSession() alone.
  Roles are read from public.user_roles on every call, so removing a role takes effect at once.
  RLS is the last layer underneath all of this.
*/

import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "staff";

export type CurrentUser = {
  id: string;
  email: string | null;
  name: string | null;
};

/** The verified user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const c = data.claims as { sub: string; email?: string; user_metadata?: { full_name?: string } };
  return { id: c.sub, email: c.email ?? null, name: c.user_metadata?.full_name?.trim() || null };
});

/** Redirects to /login (then back to `next`) when nobody is signed in. */
export async function requireUser(next: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export const getRole = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  return (data as { role: Role } | null) ?? null;
});

/**
 * Signed in AND holding one of `roles`. Anyone else gets a 404, so /admin doesn't advertise itself.
 * Call at the top of every admin Server Component and Server Action.
 */
export async function requireRole(roles: Role[], next = "/admin") {
  const user = await requireUser(next);
  const role = await getRole(user.id);
  if (!role || !roles.includes(role.role)) notFound();
  return { user, role };
}

export type Profile = { full_name: string | null; area: string | null; phone: string | null };

/** The signed-in user's profile (RLS: own row only). Cached per request; used by the header and the order sheet. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("full_name, area, phone").eq("id", user.id).maybeSingle();
  return (data as Profile | null) ?? { full_name: user.name, area: null, phone: null };
});
