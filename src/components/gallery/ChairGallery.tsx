"use client";

/*
  «زبايننا المرتّبين» (U5.3): the salon's photos and silent videos. Pictures only: no caption, no name, no button on an item;
  the one title is «زبايننا المرتّبين».

  A. مرآة الصالون (only with a featured video): the video seen through the seal (adli-seal-mono.svg as a CSS mask,
     never redrawn: the video shows inside the ع and between the rings), in the middle of a dark stage with a brass
     ring. Scrolling, the seal and the ring fade and the circle opens until it fills the screen (CSS sticky, scrubbed
     by GSAP; no GSAP pin). On a wide screen the 9:16 video stands in the middle over a blurred copy of its poster.
     Server-rendered open (the end state), so it is complete without JS and with reduced motion; the scrub only
     takes over when it is still under the screen as GSAP arrives.
  B. The row: 9:16 cards in a thin brass frame (a photo keeps its 4:5 or 1:1 at the same height), scroll-snap,
     right to left. The card in the middle is full size, its neighbours 0.92. Only that card plays; the rest show
     their poster; photos drift slowly (Ken Burns). On a computer, hovering a card plays it.
  C. A tap opens the reels viewer (ReelViewer, loaded on demand).
  D. The photos the owner marked «خلفية» (published) change slowly behind the title and the row (GalleryBackdrop),
     under a light forest tint, in the night tokens; they are not cards. Without any, the section looks as before.

  One video plays at a time on the whole page (playback.ts). Posters are lazy and sized (480px on phones), videos
  are preload="none" here; nothing loads before the section comes near. GSAP (ScrollTrigger, Flip, DrawSVG) comes
  with the motion module only then (gallery-motion.ts).
*/

import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { GalleryBackdrop } from "./GalleryBackdrop";
import type { GalleryItem } from "@/lib/gallery";
import { backdropPhotos, rowItems } from "@/lib/gallery-items";
import { play, release } from "./playback";
import styles from "./ChairGallery.module.css";

const ReelViewer = dynamic(() => import("./ReelViewer"), { ssr: false });

const RATIO: Record<GalleryItem["aspect"], number> = { "9:16": 9 / 16, "4:5": 4 / 5, "1:1": 1 };

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export function ChairGallery({ items: all }: { items: GalleryItem[] }) {
  const titleId = useId();
  const items = useMemo(() => rowItems(all), [all]);
  const photos = useMemo(() => backdropPhotos(all), [all]);
  const featured = useMemo(() => items.find((i) => i.featured && i.kind === "video") ?? null, [items]);
  const section = useRef<HTMLElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const mirrorVideo = useRef<HTMLVideoElement>(null);
  const row = useRef<HTMLOListElement>(null);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const cardVideo = useRef<HTMLVideoElement | null>(null);

  const [near, setNear] = useState(false); // the section is coming: load the motion module and prefetch the viewer
  const [rowSeen, setRowSeen] = useState(false); // the row is on screen: its middle card may play
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  // The open item, and whether it came from a tap (the card grows into the viewer) or from the address (?reel=id).
  const [open, setOpen] = useState<{ index: number; fromCard: boolean } | null>(null);
  const [closeAsked, setCloseAsked] = useState(0); // the browser's back while open: the viewer closes itself
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  const playing = hovered ?? (rowSeen ? active : null);

  // ?reel=<id>: opened by the address, closed by the browser's back button. Read on the client only.
  useEffect(() => {
    const sync = () => {
      const id = new URLSearchParams(window.location.search).get("reel");
      const index = id ? items.findIndex((i) => i.id === id) : -1;
      if (index >= 0 && !openRef.current) setOpen({ index, fromCard: false });
      else if (index < 0 && openRef.current) setCloseAsked((n) => n + 1);
    };
    const first = requestAnimationFrame(sync);
    window.addEventListener("popstate", sync);
    return () => {
      cancelAnimationFrame(first);
      window.removeEventListener("popstate", sync);
    };
  }, [items]);

  const openItem = (index: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set("reel", items[index].id);
    window.history.pushState({ reel: items[index].id }, "", url);
    setOpen({ index, fromCard: true });
  };

  const closed = (index: number) => {
    setOpen(null);
    setActive(index);
    focusCard(index);
    // Leave the address as it was before opening: back over the entry we pushed, or drop ?reel from a direct visit.
    const url = new URL(window.location.href);
    if (!url.searchParams.has("reel")) return;
    if ((window.history.state as { reel?: string } | null)?.reel) window.history.back();
    else {
      url.searchParams.delete("reel");
      window.history.replaceState(null, "", url);
    }
  };

  // Near: about a screen and a half before it shows.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "150% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Near: fetch the viewer now (GSAP Flip and DrawSVG come with it), so the first tap opens at once.
  useEffect(() => {
    if (near) void import("./ReelViewer");
  }, [near]);

  // The GSAP layer for this section (the mirror's scrub, the row's entrance, tilt and hover), once near.
  useEffect(() => {
    if (!near || reducedMotion()) return;
    let undo: (() => void) | undefined;
    let cancelled = false;
    void import("./gallery-motion").then(({ setupGalleryMotion }) => {
      if (cancelled) return;
      undo = setupGalleryMotion({ mirror: mirror.current, row: row.current, cards: cards.current.filter(Boolean) as HTMLElement[] });
    });
    return () => {
      cancelled = true;
      undo?.();
    };
  }, [near]);

  // The mirror's video plays while most of its stage is on screen (never with reduced motion).
  useEffect(() => {
    // The stage, not its wrapper: scrubbed, the wrapper is 260svh tall and never half on screen.
    const stage = mirror.current?.firstElementChild;
    const video = mirrorVideo.current;
    if (!stage || !video || reducedMotion()) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio >= 0.5) play(video);
        else release(video);
      },
      { threshold: [0, 0.5] },
    );
    io.observe(stage);
    return () => {
      io.disconnect();
      release(video);
    };
  }, []);

  // The row: on screen or not, and which card is in the middle (on scroll, once a frame); neighbours at 0.92.
  useEffect(() => {
    const list = row.current;
    if (!list) return;
    const io = new IntersectionObserver(([e]) => setRowSeen(e.intersectionRatio >= 0.6), { threshold: [0, 0.6] });
    io.observe(list);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const box = list.getBoundingClientRect();
      const middle = box.left + box.width / 2;
      let best = 0;
      let bestDistance = Infinity;
      cards.current.forEach((card, i) => {
        if (!card) return;
        const r = card.getBoundingClientRect();
        const distance = Math.abs(r.left + r.width / 2 - middle);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
        card.style.setProperty("--near", String(Math.max(0, 1 - distance / Math.max(1, r.width))));
      });
      setActive(best);
      // Every card fits without scrolling (layout widths, not the scaled boxes): centre the row (data-fits, CSS).
      const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
      const total = cards.current.reduce((sum, card) => sum + (card?.offsetWidth ?? 0), 0) + gap * Math.max(0, cards.current.length - 1);
      const fits = total <= list.clientWidth - 2 * 16;
      if (fits !== list.hasAttribute("data-fits")) list.toggleAttribute("data-fits", fits);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    list.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      list.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // The playing card: only one, never with reduced motion, never while the viewer is open.
  useEffect(() => {
    const video = cardVideo.current;
    if (!video || open !== null || reducedMotion()) return;
    play(video);
    return () => release(video);
  }, [playing, open]);

  /** A card for the viewer's shared-element transition, brought to the middle of the row first (instantly), so
   *  «back to the card» lands on the right card in view even if the row has moved or the item changed. */
  const cardFor = useCallback((index: number): HTMLElement | null => {
    const card = cards.current[index];
    const list = row.current;
    if (!card || !list) return null;
    const r = card.getBoundingClientRect();
    const box = list.getBoundingClientRect();
    list.scrollBy({ left: r.left + r.width / 2 - (box.left + box.width / 2), behavior: "instant" as ScrollBehavior });
    return card;
  }, []);

  const focusCard = useCallback((index: number) => cards.current[index]?.focus({ preventScroll: true }), []);

  return (
    <section ref={section} className={styles.section} aria-labelledby={titleId}>
      {featured && (
        <div ref={mirror} className={styles.mirror} data-mirror="open">
          <div className={styles.stage} data-theme="night">
            <div className={styles.clip}>
              {featured.poster && (
                // eslint-disable-next-line @next/next/no-img-element -- a blurred backdrop, decoration only
                <img className={styles.backdrop} src={featured.sm} alt="" aria-hidden="true" loading="lazy" decoding="async" />
              )}
              <video
                ref={mirrorVideo}
                className={styles.mirrorVideo}
                src={featured.src}
                poster={featured.poster ?? featured.sm}
                muted
                playsInline
                loop
                preload="none"
                aria-hidden="true"
                tabIndex={-1}
              />
            </div>
            <span className={styles.ring} aria-hidden="true" />
            <span className={styles.seal} aria-hidden="true" data-seal>
              <BrandMark kind="seal" tone="mono" fluid />
            </span>
          </div>
        </div>
      )}

      <div className={styles.body} data-theme={photos.length ? "night" : undefined}>
      {photos.length > 0 && (
        <>
          <GalleryBackdrop images={photos} paused={open !== null} />
          <span className={styles.backdropTint} aria-hidden="true" />
        </>
      )}
      <div className={styles.head}>
        <h2 id={titleId} className="display-lg" data-motion="words">
          زبايننا المرتّبين
        </h2>
      </div>

      <ol ref={row} className={styles.row} aria-label="صور وفيديوهات زبايننا المرتّبين">
        {items.map((item, i) => {
          const isVideo = item.kind === "video";
          const label = `${isVideo ? "فيديو" : "صورة"} ${i + 1} من ${items.length}`;
          const poster = isVideo ? (item.poster ?? item.sm) : item.src;
          return (
            <li key={item.id} className={styles.cell}>
              <button
                ref={(el) => {
                  cards.current[i] = el;
                }}
                type="button"
                className={styles.card}
                data-kind={item.kind}
                style={{ "--ratio": RATIO[item.aspect] } as CSSProperties}
                aria-label={`${label}، افتحه`}
                onClick={() => openItem(i)}
                onPointerEnter={() => finePointer() && isVideo && setHovered(i)}
                onPointerLeave={() => setHovered((h) => (h === i ? null : h))}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Storage WebP as it is, sized by srcset */}
                <img
                  className={styles.poster}
                  src={item.sm}
                  srcSet={`${item.sm} 480w, ${poster} 1080w`}
                  sizes="(max-width: 600px) 75vw, 320px"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
                {isVideo && playing === i && open === null && (
                  <video
                    ref={cardVideo}
                    className={styles.cardVideo}
                    src={item.src}
                    muted
                    playsInline
                    loop
                    preload="none"
                    aria-hidden="true"
                    tabIndex={-1}
                    onPlaying={(e) => e.currentTarget.setAttribute("data-on", "")}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>
      </div>

      {open !== null && (
        <ReelViewer
          items={items}
          start={open.index}
          fromCard={open.fromCard}
          cardFor={cardFor}
          closeAsked={closeAsked}
          onClosed={closed}
        />
      )}
    </section>
  );
}
