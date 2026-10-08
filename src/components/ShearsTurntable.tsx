"use client";

import { useEffect, useRef, useState } from "react";
import { watchHeroCover } from "@/lib/hero-cover";
import styles from "./ShearsTurntable.module.css";

/*
  The Adli shears (assets/shears/README.md): 48 transparent Cycles frames, a full turn 7.5° apart, on a 2D canvas
  (not WebGL: the hero bottle stays the site's one WebGL canvas).
  - f000.webp is a plain <img>, shown at once. The other 47 frames load only once the stage is on screen, and never
    with prefers-reduced-motion or Save-Data (then f000 stays alone).
  - Two frames are blended with 'lighter' (alpha 1−f and f): the frames are transparent, so a plain alpha-over
    blend would leave a light halo on the edges.
  - Turns by itself slowly; horizontal drag (touch-action: pan-y keeps vertical swipes for the page) and the arrow
    keys turn it. The loop runs only while the stage is on screen and the tab is visible.
*/

const BASE = "/shears/v1";
const FRAMES = 48;
const DEG_PER_FRAME = 360 / FRAMES;
const AUTO_DEG_PER_S = 14;
const MAX_DPR = 2;
const frameSrc = (k: number) => `${BASE}/f${String(k).padStart(3, "0")}.webp`;

type NavigatorHints = Navigator & { connection?: { saveData?: boolean } };

function mayTurn() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  return !(navigator as NavigatorHints).connection?.saveData;
}

type Props = {
  /** What the shears are, for screen readers. */
  label?: string;
  className?: string;
  /** Above the fold (the /booking header): load f000 eagerly. Never preloaded: it is not a page's LCP. */
  eager?: boolean;
  /** Turning speed, degrees a second (default 14). */
  degPerS?: number;
  /** In the hero (U5.1): f000 appears only after the page's load event, so it never competes with the bottle's
   *  poster (the LCP); and drawing stops while the sections cover the pinned hero. */
  inHero?: boolean;
};

export function ShearsTurntable({
  label = "مقص حلاقة عدلي، شفرات فولاذ ومقابض نحاس، وعلى برغيه ختم عدلي.",
  className,
  eager,
  degPerS = AUTO_DEG_PER_S,
  inHero = false,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  // In the hero, f000 waits for the load event (the poster first).
  const [posterOk, setPosterOk] = useState(!inHero);
  const speed = useRef(degPerS);

  useEffect(() => {
    if (posterOk) return;
    const show = () => setPosterOk(true);
    if (document.readyState === "complete") show();
    else window.addEventListener("load", show, { once: true });
    return () => window.removeEventListener("load", show);
  }, [posterOk]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!posterOk || !stage || !canvas || !mayTurn()) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let disposed = false;
    let ready = false;
    let inView = false;
    let raf = 0;
    let angle = 0;
    let velocity = 0;
    let dragging = false;
    let lastX = 0;
    let lastT = 0;
    let prev = 0;
    const imgs: HTMLImageElement[] = [];

    function size() {
      const r = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas!.width = Math.round(r.width * dpr);
      canvas!.height = Math.round(r.height * dpr);
    }

    function draw() {
      const t = (((angle % 360) + 360) % 360) / DEG_PER_FRAME;
      const i = Math.floor(t) % FRAMES;
      const j = (i + 1) % FRAMES;
      const f = t - Math.floor(t);
      const { width: w, height: h } = canvas!;
      ctx!.clearRect(0, 0, w, h);
      ctx!.globalCompositeOperation = "lighter";
      ctx!.globalAlpha = 1 - f;
      ctx!.drawImage(imgs[i], 0, 0, w, h);
      if (f > 0.001) {
        ctx!.globalAlpha = f;
        ctx!.drawImage(imgs[j], 0, 0, w, h);
      }
      ctx!.globalCompositeOperation = "source-over";
      ctx!.globalAlpha = 1;
    }

    function loop(now: number) {
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      if (!dragging) {
        if (Math.abs(velocity) > 0.5) {
          angle += velocity * dt;
          velocity *= Math.pow(0.04, dt); // inertia after a flick
        } else {
          angle += speed.current * dt;
        }
      }
      draw();
      raf = requestAnimationFrame(loop);
    }

    let covered = false;
    function sync() {
      cancelAnimationFrame(raf);
      raf = 0;
      if (ready && inView && !covered && !document.hidden) {
        prev = performance.now();
        raf = requestAnimationFrame(loop);
      }
    }

    function load() {
      let loaded = 0;
      for (let k = 0; k < FRAMES; k++) {
        const im = new Image();
        im.decoding = "async";
        im.onload = () => {
          if (disposed || ++loaded < FRAMES) return;
          ready = true;
          size();
          draw();
          setLive(true);
          sync();
        };
        im.src = frameSrc(k);
        imgs[k] = im;
      }
    }

    let requested = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (inView && !requested) {
          requested = true;
          load();
        }
        sync();
      },
      { rootMargin: "200px" },
    );
    io.observe(stage);
    document.addEventListener("visibilitychange", sync);
    const stopCover = inHero
      ? watchHeroCover((c) => {
          covered = c;
          sync();
        })
      : () => {};
    const ro = new ResizeObserver(() => {
      if (ready) {
        size();
        draw();
      }
    });
    ro.observe(canvas);

    // Drag: one stage width ≈ one full turn.
    const onDown = (e: PointerEvent) => {
      if (!ready) return;
      dragging = true;
      lastX = e.clientX;
      lastT = performance.now();
      velocity = 0;
      stage.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const now = performance.now();
      // RTL page, but the turn follows the finger: drag right turns right.
      const d = ((e.clientX - lastX) / stage.clientWidth) * 360;
      angle += d;
      velocity = d / Math.max((now - lastT) / 1000, 0.001);
      lastX = e.clientX;
      lastT = now;
    };
    const onUp = () => {
      dragging = false;
      velocity = Math.max(-720, Math.min(720, velocity));
    };
    const onKey = (e: KeyboardEvent) => {
      if (!ready || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      e.preventDefault();
      angle += (e.key === "ArrowRight" ? 1 : -1) * DEG_PER_FRAME;
      if (!raf) draw();
    };
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    stage.addEventListener("keydown", onKey);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      stopCover();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", sync);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("keydown", onKey);
      for (const im of imgs) im.onload = null;
    };
  }, [posterOk, inHero]);

  return (
    <div
      ref={stageRef}
      className={[styles.stage, live && styles.live, className].filter(Boolean).join(" ")}
      role="img"
      aria-label={live ? `${label} اسحب أو استعمل الأسهم لتدويره.` : label}
      tabIndex={live ? 0 : undefined}
    >
      {/* f000 shown at once, from public/ as it is (18 KB, transparent WebP); the canvas covers it once live. */}
      {posterOk && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.poster} src={frameSrc(0)} alt="" width={494} height={618} loading={eager || inHero ? "eager" : "lazy"} decoding="async" />
      )}
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </div>
  );
}
