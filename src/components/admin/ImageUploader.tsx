"use client";

/*
  Product photo, prepared in the browser (canvas, no library), previewed on the seal, then uploaded straight to the
  `products` bucket (staff-only storage policy) with a year-long cache and recorded with admin_set_product_image().
    - Resized to 1600px on its longest side.
    - WebP where the browser can encode it.
    - Safari / iPhone can't: an opaque photo becomes JPEG; a transparent one stays PNG (alpha kept) and is shrunk
      step by step until it is under PNG_BUDGET (never below MIN_SIDE).
  Visitors get WebP/AVIF from next/image whatever was uploaded.
*/

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { setProductImage } from "@/app/admin/products/actions";
import { createClient } from "@/lib/supabase/client";
import { productImageSrc } from "@/lib/format";
import type { ActionState } from "@/lib/admin/errors";
import styles from "./ImageUploader.module.css";

const MAX_SIDE = 1600;
const MIN_SIDE = 800;
const PNG_BUDGET = 1.5 * 1024 * 1024;
const QUALITY = 0.86;

type Ext = "webp" | "jpg" | "png";
const MIME: Record<Ext, string> = { webp: "image/webp", jpg: "image/jpeg", png: "image/png" };
const FORMAT_NAME: Record<Ext, string> = { webp: "WebP", jpg: "JPEG", png: "PNG" };

type Prepared = { blob: Blob; url: string; ext: Ext; width: number; height: number };

function draw(source: ImageBitmap, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

const encode = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** Any pixel not fully opaque? (Every 4th pixel is enough for a product photo and keeps it quick on a phone.) */
function hasTransparency(canvas: HTMLCanvasElement) {
  const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 16) if (data[i] < 255) return true;
  return false;
}

async function prepare(file: File): Promise<Prepared> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    let width = Math.round(bitmap.width * scale);
    let height = Math.round(bitmap.height * scale);
    let canvas = draw(bitmap, width, height);
    const done = (blob: Blob, ext: Ext): Prepared => ({ blob, url: URL.createObjectURL(blob), ext, width, height });

    const webp = await encode(canvas, MIME.webp, QUALITY);
    if (webp?.type === MIME.webp) return done(webp, "webp");

    if (!hasTransparency(canvas)) {
      const jpg = await encode(canvas, MIME.jpg, QUALITY);
      if (jpg?.type === MIME.jpg) return done(jpg, "jpg");
    }

    let png = await encode(canvas, MIME.png);
    while (png && png.size > PNG_BUDGET && Math.max(width, height) > MIN_SIDE) {
      const step = Math.max(MIN_SIDE / Math.max(width, height), 0.85);
      width = Math.round(width * step);
      height = Math.round(height * step);
      canvas = draw(bitmap, width, height); // always from the original, so quality doesn't degrade step by step
      png = await encode(canvas, MIME.png);
    }
    if (!png) throw new Error("encode failed");
    return done(png, "png");
  } finally {
    bitmap.close();
  }
}

export function ImageUploader({ productId, current, name }: { productId: string; current: string | null; name: string }) {
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
    if (!file.type.startsWith("image/")) {
      setState({ ok: false, message: "اختر ملف صورة (PNG أو JPG أو WebP)." });
      return;
    }
    setBusy("reading");
    try {
      setPrepared(await prepare(file));
    } catch {
      setState({ ok: false, message: "تعذّر قراءة هذه الصورة. جرّب صورة PNG أو JPG أخرى." });
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
    const path = `${productId}/${crypto.randomUUID()}.${prepared.ext}`;
    const { error } = await createClient()
      .storage.from("products")
      .upload(path, prepared.blob, { cacheControl: "31536000", contentType: MIME[prepared.ext], upsert: false });
    if (error) {
      setBusy(null);
      setState({
        ok: false,
        message: error.message.includes("size")
          ? "الصورة أكبر من 5 ميغابايت بعد التصغير. جرّب صورة أخرى."
          : "تعذّر رفع الصورة. تأكد من الاتصال وحاول مرة أخرى.",
      });
      return;
    }
    const result = await setProductImage(productId, path);
    setBusy(null);
    setState(result);
    if (result?.ok) cancel();
  }

  const shown = prepared?.url ?? productImageSrc(current);

  return (
    <div className={styles.wrap}>
      <div className={`ad-seal ${styles.seal}`}>
        <div className="ad-seal__disc">
          {shown ? (
            <div className="ad-seal__img">
              {prepared ? (
                // A local blob: URL; next/image can't optimise it.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shown} alt={`معاينة صورة ${name}`} className={styles.blob} />
              ) : (
                <Image src={shown} alt={`صورة ${name}`} fill sizes="200px" />
              )}
            </div>
          ) : (
            <span className={styles.none}>بلا صورة</span>
          )}
        </div>
      </div>

      <div className={styles.controls}>
        {prepared ? (
          <>
            <p className={styles.info}>
              معاينة: {prepared.width}×{prepared.height}، {FORMAT_NAME[prepared.ext]}،{" "}
              {Math.max(1, Math.round(prepared.blob.size / 1024))} كيلوبايت
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
            <p className={styles.info}>صورة PNG شفافة الخلفية أفضل. تُصغَّر إلى 1600 بكسل وتُحوّل قبل الرفع.</p>
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
