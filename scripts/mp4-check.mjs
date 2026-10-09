// MP4 reader (src/lib/mp4.ts): built boxes (v0 / v1, turned matrix, 64-bit size, HEVC, QuickTime, broken files), then
// any real files in salon-media/out/ (local only, never in git) checked against ffprobe. Run: npm run check:mp4
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isH264, readMp4 } from "../src/lib/mp4.ts";
let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label} → ${JSON.stringify(got)}${ok ? "" : ` (want ${JSON.stringify(want)})`}`);
};

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
const box = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(8 + body.length), Buffer.from(type, "latin1"), body]); };
const bigBox = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(1), Buffer.from(type, "latin1"), u64(16 + body.length), body]); };
const zeros = (n) => Buffer.alloc(n);
const fixed = (n) => u32(Math.round(n * 65536));

const ftyp = (brand = "isom") => box("ftyp", Buffer.from(brand, "latin1"), u32(512), Buffer.from("isomavc1", "latin1"));
const mvhd = (v, timescale, duration) =>
  v === 1
    ? box("mvhd", Buffer.from([1, 0, 0, 0]), u64(0), u64(0), u32(timescale), u64(duration), zeros(80))
    : box("mvhd", Buffer.from([0, 0, 0, 0]), u32(0), u32(0), u32(timescale), u32(duration), zeros(80));
// The display matrix: identity, or a 90° turn (a=0, b=1, c=-1, d=0).
const matrix = (turned) =>
  Buffer.concat(turned ? [i32(0), i32(65536), i32(0), i32(-65536), i32(0), i32(0), i32(0), i32(0), i32(1 << 30)] : [i32(65536), i32(0), i32(0), i32(0), i32(65536), i32(0), i32(0), i32(0), i32(1 << 30)]);
const tkhd = (v, w, h, turned = false) =>
  v === 1
    ? box("tkhd", Buffer.from([1, 0, 0, 3]), u64(0), u64(0), u32(1), u32(0), u64(0), zeros(8), zeros(8), matrix(turned), fixed(w), fixed(h))
    : box("tkhd", Buffer.from([0, 0, 0, 3]), u32(0), u32(0), u32(1), u32(0), u32(0), zeros(8), zeros(8), matrix(turned), fixed(w), fixed(h));
const hdlr = (kind) => box("hdlr", zeros(4), zeros(4), Buffer.from(kind, "latin1"), zeros(12), Buffer.from("x\0"));
const stsd = (codec) => box("stsd", zeros(4), u32(1), box(codec, zeros(78)));
const trak = (kind, v, w, h, codec, turned) => box("trak", tkhd(v, w, h, turned), box("mdia", hdlr(kind), box("minf", box("stbl", stsd(codec)))));
const mp4 = ({ brand = "isom", v = 0, timescale = 1000, duration = 8400, w = 720, h = 1280, codec = "avc1", turned = false, audioFirst = false } = {}) => {
  const tracks = [trak("vide", v, w, h, codec, turned)];
  if (audioFirst) tracks.unshift(trak("soun", 0, 0, 0, "mp4a"));
  return new Uint8Array(Buffer.concat([ftyp(brand), box("moov", mvhd(v, timescale, duration), ...tracks), box("mdat", zeros(64))]));
};

eq("H.264 720×1280, 8.4 s", readMp4(mp4()), { brand: "isom", durationMs: 8400, width: 720, height: 1280, codec: "avc1" });
eq("version 1 boxes, 90000 timescale, 15.24 s", readMp4(mp4({ v: 1, timescale: 90000, duration: 1371600 })), { brand: "isom", durationMs: 15240, width: 720, height: 1280, codec: "avc1" });
eq("matrix turned 90°: sides swapped", readMp4(mp4({ w: 1280, h: 720, turned: true })), { brand: "isom", durationMs: 8400, width: 720, height: 1280, codec: "avc1" });
eq("audio track first: the video track is found", readMp4(mp4({ audioFirst: true })).width, 720);
eq("HEVC (hvc1) is read as such", readMp4(mp4({ codec: "hvc1" })).codec, "hvc1");
eq("isH264 avc1 / avc3 / hvc1", [isH264("avc1"), isH264("avc3"), isH264("hvc1"), isH264(null)], [true, true, false, false]);
eq("QuickTime brand is reported", readMp4(mp4({ brand: "qt  " })).brand, "qt  ");
eq("20.001 s", readMp4(mp4({ duration: 20001 })).durationMs, 20001);
{
  const big = new Uint8Array(Buffer.concat([ftyp(), bigBox("moov", mvhd(0, 600, 1800), trak("vide", 0, 576, 1024, "avc1"))]));
  eq("64-bit box size", readMp4(big), { brand: "isom", durationMs: 3000, width: 576, height: 1024, codec: "avc1" });
}
eq("not an MP4 (a JPEG's first bytes)", readMp4(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1])), null);
eq("ftyp but no moov", readMp4(new Uint8Array(Buffer.concat([ftyp(), box("mdat", zeros(10))]))), null);
eq("truncated half way", readMp4(mp4().slice(0, 60)), null);
eq("empty", readMp4(new Uint8Array(0)), null);

// Real files, if any (salon-media/out is local only), against ffprobe.
const dir = "salon-media/out";
if (existsSync(dir)) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".mp4"))) {
    const info = readMp4(new Uint8Array(readFileSync(`${dir}/${f}`)));
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", `${dir}/${f}`]).toString());
    const vs = probe.streams.find((s) => s.codec_type === "video");
    const want = { durationMs: Math.round(Number(probe.format.duration) * 1000), width: vs.width, height: vs.height, codec: vs.codec_tag_string };
    const got = info && { durationMs: info.durationMs, width: info.width, height: info.height, codec: info.codec };
    const close = got && Math.abs(got.durationMs - want.durationMs) <= 40 && got.width === want.width && got.height === want.height && got.codec === want.codec;
    if (!close) fail++;
    console.log(`${close ? "ok  " : "FAIL"} real ${f} → ${JSON.stringify(got)}${close ? "" : ` (ffprobe ${JSON.stringify(want)})`}`);
  }
} else console.log("(no salon-media/out here: real-file checks skipped)");

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
