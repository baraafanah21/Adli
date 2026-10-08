"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import {
  counters,
  footerLogo,
  headingWords,
  magnetic,
  photoParallax,
  priceLists,
  stackLayers,
} from "@/lib/motion/effects";

gsap.registerPlugin(useGSAP);

/**
 * The GSAP layer (U5.2), loaded by MotionLayer only after the page has loaded and the browser is idle, never with
 * reduced motion. One run per page (MotionLayer keys it by pathname): useGSAP reverts every tween, ScrollTrigger and
 * split on unmount, and gsap.matchMedia reverts them at once if reduced motion is switched on meanwhile. The hero's
 * bottle and shears are left alone (they have their own CSS scroll depth and pause rules); nothing is pinned by JS.
 */
export default function MotionRoot() {
  useGSAP((_, contextSafe) => {
    const safe = contextSafe!;
    const root = document.body;
    const mm = gsap.matchMedia();

    mm.add(
      { motion: "(prefers-reduced-motion: no-preference)", fine: "(hover: hover) and (pointer: fine)" },
      (ctx) => {
        const { motion, fine } = ctx.conditions as { motion: boolean; fine: boolean };
        if (!motion) return;
        // Top to bottom, so ScrollTrigger refreshes them in page order.
        const cleanups = [
          stackLayers(root),
          headingWords(root),
          priceLists(root),
          counters(root),
          photoParallax(root),
          footerLogo(root, safe),
          fine ? magnetic(root, safe) : undefined,
        ];

        // Positions change when the shelf is filtered or late content arrives: refresh once it settles.
        const page = document.querySelector(".ad-page");
        let timer: ReturnType<typeof setTimeout> | undefined;
        let lastHeight = page?.clientHeight ?? 0;
        const ro = new ResizeObserver(() => {
          const h = page?.clientHeight ?? 0;
          if (h === lastHeight) return;
          lastHeight = h;
          clearTimeout(timer);
          timer = setTimeout(() => ScrollTrigger.refresh(), 200);
        });
        if (page) ro.observe(page);
        ScrollTrigger.refresh();

        return () => {
          ro.disconnect();
          clearTimeout(timer);
          cleanups.forEach((c) => c?.());
        };
      },
    );
  });

  return null;
}
