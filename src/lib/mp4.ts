/*
  Reads what the gallery needs from an MP4's boxes, with no dependency: is it an MP4 (not a QuickTime .mov), how long
  it is, the video track's size (turned when its matrix says so) and codec. Pure TypeScript over a Uint8Array, so the
  same code checks a video in the browser before upload and again on the server after it (never trusting the first).
  Tested by `npm run check:mp4`.

  Boxes: [size u32][type 4cc] then the body; size 1 = a 64-bit size follows, size 0 = to the end of the file.
    ftyp                    major brand ("qt  " is QuickTime)
    moov > mvhd             timescale and duration (version 0: 32-bit, version 1: 64-bit times)
    moov > trak > tkhd      width / height (16.16 fixed point) and the display matrix (a 90° turn swaps them)
    trak > mdia > hdlr      handler "vide" marks the video track
    trak > mdia > minf > stbl > stsd   the first sample entry's type: avc1 / avc3 (H.264), hvc1 / hev1 (HEVC) …
*/

export type Mp4Info = {
  brand: string;
  durationMs: number;
  width: number;
  height: number;
  /** The video track's sample entry, e.g. "avc1" (H.264) or "hvc1" (HEVC). */
  codec: string | null;
};

type Box = { type: string; start: number; body: number; end: number };

const fourcc = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

function* boxes(b: Uint8Array, view: DataView, from: number, to: number): Generator<Box> {
  let at = from;
  while (at + 8 <= to) {
    let size = view.getUint32(at);
    const type = fourcc(b, at + 4);
    let body = at + 8;
    if (size === 1) {
      if (at + 16 > to) return;
      size = Number(view.getBigUint64(at + 8));
      body = at + 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < body - at || at + size > to) return; // truncated or corrupt: stop here
    yield { type, start: at, body, end: at + size };
    at += size;
  }
}

const child = (b: Uint8Array, v: DataView, box: Box, type: string) => {
  for (const c of boxes(b, v, box.body, box.end)) if (c.type === type) return c;
  return null;
};

/** null when it isn't a readable MP4 (no ftyp first, no moov, no mvhd). */
export function readMp4(bytes: Uint8Array): Mp4Info | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const top = [...boxes(bytes, v, 0, bytes.byteLength)];
  if (top[0]?.type !== "ftyp" || top[0].end - top[0].body < 4) return null;
  const brand = fourcc(bytes, top[0].body);
  const moov = top.find((x) => x.type === "moov");
  if (!moov) return null;

  const mvhd = child(bytes, v, moov, "mvhd");
  if (!mvhd) return null;
  const version = bytes[mvhd.body];
  const timescale = version === 1 ? v.getUint32(mvhd.body + 20) : v.getUint32(mvhd.body + 12);
  const duration = version === 1 ? Number(v.getBigUint64(mvhd.body + 24)) : v.getUint32(mvhd.body + 16);
  if (!timescale) return null;

  let width = 0;
  let height = 0;
  let codec: string | null = null;
  for (const trak of boxes(bytes, v, moov.body, moov.end)) {
    if (trak.type !== "trak") continue;
    const mdia = child(bytes, v, trak, "mdia");
    const hdlr = mdia && child(bytes, v, mdia, "hdlr");
    if (!hdlr || fourcc(bytes, hdlr.body + 8) !== "vide") continue;
    const tkhd = child(bytes, v, trak, "tkhd");
    if (tkhd) {
      const tv = bytes[tkhd.body];
      const matrix = tkhd.body + (tv === 1 ? 52 : 40);
      const w = v.getUint32(matrix + 36) / 65536;
      const h = v.getUint32(matrix + 40) / 65536;
      const b = v.getInt32(matrix + 4); // the matrix's b: non-zero for a 90° / 270° turn
      [width, height] = b !== 0 ? [h, w] : [w, h];
    }
    const minf = mdia && child(bytes, v, mdia, "minf");
    const stbl = minf && child(bytes, v, minf, "stbl");
    const stsd = stbl && child(bytes, v, stbl, "stsd");
    if (stsd && stsd.body + 16 <= stsd.end) codec = fourcc(bytes, stsd.body + 12);
    break;
  }

  return { brand, durationMs: Math.round((duration / timescale) * 1000), width: Math.round(width), height: Math.round(height), codec };
}

/** H.264: plays in every browser. HEVC (the iPhone's default) doesn't, everywhere. */
export const isH264 = (codec: string | null) => codec === "avc1" || codec === "avc3";
