"use client";

/*
  Adding one video to the gallery (owner). Nothing is uploaded until the poster is chosen; «إلغاء» at any step before
  that leaves nothing behind.
    1. Checked in the browser with the same MP4 reader as the server (src/lib/mp4.ts): an MP4 (not an iPhone .mov),
       H.264 (not HEVC), at most 20 s and 5 MB is ready as it is.
    1b. Anything else is made ready here (src/lib/admin/video-compress.ts, Mediabunny over WebCodecs, loaded only now):
       over 19.9 s first opens the trim screen (where it starts, how long, a looping preview); then «جارٍ تجهيز الفيديو…
       45٪» with «أوقف», the screen kept awake (Wake Lock). The result goes through the same checks. A browser without
       WebCodecs / H.264 is told to open the page in a recent Chrome or Safari (scripts/media/compress.mjs still works
       on a computer).
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
import type { Probe } from "@/lib/admin/video-compress";
import styles from "./GalleryManager.module.css";

const ImageEditor = dynamic(() => import("@/components/admin/ImageEditor"), { ssr: false });

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_MS = 20000;
/** The longest cut (video-compress.ts MAX_SECONDS): the server's 20 s, less a margin for frame timing. */
const MAX_CUT = 19.9;
const BROWSER = "افتح الصفحة من Chrome أو Safari حديث.";

type Step = "checking" | "trim" | "compressing" | "poster" | "editing" | "uploading";

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
const loadCompressor = () => import("@/lib/admin/video-compress");

/** Ready as it is: what the server accepts (an MP4, H.264, ≤ 20 s, ≤ 5 MB). A big file isn't read at all. */
async function readyAsIs(file: File): Promise<boolean> {
  if (file.size > MAX_BYTES) return false;
  const info = readMp4(new Uint8Array(await file.arrayBuffer()));
  return !!info && info.brand !== "qt  " && isH264(info.codec) && info.durationMs <= MAX_MS;
}

/** The screen stays on while the video is made ready (a phone that sleeps stops the encoder). */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let done = false;
    const take = () => {
      if (done || document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then(
        (l) => (done ? void l.release() : (lock = l)),
        () => {},
      );
    };
    take();
    // The lock is let go when the tab is hidden; take it again on return.
    document.addEventListener("visibilitychange", take);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", take);
      void lock?.release().catch(() => {});
    };
  }, [on]);
}

type Props = { file: File; prepare: GalleryActions["prepareVideo"]; onClose: (result: ActionState) => void };

export function VideoAdder({ file: picked, prepare, onClose }: Props) {
  const titleId = useId();
  const posterInput = useId();
  const video = useRef<HTMLVideoElement>(null);
  const trimVideo = useRef<HTMLVideoElement>(null);
  const frameCanvas = useRef<HTMLCanvasElement>(null);
  const playVideo = useRef<HTMLVideoElement>(null); // the clip while it is prepared (and recorded, by playback)
  const probe = useRef<Probe | null>(null);
  const abort = useRef<AbortController | null>(null);
  // The file that is uploaded: the one picked when it is ready as it is, else the one made here.
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [pickedUrl] = useState(() => URL.createObjectURL(picked));
  const [step, setStep] = useState<Step>("checking");
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [at, setAt] = useState(0);
  const [poster, setPoster] = useState<File[] | null>(null);
  // Trim: the source's length, where the cut starts and how long it is (seconds).
  const [source, setSource] = useState(0);
  const [cutStart, setCutStart] = useState(0);
  const [cutLength, setCutLength] = useState(MAX_CUT);
  const [trimmed, setTrimmed] = useState(false);
  const [plays, setPlays] = useState(true);
  const [progress, setProgress] = useState({ fraction: 0, pass: 1 });

  useWakeLock(step === "compressing");

  useEffect(() => () => URL.revokeObjectURL(pickedUrl), [pickedUrl]);
  useEffect(() => (url ? () => URL.revokeObjectURL(url) : undefined), [url]);
  useEffect(
    () => () => {
      abort.current?.abort();
      probe.current?.dispose();
    },
    [],
  );

  function takeFile(f: File) {
    setFile(f);
    setUrl(URL.createObjectURL(f));
    setStep("poster");
  }

  // 1. The checks, once: ready as it is, or open it with Mediabunny.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (await readyAsIs(picked)) return !cancelled && takeFile(picked);
      const { probeVideo } = await loadCompressor();
      const result = await probeVideo(picked);
      if (cancelled) return result.ok && result.probe.dispose();
      if (!result.ok) {
        setError(
          result.reason === "unsupported"
            ? `هذا المتصفح لا يستطيع تجهيز الفيديو. ${BROWSER}`
            : result.reason === "undecodable"
              ? `هذا المتصفح لا يقرأ ترميز هذا الفيديو. ${BROWSER}`
              : "تعذّر قراءة هذا الفيديو. جرّب ملفاً آخر.",
        );
        return;
      }
      probe.current = result.probe;
      setSource(result.probe.duration);
      if (result.probe.duration > MAX_CUT) {
        setTrimmed(true);
        setCutLength(MAX_CUT);
        setStep("trim");
      } else void compress(0, result.probe.duration, false);
    })().catch(() => !cancelled && setError("تعذّر قراءة هذا الفيديو. جرّب ملفاً آخر."));
    return () => {
      cancelled = true;
    };
    // Once per file; compress/takeFile only set state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  // 1b. Make it ready: H.264, 720p, ≤ 30 fps, silent, ≤ 5 MB; then the same checks as a ready file.
  async function compress(start: number, end: number, fromTrim: boolean) {
    setError(null);
    setProgress({ fraction: 0, pass: 1 });
    setStep("compressing");
    const ctrl = new AbortController();
    abort.current = ctrl;
    const { compressVideo, isWebKit } = await loadCompressor();
    // The «compressing» step renders the <video>: wait for it to be in the page.
    for (let i = 0; i < 10 && !playVideo.current; i++) await new Promise((r) => requestAnimationFrame(r));
    const out = await compressVideo(picked, {
      start,
      end,
      signal: ctrl.signal,
      onProgress: (fraction, pass) => setProgress({ fraction, pass }),
      playback: playVideo.current,
      // Safari / iPhone and HDR: WebCodecs frames come out black when redrawn; a playing <video> doesn't.
      preferPlayback: isWebKit() || (probe.current?.hdr ?? false),
    });
    if (ctrl.signal.aborted) return;
    abort.current = null;
    const back = () => setStep(fromTrim ? "trim" : "checking");
    if (!out.ok) {
      if (out.reason === "too-big") {
        // Only a shorter cut helps: offer the trim screen even for a short video.
        setError("الفيديو أكبر من 5 ميغابايت حتى بعد الضغط. اختر مقطعاً أقصر.");
        setTrimmed(true);
        setCutLength(Math.max(1, Math.min(MAX_CUT, (end - start) * 0.7)));
        setStep("trim");
      } else {
        setError(
          out.reason === "undecodable"
            ? `هذا المتصفح لا يقرأ ترميز هذا الفيديو. ${BROWSER}`
            : out.reason === "black"
              ? "خرج الفيديو أسود بعد التجهيز. جرّب مرة أخرى، أو جهّزه من الكمبيوتر بسكربت الضغط."
              : "تعذّر تجهيز الفيديو. حاول مرة أخرى.",
        );
        back();
      }
      return;
    }
    if (!(await readyAsIs(out.file))) {
      setError("تعذّر تجهيز الفيديو. حاول مرة أخرى.");
      back();
      return;
    }
    takeFile(out.file);
  }

  function stopCompressing() {
    abort.current?.abort();
    abort.current = null;
    if (trimmed) setStep("trim");
    else onClose(null);
  }

  // Trim preview: the cut loops in the <video>; a file the browser can't play (HEVC on some devices) shows a frame.
  const cutEnd = Math.min(source, cutStart + cutLength);
  useEffect(() => {
    if (step !== "trim") return;
    const v = trimVideo.current;
    if (v && plays) {
      if (Math.abs(v.currentTime - cutStart) > 0.05) v.currentTime = cutStart;
      void v.play().catch(() => {});
      return;
    }
    const canvas = frameCanvas.current;
    if (!canvas || !probe.current) return;
    let live = true;
    probe.current.frameAt(cutStart, 360).then((frame) => {
      if (!live || !frame) return;
      canvas.width = frame.width;
      canvas.height = frame.height;
      canvas.getContext("2d")?.drawImage(frame, 0, 0);
    });
    return () => {
      live = false;
    };
  }, [step, cutStart, plays]);

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
    if (!file) return;
    setStep("uploading");
    setError(null);
    const prep = await prepare();
    if (!prep.ok) {
      setError(prep.message);
      setStep("poster");
      return;
    }
    const { createClient } = await import("@/lib/supabase/client");
    const client = createClient();
    const bucket = client.storage.from("gallery");
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
      // The request didn't come back: the server may not have seen it. Don't leave the file behind (and say if it stays).
      const { removeFiles, keptNote } = await import("@/lib/storage-files");
      const removed = await removeFiles(client, "gallery", [prep.path], "gallery video upload abandoned");
      setError(`تعذّر حفظ الفيديو. تأكد من الاتصال وحاول مرة أخرى.${removed.ok ? "" : ` ${keptNote(removed.kept.length)}`}`);
      setStep("poster");
    }
  }

  const uploading = step === "uploading";
  const percent = Math.floor(progress.fraction * 100);
  const showPoster = step === "poster" || step === "editing" || step === "uploading";

  return (
    <section className={styles.adder} aria-labelledby={titleId}>
      <h2 id={titleId}>فيديو جديد</h2>

      {step === "checking" && !error && (
        <p className={styles.hint} role="status">
          جارٍ فحص الفيديو…
        </p>
      )}

      {/* Above the steps, so a refusal after «جهّز» is seen without scrolling. */}
      {error && (
        <p className="ad-notice ad-notice--error" role="alert">
          {error}
        </p>
      )}

      {step === "trim" && (
        <>
          <p className={styles.hint}>
            الفيديو {source.toFixed(1)} ثانية، والحد 20. اختر المقطع الذي يظهر في الموقع.
          </p>
          <div className={styles.adderBody}>
            {plays ? (
              <video
                ref={trimVideo}
                className={styles.preview}
                src={pickedUrl}
                muted
                playsInline
                autoPlay
                preload="auto"
                onError={() => setPlays(false)}
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  if (v.currentTime >= cutEnd || v.currentTime < cutStart - 0.3) v.currentTime = cutStart;
                }}
              />
            ) : (
              <canvas ref={frameCanvas} className={styles.preview} aria-label="أول لقطة من المقطع" />
            )}
            <div className={styles.adderControls}>
              <label className={styles.moment}>
                <span>البداية</span>
                <input
                  type="range"
                  dir="ltr"
                  min={0}
                  max={Math.max(0, source - cutLength)}
                  step={0.1}
                  value={Math.min(cutStart, Math.max(0, source - cutLength))}
                  onChange={(e) => setCutStart(Number(e.target.value))}
                  aria-valuetext={`${cutStart.toFixed(1)} ثانية`}
                />
                <span dir="ltr" className={styles.time}>
                  {cutStart.toFixed(1)}s
                </span>
              </label>
              <label className={styles.moment}>
                <span>المدة</span>
                <input
                  type="range"
                  dir="ltr"
                  min={1}
                  max={Math.min(MAX_CUT, source)}
                  step={0.1}
                  value={cutLength}
                  onChange={(e) => {
                    const len = Number(e.target.value);
                    setCutLength(len);
                    setCutStart((s) => Math.min(s, Math.max(0, source - len)));
                  }}
                  aria-valuetext={`${cutLength.toFixed(1)} ثانية`}
                />
                <span dir="ltr" className={styles.time}>
                  {cutLength.toFixed(1)}s
                </span>
              </label>
              <p className={styles.hint} dir="ltr">
                {cutStart.toFixed(1)}s → {cutEnd.toFixed(1)}s
              </p>
              <div className="ad-form-actions">
                <button type="button" className="ad-btn ad-btn--primary" onClick={() => void compress(cutStart, cutEnd, true)}>
                  جهّز هذا المقطع
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {step === "compressing" && (
        <div className={styles.compress} role="status">
          {/* The clip as it is prepared: by playback (Safari, HDR) it plays here and each frame is recorded. */}
          <video ref={playVideo} className={styles.preview} src={pickedUrl} muted playsInline preload="auto" aria-hidden="true" />
          <p>
            {progress.pass > 1 ? "جارٍ تجهيز نسخة أصغر…" : "جارٍ تجهيز الفيديو…"} {percent}٪
          </p>
          <progress max={100} value={percent} aria-label="تجهيز الفيديو" />
          <p className={styles.hint}>أبقِ هذه الصفحة مفتوحة حتى ينتهي.</p>
          <div className="ad-form-actions">
            <button type="button" className="ad-btn ad-btn--ghost" onClick={stopCompressing}>
              أوقف التجهيز
            </button>
          </div>
        </div>
      )}

      {showPoster && url && (
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
          يُرفع الفيديو ({mb(file?.size ?? 0)} ميغابايت)…
        </p>
      )}

      <div className="ad-form-actions">
        <button
          type="button"
          className="ad-btn ad-btn--ghost"
          onClick={() => {
            abort.current?.abort();
            onClose(null);
          }}
          disabled={uploading}
        >
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
