/*
  Order statuses as the admin sees them, and the moves allowed from each one.
  Mirrors admin_set_order_status() in supabase/migrations/20261007000000_admin_orders.sql:
  new → confirmed | cancelled; confirmed → done | cancelled. The database is the rule; this only draws the buttons.
*/

export const ORDER_STATUSES = ["new", "confirmed", "done", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const isOrderStatus = (s: unknown): s is OrderStatus =>
  typeof s === "string" && (ORDER_STATUSES as readonly string[]).includes(s);

/** Badge text. Always shown with its colour, never colour alone. */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "جديد",
  confirmed: "مؤكد",
  done: "تم التسليم",
  cancelled: "ملغى",
};

export type OrderAction = {
  to: OrderStatus;
  /** The button. */
  label: string;
  /** The success message: the same action, done. */
  done: string;
  /** Irreversible moves ask first, inside the page; this is the sentence they ask with. */
  confirm?: string;
};

export const ORDER_ACTIONS: Record<OrderStatus, OrderAction[]> = {
  new: [
    { to: "confirmed", label: "تأكيد الطلب", done: "تأكّد الطلب" },
    {
      to: "cancelled",
      label: "إلغاء الطلب",
      done: "أُلغي الطلب",
      confirm: "إلغاء الطلب نهائي، ولا يمكن الرجوع عنه.",
    },
  ],
  confirmed: [
    { to: "done", label: "تسليم الطلب", done: "سُلّم الطلب" },
    {
      to: "cancelled",
      label: "إلغاء الطلب",
      done: "أُلغي الطلب",
      confirm: "سيرجع للمخزون كل ما خُصم لهذا الطلب، ولا يمكن الرجوع عن الإلغاء.",
    },
  ],
  done: [],
  cancelled: [],
};
