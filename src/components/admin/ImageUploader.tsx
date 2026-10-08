"use client";

/*
  Product photo: any photo from the phone (JPEG, PNG, HEIC on an iPhone), nothing to prepare.
    1. In the browser: decode it (the iPhone's HEIC included, in Safari), apply its EXIF rotation, scale it to at most
       2400px and encode a JPEG (every browser can, Safari included), so the upload stays under Vercel's 4.5 MB.
       The canvas copies no metadata, so the location the photo was taken at never leaves the phone.
    2. Previewed in the shelf's own 4:5 frame, so the owner sees the crop before saving.
    3. POST /api/admin/product-image (staff only): sharp makes the two WebP files and records the photo.
*/

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { productImageSrc } from "@/lib/format";
import type { ActionState } from "@/lib/admin/errors";
import styles from "./ImageUploader.module.css";

const MAX_SIDE = 2400;
const BUDGET = 4 * 1024 * 1024;

type Prepared = { blob: Blob; url: string; width: number; height: number };

/** createImageBitmap applies EXIF orientation; an <img> is the fallback (older Safari, some HEIC files). */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = document.createElement("img");
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const encode = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

async function prepare(file: File): Promise<Prepared> {
  const source = await decode(file);
  try {
    const w0 = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const h0 = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    if (!w0 || !h0) throw new Error("empty image");
    const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const width = Math.round(w0 * scale);
    const height = Math.round(h0 * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    // JPEG has no transparency: a cut-out PNG sits on white instead of black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);

    let quality = 0.9;
    let blob = await encode(canvas, quality);
    while (blob && blob.size > BUDGET && quality > 0.5) {
      quality -= 0.1;
      blob = await encode(canvas, quality);
    }
    if (!blob || blob.size > BUDGET) throw new Error("too large");
    return { blob, url: URL.createObjectURL(blob), width, height };
  } finally {
    if (!(source instanceof HTMLImageElement)) source.close();
  }
}

const isHeic = (file: File) => /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

export function ImageUploader({ productId, current, name }: { productId: string; current: string | null; name: string }) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState<"reading" | "saving" | null>(null);
  const [state, setState] = useState<ActionState>(null);

  // Free the preview's object URL when it is replaced or the page closes.
  useEffect(() => () => (prepared ? URL.revokeObjectURL(prepared.url) : undefined), [prepared]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setState(null);
    if (file.type && !file.type.startsWith("image/")) {
      setState({ ok: false, message: "اختر صورة من المعرض أو صوّر المنتج." });
      return;
    }
    setBusy("reading");
    try {
      setPrepared(await prepare(file));
    } catch {
      setState({
        ok: false,
        message: isHeic(file)
          ? "هذا المتصفح لا يقرأ صور HEIC. ارفعها من الآيفون مباشرة، أو اختر صورة أخرى."
          : "تعذّر قراءة هذه الصورة. جرّب صورة أخرى.",
      });
    } finally {
      setBusy(null);
    }
  }

  function cancel() {
    setPrepared(null);
    if (input.current) input.current.value = "";
  }

  async function save() {
    if (!prepared) return;
    setBusy("saving");
    const body = new FormData();
    body.set("productId", productId);
    body.set("file", prepared.blob, "photo.jpg");
    let result: ActionState;
    try {
      const res = await fetch("/api/admin/product-image", { method: "POST", body });
      const json = (await res.json()) as { ok: boolean; message?: string };
      result = json.ok ? { ok: true, message: "حُفظت الصورة." } : { ok: false, message: json.message ?? "تعذّر حفظ الصورة." };
    } catch {
      result = { ok: false, message: "تعذّر رفع الصورة. تأكد من الاتصال وحاول مرة أخرى." };
    }
    setBusy(null);
    setState(result);
    if (result?.ok) {
      cancel();
      router.refresh();
    }
  }

  const saved = productImageSrc(current, "sm");

  return (
    <div className={styles.wrap}>
      {/* The shelf's own frame (SealStage), at card size: what the customer will see. */}
      <div className={`ad-photo ${styles.frame}`}>
        <div className="ad-photo__frame">
          {prepared ? (
            // A local blob: URL; next/image can't optimise it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={prepared.url} alt={`معاينة صورة ${name}`} className={styles.blob} />
          ) : saved ? (
            <Image src={saved} alt={`صورة ${name}`} fill sizes="200px" unoptimized />
          ) : (
            <span className="ad-photo__empty">
              <span className={styles.none}>بلا صورة</span>
            </span>
          )}
          {(prepared || saved) && (
            <span className="ad-photo__seal">
              <BrandMark kind="seal" width={32} />
            </span>
          )}
        </div>
      </div>

      <div className={styles.controls}>
        {prepared ? (
          <>
            <p className={styles.info}>
              هكذا تظهر في المتجر. الإطار يقص الأطراف، فتأكد أن المنتج في الوسط.
            </p>
            <div className="ad-form-actions">
              <button type="button" className="ad-btn ad-btn--primary" onClick={save} disabled={busy !== null}>
                {busy === "saving" ? "جارٍ الحفظ…" : "حفظ الصورة"}
              </button>
              <button type="button" className="ad-btn ad-btn--ghost" onClick={cancel} disabled={busy !== null}>
                إلغاء
              </button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor={inputId} className="ad-btn ad-btn--ghost">
              {busy === "reading" ? "جارٍ تجهيز الصورة…" : current ? "اختر صورة جديدة" : "اختر صورة"}
            </label>
            <input
              ref={input}
              id={inputId}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <p className={styles.info}>
              أي صورة من الجوال. صوّر المنتج كاملاً في وسط الصورة؛ التدوير والتحويل وحذف بيانات الموقع تتم وحدها.
            </p>
          </>
        )}
        {state && (
          <p className={`ad-notice ${state.ok ? "ad-notice--ok" : "ad-notice--error"}`} role={state.ok ? "status" : "alert"}>
            {state.message}
          </p>
        )}
      </div>
    </div>
  );
}
