"use client";

/*
  Product photo: any photo from the phone (JPEG, PNG, HEIC on an iPhone), nothing to prepare.
    1. Picked → the image editor (ImageEditor, loaded only now): upright, then cropped to the card's 4:5, turned,
       zoomed, or kept as it is. It draws a JPEG of at most 2400px on the phone (src/lib/admin/image-prep.ts); the
       canvas copies no metadata, so the place the photo was taken never leaves the phone. The original isn't kept.
    2. Shown at once in the shelf's own frame while it uploads.
    3. POST /api/admin/product-image (staff only): sharp checks it again and makes the two WebP files (unchanged).
*/

import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { productImageSrc } from "@/lib/format";
import type { ActionState } from "@/lib/admin/errors";
import type { Aspect, Edited } from "./ImageEditor";
import styles from "./ImageUploader.module.css";

// The editor (react-easy-crop included) is its own chunk, fetched when a photo is picked.
const ImageEditor = dynamic(() => import("./ImageEditor"), { ssr: false });

/** The product card's frame (SealStage): 4:5 only. */
const CARD: Aspect[] = [{ value: 4 / 5, label: "4:5" }];

export function ImageUploader({ productId, current, name }: { productId: string; current: string | null; name: string }) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File[] | null>(null);
  const [uploading, setUploading] = useState<{ url: string } | null>(null);
  const [state, setState] = useState<ActionState>(null);

  // Free the preview's object URL when it is replaced or the page closes.
  useEffect(() => () => (uploading ? URL.revokeObjectURL(uploading.url) : undefined), [uploading]);
  // After a successful upload the local preview stays until the saved photo arrives (router.refresh), so the frame
  // never flashes back to the old one: a new `current` clears it.
  const [done, setDone] = useState(false);
  const [shownFor, setShownFor] = useState(current);
  if (shownFor !== current) {
    setShownFor(current);
    setUploading(null);
    setDone(false);
  }

  function clearInput() {
    if (input.current) input.current.value = "";
  }

  function onFiles(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    setState(null);
    setPicked([file]);
  }

  async function upload(photo: Edited) {
    const preview = { url: URL.createObjectURL(photo.blob) };
    setUploading(preview);
    const body = new FormData();
    body.set("productId", productId);
    body.set("file", photo.blob, "photo.jpg");
    let result: ActionState;
    try {
      const res = await fetch("/api/admin/product-image", { method: "POST", body });
      const json = (await res.json()) as { ok: boolean; message?: string };
      result = json.ok ? { ok: true, message: "حُفظت الصورة." } : { ok: false, message: json.message ?? "تعذّر حفظ الصورة." };
    } catch {
      result = { ok: false, message: "تعذّر رفع الصورة. تأكد من الاتصال وحاول مرة أخرى." };
    }
    setState(result);
    if (result?.ok) {
      setDone(true);
      router.refresh();
    } else setUploading(null);
  }

  const saved = productImageSrc(current, "sm");
  const shown = uploading?.url ?? null;

  return (
    <div className={styles.wrap}>
      {/* The shelf's own frame (SealStage), at card size: what the customer will see. */}
      <div className={`ad-photo ${styles.frame}`}>
        <div className="ad-photo__frame">
          {shown ? (
            // A local blob: URL; next/image can't optimise it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt={`معاينة صورة ${name}`} className={styles.blob} />
          ) : saved ? (
            <Image src={saved} alt={`صورة ${name}`} fill sizes="200px" unoptimized />
          ) : (
            <span className="ad-photo__empty">
              <span className={styles.none}>بلا صورة</span>
            </span>
          )}
          {(shown || saved) && (
            <span className="ad-photo__seal">
              <BrandMark kind="seal" width={32} />
            </span>
          )}
        </div>
      </div>

      <div className={styles.controls}>
        <label htmlFor={inputId} className="ad-btn ad-btn--ghost" aria-disabled={uploading !== null && !done}>
          {uploading && !done ? "جارٍ الرفع…" : current ? "اختر صورة جديدة" : "اختر صورة"}
        </label>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={uploading !== null && !done}
          onChange={(e) => onFiles(e.target.files)}
        />
        <p className={styles.info}>
          أي صورة من الجوال. تُفتح أولاً للقص على إطار البطاقة (4:5) والتدوير والتكبير، أو تستخدمها كما هي. الأصل لا
          يُحفظ: لتعديل الصورة لاحقاً ارفعها من جديد.
        </p>
        {state && (
          <p className={`ad-notice ${state.ok ? "ad-notice--ok" : "ad-notice--error"}`} role={state.ok ? "status" : "alert"}>
            {state.message}
          </p>
        )}
      </div>

      {picked && (
        <ImageEditor
          files={picked}
          aspects={CARD}
          look="card"
          onDone={(photos) => {
            setPicked(null);
            clearInput();
            if (photos[0]) void upload(photos[0]);
          }}
          onCancel={() => {
            setPicked(null);
            clearInput();
          }}
        />
      )}
    </div>
  );
}
