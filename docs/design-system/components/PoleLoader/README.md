# PoleLoader

A barber-pole loader shown while the hero bottle frames stream in, and the same stripe as a thin scroll-progress bar.

- `.ad-pole` for the loader (centered on `ground` until the canvas reports ready); `.ad-progress` inside a `surface-sunk` track for scroll progress, width bound to scroll position.
- The consumer provides the loading state (frames loaded / total) and the scroll fraction.
- Stripes stop moving under `prefers-reduced-motion`.
- Never use the pole stripe as decoration elsewhere; it means "in progress".
