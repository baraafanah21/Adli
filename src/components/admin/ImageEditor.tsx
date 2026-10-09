"use client";

/*
  The admin's photo editor: crop, turn and zoom a photo on the phone before it is uploaded, so ~8 MB from the camera
  becomes well under 1 MB, already framed. Shared by every admin upload (product photos now; the gallery and video
  posters next), loaded only when a photo is picked (next/dynamic in the uploader), never on the public site.

  - react-easy-crop does the stage: drag, pinch, wheel. Its own position limit allows an empty corner once the photo
    is tilted, so it is switched off (restrictPosition={false}) and src/lib/image-crop.ts keeps the whole frame on the
    photo: a zoom floor per angle (minZoomFor) and a clamp on every position (clampPosition). Both are applied while
    rendering, so the view on screen is always a legal one; zoom 0 in state means "fit" (the floor).
  - Only the aspects given (`aspects`, the first is the default): products 4:5, the gallery 9:16 / 1:1,
    posters 9:16. Never a free crop. `look="card"` dresses the frame as the shop's card (brass rings, the seal).
  - Several photos: one at a time («2 من 5»), each in its own <PhotoStep key>, so nothing carries over; «تخطي» keeps
    a photo as it is.
  - Saving draws on the phone (src/lib/admin/image-prep.ts): upright, ≤ 3000px source, ≤ 2400px JPEG 0.92. The
    original is never kept anywhere: editing a saved photo means uploading it again.
  - The page is RTL; the stage is LTR so dragging and turning follow the hand. A native <dialog> (showModal: focus
    stays inside, the page behind is inert). Keys: arrows move the frame, + / − zoom, R turns (Shift+R back),
    Enter saves, Esc cancels. Cancelling after a change asks first; cancelling never uploads anything.
*/

import Cropper from "react-easy-crop";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { ResetIcon, RotateLeftIcon, RotateRightIcon } from "./editor-icons";
import { clampPosition, cropPlan, minZoomFor, type Point, type Size } from "@/lib/image-crop";
import {
  OUTPUT_MAX,
  SOFT_WIDTH,
  decodePhoto,
  isHeic,
  release,
  releasePhoto,
  renderCrop,
  renderWhole,
  toJpeg,
  type Edited,
  type Photo,
} from "@/lib/admin/image-prep";
import styles from "./ImageEditor.module.css";

export type Aspect = { value: number; label: string };
export type { Edited };

type Props = {
  files: File[];
  /** Allowed frames; the first is the default. Never a free crop. */
  aspects: Aspect[];
  /** "card": the frame is dressed as the shop's product card (brass rings, the seal in its corner). */
  look?: "card" | "plain";
  /** Every photo done (saved or kept as it is), in order. Never called on cancel. */
  onDone: (photos: Edited[]) => void;
  onCancel: () => void;
};

const ZOOM_SPAN = 4; // the slider goes from the floor to 4× the floor
const MOVE = 10; // px per arrow key (Shift: 4×)
const SEAL_RATIO = 32 / 248; // the card's seal: 32px on a 248px-wide card (SealStage), scaled to the frame
const ORIGIN: Point = { x: 0, y: 0 };

const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;

export default function ImageEditor({ files, aspects, look = "plain", onDone, onCancel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Edited[]>([]);
  // The current step's «cancel» (asks first after a change); Esc and the backdrop go through it. `reopen` is called
  // before asking, for when the browser has already closed the dialog itself.
  const requestClose = useRef<(reopen?: () => void) => void>(onCancel);
  const leaving = useRef(false);

  // Open as a modal at once; close it on unmount.
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => {
      leaving.current = true;
      d?.close();
    };
  }, []);

  function next(result: Edited | null) {
    const all = result ? [...results, result] : results;
    if (index + 1 < files.length) {
      setResults(all);
      setIndex(index + 1);
    } else {
      onDone(all);
    }
  }

  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) requestClose.current();
  };

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault(); // Esc: the step decides (asks first if something changed)
        requestClose.current();
      }}
      onClose={() => {
        // Closed by the browser, not by us: Chrome won't let a page refuse Esc twice without a tap in between. Treat it
        // as «إلغاء»: after a change, open again and ask.
        if (!leaving.current) requestClose.current(() => dialog.current?.showModal());
      }}
      onClick={onBackdrop}
    >
      <PhotoStep
        key={index}
        file={files[index]}
        position={files.length > 1 ? { at: index + 1, of: files.length } : null}
        aspects={aspects}
        look={look}
        titleId={titleId}
        hasDone={results.length > 0}
        requestClose={requestClose}
        onNext={next}
        onCancel={onCancel}
      />
    </dialog>
  );
}

type StepProps = {
  file: File;
  position: { at: number; of: number } | null;
  aspects: Aspect[];
  look: "card" | "plain";
  titleId: string;
  hasDone: boolean;
  requestClose: RefObject<(reopen?: () => void) => void>;
  onNext: (result: Edited | null) => void;
  onCancel: () => void;
};

function PhotoStep({ file, position, aspects, look, titleId, hasDone, requestClose, onNext, onCancel }: StepProps) {
  const notImage = Boolean(file.type) && !file.type.startsWith("image/") && !isHeic(file);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [error, setError] = useState<string | null>(notImage ? "هذا الملف ليس صورة. اختر صورة من المعرض." : null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [aspect, setAspect] = useState(aspects[0].value);
  const [quarter, setQuarter] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [zoomWanted, setZoom] = useState(0); // 0 = fit (the floor)
  const [cropWanted, setCrop] = useState<Point>(ORIGIN);
  const [touched, setTouched] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [media, setMedia] = useState<Size | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<Size | null>(null);

  // The frame: the largest box of this aspect inside the stage, with a margin (--space-6) so the card's outer ring and
  // the dimmed photo around it stay in view. Fixed by us (cropSize), so it doesn't change size as the photo turns.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const margin = parseFloat(getComputedStyle(el).getPropertyValue("--space-6")) || 0;
      setRoom({ width: el.clientWidth - 2 * margin, height: el.clientHeight - 2 * margin });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const frame = useMemo<Size | null>(() => {
    if (!room || room.width <= 0 || room.height <= 0) return null;
    const width = Math.min(room.width, room.height * aspect);
    return { width, height: width / aspect };
  }, [room, aspect]);

  // The legal view, worked out while rendering: never under the floor, the frame always on the photo.
  const deg = quarter * 90 + tilt;
  const floor = media && frame ? minZoomFor(media, frame, deg) : 1;
  const ceiling = floor * ZOOM_SPAN;
  const zoom = Math.min(ceiling, Math.max(floor, zoomWanted));
  const crop = media && frame ? clampPosition(cropWanted, media, frame, zoom, deg) : cropWanted;

  // Decode this photo (upright, ≤ 3000px); free it when the step goes.
  useEffect(() => {
    if (notImage) return;
    let cancelled = false;
    let decoded: Photo | null = null;
    decodePhoto(file)
      .then((p) => {
        decoded = p;
        if (!cancelled) setPhoto(p);
      })
      .catch(() => {
        if (cancelled) return;
        setError(
          isHeic(file)
            ? "هذا المتصفح لا يفتح صور HEIC. صدّرها JPEG، أو اخترها من «الصور» لا من «الملفات»."
            : "تعذّر فتح هذه الصورة. جرّب صورة أخرى.",
        );
      });
    return () => {
      cancelled = true;
      releasePhoto(decoded);
    };
  }, [file, notImage]);

  // Once the photo is on the stage, the keys work at once: focus the frame (arrows, + / −, R, Enter).
  useEffect(() => {
    if (photo) stage.current?.querySelector<HTMLElement>(".reactEasyCrop_CropArea")?.focus({ preventScroll: true });
  }, [photo]);

  const plan = useMemo(
    () =>
      photo && media && frame
        ? cropPlan({ natural: { width: photo.width, height: photo.height }, media, frame, crop, zoom, deg }, OUTPUT_MAX)
        : null,
    [photo, media, frame, crop, zoom, deg],
  );
  const soft = plan !== null && plan.sourceWidth < SOFT_WIDTH;

  const edit = () => setTouched(true);
  // react-easy-crop also reports the view on its own (when the photo loads, on resize): only a real change counts as
  // an edit, so «إلغاء» right after opening closes without asking.
  const moveTo = (c: Point) => {
    const next = media && frame ? clampPosition(c, media, frame, zoom, deg) : c;
    setCrop(next);
    if (!near(next.x, crop.x) || !near(next.y, crop.y)) edit();
  };
  const zoomTo = (z: number) => {
    const next = Math.min(ceiling, Math.max(floor, z));
    setZoom(next);
    if (!near(next, zoom)) edit();
  };
  const turn = (by: 1 | -1) => {
    setQuarter((quarter + by + 4) % 4);
    setZoom(0); // fit again at the new angle
    edit();
  };
  const tiltTo = (t: number) => {
    setTilt(t);
    edit();
  };
  const reset = () => {
    setQuarter(0);
    setTilt(0);
    setAspect(aspects[0].value);
    setCrop(ORIGIN);
    setZoom(0);
    setTouched(false);
  };

  async function finish(make: () => HTMLCanvasElement, edited: boolean, chosen: number) {
    if (busy) return;
    setBusy(true);
    setSaveError(null);
    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = make();
      const result = await toJpeg(canvas, edited, chosen);
      release(canvas);
      canvas = null;
      onNext(result);
    } catch {
      setSaveError(edited ? "تعذّر تجهيز الصورة. جرّب مرة أخرى، أو استخدمها كما هي." : "تعذّر تجهيز الصورة. جرّب صورة أخرى.");
      setBusy(false);
    } finally {
      release(canvas);
    }
  }
  const save = () => {
    if (photo && media && frame) void finish(() => renderCrop(photo, { media, frame, crop, zoom, deg }), true, aspect);
  };
  const asIs = () => {
    // Kept as it is: recorded with the allowed aspect nearest its own (the server crops the centre to it).
    if (photo) {
      const own = photo.width / photo.height;
      const nearest = aspects.reduce((a, b) => (Math.abs(Math.log(b.value / own)) < Math.abs(Math.log(a.value / own)) ? b : a));
      void finish(() => renderWhole(photo), false, nearest.value);
    }
  };

  // «إلغاء»: nothing is uploaded. After a change (or with photos already done) ask first.
  // eslint-disable-next-line react-hooks/immutability -- the dialog's Esc and backdrop call the current step's cancel
  requestClose.current = (reopen) => {
    if (busy) {
      reopen?.();
      return;
    }
    if (touched || hasDone) {
      reopen?.();
      setConfirming(true);
    } else onCancel();
  };
  const close = () => requestClose.current();

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (confirming || busy || !photo) return;
    const target = e.target as HTMLElement;
    const inRange = target instanceof HTMLInputElement && target.type === "range";
    const onControl = target.tagName === "BUTTON" || target.tagName === "INPUT";
    const step = MOVE * (e.shiftKey ? 4 : 1);
    // The arrows move the frame over the photo, so the photo moves the other way.
    const moves: Record<string, Point> = {
      ArrowLeft: { x: step, y: 0 },
      ArrowRight: { x: -step, y: 0 },
      ArrowUp: { x: 0, y: step },
      ArrowDown: { x: 0, y: -step },
    };
    if (moves[e.key] && !inRange) {
      e.preventDefault();
      moveTo({ x: crop.x + moves[e.key].x, y: crop.y + moves[e.key].y });
    } else if ((e.key === "+" || e.key === "=") && !inRange) {
      e.preventDefault();
      zoomTo(zoom * 1.1);
    } else if ((e.key === "-" || e.key === "_") && !inRange) {
      e.preventDefault();
      zoomTo(zoom / 1.1);
    } else if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      turn(e.shiftKey ? -1 : 1);
    } else if (e.key === "Enter" && !onControl) {
      e.preventDefault();
      save();
    }
  }

  const sealWidth = frame ? Math.round(frame.width * SEAL_RATIO) : 32;

  return (
    <div className={styles.shell} onKeyDown={onKeyDown}>
      <header className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          تعديل الصورة
        </h2>
        {position && (
          <span className={styles.count} aria-live="polite">
            {position.at} من {position.of}
          </span>
        )}
        <button type="button" className="ad-sheet__close" onClick={close} aria-label="إلغاء وإغلاق" disabled={busy}>
          <span aria-hidden="true">×</span>
        </button>
      </header>

      {/* LTR: dragging and turning follow the hand, whatever the page's direction. */}
      <div ref={stage} className={styles.stage} dir="ltr" data-theme="night">
        {photo ? (
          <>
            <Cropper
              image={photo.url}
              crop={crop}
              zoom={zoom}
              rotation={deg}
              aspect={aspect}
              cropSize={frame ?? undefined}
              minZoom={floor}
              maxZoom={ceiling}
              restrictPosition={false}
              showGrid={dragging}
              zoomSpeed={0.5}
              keyboardStep={0}
              disableAutomaticStylesInjection
              onCropChange={moveTo}
              onZoomChange={zoomTo}
              onMediaLoaded={(m) => setMedia({ width: m.width, height: m.height })}
              setMediaSize={(m) => setMedia({ width: m.width, height: m.height })}
              onInteractionStart={() => setDragging(true)}
              onInteractionEnd={() => setDragging(false)}
              classes={{ cropAreaClassName: look === "card" ? `${styles.frame} ${styles.frameCard}` : styles.frame }}
              mediaProps={{ alt: "" }}
              cropperProps={{ "aria-label": "إطار القص: اسحب الصورة لتحريكها" }}
            />
            {look === "card" && frame && (
              // The card's dress over the frame: the outer brass ring and the seal in its corner (bottom-left, as on
              // the RTL shop's card; the stage itself is LTR).
              <div className={styles.cardDress} style={{ width: frame.width, height: frame.height }} aria-hidden="true">
                <span className={styles.seal}>
                  <BrandMark kind="seal" width={sealWidth} />
                </span>
              </div>
            )}
          </>
        ) : error ? null : (
          <p className={styles.loading} role="status">
            جارٍ فتح الصورة…
          </p>
        )}
        {busy && (
          <p className={styles.processing} role="status">
            جارٍ تجهيز الصورة…
          </p>
        )}
      </div>

      <div className={styles.controls}>
        {error ? (
          <p className="ad-notice ad-notice--error" role="alert">
            {error}
          </p>
        ) : (
          <>
            {aspects.length > 1 && (
              <div className={styles.aspects} role="radiogroup" aria-label="نسبة الإطار">
                {aspects.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    role="radio"
                    aria-checked={near(aspect, a.value)}
                    className="ad-chip"
                    onClick={() => {
                      setAspect(a.value);
                      setZoom(0);
                      edit();
                    }}
                    disabled={!photo || busy}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            <div className={styles.tools}>
              <button type="button" className={styles.tool} onClick={() => turn(-1)} disabled={!photo || busy} aria-label="تدوير ربع دورة لليسار">
                <RotateLeftIcon />
              </button>
              <button type="button" className={styles.tool} onClick={() => turn(1)} disabled={!photo || busy} aria-label="تدوير ربع دورة لليمين">
                <RotateRightIcon />
              </button>
              <button type="button" className={styles.tool} onClick={reset} disabled={!photo || busy || !touched} aria-label="إرجاع الصورة كما كانت">
                <ResetIcon />
                <span>إرجاع</span>
              </button>
            </div>

            <label className={styles.slider}>
              <span className={styles.sliderName}>التكبير</span>
              <input
                type="range"
                dir="ltr"
                min={floor}
                max={ceiling}
                step={(ceiling - floor) / 200 || 0.01}
                value={zoom}
                onChange={(e) => zoomTo(Number(e.target.value))}
                disabled={!photo || busy}
                aria-valuetext={`${Math.round((zoom / floor) * 100)}٪`}
              />
              <span aria-hidden="true" />
            </label>

            <label className={styles.slider}>
              <span className={styles.sliderName}>الميلان</span>
              <input
                type="range"
                dir="ltr"
                min={-45}
                max={45}
                step={0.5}
                value={tilt}
                onChange={(e) => tiltTo(Number(e.target.value))}
                onDoubleClick={() => tiltTo(0)}
                disabled={!photo || busy}
                aria-valuetext={`${tilt} درجة`}
              />
              <button
                type="button"
                className={styles.tiltValue}
                onClick={() => tiltTo(0)}
                disabled={!photo || busy || tilt === 0}
                aria-label="الميلان إلى الصفر"
                dir="ltr"
              >
                {tilt > 0 ? "+" : ""}
                {tilt}°
              </button>
            </label>

            {saveError && (
              <p className="ad-notice ad-notice--error" role="alert">
                {saveError}
              </p>
            )}
            {soft && (
              <p className="ad-notice" role="status">
                الصورة صغيرة، وقد تظهر مغبّشة. يمكنك المتابعة.
              </p>
            )}
            <p className={styles.note}>الأصل لا يُحفظ: لتعديل صورة محفوظة لاحقاً، ارفعها من جديد.</p>
          </>
        )}
      </div>

      <footer className={styles.foot}>
        <button type="button" className="ad-btn ad-btn--primary" onClick={save} disabled={!photo || busy}>
          {busy ? "جارٍ التجهيز…" : "حفظ"}
        </button>
        {error ? (
          <button type="button" className="ad-btn ad-btn--ghost" onClick={() => onNext(null)} disabled={busy}>
            {position ? "تخطي هذه الصورة" : "إغلاق"}
          </button>
        ) : (
          <button type="button" className="ad-btn ad-btn--ghost" onClick={asIs} disabled={!photo || busy}>
            {position ? "تخطي (كما هي)" : "استخدم الصورة كما هي"}
          </button>
        )}
        <button type="button" className="ad-btn ad-btn--ghost" onClick={close} disabled={busy}>
          إلغاء
        </button>
      </footer>

      {confirming && (
        <div className={styles.confirm} role="alertdialog" aria-labelledby={`${titleId}-confirm`}>
          <p id={`${titleId}-confirm`} className={styles.confirmText}>
            تتجاهل التعديل؟ لن يُرفع شيء.
          </p>
          <div className={styles.confirmActions}>
            <button type="button" className="ad-btn ad-btn--primary" onClick={onCancel} autoFocus>
              تجاهل التعديل
            </button>
            <button type="button" className="ad-btn ad-btn--ghost" onClick={() => setConfirming(false)}>
              متابعة التعديل
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
