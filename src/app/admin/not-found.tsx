import { NotFoundBody } from "@/components/NotFoundBody";

// requireRole() answers a wrong role with notFound(): same 404 as the public site, inside the admin layout's frame.
export default function NotFound() {
  return <NotFoundBody />;
}
