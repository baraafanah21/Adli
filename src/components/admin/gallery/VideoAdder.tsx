"use client";

/*
  Adding one video to the gallery (owner). Nothing is uploaded until the poster is chosen; «إلغاء» at any step before
  that leaves nothing behind.
    1. Checked in the browser with the same MP4 reader as the server (src/lib/mp4.ts): an MP4 (not an iPhone .mov),
       H.264 (not HEVC), at most 20 s and 5 MB. Each refusal says what to do: the compress script
       (scripts/media/compress.mjs) makes any video fit.
    2. The poster, required: a frame of the video (a slider to choose the moment, then a canvas grab) or a photo file.
    3. The ImageEditor frames it (9:16 by default, 4:5, 1:1): the aspect chosen is the item's.
    4. The MP4 goes straight from the browser to Storage (a 5 MB request can't pass through Vercel), at the path
       prepareGalleryVideo() hands out (`prepare`); then /api/admin/gallery/video reads it back and checks it again, makes the
       poster's WebP files and records the item (hidden until published).
*/

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState } from "react";
import type { ActionState } from "@/lib/admin/errors";
import type { GalleryActions } from "./GalleryManager";
import type { Edited } from "@/components/admin/ImageEditor";
import { GALLERY_EDITOR_ASPECTS, aspectLabel } from "@/lib/gallery-aspects";
import { isH264, readMp4 } from "@/lib/mp4";
import styles from "./GalleryManager.module.css";

const ImageEditor = dynamic(() => import("@/components/admin/ImageEditor"), { ssr: false });

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_MS = 20000;
const SCRIPT = "اضغطه أولاً بسكربت الضغط (scripts/media/compress.mjs)، فيصير MP4 بترميز H.264 وأقل من 5 ميغابايت.";

type Step = "checking" | "poster" | "editing" | "uploading";

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

async function check(file: File): Promise<string | null> {
  if (file.size > MAX_BYTES) return `الفيديو ${mb(file.size)} ميغابايت، والحد 5. ${SCRIPT}`;
  const info = readMp4(new Uint8Array(await file.arrayBuffer()));
  if (!info || info.brand === "qt  ") return `هذا الملف ليس فيديو MP4 (فيديو الآيفون MOV). ${SCRIPT}`;
  if (!isH264(info.codec)) return `ترميز هذا الفيديو (HEVC) لا تشغّله كل المتصفحات. ${SCRIPT}`;
  if (info.durationMs > MAX_MS) return `الفيديو ${(info.durationMs / 1000).toFixed(1)} ثانية، والحد 20. اختر أحلى مقطع فيه. ${SCRIPT}`;
  return null;
}

type Props = { file: File; prepare: GalleryActions["prepareVideo"]; onClose: (result: ActionState) => void };

export function VideoAdder({ file, prepare, onClose }: Props) {
  const titleId = useId();
  const posterInput = useId();
  const video = useRef<HTMLVideoElement>(null);
  const [url] = useState(() => URL.createObjectURL(file));
  const [step, setStep] = useState<Step>("checking");
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [at, setAt] = useState(0);
  const [poster, setPoster] = useState<File[] | null>(null);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  // 1. The checks, once.
  useEffect(() => {
    let cancelled = false;
    check(file).then(
      (problem) => {
        if (cancelled) return;
        if (problem) setError(problem);
        else setStep("poster");
      },
      () => !cancelled && setError(`تعذّر قراءة هذا الفيديو. ${SCRIPT}`),
    );
    return () => {
      cancelled = true;
    };
  }, [file]);

  // 2a. A frame: seek to the chosen moment, then draw it.
  function seek(t: number) {
    setAt(t);
    if (video.current) video.current.currentTime = t;
  }

  async function grab() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) {
      setError("تعذّر أخذ اللقطة. جرّب لحظة أخرى، أو ارفع صورة غلاف.");
      return;
    }
    setError(null);
    setPoster([new File([blob], "poster.jpg", { type: "image/jpeg" })]);
    setStep("editing");
  }

  // 4. Upload, then the server's own checks.
  async function upload(framed: Edited) {
    setStep("uploading");
    setError(null);
    const prep = await prepare();
    if (!prep.ok) {
      setError(prep.message);
      setStep("poster");
      return;
    }
    const { createClient } = await import("@/lib/supabase/client");
    const bucket = createClient().storage.from("gallery");
    const { error: uploadError } = await bucket.upload(prep.path, file, {
      contentType: "video/mp4",
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) {
      console.error("gallery video upload", uploadError.message);
      setError("تعذّر رفع الفيديو. تأكد من الاتصال وحاول مرة أخرى.");
      setStep("poster");
      return;
    }
    const body = new FormData();
    body.set("id", prep.id);
    body.set("video", prep.path);
    body.set("aspect", aspectLabel(framed.aspect) ?? "9:16");
    body.set("poster", framed.blob, "poster.jpg");
    try {
      const res = await fetch("/api/admin/gallery/video", { method: "POST", body });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (json.ok) onClose({ ok: true, message: "أُضيف الفيديو. انشره ليظهر في الموقع." });
      else {
        setError(json.message ?? "تعذّر حفظ الفيديو.");
        setStep("poster");
      }
    } catch {
      // The request didn't come back: the server may not have seen it. Don't leave the file behind.
      await bucket.remove([prep.path]);
      setError("تعذّر حفظ الفيديو. تأكد من الاتصال وحاول مرة أخرى.");
      setStep("poster");
    }
  }

  const uploading = step === "uploading";

  return (
    <section className={styles.adder} aria-labelledby={titleId}>
      <h2 id={titleId}>فيديو جديد</h2>

      {step === "checking" && !error && (
        <p className={styles.hint} role="status">
          جارٍ فحص الفيديو…
        </p>
      )}

      {error && (
        <p className="ad-notice ad-notice--error" role="alert">
          {error}
        </p>
      )}

      {step !== "checking" && (
        <>
          <p className={styles.hint}>صورة الغلاف إلزامية: تظهر قبل أن يعمل الفيديو. اختر لحظة منه، أو ارفع صورة.</p>
          <div className={styles.adderBody}>
            <video
              ref={video}
              className={styles.preview}
              src={url}
              muted
              playsInline
              preload="auto"
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            />
            <div className={styles.adderControls}>
              <label className={styles.moment}>
                <span>اللحظة</span>
                <input
                  type="range"
                  dir="ltr"
                  min={0}
                  max={duration || 0}
                  step={0.05}
                  value={at}
                  onChange={(e) => seek(Number(e.target.value))}
                  disabled={!duration || uploading}
                  aria-valuetext={`${at.toFixed(1)} ثانية`}
                />
                <span dir="ltr" className={styles.time}>
                  {at.toFixed(1)}s
                </span>
              </label>
              <div className="ad-form-actions">
                <button type="button" className="ad-btn ad-btn--primary" onClick={grab} disabled={!duration || uploading}>
                  التقط هذه اللحظة
                </button>
                <label htmlFor={posterInput} className="ad-btn ad-btn--ghost" aria-disabled={uploading}>
                  ارفع صورة غلاف
                </label>
                <input
                  id={posterInput}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) {
                      setError(null);
                      setPoster([f]);
                      setStep("editing");
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {uploading && (
        <p className="ad-notice" role="status">
          يُرفع الفيديو ({mb(file.size)} ميغابايت)…
        </p>
      )}

      <div className="ad-form-actions">
        <button type="button" className="ad-btn ad-btn--ghost" onClick={() => onClose(null)} disabled={uploading}>
          إلغاء
        </button>
      </div>

      {step === "editing" && poster && (
        <ImageEditor
          files={poster}
          aspects={GALLERY_EDITOR_ASPECTS}
          onDone={(results) => {
            setPoster(null);
            if (results[0]) void upload(results[0]);
            else setStep("poster");
          }}
          onCancel={() => {
            setPoster(null);
            setStep("poster");
          }}
        />
      )}
    </section>
  );
}
