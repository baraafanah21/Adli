# VariantPicker

Choosing a product's size, colour or other option on its page. Sits above the price row inside `.ad-card--lg`; the price, availability and «أضف للطلب» follow the chosen variant.

- Markup: `.ad-picker` > one `fieldset.ad-picker__option` per option, its `legend.ad-picker__legend` is the option name with the current value («اللون: أسود»), then `.ad-picker__values`.
- Each value is a native radio (visually hidden) inside its label, so arrow keys move within an option and the group is announced with its name:
  - size and text options: `label.ad-chip` (the category chip, pressed = `brass` fill with `on-brass` text).
  - colour options: `label.ad-swatch`, a 24px circle in the colour's own hex (`--swatch`, from the data) with the colour's name beside it as text. Colour is never shown alone.
- Unavailable value (`.is-out`): no in-stock variant has it together with the other current choices. Dimmed to 45%, the name struck through (the swatch gets a diagonal line), the radio disabled, and screen readers hear «، نفدت الكمية».
- Choosing a value picks the exact combination if it is in stock, otherwise the in-stock variant with that value that keeps most of the other choices.
- The chosen variant is in the URL as `?v=<sku>` (`history.replaceState`, no navigation); the server reads it so the first paint matches. An unknown sku falls back to the first in-stock variant.
- Under the price row, `.ad-stock` (role status) says «كمية محدودة» in `oud` when the chosen variant is low; when it is out, the button is disabled and says «نفدت الكمية».
- A product with only its default variant (no options) shows no picker at all.
- Data: `product_options` (name_ar, kind, sort) and `product_option_values` (label_ar, hex, sort); variants with their price (inherited when empty) and `stock_state`. Values no active variant uses are not shown.
- On the shelf, a product with options has no add button: the card shows «من ₪ 45» when variant prices differ and a ghost link «اختر اللون والمقاس» to its page.
