"use client";

/*
  «زبايننا المرتّبين»'s reels viewer, opened from a card (loaded on demand by ChairGallery).

  - In: the card itself grows to the full screen (GSAP Flip: the item's frame is fitted onto the card, then let go),
    its brass hairline melts away and the background darkens. Out: the same backwards, onto the right card in the
    row (ChairGallery brings it to the middle first), even if the row moved or the item changed. Opened from the
    address (?reel=id) or with reduced motion: a plain fade.
  - Moving: one item per screen (100dvh) on a native scroll-snap list, so a finger is followed 1:1 with natural
    momentum: up = next, down = previous. A computer: the wheel (one item per gesture), ↑ / ↓, and the ↑ / ↓ buttons
    beside the frame. Past the last item a pull up gives (rubber band) and springs back.
  - Closing: ✕, Esc, the browser's back (?reel=id, ChairGallery), and from the first item only a pull down: past a
    quarter of the screen it closes; on the way the item follows the finger, shrinks to 0.85, rounds to 24px and the
    background fades; let go before that and it springs back.
  - Playing: the current item loops; the ones before and after are ready. Only three <video> elements, reused
    (slot = index % 3): the next one preload="metadata". A tap pauses or plays (a pulsing sign); a long press pauses
    and hides every control until the finger lifts. A thin progress line at the bottom can be dragged to seek.
    «3 / 8» in a corner, western digits like the prices. Loading: the brass ring draws itself around the seal (DrawSVG), no spinner.
  - The background takes the item's dominant colour, sampled from its poster on an 8×8 canvas, darkened. A light
    vibration (8 ms) on a new item where the device has one. A modal <dialog>: focus stays inside, Arabic labels, and
    the focus goes back to the card.
*/

import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import type { GalleryItem } from "@/lib/gallery";
import { play, release } from "./playback";
import styles from "./ReelViewer.module.css";

gsap.registerPlugin(Flip, DrawSVGPlugin);

type Props = {
  items: GalleryItem[];
  start: number;
  /** Opened by a tap (the card grows into the viewer), or by the address (a fade). */
  fromCard: boolean;
  /** The row's card for an item, brought to the middle of the row first. */
  cardFor: (index: number) => HTMLElement | null;
  /** Counts up when the browser's back asks the viewer to close. */
  closeAsked: number;
  onClosed: (index: number) => void;
};

const RATIO: Record<GalleryItem["aspect"], number> = { "9:16": 9 / 16, "4:5": 4 / 5, "1:1": 1 };
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const LONG_PRESS = 400;
const tintCache = new Map<string, string>();

/*
  The page behind stays still while the viewer is open: on Safari a fixed body is the only lock a finger can't move,
  and on Chrome for Android overscroll-behavior: none (html[data-reel-open], components.css) stops the pull-to-refresh
  a pull down on the first item would otherwise start. The body is fixed where it was, so nothing moves on screen and
  the row's card is still where the closing transition expects it; scrolling comes back to the same place on close.
*/
function lockPage() {
  const y = window.scrollY;
  const body = document.body.style;
  const before = { position: body.position, top: body.top, insetInline: body.insetInline, width: body.width };
  document.documentElement.dataset.reelOpen = "";
  body.position = "fixed";
  body.top = `${-y}px`;
  body.insetInline = "0";
  body.width = "100%";
  return () => {
    Object.assign(body, before);
    delete document.documentElement.dataset.reelOpen;
    window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
  };
}

/** The poster's dominant colour (its 8×8 average), darkened so the controls stay readable. */
async function tintOf(url: string): Promise<string | null> {
  const known = tintCache.get(url);
  if (known) return known;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 8, 8);
    const data = ctx.getImageData(0, 0, 8, 8).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    const n = data.length / 4;
    const k = 0.32; // darkened: a backdrop, not a colour field
    const tint = `rgb(${Math.round((r / n) * k)}, ${Math.round((g / n) * k)}, ${Math.round((b / n) * k)})`;
    tintCache.set(url, tint);
    return tint;
  } catch {
    return null; // no CORS on the file: the default backdrop stays
  }
}

export default function ReelViewer({ items, start, fromCard, cardFor, closeAsked, onClosed }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const chrome = useRef<HTMLDivElement>(null);
  const frames = useRef<(HTMLDivElement | null)[]>([]);
  const slots = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const videos = useRef<(HTMLVideoElement | null)[]>([null, null, null]);
  const fill = useRef<HTMLDivElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const closing = useRef(false);
  const unlock = useRef<(() => void) | null>(null);
  const wheelLock = useRef<number | null>(null);
  const suppressClick = useRef(false);

  const [current, setCurrent] = useState(start);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false); // long press: paused, controls hidden
  const [pulse, setPulse] = useState<{ key: number; playing: boolean } | null>(null);
  const [loading, setLoading] = useState(items[start]?.kind === "video");
  const last = items.length - 1;
  const item = items[current];

  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  /** Which item each of the three video slots shows: the one of current − 1, current, current + 1 with i % 3 = slot. */
  const slotItem = (slot: number) => {
    for (const i of [current - 1, current, current + 1]) {
      if (i >= 0 && i <= last && i % 3 === slot && items[i].kind === "video") return i;
    }
    return null;
  };

  const height = () => list.current?.clientHeight ?? window.innerHeight;
  /** The current item's moving parts: its frame (poster) and, for a video, its video element (same size and place). */
  const movingParts = useCallback(() => {
    const i = currentRef.current;
    const video = items[i]?.kind === "video" ? videos.current[i % 3] : null;
    return [frames.current[i], video].filter(Boolean) as HTMLElement[];
  }, [items]);

  // ---- open ------------------------------------------------------------------------------------------------------
  useLayoutEffect(() => {
    const d = dialog.current;
    const l = list.current;
    if (!d || !l) return;
    d.showModal();
    unlock.current = lockPage();
    l.scrollTop = start * l.clientHeight;
    const frame = frames.current[start];
    const card = fromCard && !reduced() ? cardFor(start) : null;
    const ctx = gsap.context(() => {
      if (card && frame) {
        const from = Flip.fit(frame, card, { scale: true, getVars: true }) as gsap.TweenVars;
        gsap.from(frame, { ...from, duration: 0.65, ease: "expo.out" });
        gsap.fromTo(frame, { "--hairline": 1 }, { "--hairline": 0, duration: 0.5, ease: "power2.out", delay: 0.15 });
        gsap.from(backdrop.current, { opacity: 0, duration: 0.45, ease: "power2.out" });
        gsap.from(chrome.current, { opacity: 0, duration: 0.35, delay: 0.4 });
      } else {
        gsap.from(d, { opacity: 0, duration: 0.25, ease: "power1.out" });
      }
    }, d);
    d.focus();
    return () => {
      ctx.revert();
      unlock.current?.(); // unmounted without closing (navigating away): let the page go
      unlock.current = null;
    };
    // Opening happens once, for the item it opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- close -----------------------------------------------------------------------------------------------------
  const finish = useCallback(() => {
    const i = currentRef.current;
    for (const v of videos.current) {
      if (!v) continue;
      release(v);
      // Let go of the media now (no leak after many opens).
      v.removeAttribute("src");
      v.load();
    }
    dialog.current?.close();
    unlock.current?.();
    unlock.current = null;
    onClosed(i);
  }, [onClosed]);

  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const i = currentRef.current;
    for (const v of videos.current) v?.pause();
    const video = items[i]?.kind === "video" ? videos.current[i % 3] : null;
    if (video) gsap.set(video, { opacity: 0 }); // the poster underneath carries the way back
    const frame = frames.current[i];
    const card = reduced() ? null : cardFor(i);
    const r = card?.getBoundingClientRect();
    const onScreen = r && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
    if (frame && card && onScreen) {
      Flip.fit(frame, card, { scale: true, duration: 0.55, ease: "expo.inOut", onComplete: finish });
      gsap.to(frame, { "--hairline": 1, duration: 0.4, delay: 0.15 });
      gsap.to([backdrop.current, chrome.current], { opacity: 0, duration: 0.45, ease: "power2.in" });
    } else {
      gsap.to(dialog.current, { opacity: 0, duration: 0.25, ease: "power1.in", onComplete: finish });
    }
  }, [cardFor, finish, items]);

  // The browser's back button (ChairGallery counts it up).
  const asked = useRef(closeAsked);
  useEffect(() => {
    if (closeAsked !== asked.current) {
      asked.current = closeAsked;
      requestClose();
    }
  }, [closeAsked, requestClose]);

  // ---- which item: from the scroll position ----------------------------------------------------------------------
  useEffect(() => {
    const l = list.current;
    if (!l) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const i = Math.max(0, Math.min(last, Math.round(l.scrollTop / l.clientHeight)));
        if (i === currentRef.current || closing.current) return;
        currentRef.current = i;
        setCurrent(i);
        setPaused(false);
        setLoading(items[i].kind === "video");
        navigator.vibrate?.(8);
        const url = new URL(window.location.href);
        url.searchParams.set("reel", items[i].id);
        window.history.replaceState(window.history.state?.reel ? { reel: items[i].id } : window.history.state, "", url);
      });
    };
    l.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      l.removeEventListener("scroll", onScroll);
    };
  }, [items, last]);

  const go = useCallback(
    (to: number) => {
      const l = list.current;
      if (!l) return;
      const i = Math.max(0, Math.min(last, to));
      l.scrollTo({ top: i * l.clientHeight, behavior: reduced() ? "instant" : "smooth" });
    },
    [last],
  );

  // A pull past the last item: give a little and spring back (also for the wheel and ↓ at the end).
  const bounce = useCallback(() => {
    const parts = movingParts();
    gsap.fromTo(parts, { y: 0 }, { y: -36, duration: 0.14, ease: "power2.out", yoyo: true, repeat: 1 });
  }, [movingParts]);

  // ---- playing ---------------------------------------------------------------------------------------------------
  useEffect(() => {
    videos.current.forEach((v, slot) => {
      if (!v) return;
      const i = slotItem(slot);
      if (i === current && !paused && !held && !closing.current) play(v);
      else v.pause();
    });
    // slotItem depends on current only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, paused, held]);

  // A long press: every control out of the way until the finger lifts.
  useEffect(() => {
    if (!closing.current) gsap.to(chrome.current, { opacity: held ? 0 : 1, duration: 0.25, ease: "power2.out", overwrite: "auto" });
  }, [held]);

  // The progress line follows the current video, once a frame.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = item?.kind === "video" ? videos.current[current % 3] : null;
      if (v && fill.current && v.duration) fill.current.style.transform = `scaleX(${v.currentTime / v.duration})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [current, item]);

  // Loading: the brass ring draws itself around the seal while the current video waits.
  useEffect(() => {
    if (!loading || !ring.current) return;
    const t = gsap.fromTo(
      ring.current,
      { drawSVG: "0% 0%" },
      { drawSVG: "0% 100%", duration: 0.9, ease: "power1.inOut", repeat: -1, yoyo: true },
    );
    return () => {
      t.kill();
    };
  }, [loading]);

  // The backdrop takes the item's colour.
  useEffect(() => {
    let cancelled = false;
    void tintOf(item.sm).then((tint) => {
      if (!cancelled && tint && backdrop.current) gsap.to(backdrop.current, { backgroundColor: tint, duration: 0.8, ease: "power2.out" });
    });
    return () => {
      cancelled = true;
    };
  }, [item]);

  const toggle = useCallback(() => {
    if (item.kind !== "video") return;
    setPulse({ key: performance.now(), playing: paused });
    setPaused(!paused);
  }, [item, paused]);

  // ---- keys and wheel --------------------------------------------------------------------------------------------
  const onKeyDown = (e: KeyboardEvent) => {
    if (closing.current) return;
    if (e.key === "ArrowDown" || e.key === "PageDown") {
      e.preventDefault();
      if (current === last) bounce();
      else go(current + 1);
    } else if (e.key === "ArrowUp" || e.key === "PageUp") {
      e.preventDefault();
      go(current - 1);
    } else if (e.key === " " && (e.target as HTMLElement).tagName !== "BUTTON") {
      e.preventDefault();
      toggle();
    }
  };

  useEffect(() => {
    // On the whole viewer, not only the list: the wheel over a control (✕, ↑ / ↓, the progress line) moves too.
    const l = dialog.current;
    if (!l) return;
    // One item per wheel gesture: the first event moves, the rest of the gesture is ignored until it goes quiet.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (closing.current || Math.abs(e.deltaY) < 4) return;
      if (wheelLock.current !== null) {
        clearTimeout(wheelLock.current);
        wheelLock.current = window.setTimeout(() => (wheelLock.current = null), 260);
        return;
      }
      wheelLock.current = window.setTimeout(() => (wheelLock.current = null), 260);
      const i = currentRef.current;
      if (e.deltaY > 0) {
        if (i === last) bounce();
        else go(i + 1);
      } else go(i - 1);
    };
    l.addEventListener("wheel", onWheel, { passive: false });
    return () => l.removeEventListener("wheel", onWheel);
  }, [bounce, go, last]);

  // ---- touch: pull down to close (first item), rubber band (last item), long press -------------------------------
  useEffect(() => {
    const l = list.current;
    if (!l) return;
    let y0 = 0;
    let x0 = 0;
    let dy = 0;
    let mode: "idle" | "scroll" | "dismiss" | "rubber" = "idle";
    let longTimer = 0;
    let longActive = false;
    const control = (t: EventTarget | null) => (t as HTMLElement | null)?.closest("button, [role=slider]") !== null;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || closing.current || control(e.target)) return;
      y0 = e.touches[0].clientY;
      x0 = e.touches[0].clientX;
      dy = 0;
      mode = "idle";
      longActive = false;
      clearTimeout(longTimer);
      longTimer = window.setTimeout(() => {
        longActive = true;
        suppressClick.current = true;
        setHeld(true);
      }, LONG_PRESS);
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || closing.current) return;
      dy = e.touches[0].clientY - y0;
      const dx = e.touches[0].clientX - x0;
      if (Math.abs(dy) > 10 || Math.abs(dx) > 10) clearTimeout(longTimer);
      if (longActive) return;
      if (mode === "idle" && Math.abs(dy) > 6) {
        const i = currentRef.current;
        const top = i === 0 && l.scrollTop <= 1;
        const bottom = i === last && l.scrollTop >= l.scrollHeight - l.clientHeight - 1;
        mode = top && dy > 0 ? "dismiss" : bottom && dy < 0 ? "rubber" : "scroll";
      }
      const h = height();
      if (mode === "dismiss") {
        e.preventDefault();
        const d = Math.max(0, dy);
        gsap.set(movingParts(), {
          y: d,
          scale: Math.max(0.85, 1 - 0.15 * Math.min(1, d / (h * 0.4))),
          borderRadius: Math.min(24, (24 * d) / (h * 0.25)),
        });
        gsap.set(backdrop.current, { opacity: 1 - Math.min(1, d / (h * 0.5)) });
        gsap.set(chrome.current, { opacity: 1 - Math.min(1, d / (h * 0.2)) });
      } else if (mode === "rubber") {
        e.preventDefault();
        const d = Math.min(0, dy);
        const give = (1 - 1 / ((-d * 0.55) / h + 1)) * h * 0.5; // the further, the stiffer
        gsap.set(movingParts(), { y: -give });
      }
    };
    const onEnd = () => {
      clearTimeout(longTimer);
      if (longActive) {
        longActive = false;
        setHeld(false);
        return;
      }
      const h = height();
      if (mode === "dismiss") {
        if (dy > h / 4) requestClose();
        else {
          gsap.to(movingParts(), { y: 0, scale: 1, borderRadius: 0, duration: 0.55, ease: "back.out(1.7)" });
          gsap.to([backdrop.current, chrome.current], { opacity: 1, duration: 0.35 });
        }
      } else if (mode === "rubber") {
        gsap.to(movingParts(), { y: 0, duration: 0.7, ease: "elastic.out(1, 0.55)" });
      }
      mode = "idle";
    };
    l.addEventListener("touchstart", onStart, { passive: true });
    l.addEventListener("touchmove", onMove, { passive: false });
    l.addEventListener("touchend", onEnd);
    l.addEventListener("touchcancel", onEnd);
    return () => {
      clearTimeout(longTimer);
      l.removeEventListener("touchstart", onStart);
      l.removeEventListener("touchmove", onMove);
      l.removeEventListener("touchend", onEnd);
      l.removeEventListener("touchcancel", onEnd);
    };
  }, [last, movingParts, requestClose]);

  // A mouse: a long press too (a tap is the click below).
  const mouseTimer = useRef(0);
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || (e.target as HTMLElement).closest("button, [role=slider]")) return;
    mouseTimer.current = window.setTimeout(() => {
      suppressClick.current = true;
      setHeld(true);
    }, LONG_PRESS);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(mouseTimer.current);
    setHeld(false);
  };
  const onSlideClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, [role=slider]")) return;
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    toggle();
  };

  // ---- seeking on the progress line (right to left, like the page) -----------------------------------------------
  const seek = (e: PointerEvent<HTMLDivElement>) => {
    const v = videos.current[current % 3];
    if (!v || !v.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (r.right - e.clientX) / r.width));
    v.currentTime = ratio * v.duration;
  };


  return (
    <dialog
      ref={dialog}
      className={styles.viewer}
      data-theme="night"
      aria-label="عارض زبايننا المرتّبين"
      data-held={held || undefined}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div ref={backdrop} className={styles.backdrop} aria-hidden="true" />

      <div ref={list} className={styles.list} onClick={onSlideClick} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        {items.map((it, i) => {
          const near = Math.abs(i - current) <= 1;
          return (
            <section key={it.id} className={styles.slide} aria-label={`${it.kind === "video" ? "فيديو" : "صورة"} ${i + 1} من ${items.length}`}>
              <div
                ref={(el) => {
                  frames.current[i] = el;
                }}
                className={styles.frame}
                style={{ "--ratio": RATIO[it.aspect] } as CSSProperties}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Storage WebP as it is */}
                <img
                  src={it.kind === "video" ? (it.poster ?? it.sm) : it.src}
                  alt=""
                  loading={near ? "eager" : "lazy"}
                  decoding="async"
                  draggable={false}
                />
              </div>
            </section>
          );
        })}

        {/* The three reused video elements, each laid over its item's slide. */}
        {[0, 1, 2].map((slot) => {
          const i = slotItem(slot);
          const it = i === null ? null : items[i];
          return (
            <div
              key={slot}
              ref={(el) => {
                slots.current[slot] = el;
              }}
              className={styles.slot}
              style={{ "--i": i ?? 0, "--ratio": it ? RATIO[it.aspect] : 1 } as CSSProperties}
              hidden={it === null}
              aria-hidden="true"
            >
              <video
                ref={(el) => {
                  videos.current[slot] = el;
                }}
                src={it?.src}
                muted
                playsInline
                loop
                preload={i === current ? "auto" : "metadata"}
                tabIndex={-1}
                onPlaying={(e) => {
                  e.currentTarget.dataset.on = "";
                  if (i === currentRef.current) setLoading(false);
                }}
                onWaiting={() => i === currentRef.current && setLoading(true)}
                onEmptied={(e) => delete e.currentTarget.dataset.on}
              />
            </div>
          );
        })}
      </div>

      <div ref={chrome} className={styles.chrome}>
        <span className={styles.count} aria-live="polite">
          {current + 1} / {items.length}
        </span>
        <button type="button" className={styles.close} onClick={requestClose} aria-label="إغلاق">
          <span aria-hidden="true">×</span>
        </button>
        <div className={styles.steps}>
          <button type="button" onClick={() => go(current - 1)} disabled={current === 0} aria-label="السابق">
            <span aria-hidden="true">↑</span>
          </button>
          <button type="button" onClick={() => (current === last ? bounce() : go(current + 1))} aria-label="التالي">
            <span aria-hidden="true">↓</span>
          </button>
        </div>
        {item.kind === "video" && (
          <div
            className={styles.progress}
            role="slider"
            tabIndex={0}
            aria-label="موضع الفيديو"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={0}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              seek(e);
            }}
            onPointerMove={(e) => e.buttons && seek(e)}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div ref={fill} className={styles.fill} />
          </div>
        )}
      </div>

      {pulse && (
        <span key={pulse.key} className={styles.pulse} aria-hidden="true">
          {pulse.playing ? "▶" : "❚❚"}
        </span>
      )}

      {loading && (
        <span className={styles.loader} role="status" aria-label="جارٍ تحميل الفيديو">
          <BrandMark kind="seal" tone="mono" width={40} />
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle ref={ring} cx="32" cy="32" r="30" />
          </svg>
        </span>
      )}
    </dialog>
  );
}
