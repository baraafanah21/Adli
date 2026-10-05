# Button

A pill button in three roles: `primary` (brass), `whatsapp` (the single send-order action) and `ghost`.

- Markup: `<button class="ad-btn ad-btn--primary">`. Add `ad-btn--block` for full width inside the order sheet.
- The consumer provides the label (an action verb in Arabic) and, optionally, a 20px icon before it.
- `ad-btn--whatsapp` appears once per screen, only in the order sheet and the closing scene. Its text is `on-whatsapp`, never white.
- One `primary` per product. Secondary actions are `ghost`.
- Disabled state is the `disabled` attribute; relabel it to say why ("نفدت الكمية"), don't only grey it out.
- Minimum height 48px for thumbs.
