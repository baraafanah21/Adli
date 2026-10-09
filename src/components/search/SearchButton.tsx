"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { SearchIcon } from "@/components/icons";
import styles from "@/components/SiteHeader.module.css";

// The dialog (and the index it fetches) loads only the first time the search opens: nothing on the first load.
const SearchDialog = dynamic(() => import("./SearchDialog"), { ssr: false });

const typing = (el: Element | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/** The header's search: a magnifier that opens the search dialog; «/» opens it too (a keyboard, outside a field). */
export function SearchButton() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || typing(document.activeElement)) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      setMounted(true);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="ابحث عن منتج"
        aria-haspopup="dialog"
        aria-keyshortcuts="/"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        // Start fetching the dialog's code as soon as the pointer is on the way.
        onPointerEnter={() => void import("./SearchDialog")}
        onFocus={() => void import("./SearchDialog")}
      >
        <SearchIcon />
      </button>
      {mounted && <SearchDialog open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
