"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "@/components/icons";
import { THEME_KEY, type Theme } from "@/lib/theme";
import styles from "./SiteHeader.module.css";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const getTheme = (): Theme => (document.documentElement.dataset.theme === "day" ? "day" : "night");
const getServerTheme = (): Theme => "night";

/** Night/day switch. The first-visit choice (saved theme or prefers-color-scheme) is made by the inline script in layout.tsx. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);
  const next: Theme = theme === "night" ? "day" : "night";

  function toggle() {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked (private mode): the choice lasts for this page only.
    }
  }

  return (
    <button
      type="button"
      className={styles.iconButton}
      onClick={toggle}
      aria-label={next === "day" ? "الوضع النهاري" : "الوضع الليلي"}
      title={next === "day" ? "الوضع النهاري" : "الوضع الليلي"}
    >
      {theme === "night" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
