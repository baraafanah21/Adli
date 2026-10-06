"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import styles from "./HeroStage.module.css";

// three.js never enters the first-load bundle: this chunk is fetched only after first paint.
const HeroBottle = dynamic(() => import("@/components/HeroBottle"), { ssr: false });

export const HERO_POSTER = "/hero/v1/f000.webp";

function canRunWebGL() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
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
 * The hero stage: the poster <img> is the LCP candidate; the live bottle loads when the browser is idle
 * and fades in over it once its first frame is drawn. Reduced motion or no WebGL2: the poster stays.
 */
export function HeroStage() {
  const [load, setLoad] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!canRunWebGL()) return;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const start = () => setLoad(true);
    const schedule = () => {
      if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(start, { timeout: 3000 });
      else timeoutId = setTimeout(start, 1200);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      window.removeEventListener("load", schedule);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  const onReady = useCallback(() => setReady(true), []);
  const onError = useCallback(() => setFailed(true), []);
  const live = ready && !failed;

  return (
    <div className={styles.stage}>
      <Image
        className={`${styles.poster} ${live ? styles.hidden : ""}`}
        src={HERO_POSTER}
        alt="قنينة عطر عدلي بغطاء نحاسي منحوت عليه ختم الشعار، على منصة الختم"
        fill
        sizes="(max-width: 840px) 100vw, 520px"
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
