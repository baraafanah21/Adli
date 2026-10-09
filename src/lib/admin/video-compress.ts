/*
  Getting a video ready for the gallery in the browser (owner, /admin/gallery only), with Mediabunny over WebCodecs.
  Loaded with a dynamic import from VideoAdder, only when the chosen video isn't ready as it is (not an MP4, not
  H.264, over 20 s or over 5 MB), so mediabunny never reaches another page's bundle. The server doesn't change: what
  comes out passes the same checks (src/lib/mp4.ts) before upload and again after it.

  Output: MP4 (moov first), H.264, the shorter side 720 at most (never enlarged), 30 fps at most, no audio, ≤ 5 MB,
  the rotation baked into the frames (an iPhone films landscape pixels with a "turn 90°" flag; the output is upright
  pixels, so its size and the gallery's aspect are the ones seen). Input: anything the browser can decode, including an
  iPhone .mov in HEVC (Safari, and Chrome where the device decodes HEVC).

  Mediabunny is MPL-2.0: used as published (pinned in package.json), its files never edited.
*/
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
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
  /** A frame at `t` seconds, upright, about `width` px wide (for the trim preview when <video> can't play the file). */
  frameAt: (t: number, width: number) => Promise<HTMLCanvasElement | OffscreenCanvas | null>;
  dispose: () => void;
};

export type ProbeResult =
  | { ok: true; probe: Probe }
  | { ok: false; reason: "unsupported" | "undecodable" | "unreadable" };

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
    const [width, height, duration, decodable] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      input.computeDuration([track]),
      track.canDecode(),
    ]);
    if (!decodable) {
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
};

export type CompressResult =
  | { ok: true; file: File }
  | { ok: false; reason: "canceled" | "too-big" | "failed" | "undecodable" };

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

/**
 * The video ready for upload, or why not. If the encoder overshoots 5 MB (a busy clip), it tries again at a lower
 * bitrate, twice at most (the progress starts again and says so). Metadata (the iPhone's place and time) isn't kept.
 */
export async function compressVideo(file: File, o: CompressOptions): Promise<CompressResult> {
  const seconds = Math.min(o.end, o.start + MAX_SECONDS) - o.start;
  let bitrate = bitrateFor(seconds);
  try {
    for (let pass = 1; pass <= 3; pass++) {
      const out = await encode(file, o, bitrate, pass);
      if (out === "canceled" || out === "undecodable") return { ok: false, reason: out };
      if (out.byteLength <= MAX_BYTES) {
        o.onProgress(1, pass);
        return { ok: true, file: new File([out], "video.mp4", { type: "video/mp4" }) };
      }
      bitrate = Math.floor(bitrate * Math.min(0.85, (MAX_BYTES / out.byteLength) * 0.9));
    }
    return { ok: false, reason: "too-big" };
  } catch (e) {
    console.error("video compress", e);
    return { ok: false, reason: "failed" };
  }
}
