"use client";

/*
  «المعرض» (U5.3, owner only): add photos and videos, order them by dragging, publish or hide, choose the one video in
  «مرآة الصالون», delete. No text anywhere: the gallery is pictures only.

  - Photos: picked (several at once) → ImageEditor (9:16 by default or 1:1; the aspect chosen is recorded) →
    /api/admin/gallery/image one by one, «يُرفع 2 من 5».
  - A video: VideoAdder (checks it, then a poster from a frame or a file, then the editor, then the upload).
  - Order: drag the grip (mouse or finger) or use «قدّم» / «أخّر»; saved once, when the drag ends. The whole order is
    sent (admin_gallery_reorder refuses anything else), and put back if it fails.
  - Every write goes through a Server Action or an upload route; the page is re-read afterwards.
*/

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { GripIcon, PlayIcon } from "@/components/admin/editor-icons";
import type { ActionState } from "@/lib/admin/errors";
import type { Edited } from "@/components/admin/ImageEditor";
import { GALLERY_EDITOR_ASPECTS, aspectLabel } from "@/lib/gallery-aspects";
import type { GalleryAspect } from "@/lib/gallery";
import { VideoAdder } from "./VideoAdder";
import styles from "./GalleryManager.module.css";

const ImageEditor = dynamic(() => import("@/components/admin/ImageEditor"), { ssr: false });

export type AdminGalleryItem = {
  id: string;
  kind: "image" | "video";
  aspect: GalleryAspect;
  src: string;
  sm: string;
  durationMs: number | null;
  published: boolean;
  featured: boolean;
  /** «خلفية»: shown behind the section on the home page (when published), not in the row. Photos only. */
  backdrop: boolean;
};

/** «صورتان»، «3 صور»، «11 صورة»: the count with the right Arabic form. */
const photosAr = (n: number) => (n === 2 ? "صورتان" : n >= 3 && n <= 10 ? `${n} صور` : `${n} صورة`);

const CSS_ASPECT: Record<GalleryAspect, string> = { "9:16": "9 / 16", "4:5": "4 / 5", "1:1": "1 / 1" };

/** The writes, passed in by the page (the Server Actions in src/app/admin/gallery/actions.ts). */
export type GalleryActions = {
  setPublished: (id: string, published: boolean) => Promise<ActionState>;
  setFeatured: (id: string | null) => Promise<ActionState>;
  setBackdrop: (id: string, backdrop: boolean) => Promise<ActionState>;
  reorder: (ids: string[]) => Promise<ActionState>;
  remove: (id: string) => Promise<ActionState>;
  prepareVideo: () => Promise<{ ok: true; id: string; path: string } | { ok: false; message: string }>;
};

export function GalleryManager({ items, actions }: { items: AdminGalleryItem[]; actions: GalleryActions }) {
  const router = useRouter();
  const photoInput = useId();
  const videoInput = useId();
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [order, setOrder] = useState(() => items.map((i) => i.id));
  // A new list from the server (after any change): the local order follows it again.
  const [seen, setSeen] = useState(items);
  if (seen !== items) {
    setSeen(items);
    setOrder(items.map((i) => i.id));
  }
  const [notice, setNotice] = useState<ActionState>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[] | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [removing, setRemoving] = useState<AdminGalleryItem | null>(null);
  const confirm = useRef<HTMLDialogElement>(null);
  const confirmTitle = useId();

  async function run(key: string, action: () => Promise<ActionState>) {
    setPending(key);
    setNotice(null);
    const result = await action();
    setPending(null);
    setNotice(result);
  }

  // ---- order -------------------------------------------------------------------------------------------------
  // A drag listens on the window (not the grip): React moves the dragged card in the DOM as the order changes, which
  // drops the grip's pointer capture, so the grip itself may never hear the finger lift. The drag keeps its own copy
  // of the order (the end saves the latest) and where the pointer is (the page keeps scrolling while it is held near
  // the top or bottom edge).
  type Drag = { id: string; moved: boolean; order: string[]; x: number; y: number; frame: number; stop: () => void };
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  useEffect(() => () => drag.current?.stop(), []);

  async function saveOrder(next: string[]) {
    const before = items.map((i) => i.id);
    if (next.join() === before.join()) return;
    setPending("order");
    const result = await actions.reorder(next);
    setPending(null);
    if (!result?.ok) setOrder(before);
    setNotice(result);
  }

  const move = (id: string, by: -1 | 1) => {
    const from = order.indexOf(id);
    const to = from + by;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, id);
    setOrder(next);
    void saveOrder(next);
  };

  function placeAt(d: Drag) {
    const over = document.elementFromPoint(d.x, d.y)?.closest<HTMLElement>("[data-gallery-id]")?.dataset.galleryId;
    if (!over || over === d.id) return;
    const next = [...d.order];
    next.splice(d.order.indexOf(d.id), 1);
    next.splice(d.order.indexOf(over), 0, d.id);
    d.order = next;
    d.moved = true;
    setOrder(next);
  }

  const onGripDown = (id: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (pending || drag.current) return;
    e.preventDefault();
    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== e.pointerId) return;
      d.x = ev.clientX;
      d.y = ev.clientY;
      placeAt(d);
    };
    const onEnd = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== e.pointerId) return;
      d.stop();
      setDragging(null);
      if (d.moved) void saveOrder(d.order);
    };
    // Held near the top or bottom of the screen: scroll, faster the closer to the edge, and keep placing the card.
    const edgeScroll = () => {
      const d = drag.current;
      if (!d) return;
      const edge = 88;
      const speed = d.y < edge ? -(edge - d.y) / 4 : d.y > window.innerHeight - edge ? (d.y - (window.innerHeight - edge)) / 4 : 0;
      if (speed) {
        window.scrollBy(0, speed);
        placeAt(d);
      }
      d.frame = requestAnimationFrame(edgeScroll);
    };
    const stop = () => {
      const d = drag.current;
      if (d) cancelAnimationFrame(d.frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      drag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    drag.current = { id, moved: false, order, x: e.clientX, y: e.clientY, frame: requestAnimationFrame(edgeScroll), stop };
    setDragging(id);
  };

  // ---- photos ------------------------------------------------------------------------------------------------
  async function uploadPhotos(results: Edited[]) {
    setPhotos(null);
    setNotice(null);
    if (results.length === 0) return;
    let failed: string | null = null;
    let added = 0;
    for (const [i, photo] of results.entries()) {
      setProgress(results.length > 1 ? `تُرفع الصورة ${i + 1} من ${results.length}…` : "تُرفع الصورة…");
      const body = new FormData();
      body.set("file", photo.blob, "photo.jpg");
      body.set("aspect", aspectLabel(photo.aspect) ?? "9:16");
      try {
        const res = await fetch("/api/admin/gallery/image", { method: "POST", body });
        const json = (await res.json()) as { ok: boolean; message?: string };
        if (json.ok) added++;
        else failed = json.message ?? "تعذّر رفع صورة.";
      } catch {
        failed = "تعذّر رفع صورة. تأكد من الاتصال وحاول مرة أخرى.";
      }
    }
    setProgress(null);
    if (added) router.refresh();
    setNotice(
      failed
        ? { ok: false, message: added ? `أُضيفت ${added} من ${results.length}. ${failed}` : failed }
        : { ok: true, message: added > 1 ? `أُضيفت ${photosAr(added)}. انشرها لتظهر في الموقع.` : "أُضيفت الصورة. انشرها لتظهر في الموقع." },
    );
  }

  // ---- delete ------------------------------------------------------------------------------------------------
  const askDelete = (item: AdminGalleryItem) => {
    setRemoving(item);
    confirm.current?.showModal();
  };
  const closeDelete = () => {
    confirm.current?.close();
    setRemoving(null);
  };

  const busy = pending !== null || progress !== null;
  const shown = order.map((id) => byId.get(id)).filter((i): i is AdminGalleryItem => Boolean(i));

  return (
    <div className={styles.wrap}>
      <div className={styles.add}>
        <label htmlFor={photoInput} className="ad-btn ad-btn--primary" aria-disabled={busy}>
          أضف صوراً
        </label>
        <input
          id={photoInput}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) setPhotos(files);
          }}
        />
        <label htmlFor={videoInput} className="ad-btn ad-btn--ghost" aria-disabled={busy || video !== null}>
          أضف فيديو
        </label>
        <input
          id={videoInput}
          type="file"
          accept="video/mp4,video/*"
          className="sr-only"
          disabled={busy || video !== null}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) {
              setNotice(null);
              setVideo(file);
            }
          }}
        />
      </div>
      <p className={styles.hint}>
        الصور تُقص قبل الرفع (9:16 أو 1:1). الفيديو MP4 حتى 20 ثانية و5 ميغابايت، بلا صوت عند العرض.
      </p>

      {progress && (
        <p className="ad-notice" role="status">
          {progress}
        </p>
      )}
      {notice && (
        <p className={`ad-notice ${notice.ok ? "ad-notice--ok" : "ad-notice--error"}`} role={notice.ok ? "status" : "alert"}>
          {notice.message}
        </p>
      )}

      {video && (
        <VideoAdder
          file={video}
          prepare={actions.prepareVideo}
          onClose={(result) => {
            setVideo(null);
            if (result) {
              setNotice(result);
              if (result.ok) router.refresh();
            }
          }}
        />
      )}

      {shown.length === 0 ? (
        <div className={styles.empty}>
          <BrandMark kind="seal" tone="mono" width={56} />
          <p>ارفع أول صورة</p>
        </div>
      ) : (
        <ol className={styles.grid} aria-label="عناصر المعرض بالترتيب">
          {shown.map((item, index) => {
            const seconds = item.durationMs ? Math.round(item.durationMs / 1000) : null;
            const label = `${item.kind === "video" ? "فيديو" : "صورة"} ${index + 1}`;
            const working = pending === item.id;
            return (
              <li
                key={item.id}
                data-gallery-id={item.id}
                className={styles.card}
                data-dragging={dragging === item.id || undefined}
                data-hidden={!item.published || undefined}
                aria-label={label}
              >
                <div className={styles.thumb} style={{ aspectRatio: CSS_ASPECT[item.aspect] }}>
                  {/* The 480px WebP from Storage, as it is (no optimisation needed for a thumbnail). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.sm} alt="" loading="lazy" decoding="async" draggable={false} />
                  {item.kind === "video" && (
                    <span className={styles.kind}>
                      <PlayIcon />
                      {seconds !== null && <span>{seconds} ث</span>}
                    </span>
                  )}
                  {item.featured && <span className={styles.mirror}>في المرآة</span>}
                  {item.backdrop && <span className={styles.mirror}>خلفية</span>}
                </div>

                <div className={styles.meta}>
                  <span className={item.published ? styles.on : styles.off}>{item.published ? "منشور" : "مخفي"}</span>
                  <span className={styles.aspect} dir="ltr">
                    {item.aspect}
                  </span>
                </div>

                <div className={styles.actions}>
                  <button
                    type="button"
                    className="ad-btn ad-btn--ghost"
                    disabled={busy}
                    onClick={() => run(item.id, () => actions.setPublished(item.id, !item.published))}
                  >
                    {working ? "…" : item.published ? "أخفِ" : "انشر"}
                  </button>
                  {item.kind === "video" && item.published && !item.featured && (
                    <button type="button" className="ad-btn ad-btn--ghost" disabled={busy} onClick={() => run(item.id, () => actions.setFeatured(item.id))}>
                      اعرضه بالمرآة
                    </button>
                  )}
                  {item.featured && (
                    <button type="button" className="ad-btn ad-btn--ghost" disabled={busy} onClick={() => run(item.id, () => actions.setFeatured(null))}>
                      أوقف المرآة
                    </button>
                  )}
                  {item.kind === "image" && (
                    <label className={styles.backdropCheck}>
                      <input
                        type="checkbox"
                        checked={item.backdrop}
                        disabled={busy}
                        onChange={(e) => {
                          const on = e.target.checked;
                          void run(item.id, () => actions.setBackdrop(item.id, on));
                        }}
                      />
                      خلفية
                    </label>
                  )}
                  <button type="button" className={`ad-btn ad-btn--ghost ${styles.danger}`} disabled={busy} onClick={() => askDelete(item)}>
                    احذف
                  </button>
                </div>

                <div className={styles.order}>
                  <button
                    type="button"
                    className={styles.grip}
                    aria-label={`اسحب لترتيب ${label}`}
                    disabled={busy}
                    onPointerDown={onGripDown(item.id)}
                  >
                    <GripIcon />
                  </button>
                  <button type="button" className={styles.step} disabled={busy || index === 0} onClick={() => move(item.id, -1)} aria-label={`قدّم ${label}`}>
                    قدّم
                  </button>
                  <button
                    type="button"
                    className={styles.step}
                    disabled={busy || index === shown.length - 1}
                    onClick={() => move(item.id, 1)}
                    aria-label={`أخّر ${label}`}
                  >
                    أخّر
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <dialog ref={confirm} className="ad-sheet-dialog" aria-labelledby={confirmTitle} onClose={() => setRemoving(null)}>
        <section className="ad-sheet">
          <div className="ad-sheet__grip" aria-hidden="true" />
          <div className="ad-sheet__head">
            <h2 className="ad-sheet__title" id={confirmTitle}>
              {removing?.kind === "video" ? "تحذف هذا الفيديو؟" : "تحذف هذه الصورة؟"}
            </h2>
            <button type="button" className="ad-sheet__close" onClick={closeDelete} aria-label="إغلاق">
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <p className={styles.hint}>يُحذف من المعرض وتُحذف ملفاته نهائياً. لا يمكن التراجع.</p>
          <div className="ad-form-actions">
            <button
              type="button"
              className={`ad-btn ad-btn--primary ${styles.dangerFill}`}
              disabled={busy}
              onClick={async () => {
                if (!removing) return;
                const id = removing.id;
                closeDelete();
                await run(id, () => actions.remove(id));
              }}
            >
              احذف نهائياً
            </button>
            <button type="button" className="ad-btn ad-btn--ghost" onClick={closeDelete}>
              تراجع
            </button>
          </div>
        </section>
      </dialog>

      {photos && (
        <ImageEditor
          files={photos}
          aspects={GALLERY_EDITOR_ASPECTS}
          onDone={(results) => void uploadPhotos(results)}
          onCancel={() => setPhotos(null)}
        />
      )}
    </div>
  );
}
