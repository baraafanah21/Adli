import { NotFoundBody } from "@/components/NotFoundBody";
import { SiteChrome } from "@/components/SiteChrome";

// Unmatched URLs only: rendered under the root layout, outside every route group, so it brings the site's header.
// notFound() inside (site) or /admin uses the not-found.tsx next to that layout instead (no second header).
export default function NotFound() {
  return (
    <SiteChrome>
      <NotFoundBody />
    </SiteChrome>
  );
}
