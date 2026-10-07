import { SessionBridge } from "@/components/session/SessionBridge";
import { getCurrentUser, getProfile } from "@/lib/auth/guards";

/**
 * The only place on the public site that reads the session. Always rendered inside <Suspense> (see SiteChrome),
 * so the rest of the page never waits for cookies and can be prerendered.
 */
export async function SessionIsland() {
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);
  return <SessionBridge session={{ user, profile }} />;
}
