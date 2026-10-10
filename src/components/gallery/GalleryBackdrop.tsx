"use client";

/*
  The background of «زبايننا المرتّبين» behind the title and the row: the published photos, one after another (a
  crossfade every ~7 s). Never more than two <img> in the DOM: the one shown and the next, which is decoded before it
  fades in. Each covers the background at its own ratio and drifts very slowly so all of it is seen: a photo taller
  than the background pans top → bottom, a wider one right → left (RTL), both with a zoom of 1 → 1.08. Only transform
  (translate, scale) moves: composited, no layout, no CLS. A forest tint lies over it (ChairGallery.module.css),
  never a blur.

  The files are the cards' own: on a phone the 480px .sm.webp; on a wider screen the large photo (the one a card
  loads on a 2x screen and the reels viewer opens; a 480px file stretched across a computer screen is a blur). Stops (timer and drift) while the section is off screen, the tab is
  hidden, or the reels viewer is open. Reduced motion: the first photo, still. Server-rendered as that still photo
  (lazy: the section is below the fold, never the LCP).
*/

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { GalleryItem } from "@/lib/gallery";
import { GALLERY_ALT } from "@/lib/gallery-items";
import styles from "./ChairGallery.module.css";

const SHOW_MS = 7000;
const FADE_MS = 1200;

type Layer = { index: number; key: number } | null;
type Box = { w: number; h: number };

/** The photo's size to cover the box at its own ratio, and how far it travels (px) along the longer side. */
function cover(item: GalleryItem, box: Box) {
  const ratio = item.width / item.height;
  if (ratio < box.w / box.h) {
    const h = box.w / ratio;
    return { w: box.w, h, dx: 0, dy: h - box.h };
  }
  const w = box.h * ratio;
  return { w, h: box.h, dx: w - box.w, dy: 0 };
}

export function GalleryBackdrop({ images, paused }: { images: GalleryItem[]; paused: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const imgs = useRef<(HTMLImageElement | null)[]>([null, null]);
  const [box, setBox] = useState<Box | null>(null);
  const [onScreen, setOnScreen] = useState(false);
  const [visible, setVisible] = useState(true);
  const [still, setStill] = useState(true); // reduced motion (and until the client knows)
  const [layers, setLayers] = useState<[Layer, Layer]>([{ index: 0, key: 0 }, null]);
  const [front, setFront] = useState<0 | 1>(0);

  const running = !still && onScreen && visible && !paused && box !== null;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mq.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    io.observe(el);
    ro.observe(el);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  // Every SHOW_MS: the next photo goes into the hidden layer; it fades in once decoded (below).
  useEffect(() => {
    if (!running || images.length < 2) return;
    const timer = setTimeout(() => {
      setLayers((ls) => {
        const shown = ls[front];
        const next = ((shown?.index ?? 0) + 1) % images.length;
        const copy: [Layer, Layer] = [...ls];
        copy[front === 0 ? 1 : 0] = { index: next, key: (shown?.key ?? 0) + 1 };
        return copy;
      });
    }, SHOW_MS);
    return () => clearTimeout(timer);
  }, [running, front, images.length]);

  // The hidden layer has a new photo: decode it, then swap (the CSS opacity transition is the crossfade).
  const back = front === 0 ? 1 : 0;
  const backKey = layers[back]?.key;
  useEffect(() => {
    if (backKey === undefined) return;
    const img = imgs.current[back];
    if (!img) return;
    let live = true;
    img
      .decode()
      .catch(() => {})
      .then(() => live && setFront(back));
    return () => {
      live = false;
    };
  }, [backKey, back]);

  if (images.length === 0) return null;

  return (
    <div ref={root} className={styles.backdropFill} data-running={running ? "" : undefined} aria-hidden="true">
      {layers.map((layer, slot) => {
        if (!layer || (still && slot !== 0)) return null;
        const item = images[still ? 0 : layer.index];
        const fit = box && !still ? cover(item, box) : null;
        const style = fit
          ? ({
              "--w": `${fit.w}px`,
              "--h": `${fit.h}px`,
              "--dx": `${fit.dx}px`,
              "--dy": `${fit.dy}px`,
              "--run": `${SHOW_MS + 2 * FADE_MS}ms`,
              "--fade": `${FADE_MS}ms`,
            } as CSSProperties)
          : undefined;
        return (
          <picture key={layer.key}>
            <source media="(max-width: 600px)" srcSet={item.sm} />
            <img
              ref={(el) => {
                imgs.current[slot] = el;
              }}
              className={styles.backdropImg}
              src={item.sm}
              srcSet={`${item.sm} 480w, ${item.src} 1080w`}
              sizes="100vw"
              // The words for Google Images; a backdrop is scenery, so screen readers skip it.
              alt={GALLERY_ALT}
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              data-fit={fit ? "" : undefined}
              data-front={slot === front ? "" : undefined}
              style={style}
            />
          </picture>
        );
      })}
    </div>
  );
}
