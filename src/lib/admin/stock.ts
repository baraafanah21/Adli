/** Stock words shared by the admin's stock pages. */

export type StockReason = "receive" | "sale" | "cancel" | "adjust" | "damage";

export const STOCK_STATE_LABEL = { in: "متوفر", low: "تحت حد الإنذار", out: "نفد" } as const;

export const REASON_LABEL: Record<StockReason, string> = {
  receive: "استلام بضاعة",
  sale: "بيع",
  cancel: "إلغاء طلب",
  adjust: "تعديل جرد",
  damage: "تالف",
};

/** The three reasons staff choose by hand; sale and cancel come from orders only. */
export const MANUAL_REASONS = [
  { reason: "receive", button: "سجّل الاستلام", done: "سُجّل الاستلام", field: "الكمية المستلمة" },
  { reason: "adjust", button: "سجّل الجرد", done: "سُجّل الجرد", field: "العدد الفعلي بعد الجرد" },
  { reason: "damage", button: "سجّل التالف", done: "سُجّل التالف", field: "الكمية التالفة" },
] as const;

export type ManualReason = (typeof MANUAL_REASONS)[number]["reason"];
