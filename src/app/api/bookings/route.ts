import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizeMobile } from "@/lib/phone";
import type { PlacedBooking } from "@/lib/bookings";

/*
  The only way a booking is created. Calls create_booking() as the signed-in customer, with the server-held
  gateway secret (the same ORDER_GATEWAY_SECRET as orders), so the browser can't call the RPC directly.
  The database checks the hours, the window, the daily limit, the flag and overlaps. Responses never carry
  database text.
*/

const Body = z.object({
  idempotencyKey: z.uuid(),
  serviceId: z.uuid(),
  barberId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30),
});

export type BookingError =
  | { error: "sign_in" }
  | { error: "invalid"; field?: "name" | "phone" }
  /** The time was taken meanwhile, or is closed now: choose another. */
  | { error: "slot_taken" }
  /** Less than an hour ahead, or past the 7 days. */
  | { error: "outside_window" }
  /** One booking per account per salon day. */
  | { error: "daily_limit" }
  | { error: "rate_limited" }
  /** The service or the barber is no longer bookable. */
  | { error: "not_bookable" }
  | { error: "failed" };

const fail = (body: BookingError, status: number) => Response.json(body, { status });

/** Same-origin only: the booking page is the one caller. */
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
    console.error("bookings: ORDER_GATEWAY_SECRET is not set");
    return fail({ error: "failed" }, 500);
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return fail({ error: "sign_in" }, 401);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail({ error: "invalid" }, 400);
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return fail({ error: "invalid", field: field === "name" || field === "phone" ? field : undefined }, 400);
  }
  const b = parsed.data;
  const phone = normalizeMobile(b.phone);
  if (!phone) return fail({ error: "invalid", field: "phone" }, 400);

  const { data, error } = await supabase.rpc("create_booking", {
    p_idempotency_key: b.idempotencyKey,
    p_service_id: b.serviceId,
    p_barber_id: b.barberId,
    p_starts_at: b.startsAt,
    p_customer_name: b.name,
    p_phone: phone,
    p_gateway_secret: secret,
  });

  if (error) {
    switch (error.code) {
      case "P0020":
        return fail({ error: "slot_taken" }, 409);
      case "P0021":
        return fail({ error: "outside_window" }, 409);
      case "P0022":
        return fail({ error: "daily_limit" }, 409);
      case "P0023":
        return fail({ error: "rate_limited" }, 429);
      case "P0027":
        return fail({ error: "not_bookable" }, 409);
      case "22023":
        if (error.message === "phone_invalid") return fail({ error: "invalid", field: "phone" }, 400);
        if (error.message === "name_required") return fail({ error: "invalid", field: "name" }, 400);
        // start_off_grid: the page only offers grid times, so the time list is stale.
        if (error.message === "start_off_grid") return fail({ error: "slot_taken" }, 409);
        return fail({ error: "invalid" }, 400);
      case "42501":
        if (error.message === "sign_in_required") return fail({ error: "sign_in" }, 401);
      // falls through: a bad secret is a server misconfiguration, not the customer's fault.
      default:
        console.error("bookings: create_booking failed", error.code, error.message);
        return fail({ error: "failed" }, 500);
    }
  }

  const booking = (Array.isArray(data) ? data[0] : data) as PlacedBooking | undefined;
  if (!booking) {
    console.error("bookings: create_booking returned no row");
    return fail({ error: "failed" }, 500);
  }
  return Response.json(booking, { status: 201 });
}
