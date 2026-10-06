"use client";

import { useSyncExternalStore } from "react";
import { openStatus } from "@/lib/salon";
import styles from "./OpenNow.module.css";

// The page can be prerendered, so "now" is only known in the browser. The server renders an
// empty line of the same height (no layout shift), then the status fills in and refreshes each minute.
const subscribe = (onChange: () => void) => {
  const id = window.setInterval(onChange, 30_000);
  return () => window.clearInterval(id);
};
const currentMinute = () => Math.floor(Date.now() / 60_000);
const noMinute = () => null;

export function OpenNow() {
  const minute = useSyncExternalStore(subscribe, currentMinute, noMinute);
  const status = minute === null ? null : openStatus(new Date(minute * 60_000));

  return (
    <p className={styles.status} data-open={status?.open} aria-live="polite">
      {status && (
        <>
          <span className={styles.dot} aria-hidden="true" />
          {status.label}
        </>
      )}
    </p>
  );
}
