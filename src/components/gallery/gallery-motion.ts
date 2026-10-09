/*
  «زبايننا المرتّبين»'s motion (GSAP), imported by ChairGallery only once the section is near, never with reduced motion. The
  golden rule of the motion layer holds: the section is complete as the server sent it (the mirror open, the cards in
  place), and an effect takes over only what is still under the screen when this arrives.

    mirror   CSS sticky (data-mirror="scrub" makes its wrapper tall and its stage sticky; no GSAP pin), scrubbed:
             the seal and the brass ring fade, then the circle (clip-path: circle(var(--r))) opens until it covers
             the screen's corners.
    row      the cards rise in one after another (stagger) the first time the row comes in; a fast scroll leans them
             (rotateY, at most 6°, by the scroll's speed) and they settle back when it stops; on a computer a card
             leans toward the pointer (at most 4°).
  Only transforms and opacity, on CSS variables the stylesheet composes, so the card's own scale (--near) and press
  state keep working underneath.
*/
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

type Parts = { mirror: HTMLElement | null; row: HTMLElement | null; cards: HTMLElement[] };

const belowFold = (el: Element) => el.getBoundingClientRect().top >= window.innerHeight;

export function setupGalleryMotion({ mirror, row, cards }: Parts): () => void {
  const ctx = gsap.context(() => {
    // A. The mirror ------------------------------------------------------------------------------------------------
    if (mirror && belowFold(mirror)) {
      mirror.dataset.mirror = "scrub";
      const stage = mirror.firstElementChild as HTMLElement;
      // The seal's radius on this screen (the CSS sets the seal's size), and the radius that covers every corner.
      const sealRadius = () => (stage.querySelector<HTMLElement>("[data-seal]")?.offsetWidth ?? 300) / 2;
      const cover = () => Math.hypot(stage.clientWidth, stage.clientHeight) / 2 + 2;
      gsap.set(stage, { "--r": `${sealRadius()}px`, "--veil": 1 });
      gsap
        .timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: mirror,
            start: "top top",
            end: "bottom bottom",
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        })
        .fromTo(stage, { "--veil": 1 }, { "--veil": 0, duration: 0.35 }, 0)
        .fromTo(stage, { "--r": () => `${sealRadius()}px` }, { "--r": () => `${cover()}px`, duration: 0.85, ease: "power2.in" }, 0.15);
    }

    // B. The row ---------------------------------------------------------------------------------------------------
    if (!row) return;
    if (belowFold(row)) {
      // On each card's cell, not the card: the card's own transform carries its scale and lean.
      gsap.from(cards.map((c) => c.parentElement), {
        y: 64,
        opacity: 0,
        duration: 0.9,
        ease: "power4.out",
        stagger: 0.08,
        scrollTrigger: { trigger: row, start: "top 88%", once: true },
      });
    }

    // Lean with the scroll's speed, back to straight when it stops.
    const lean = gsap.quickTo(row, "--lean", { duration: 0.5, ease: "power3.out" });
    let last = row.scrollLeft;
    let lastTime = performance.now();
    let settle = 0;
    const onScroll = () => {
      const now = performance.now();
      const speed = (row.scrollLeft - last) / Math.max(1, now - lastTime); // px per ms
      last = row.scrollLeft;
      lastTime = now;
      lean(gsap.utils.clamp(-6, 6, speed * 4));
      clearTimeout(settle);
      settle = window.setTimeout(() => lean(0), 90);
    };
    row.addEventListener("scroll", onScroll, { passive: true });

    // A computer: the card under the pointer leans toward it.
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const offs = fine
      ? cards.map((card) => {
          const rx = gsap.quickTo(card, "--tilt-x", { duration: 0.4, ease: "power3.out" });
          const ry = gsap.quickTo(card, "--tilt-y", { duration: 0.4, ease: "power3.out" });
          const move = (e: PointerEvent) => {
            const r = card.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width - 0.5;
            const py = (e.clientY - r.top) / r.height - 0.5;
            ry(px * 8); // ±4°
            rx(-py * 8);
          };
          const leave = () => {
            rx(0);
            ry(0);
          };
          card.addEventListener("pointermove", move);
          card.addEventListener("pointerleave", leave);
          return () => {
            card.removeEventListener("pointermove", move);
            card.removeEventListener("pointerleave", leave);
          };
        })
      : [];

    return () => {
      row.removeEventListener("scroll", onScroll);
      clearTimeout(settle);
      offs.forEach((off) => off());
    };
  });

  ScrollTrigger.refresh();
  return () => {
    ctx.revert();
    if (mirror) mirror.dataset.mirror = "open";
  };
}
