# BundleContents

What a gift bundle holds, on the bundle's product page, under the description and above the price row.

- Markup: `section.ad-bundle[aria-label="محتوى البكجة"]` on `surface-sunk` with a `line` border and `radius-md`: the title «في البكجة», `ul.ad-bundle__lines` (name and, when more than one, «2 × » in `ink-muted`; each piece's own price at the end), then `.ad-bundle__sum` «قيمتها منفصلة» with the separate total struck through, then `.ad-bundle__saving` «توفّر ₪ 35» in `brass`.
- Each piece links to its product page. Its name includes the variant when it has one («طاقية سوداء، مقاس L»).
- The bundle's own price is fixed by the salon (the bundle's variant, or the product price); the row below it is the usual price and «أضف للطلب». The saving line only shows when the bundle costs less than its pieces.
- Availability: the bundle is «نفدت الكمية» when any piece is out (or hidden), and «كمية محدودة» when any piece is low. Exact counts are never shown.
- Data: `products.kind = 'bundle'`, its pieces in `bundle_items` (variant, qty, sort). A piece is always a simple product's variant, never another bundle.
- A later «ركّب بكجتك بنفسك» is a different flow with its own tables; this component stays for the fixed bundles.
