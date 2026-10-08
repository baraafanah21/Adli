# OrderSheet

The bottom sheet that lists the chosen items, collects name and area, and sends the order to WhatsApp.

- Markup: `section.ad-sheet` with `.ad-line` rows (name + meta, `.ad-stepper`, line price), `.ad-total`, two `.ad-field`s and one `ad-btn--whatsapp ad-btn--block`.
- The consumer provides the cart items (variant id, product name, variant name, volume, unit price, quantity), and handles send: POST to the server route that recomputes the total from Supabase, stores the order, returns its code, then opens `wa.me` with the message from the Build section.
- Opens from the cart icon with `shadow-panel`, 420ms, over a scrim at `z-sheet`. On desktop it docks to the left edge (RTL end) at 440px.
- Quantity 0 removes the row. An empty sheet says "سلتك فارغة" with a ghost button "تصفّح المنتجات".
- Name is required; area is optional. Errors say what to fix: "اكتب اسمك ليصل الطلب باسمك".
- The send button stays disabled while saving and reads "جارٍ تجهيز الطلب…".
- Shell (Phase A): a native `<dialog>` opened with `showModal()` (focus trap, Esc, top layer above `z-sheet`), closed by the scrim or a 44px «إغلاق» button. Slides up on phones, from the RTL end on desktop, 420ms; no motion under `prefers-reduced-motion`.
- Fields: name (required), area (optional), phone (required since Phase U: `PhoneField`, the +970 / +972 prefix and the local number, `dir="ltr"`; also refused without it by `POST /api/orders` and `orders_phone_required`). Stepper buttons are 44px; on quantity 1 the minus button is labelled «احذف …» and removes the row.
- The send goes to `POST /api/orders` (never the RPC directly). A product that ran out is marked on its line («نفدت الكمية، احذفه من السلة») and the alert says «نفدت كمية عود ملكي، احذفه من السلة لتكمل الطلب.»; sending stays disabled until it's removed. Errors sit in a box outlined in `oud` with `ink` text.
- After success the cart is cleared and WhatsApp opens in the same tab; the sheet keeps «أُرسل الطلب رقم AD-…» with a fallback «افتح واتساب» link.
- Phase D: a line is one variant. Its meta shows the variant name, then the volume («سوداء، مقاس L»); the stepper labels and the out-of-stock alert use the full name («نفدت كمية طاقية سوداء، مقاس L، احذفه من السلة لتكمل الطلب.»). The WhatsApp line carries the variant name too.
