/**
 * U5.2 motion layer: the GSAP effects. Imported only by MotionRoot, which loads after the page (see MotionLayer), so
 * none of this is in the first-load bundle. The golden rule: the page is complete and readable before GSAP arrives.
 * An effect hides something only if it is still under the screen at that moment (`belowFold`); whatever is already
 * in view stays exactly as it is. Every effect hooks onto server-rendered markup by a data attribute, never changes
 * the DOM React owns for longer than its animation (SplitText reverts when done), and
 * returns a cleanup. Colours come from tokens (currentColor, --shade).
 *
 *   data-layer            hero and each section layer, in page order: dims (--cover, --shade) as the next one rises
 *   data-layer="rise"     a section layer: sticky at its own bottom edge, so the next one rises over it (U4 extended)
 *   data-motion="words"   a heading: word by word (SplitText words only: Arabic letters are joined, never chars)
 *   data-motion="parallax"  a photo frame: the photo drifts inside it
 *   data-motion="price-list"  the price board: each leader is drawn ([data-leader]), then the price counts up
 *   data-count            a number that counts up (its text keeps its format; the width is held while it counts)
 *   data-magnetic         a booking button: leans toward the pointer (mouse only)
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);
// Phones: the address bar showing / hiding resizes the screen; don't recompute every trigger for it.
ScrollTrigger.config({ ignoreMobileResize: true });

type Cleanup = (() => void) | undefined;
type Safe = <T extends (...args: never[]) => unknown>(fn: T) => T;

/** --ease-out (cubic-bezier(0.22, 1, 0.36, 1)) is closest to power4.out. */
const EASE = "power4.out";

const belowFold = (el: Element) => el.getBoundingClientRect().top >= window.innerHeight;
const rtlOrigin = (el: Element) => (getComputedStyle(el).direction === "rtl" ? "100% 50%" : "0% 50%");

/** Layers: each one dims while the next rises over it; the section layers stick at their bottom edge (CSS). */
export function stackLayers(root: ParentNode): Cleanup {
  const layers = [...root.querySelectorAll<HTMLElement>("[data-layer]")];
  if (layers.length < 2) return;
  const rising = layers.filter((l) => l.dataset.layer === "rise");

  // Sticky needs each layer's height (top = min(header, screen − height)); kept fresh as the shelf filters change.
  const ro = new ResizeObserver(() => {
    for (const l of rising) l.style.setProperty("--layer-h", `${l.offsetHeight}px`);
  });
  for (const l of rising) {
    ro.observe(l);
    l.dataset.stacked = "";
  }
  for (const l of layers) l.dataset.shade = "";

  // ScrollTrigger measures in normal flow: a layer stuck at that moment would give a wrong position.
  const unstick = () => rising.forEach((l) => delete l.dataset.stacked);
  const restick = () => rising.forEach((l) => (l.dataset.stacked = ""));
  ScrollTrigger.addEventListener("refreshInit", unstick);
  ScrollTrigger.addEventListener("refresh", restick);

  // clamp(): a layer already peeking in at the top of the page (wide screens) starts from 0 there, so nothing on
  // screen changes the moment this loads.
  layers.forEach((layer, i) => {
    const next = layers[i + 1];
    if (!next) return;
    gsap.fromTo(
      layer,
      { "--cover": 0 },
      {
        "--cover": 1,
        ease: "none",
        scrollTrigger: { trigger: next, start: "clamp(top bottom)", end: "clamp(top top)", scrub: true },
      },
    );
  });

  return () => {
    ro.disconnect();
    ScrollTrigger.removeEventListener("refreshInit", unstick);
    ScrollTrigger.removeEventListener("refresh", restick);
    for (const l of layers) {
      delete l.dataset.shade;
      delete l.dataset.stacked;
      l.style.removeProperty("--layer-h");
      l.style.removeProperty("--cover");
    }
  };
}

/** Section headings, word by word, once. Reverted to the original markup as soon as they have landed. */
export function headingWords(root: ParentNode): Cleanup {
  root.querySelectorAll<HTMLElement>("[data-motion~='words']").forEach((el) => {
    if (!belowFold(el)) return;
    const split = SplitText.create(el, { type: "words", aria: "auto" });
    gsap.from(split.words, {
      opacity: 0,
      yPercent: 45,
      duration: 0.9,
      ease: EASE,
      stagger: 0.09,
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
      onComplete: () => split.revert(),
    });
  });
  return undefined;
}

/** Photos drift inside their frame (CSS `translate` / `scale` on the img, so the card's hover zoom still works). */
export function photoParallax(root: ParentNode): Cleanup {
  const frames = [...root.querySelectorAll<HTMLElement>("[data-motion~='parallax']")].filter(belowFold);
  for (const el of frames) {
    el.dataset.parallax = "on";
    gsap.fromTo(
      el,
      { "--drift": "-5%" },
      { "--drift": "5%", ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true } },
    );
  }
  return () => {
    for (const el of frames) {
      delete el.dataset.parallax;
      el.style.removeProperty("--drift");
    }
  };
}

/** A count-up tween for one [data-count] element (no trigger of its own), and how to put the text back. */
function countTween(el: HTMLElement) {
  const node = el.firstChild;
  if (!(node instanceof Text) || !node.nodeValue) return null;
  const final = node.nodeValue;
  const match = final.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const to = Number(el.dataset.count || match[0]);
  // Same width while counting, so nothing beside it moves (no layout shift).
  el.style.minInlineSize = `${el.getBoundingClientRect().width}px`;
  const restore = () => {
    node.nodeValue = final;
    el.style.removeProperty("min-inline-size");
  };
  const n = { v: 0 };
  node.nodeValue = final.replace(match[0], "0");
  const tween = gsap.to(n, {
    v: to,
    duration: 1.1,
    ease: "power2.out",
    onUpdate: () => {
      node.nodeValue = final.replace(match[0], String(Math.round(n.v)));
    },
    onComplete: restore,
  });
  return { tween, restore };
}

/** The price board: row by row, the dotted leader is drawn from the name, then the price counts up. */
export function priceLists(root: ParentNode): Cleanup {
  const restores: (() => void)[] = [];
  root.querySelectorAll<HTMLElement>("[data-motion~='price-list']").forEach((list) => {
    if (!belowFold(list)) return;
    const tl = gsap.timeline({ scrollTrigger: { trigger: list, start: "top 85%", once: true } });
    [...list.children].forEach((row, i) => {
      const at = i * 0.08;
      const leader = row.querySelector<HTMLElement>("[data-leader]");
      if (leader) tl.from(leader, { scaleX: 0, transformOrigin: rtlOrigin(leader), duration: 0.6, ease: EASE }, at);
      const price = row.querySelector<HTMLElement>("[data-count]");
      const count = price && countTween(price);
      if (count) {
        restores.push(count.restore);
        tl.add(count.tween, at + 0.25);
      }
    });
  });
  return () => restores.forEach((r) => r());
}

/** Any other [data-count] (outside a price list): counts up once when it comes into view. */
export function counters(root: ParentNode): Cleanup {
  const restores: (() => void)[] = [];
  root.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
    if (el.closest("[data-motion~='price-list']") || !belowFold(el)) return;
    const count = countTween(el);
    if (!count) return;
    count.tween.pause();
    restores.push(count.restore);
    ScrollTrigger.create({ trigger: el, start: "top 90%", once: true, onEnter: () => count.tween.play() });
  });
  return () => restores.forEach((r) => r());
}

/** Booking buttons lean toward the pointer, at most 6px, and settle back (fine pointer only, see MotionRoot). */
export function magnetic(root: ParentNode, safe: Safe): Cleanup {
  const MAX = 6;
  const clamp = gsap.utils.clamp(-MAX, MAX);
  const offs = [...root.querySelectorAll<HTMLElement>("[data-magnetic]")].map((el) => {
    el.dataset.magneticOn = "";
    const xTo = gsap.quickTo(el, "--mag-x", { duration: 0.45, ease: "power3.out" });
    const yTo = gsap.quickTo(el, "--mag-y", { duration: 0.45, ease: "power3.out" });
    const move = safe((e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      xTo(clamp((e.clientX - (r.left + r.width / 2)) * 0.25));
      yTo(clamp((e.clientY - (r.top + r.height / 2)) * 0.4));
    });
    const leave = safe(() => {
      xTo(0);
      yTo(0);
    });
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      delete el.dataset.magneticOn;
      el.style.removeProperty("--mag-x");
      el.style.removeProperty("--mag-y");
    };
  });
  return () => offs.forEach((off) => off());
}
