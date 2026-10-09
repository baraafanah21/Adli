/*
  Getting a video ready for the gallery in the browser (owner, /admin/gallery only), with Mediabunny over WebCodecs.
  Loaded with a dynamic import from VideoAdder, only when the chosen video isn't ready as it is (not an MP4, not
  H.264, over 20 s or over 5 MB), so mediabunny never reaches another page's bundle. The server doesn't change: what
  comes out passes the same checks (src/lib/mp4.ts) before upload and again after it.

  Output: MP4 (moov first), H.264, the shorter side 720 at most (never enlarged), 30 fps at most, no audio, ≤ 5 MB,
  the rotation baked into the frames (an iPhone films landscape pixels with a "turn 90°" flag; the output is upright
  pixels, so its size and the gallery's aspect are the ones seen). Input: anything the browser can decode, including an
  iPhone .mov in HEVC (Safari, and Chrome where the device decodes HEVC).

  Two ways to the same output:
    - decode: Mediabunny's Conversion (WebCodecs decode → resize → encode). Fast, and not tied to playback.
    - playback: the clip plays (muted) in a <video> the page shows, each frame is drawn on a canvas and encoded
      (CanvasSource). Real time (≤ 20 s). Used on Safari / every iOS browser (WebKit) and for any HDR video: there,
      WebCodecs frames redrawn on a canvas come out black (an iPhone films 10-bit HDR HEVC by default), while a
      <video> is drawn with its rotation applied and tone-mapped to SDR.
  Either way the result is checked for a black picture; a black decode result is made again by playback.

  Mediabunny is MPL-2.0: used as published (pinned in package.json), its files never edited.
*/
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Conversion,
  ConversionCanceledError,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeVideo,
  type InputVideoTrack,
} from "mediabunny";

export const MAX_BYTES = 5 * 1024 * 1024;
/** The server allows 20 000 ms; a cut a few milliseconds over (frame timing) would be refused, so cut at 19.9 s. */
export const MAX_SECONDS = 19.9;
const SHORT_SIDE = 720;
const MAX_FPS = 30;
/** Leave room for the MP4's own boxes under 5 MB. */
const BUDGET_BYTES = 4.6 * 1024 * 1024;
const MAX_BPS = 2_500_000;

export type Probe = {
  /** Seconds. */
  duration: number;
  /** As seen (after the file's rotation). */
  width: number;
  height: number;
  /** 10-bit HDR (an iPhone's default): prepared by playback, never by decode. */
  hdr: boolean;
  /** A frame at `t` seconds, upright, about `width` px wide (for the trim preview when <video> can't play the file). */
  frameAt: (t: number, width: number) => Promise<HTMLCanvasElement | OffscreenCanvas | null>;
  dispose: () => void;
};

export type ProbeResult =
  | { ok: true; probe: Probe }
  | { ok: false; reason: "unsupported" | "undecodable" | "unreadable" };

/** Safari, or any browser on an iPhone / iPad (all WebKit): prepare by playback (see the top of the file). */
export function isWebKit() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iP(hone|ad|od)/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) || // iPadOS asks for the desktop site
    (/Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg\/|Android/.test(ua))
  );
}

/** WebCodecs with an H.264 encoder: recent Chrome, Edge and Safari (and Firefox where it has one). */
export function hasWebCodecs() {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoDecoder" in window;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** The output size: the shorter side 720 at most, the ratio kept, even numbers (H.264). */
export function outputSize(width: number, height: number) {
  const scale = Math.min(1, SHORT_SIDE / Math.min(width, height));
  return { width: even(width * scale), height: even(height * scale) };
}

/** The bitrate that fits `seconds` under the budget, at most 2.5 Mb/s (plenty for 720p). */
export const bitrateFor = (seconds: number) => Math.min(MAX_BPS, Math.floor((BUDGET_BYTES * 8) / Math.max(1, seconds)));

async function videoTrack(input: Input): Promise<InputVideoTrack | null> {
  return input.getPrimaryVideoTrack();
}

/** Opens the file (only the parts it needs are read: a 1-minute 4K video is never loaded whole). */
export async function probeVideo(file: File): Promise<ProbeResult> {
  if (!hasWebCodecs()) return { ok: false, reason: "unsupported" };
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await videoTrack(input);
    if (!track) {
      input.dispose();
      return { ok: false, reason: "unreadable" };
    }
    const [width, height, duration, decodable, hdr] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      input.computeDuration([track]),
      track.canDecode(),
      track.hasHighDynamicRange().catch(() => false),
    ]);
    // Playback needs no WebCodecs decoder (Safari plays HEVC in <video> even where it can't decode it here).
    if (!decodable && !isWebKit()) {
      input.dispose();
      return { ok: false, reason: "undecodable" };
    }
    const size = outputSize(width, height);
    if (!(await canEncodeVideo("avc", { ...size, quality: new Quality({ bitrate: bitrateFor(MAX_SECONDS) }) }))) {
      input.dispose();
      return { ok: false, reason: "unsupported" };
    }
    let sink: CanvasSink | null = null;
    let sinkWidth = 0;
    return {
      ok: true,
      probe: {
        duration,
        width,
        height,
        hdr,
        frameAt: async (t, w) => {
          if (!sink || sinkWidth !== w) {
            sink = new CanvasSink(track, { width: even(w), poolSize: 2 });
            sinkWidth = w;
          }
          return (await sink.getCanvas(Math.max(0, t)))?.canvas ?? null;
        },
        dispose: () => input.dispose(),
      },
    };
  } catch (e) {
    console.error("video probe", e);
    input.dispose();
    return { ok: false, reason: "unreadable" };
  }
}

export type CompressOptions = {
  /** Seconds in the input; the cut is at most MAX_SECONDS long. */
  start: number;
  end: number;
  /** 0…1 for the current pass; `pass` is 2 or 3 when a smaller file is being made after an overshoot. */
  onProgress: (fraction: number, pass: number) => void;
  signal: AbortSignal;
  /** A <video> of the picked file (shown by VideoAdder): used to prepare by playback, and as the fallback. */
  playback: HTMLVideoElement | null;
  /** Prepare by playback from the start (WebKit, or an HDR video). */
  preferPlayback: boolean;
};

export type CompressResult =
  | { ok: true; file: File }
  | { ok: false; reason: "canceled" | "too-big" | "failed" | "undecodable" | "black" };

/** One pass at a bitrate. */
async function encode(file: File, o: CompressOptions, bitrate: number, pass: number): Promise<ArrayBuffer | "canceled" | "undecodable"> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  try {
    const track = await videoTrack(input);
    if (!track) return "undecodable";
    const [width, height, stats] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      track.computePacketStats(120),
    ]);
    const size = outputSize(width, height);
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      video: {
        ...size,
        fit: "fill", // the ratio is already kept by outputSize; this only absorbs the rounding to even pixels
        codec: "avc",
        quality: new Quality({ bitrate }), // an object: a bare number would be a quality level, not bits per second
        frameRate: stats.averagePacketRate > MAX_FPS + 0.5 ? MAX_FPS : undefined,
        keyFrameInterval: 2,
        allowTransformationMetadata: false,
        forceTranscode: true,
      },
      audio: { discard: true },
      trim: { start: o.start, end: Math.min(o.end, o.start + MAX_SECONDS) },
      tags: {},
      showWarnings: false,
    });
    if (!conversion.isValid) {
      console.error("video compress: discarded", conversion.discardedTracks.map((d) => `${d.track.type}: ${d.reason}`).join(", "));
      return "undecodable";
    }
    conversion.onProgress = (p) => o.onProgress(p, pass);
    const abort = () => void conversion.cancel();
    o.signal.addEventListener("abort", abort);
    try {
      if (o.signal.aborted) return "canceled";
      await conversion.execute();
    } finally {
      o.signal.removeEventListener("abort", abort);
    }
    return (output.target as BufferTarget).buffer ?? "undecodable";
  } catch (e) {
    if (e instanceof ConversionCanceledError || o.signal.aborted) return "canceled";
    throw e;
  } finally {
    input.dispose();
  }
}

const once = (el: EventTarget, type: string) => new Promise<void>((resolve) => el.addEventListener(type, () => resolve(), { once: true }));

/**
 * One pass by playback: the cut plays muted at normal speed; on each new frame (requestVideoFrameCallback, at most
 * 30 a second) the <video> is drawn on a 720 canvas and that frame is captured at once (CanvasSource.add snapshots the
 * canvas synchronously). While the encoder is still busy with the last frame, a new one is skipped rather than queued
 * (backpressure: memory stays flat on a phone). Timestamps are the frames' own media time, so a skipped frame only
 * holds the previous one a little longer.
 */
async function encodeByPlayback(video: HTMLVideoElement, o: CompressOptions, bitrate: number, pass: number): Promise<ArrayBuffer | "canceled" | "undecodable"> {
  if (!("requestVideoFrameCallback" in video)) return "undecodable";
  if (video.readyState < 1) await Promise.race([once(video, "loadedmetadata"), new Promise((r) => setTimeout(r, 8000))]);
  if (!video.videoWidth) return "undecodable";
  const size = outputSize(video.videoWidth, video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return "undecodable";
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: "avc", quality: new Quality({ bitrate }), keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: MAX_FPS });
  await output.start();

  const end = Math.min(o.end, o.start + MAX_SECONDS);
  const length = end - o.start;
  video.loop = false;
  video.muted = true;
  video.playbackRate = 1;
  video.pause();
  video.currentTime = o.start;
  await Promise.race([once(video, "seeked"), new Promise((r) => setTimeout(r, 3000))]);

  let busy: Promise<void> | null = null;
  let failed: unknown = null;
  let last = -Infinity;
  let frames = 0;
  const outcome = await new Promise<"done" | "canceled">((resolve) => {
    let settled = false;
    // A locked phone or another app pauses the <video> and its frame callbacks: play on when the page is back (the
    // timestamps are media time, so the output doesn't jump).
    const resume = () => {
      if (!settled && document.visibilityState === "visible" && video.paused) video.play().catch(() => {});
    };
    const finish = (how: "done" | "canceled") => {
      if (settled) return;
      settled = true;
      document.removeEventListener("visibilitychange", resume);
      video.pause();
      resolve(how);
    };
    if (o.signal.aborted) return finish("canceled");
    document.addEventListener("visibilitychange", resume);
    o.signal.addEventListener("abort", () => finish("canceled"), { once: true });
    video.addEventListener("ended", () => finish("done"), { once: true });
    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (settled) return;
      const t = meta.mediaTime - o.start;
      if (t >= length - 0.001 || failed) return finish("done");
      if (t >= 0 && t - last >= 1 / MAX_FPS - 0.004 && !busy) {
        last = t;
        ctx.drawImage(video, 0, 0, size.width, size.height);
        frames++;
        busy = source
          .add(t, 1 / MAX_FPS)
          .catch((e) => void (failed = e))
          .finally(() => (busy = null));
        o.onProgress(Math.min(0.99, t / length), pass);
      }
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
    video.play().catch(() => finish("canceled"));
  });

  if (outcome === "canceled") {
    await output.cancel();
    return "canceled";
  }
  await busy;
  if (failed || frames === 0) {
    await output.cancel();
    if (failed) throw failed;
    return "undecodable";
  }
  await output.finalize();
  return (output.target as BufferTarget).buffer ?? "undecodable";
}

/**
 * Is the picture (nearly) black? A frame a third of the way in, drawn small; mean brightness under 4 of 255. Catches
 * a browser whose decoded frames don't survive the redraw (see the top of the file).
 */
async function looksBlack(file: File): Promise<boolean> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await Promise.race([once(video, "loadeddata"), new Promise((r) => setTimeout(r, 5000))]);
    if (!video.videoWidth) return false; // can't tell: let the server's checks decide
    video.currentTime = Math.min(video.duration / 3, 3);
    await Promise.race([once(video, "seeked"), new Promise((r) => setTimeout(r, 3000))]);
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(video, 0, 0, 32, 32);
    const px = ctx.getImageData(0, 0, 32, 32).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += px[i] * 0.2126 + px[i + 1] * 0.7152 + px[i + 2] * 0.0722;
    return sum / (px.length / 4) < 4;
  } catch {
    return false;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * The video ready for upload, or why not. If the encoder overshoots 5 MB (a busy clip), it tries again at a lower
 * bitrate, twice at most (the progress starts again and says so). Metadata (the iPhone's place and time) isn't kept.
 */
export async function compressVideo(file: File, o: CompressOptions): Promise<CompressResult> {
  const seconds = Math.min(o.end, o.start + MAX_SECONDS) - o.start;
  let bitrate = bitrateFor(seconds);
  let byPlayback = o.preferPlayback && o.playback !== null;
  try {
    for (let pass = 1; pass <= 3; pass++) {
      const out = byPlayback ? await encodeByPlayback(o.playback!, o, bitrate, pass) : await encode(file, o, bitrate, pass);
      if (out === "canceled" || out === "undecodable") return { ok: false, reason: out };
      if (out.byteLength <= MAX_BYTES) {
        const ready = new File([out], "video.mp4", { type: "video/mp4" });
        if (await looksBlack(ready)) {
          // A black picture from decode: once more by playback, when there is a <video> to play it in.
          if (!byPlayback && o.playback) {
            console.warn("video compress: black output by decode, trying playback");
            byPlayback = true;
            pass--;
            continue;
          }
          return { ok: false, reason: "black" };
        }
        o.onProgress(1, pass);
        return { ok: true, file: ready };
      }
      bitrate = Math.floor(bitrate * Math.min(0.85, (MAX_BYTES / out.byteLength) * 0.9));
    }
    return { ok: false, reason: "too-big" };
  } catch (e) {
    console.error("video compress", e);
    return { ok: false, reason: "failed" };
  }
}
