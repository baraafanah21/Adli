"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ShearsTurntable } from "@/components/ShearsTurntable";
import styles from "./HeroStage.module.css";

// three.js never enters the first-load bundle: this chunk is fetched only after first paint.
const HeroBottle = dynamic(() => import("@/components/HeroBottle"), { ssr: false });

// v2 (U1b): taken from the live scene with the seal carved from public/brand/adli-seal.svg.
export const HERO_POSTER = "/hero/v2/f000.webp";

type NavigatorHints = Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };

/**
 * Whether the live bottle may load at all. No: reduced motion, Save-Data (the visitor asked for less data), a weak
 * device (≤ 2 GB memory or ≤ 2 cores, where the scene would cost more than it gives), or no WebGL2. The poster stays.
 */
function canRunWebGL() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const nav = navigator as NavigatorHints;
  if (nav.connection?.saveData) return false;
  if ((nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2) return false;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * The hero stage: the poster <img> is the LCP candidate; the live bottle loads after the page has loaded, once the
 * stage is on screen and the browser is idle, and fades in over the poster once its first frame is drawn.
 * See canRunWebGL() for when it never loads. three.js is only in HeroBottle's chunk, which only this imports.
 */
export function HeroStage() {
  const stage = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // Desktop only: the objects lean a little toward the pointer (CSS variables, one write per frame).
  useEffect(() => {
    const el = stage.current;
    const hero = el?.closest("section");
    if (!el || !hero) return;
    if (!window.matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      raf = 0;
      el.style.setProperty("--mx", x.toFixed(3));
      el.style.setProperty("--my", y.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      const r = hero.getBoundingClientRect();
      x = ((e.clientX - r.left) / r.width) * 2 - 1;
      y = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      x = 0;
      y = 0;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    hero.addEventListener("pointermove", onMove);
    hero.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  useEffect(() => {
    if (!canRunWebGL()) return;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let observer: IntersectionObserver | undefined;
    const start = () => setLoad(true);
    const whenIdle = () => {
      if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(start, { timeout: 3000 });
      else timeoutId = setTimeout(start, 1200);
    };
    // After load, wait until the stage is (nearly) on screen; a visitor who scrolled past it never loads three.
    const schedule = () => {
      const el = stage.current;
      if (!el || !("IntersectionObserver" in window)) return whenIdle();
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer?.disconnect();
            whenIdle();
          }
        },
        { rootMargin: "100px" },
      );
      observer.observe(el);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      window.removeEventListener("load", schedule);
      observer?.disconnect();
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  const onReady = useCallback(() => setReady(true), []);
  const onError = useCallback(() => setFailed(true), []);
  const live = ready && !failed;

  return (
    <div className={styles.stage} ref={stage}>
      <Image
        className={`${styles.poster} ${live ? styles.hidden : ""}`}
        src={HERO_POSTER}
        alt="قنينة عطر عدلي بغطاء نحاسي منحوت عليه ختم الشعار، على منصة الختم"
        fill
        sizes="(max-width: 840px) 100vw, 520px"
        // A 16 KB WebP already: served as it is from public/ (immutable), no optimizer round trip before the LCP.
        unoptimized
        preload
        fetchPriority="high"
      />
      {load && !failed && (
        <HeroBottle className={`${styles.canvas} ${live ? "" : styles.hidden}`} onReady={onReady} onError={onError} />
      )}
      {/* U5.1: the shears beside the bottle, a second object in the same picture (2D, never WebGL). f000 after load. */}
      <div className={styles.shearsOnPlinth}>
        <ShearsTurntable inHero degPerS={20} />
      </div>
      {live && <p className={styles.hint}>اسحب لتدوير القنينة</p>}
    </div>
  );
}
