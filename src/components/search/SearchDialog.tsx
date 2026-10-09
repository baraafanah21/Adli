"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { formatPrice, productCount } from "@/lib/format";
import { buildSearchIndex, cleanQuery, searchIndex, type SearchIndex } from "@/lib/search";
import { SEARCH_INDEX_URL, searchItemFields, type SearchItem } from "@/lib/search-items";
import styles from "./SearchDialog.module.css";

/** Rows shown in the dialog; the rest are one tap away on /products?q=. */
const MAX_ROWS = 6;
/** A light pause before the list follows the typing (it searches in memory, so this is only to keep it calm). */
const DEBOUNCE_MS = 120;

// One fetch per page load, shared by every opening.
let indexPromise: Promise<SearchIndex<SearchItem>> | null = null;
function loadIndex() {
  indexPromise ??= fetch(SEARCH_INDEX_URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${SEARCH_INDEX_URL}: ${r.status}`))))
    .then((body: { items: SearchItem[] }) => buildSearchIndex(body.items, searchItemFields))
    .catch((e) => {
      indexPromise = null; // the next opening tries again
      throw e;
    });
  return indexPromise;
}

const productsUrl = (q: string) => `/products?q=${encodeURIComponent(q)}`;

type Props = { open: boolean; onClose: () => void };

/**
 * The header search (a native <dialog>: focus trap, Esc, the top layer). Full screen on a phone, a panel under the
 * header from 720px. The input is a combobox over a listbox of up to six products: ↑ ↓ move, Enter opens the product
 * (or, with none chosen, every result on /products?q=), Esc closes.
 */
export default function SearchDialog({ open, onClose }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = { list: useId(), status: useId() };
  const [index, setIndex] = useState<SearchIndex<SearchItem> | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      inputRef.current?.select();
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open || index) return;
    let live = true;
    loadIndex().then(
      (i) => live && (setIndex(i), setFailed(false)),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [open, index]);

  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(cleanQuery(query));
      setActive(-1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const results = useMemo(() => (index && term ? searchIndex(index, term) : []), [index, term]);
  const rows = results.slice(0, MAX_ROWS);
  const showAll = rows.length > 0; // the last option: every result on /products
  const optionCount = rows.length + (showAll ? 1 : 0);
  const optionId = (i: number) => `${ids.list}-${i}`;

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function choose(i: number) {
    if (i < rows.length) go(`/p/${rows[i].slug}`);
    else if (term) go(productsUrl(term));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (optionCount === 0) return;
      e.preventDefault();
      // -1 (the input itself), then each option, then round again.
      const slots = optionCount + 1;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => ((a + 1 + step + slots) % slots) - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const q = cleanQuery(query);
      if (active >= 0) choose(active);
      else if (q) go(productsUrl(q));
    }
  }

  function onBackdrop(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  const typed = cleanQuery(query);
  const settled = typed === term; // the list matches what is typed (not mid-debounce)
  const status = !typed
    ? ""
    : failed
      ? "تعذّر البحث الآن."
      : !index
        ? "جارٍ التحميل…"
        : settled
          ? results.length
            ? `${productCount(results.length)} لـ «${term}»`
            : `لا توجد نتائج لـ «${term}»`
          : "";

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-label="البحث في المنتجات" onClose={onClose} onClick={onBackdrop}>
      <div className={styles.panel}>
        <div className={styles.bar}>
          <span className={styles.field}>
            <input
              ref={inputRef}
              className={styles.input}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="اسم المنتج، العائلة، أو القسم"
              aria-label="ابحث عن منتج"
              role="combobox"
              aria-expanded={optionCount > 0}
              aria-controls={ids.list}
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? optionId(active) : undefined}
              aria-describedby={ids.status}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
            {query && (
              <button
                type="button"
                className={styles.clear}
                aria-label="امسح البحث"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
              >
                <span aria-hidden="true">×</span>
              </button>
            )}
          </span>
          <button type="button" className={styles.close} onClick={onClose}>
            إغلاق
          </button>
        </div>

        <p id={ids.status} className={styles.status} role="status" aria-live="polite">
          {status}
        </p>

        <ul id={ids.list} className={styles.list} role="listbox" aria-label="نتائج البحث" hidden={optionCount === 0}>
          {rows.map((p, i) => (
            <li
              key={p.slug}
              id={optionId(i)}
              role="option"
              aria-selected={active === i}
              className={styles.row}
              onPointerMove={() => setActive(i)}
              onClick={() => choose(i)}
            >
              <span className={styles.thumb}>
                {p.image ? (
                  <Image src={p.image} alt="" width={48} height={60} unoptimized />
                ) : (
                  <BrandMark kind="bottle" tone="mono" height={28} />
                )}
              </span>
              <span className={styles.text}>
                <span className={styles.name}>{p.name_ar}</span>
                <span className={styles.meta}>{p.family_ar ?? p.category_ar}</span>
              </span>
              <span className={styles.price}>
                {p.stock_state === "out" ? (
                  <span className={styles.out}>نفدت الكمية</span>
                ) : (
                  <>
                    {p.price_varies && "من "}
                    {formatPrice(p.price_ils)}
                  </>
                )}
              </span>
            </li>
          ))}
          {showAll && (
            <li
              id={optionId(rows.length)}
              role="option"
              aria-selected={active === rows.length}
              className={`${styles.row} ${styles.all}`}
              onPointerMove={() => setActive(rows.length)}
              onClick={() => choose(rows.length)}
            >
              كل النتائج في صفحة المنتجات ({results.length})
            </li>
          )}
        </ul>

        {typed && settled && index && results.length === 0 && (
          <div className={styles.empty}>
            <BrandMark kind="bottle" tone="mono" height={40} className="ad-sheet__empty-mark" />
            <Link href="/products" className="ad-btn ad-btn--ghost" onClick={onClose}>
              كل المنتجات
            </Link>
          </div>
        )}
        {typed && failed && (
          <div className={styles.empty}>
            <Link href="/products" className="ad-btn ad-btn--ghost" onClick={onClose}>
              كل المنتجات
            </Link>
          </div>
        )}
        {!typed && <p className={styles.hint}>ابحث بالعربي أو بالإنجليزي.</p>}
      </div>
    </dialog>
  );
}
