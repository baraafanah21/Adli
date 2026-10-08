#!/usr/bin/env node
/*
  Salon media → web files for «من الكرسي» (U5.3). Local only: reads salon-media/, writes salon-media/out/
  (both ignored by git). Usage and the manifest format: scripts/media/README.md.

    node scripts/media/compress.mjs [--only <id>] [--audio] [--dry-run]

  Video (H.264, ffmpeg):
    - cut to manifest start / duration (≤ 20 s), rotation applied (ffmpeg autorotate), shorter side
      min(720, source) (never upscaled), at most 30 fps, CRF 26, -movflags +faststart, no metadata,
      no audio unless --audio.
    - over 5 MB: again at CRF +2 up to 34, then fail with a clear message.
    - poster from the manifest moment: <id>.poster.webp (1080 wide) and <id>.poster.sm.webp (480 wide).
  Image: the product photo pipeline (sharp: .rotate(), no metadata), <id>.webp (1600 wide, q82) and
    <id>.sm.webp (480 wide, q78). Never upscaled.
  Writes salon-media/out/report.json: kind, width, height, duration_ms, bytes per item (what gallery_items needs).
*/
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, rmSync } from "node:fs";
import { extname, join, resolve, relative, isAbsolute } from "node:path";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "../..");
const MEDIA = join(ROOT, "salon-media");
const OUT = join(MEDIA, "out");
const MANIFEST = join(MEDIA, "manifest.json");

const MAX_SECONDS = 20;
const MAX_BYTES = 5 * 1024 * 1024;
const CRF_START = 26;
const CRF_STEP = 2;
const CRF_MAX = 34;
const SHORT_SIDE = 720;
const MAX_FPS = 30;
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const keepAudio = flag("--audio");
const dryRun = flag("--dry-run");

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function run(cmd, cmdArgs, { binary = false } = {}) {
  const r = spawnSync(cmd, cmdArgs, { encoding: binary ? "buffer" : "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.error) fail(`${cmd} لم يعمل: ${r.error.message} (ثبّته: sudo apt install ffmpeg)`);
  if (r.status !== 0) fail(`${cmd} فشل:\n${String(r.stderr).trim().split("\n").slice(-6).join("\n")}`);
  return r.stdout;
}

function probe(file) {
  const json = JSON.parse(
    run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]),
  );
  const video = json.streams.find((s) => s.codec_type === "video");
  if (!video) fail(`${relative(ROOT, file)}: لا يوجد مسار فيديو`);
  const rotation = Math.abs(
    Number(video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0),
  );
  const turned = rotation % 180 === 90;
  const [num, den] = (video.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    duration: Number(json.format.duration),
    width: turned ? video.height : video.width,
    height: turned ? video.width : video.height,
    fps: den ? num / den : 0,
    hasAudio: json.streams.some((s) => s.codec_type === "audio"),
  };
}

function readManifest() {
  if (!existsSync(MANIFEST)) fail(`لا يوجد ${relative(ROOT, MANIFEST)}. انسخ scripts/media/manifest.example.json وعدّله.`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch (e) {
    fail(`manifest.json ليس JSON صالحاً: ${e.message}`);
  }
  if (!Array.isArray(manifest.items)) fail("manifest.json: لازم يكون فيه items (مصفوفة)");
  const ids = new Set();
  for (const [i, item] of manifest.items.entries()) {
    const where = `items[${i}]`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.id ?? "")) fail(`${where}.id لازم يكون أحرف لاتينية صغيرة وأرقام وشرطات`);
    if (ids.has(item.id)) fail(`${where}.id مكرر: ${item.id}`);
    ids.add(item.id);
    if (typeof item.file !== "string" || isAbsolute(item.file)) fail(`${where}.file لازم يكون مساراً داخل salon-media/`);
    const path = resolve(MEDIA, item.file);
    const rel = relative(MEDIA, path);
    if (rel.startsWith("..") || rel.startsWith("out")) fail(`${where}.file خارج salon-media/ أو داخل out/`);
    if (!existsSync(path)) fail(`${where}.file غير موجود: ${item.file}`);
    item.path = path;
    const ext = extname(path).toLowerCase();
    if (ext === ".heic" || ext === ".heif")
      fail(`${where}: sharp هنا ما بيقرأ HEIC. صدّر الصورة JPEG (الآيفون: مشاركة ← حفظ كـ JPEG، أو الكاميرا «الأكثر توافقاً»).`);
    item.kind = VIDEO_EXT.has(ext) ? "video" : IMAGE_EXT.has(ext) ? "image" : fail(`${where}: نوع غير مدعوم ${ext}`);
  }
  return manifest.items;
}

function clipOf(item, info) {
  const start = Number(item.start ?? 0);
  const duration = Number(item.duration ?? info.duration - start);
  if (!(start >= 0) || start >= info.duration) fail(`${item.id}: start (${start}) خارج الفيديو (${info.duration.toFixed(2)} ث)`);
  if (!(duration > 0)) fail(`${item.id}: duration لازم تكون أكبر من صفر`);
  const end = Math.min(start + duration, info.duration);
  if (end - start > MAX_SECONDS + 0.01)
    fail(`${item.id}: المقطع ${(end - start).toFixed(1)} ث، والحد ${MAX_SECONDS} ث. حدد start و duration بالـ manifest.`);
  const poster = Number(item.poster ?? start + Math.min(1, (end - start) / 2));
  if (!(poster >= start && poster < end)) fail(`${item.id}: poster (${poster}) لازم يكون داخل المقطع ${start}–${end.toFixed(2)}`);
  return { start, duration: end - start, poster };
}

function scaleFilter(info) {
  // Shorter side to min(720, source); the other side keeps the ratio, rounded to even.
  const portrait = info.width <= info.height;
  const short = Math.min(SHORT_SIDE, portrait ? info.width : info.height);
  const scale = portrait ? `scale=${short - (short % 2)}:-2` : `scale=-2:${short - (short % 2)}`;
  const fps = info.fps > MAX_FPS + 0.5 ? `,fps=${MAX_FPS}` : "";
  return `${scale}:flags=lanczos${fps}`;
}

function encodeVideo(item, info, clip, file) {
  for (let crf = CRF_START; crf <= CRF_MAX; crf += CRF_STEP) {
    run("ffmpeg", [
      "-v", "error", "-y",
      "-ss", String(clip.start), "-t", String(clip.duration), "-i", item.path,
      "-map", "0:v:0", ...(keepAudio && info.hasAudio ? ["-map", "0:a:0", "-c:a", "aac", "-b:a", "96k"] : ["-an"]),
      "-vf", scaleFilter(info),
      "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-pix_fmt", "yuv420p", "-profile:v", "high",
      "-map_metadata", "-1", "-movflags", "+faststart",
      file,
    ]);
    const bytes = statSync(file).size;
    if (bytes <= MAX_BYTES) return { crf, bytes };
    console.log(`  CRF ${crf}: ${mb(bytes)} > 5 MB، أعيد الضغط`);
  }
  rmSync(file, { force: true });
  fail(`${item.id}: أكبر من 5 MB حتى بـ CRF ${CRF_MAX}. قصّر المقطع (duration) بالـ manifest.`);
}

function posterOf(item, clip) {
  // One full-size frame at the poster moment (rotation applied), then the image pipeline.
  return run(
    "ffmpeg",
    ["-v", "error", "-ss", String(clip.poster), "-i", item.path, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
    { binary: true },
  );
}

async function writeImages(input, outBase, sizes) {
  const base = sharp(input, { limitInputPixels: 64_000_000 }).rotate();
  const results = [];
  for (const { suffix, width, quality } of sizes) {
    const file = `${outBase}${suffix}.webp`;
    const info = await base.clone().resize({ width, withoutEnlargement: true }).webp({ quality }).toFile(file);
    results.push({ file: relative(ROOT, file), width: info.width, height: info.height, bytes: info.size });
  }
  return results;
}

const mb = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`;

async function main() {
  const items = readManifest().filter((item) => !only || item.id === only);
  if (only && items.length === 0) fail(`لا يوجد عنصر بالـ id: ${only}`);
  if (!dryRun) mkdirSync(OUT, { recursive: true });
  const report = [];

  for (const item of items) {
    console.log(`\n• ${item.id} (${item.kind}) ← ${item.file}`);
    if (item.kind === "image") {
      if (dryRun) continue;
      const files = await writeImages(readFileSync(item.path), join(OUT, item.id), [
        { suffix: "", width: 1600, quality: 82 },
        { suffix: ".sm", width: 480, quality: 78 },
      ]);
      for (const f of files) console.log(`  ${f.file}  ${f.width}×${f.height}  ${mb(f.bytes)}`);
      report.push({ id: item.id, kind: "image", width: files[0].width, height: files[0].height, bytes: files[0].bytes, files });
      continue;
    }

    const info = probe(item.path);
    const clip = clipOf(item, info);
    console.log(
      `  المصدر ${info.width}×${info.height} ${info.fps.toFixed(0)}fps ${info.duration.toFixed(2)} ث` +
        ` → مقطع ${clip.start}–${(clip.start + clip.duration).toFixed(2)} ث، poster عند ${clip.poster} ث`,
    );
    if (dryRun) continue;

    const file = join(OUT, `${item.id}.mp4`);
    const { crf, bytes } = encodeVideo(item, info, clip, file);
    const out = probe(file);
    console.log(`  ${relative(ROOT, file)}  ${out.width}×${out.height}  ${out.duration.toFixed(2)} ث  CRF ${crf}  ${mb(bytes)}`);
    const posters = await writeImages(posterOf(item, clip), join(OUT, `${item.id}.poster`), [
      { suffix: "", width: 1080, quality: 82 },
      { suffix: ".sm", width: 480, quality: 78 },
    ]);
    for (const f of posters) console.log(`  ${f.file}  ${f.width}×${f.height}  ${mb(f.bytes)}`);
    report.push({
      id: item.id,
      kind: "video",
      width: out.width,
      height: out.height,
      duration_ms: Math.round(out.duration * 1000),
      bytes,
      crf,
      files: [{ file: relative(ROOT, file), bytes }, ...posters],
    });
  }

  if (!dryRun) {
    writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(`\n✓ ${report.length} عنصر → ${relative(ROOT, OUT)}/ (report.json)`);
  } else {
    console.log("\n✓ dry run: الـ manifest سليم");
  }
}

await main();
