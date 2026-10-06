/*
  Brand colors as hex, for the hero WebGL canvas only (a canvas can't read CSS variables).
  Everything else uses var(--token). Keep in sync with src/styles/tokens.css (night values).
*/
export const BRAND = {
  forest: "#0B300F",
  cream: "#F5F5DB",
  brass: "#C9A24A",
  brassBright: "#E3C987",
} as const;

/** Scene-only tints from docs/prototypes/hero-bottle-prototype.html (not UI colors). */
export const SCENE = {
  glass: "#ffffff",
  juice: "#ffe9c9",
  juiceAttenuation: "#D9813A",
  dipTube: "#efe9dc",
  keyLight: "#ffe4bd",
  haloCore: "#ffe0a8",
  haloMid: "#c99a4c",
  haloEdge: "#2d4a1c",
} as const;
