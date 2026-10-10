"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** «خروج»: ends the session (server side, so the cookies are cleared in the same response). */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // The browser re-renders with no session (SessionIsland, the header, the order sheet). Nothing cached on the server
  // depends on who is signed in, so nothing there is expired (revalidatePath("/", "layout") re-rendered every page).
  refresh();
  redirect("/");
}
