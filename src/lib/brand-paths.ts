import { readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";

/*
  The full logo's outline, read on the server from public/brand/adli-logo-mono.svg (the one source, never copied
  into code), for DrawnLogo: the hero draws the file's own paths with CSS. Read once and kept (cacheLife "max"); the
  file is traced into the deployment by next.config.ts (outputFileTracingIncludes). A read error is thrown inside the
  cached function and turned into null by the getter, so a failure is never cached (DrawnLogo then shows BrandMark).
*/

export type LogoPaths = { viewBox: string; width: number; height: number; paths: string[] };

const FILE = path.join(process.cwd(), "public/brand/adli-logo-mono.svg");

async function readLogoPaths(): Promise<LogoPaths> {
  "use cache";
  cacheLife("max");
  const text = await readFile(FILE, "utf8");
  const viewBox = text.match(/viewBox="([^"]+)"/)?.[1];
  const paths = [...text.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  const [, , width, height] = (viewBox ?? "").split(/\s+/).map(Number);
  if (!viewBox || !width || !height || paths.length === 0) throw new Error("adli-logo-mono.svg: no viewBox or paths");
  return { viewBox, width, height, paths };
}

export async function getLogoPaths(): Promise<LogoPaths | null> {
  try {
    return await readLogoPaths();
  } catch (e) {
    console.error("brand: logo paths", e);
    return null;
  }
}
