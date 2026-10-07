"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./HeroStage.module.css";

// three.js never enters the first-load bundle: this chunk is fetched only after first paint.
const HeroBottle = dynamic(() => import("@/components/HeroBottle"), { ssr: false });

export const HERO_POSTER = "/hero/v1/f000.webp";

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
      {live && <p className={styles.hint}>اسحب لتدوير القنينة</p>}
    </div>
  );
}
