# OrderSheet

The bottom sheet that lists the chosen items, collects name and area, and sends the order to WhatsApp.

- Markup: `section.ad-sheet` with `.ad-line` rows (name + meta, `.ad-stepper`, line price), `.ad-total`, two `.ad-field`s and one `ad-btn--whatsapp ad-btn--block`.
- The consumer provides the cart items (product id, name, volume, unit price, quantity), and handles send: POST to the server route that recomputes the total from Supabase, stores the order, returns its code, then opens `wa.me` with the message from the Build section.
- Opens from the cart icon with `shadow-panel`, 420ms, over a scrim at `z-sheet`. On desktop it docks to the left edge (RTL end) at 440px.
- Quantity 0 removes the row. An empty sheet says "سلتك فارغة" with a ghost button "تصفّح العطور".
- Name is required; area is optional. Errors say what to fix: "اكتب اسمك ليصل الطلب باسمك".
- The send button stays disabled while saving and reads "جارٍ تجهيز الطلب…".
