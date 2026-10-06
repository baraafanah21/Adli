export type OrderLine = {
  name_ar: string;
  volume_ml: number | null;
  qty: number;
  line_total_ils: number;
};

export type PlacedOrder = {
  code: string;
  total_ils: number;
  items: OrderLine[];
};

const shekel = (n: number) => `₪ ${n}`;

/** Message format agreed in the design system (docs/design-system/build-stack.md). */
export function buildOrderMessage(order: PlacedOrder, customerName: string, area?: string) {
  const lines = order.items.map((i) => {
    const vol = i.volume_ml ? ` ${i.volume_ml} مل` : "";
    return `• ${i.name_ar}${vol} × ${i.qty} — ${shekel(i.line_total_ils)}`;
  });
  const who = area?.trim() ? `الاسم: ${customerName.trim()} — المنطقة: ${area.trim()}` : `الاسم: ${customerName.trim()}`;
  return [
    `مرحباً صالون عدلي، أريد تثبيت طلب رقم ${order.code}:`,
    ...lines,
    `المجموع: ${shekel(order.total_ils)}`,
    who,
  ].join("\n");
}

function salonNumber() {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  if (!number) throw new Error("NEXT_PUBLIC_WHATSAPP_NUMBER is not set");
  return number.replace(/\D/g, "");
}

export function whatsappUrl(message: string) {
  return `https://wa.me/${salonNumber()}?text=${encodeURIComponent(message)}`;
}

/** Plain chat with the salon, no prefilled order. */
export function whatsappChatUrl() {
  return `https://wa.me/${salonNumber()}`;
}
