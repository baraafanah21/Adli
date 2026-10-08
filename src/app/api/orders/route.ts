import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { PlacedOrder } from "@/lib/whatsapp";
import { normalizeMobile } from "@/lib/phone";

/*
  The only way an order is created. Calls place_order() with the server-held gateway secret,
  so the browser can't call the RPC directly and skip the per-IP rate limit (5 orders / minute).
  Prices are recomputed in the database. Responses never carry database text.
*/

const Body = z.object({
  idempotencyKey: z.uuid(),
  name: z.string().trim().min(1).max(80),
  area: z.string().trim().max(80).default(""),
  // Required (Phase U): the full number with the prefix the customer chose (+9705… / +9725…), see src/lib/phone.ts.
  phone: z.string().trim().min(1).max(30),
  items: z
    .array(z.object({ variantId: z.uuid(), qty: z.number().int().min(1).max(20) }))
    .min(1)
    .max(30),
});

export type OrderError =
  | { error: "invalid"; field?: "name" | "phone" | "items" }
  /** `id` is the variant id; `name_ar` is the product with its variant («طاقية أسود، مقاس L»). */
  | { error: "unavailable"; products: { id: string; name_ar: string | null }[] }
  | { error: "rate_limited" }
  /** The salon blocked this account (E3.2); ordering signed out (as a guest) still works. */
  | { error: "blocked" }
  | { error: "failed" };

const fail = (body: OrderError, status: number) => Response.json(body, { status });

/** First x-forwarded-for value (set by Vercel); "local" when there is none (development). */
function clientIp(request: Request) {
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || "local";
}

/** Same-origin only: the order sheet is the one caller. */
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail({ error: "failed" }, 403);

  const secret = process.env.ORDER_GATEWAY_SECRET;
  if (!secret) {
    console.error("orders: ORDER_GATEWAY_SECRET is not set");
    return fail({ error: "failed" }, 500);
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail({ error: "invalid" }, 400);
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return fail({ error: "invalid", field: field === "name" || field === "phone" || field === "items" ? field : undefined }, 400);
  }
  const b = parsed.data;
  const phone = normalizeMobile(b.phone);
  if (!phone) return fail({ error: "invalid", field: "phone" }, 400);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_order", {
    p_idempotency_key: b.idempotencyKey,
    p_customer_name: b.name,
    p_area: b.area,
    p_phone: phone,
    p_items: b.items.map((i) => ({ variant_id: i.variantId, qty: i.qty })),
    p_client_ip: clientIp(request),
    p_gateway_secret: secret,
  });

  if (error) {
    switch (error.code) {
      case "P0001": {
        let products: { id: string; name_ar: string | null }[] = [];
        try {
          products = JSON.parse(error.details ?? "[]");
        } catch {}
        return fail({ error: "unavailable", products }, 409);
      }
      case "P0029":
        return fail({ error: "blocked" }, 403);
      case "P0002":
        return fail({ error: "rate_limited" }, 429);
      case "22023":
        // The orders trigger (private.phone_normalize) has the last word on the phone.
        if (error.message === "phone_invalid") return fail({ error: "invalid", field: "phone" }, 400);
        return fail({ error: "invalid" }, 400);
      case "22P02":
      case "23514":
        return fail({ error: "invalid" }, 400);
      default:
        // 42501 (bad secret) lands here too: a server misconfiguration, not the customer's fault.
        console.error("orders: place_order failed", error.code, error.message);
        return fail({ error: "failed" }, 500);
    }
  }

  const order = (Array.isArray(data) ? data[0] : data) as PlacedOrder | undefined;
  if (!order) {
    console.error("orders: place_order returned no row");
    return fail({ error: "failed" }, 500);
  }
  return Response.json(order, { status: 201 });
}
