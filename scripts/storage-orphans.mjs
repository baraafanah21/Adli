#!/usr/bin/env node
/*
  Files in Storage that nothing points to: in `gallery` no gallery_items row, in `products` no product's photo.
  Lists them (dry run, the default) or removes them (--delete), checking what Storage says it removed.

    npm run storage:orphans                 dry run: what would go
    npm run storage:orphans -- --delete     remove them
    npm run storage:orphans -- --bucket gallery    (or products; both by default)

  No service-role key exists in this project, so it signs in as the owner: STORAGE_SCRIPT_EMAIL and
  STORAGE_SCRIPT_PASSWORD from the environment or .env.local (local only; never committed, never printed). It needs
  20261010000000_storage_select_policies.sql applied: without a SELECT policy Storage lists nothing.
  Files younger than an hour are left alone (an upload may be in progress: a video goes to Storage before its row).
*/
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const doDelete = args.includes("--delete");
const onlyBucket = args.includes("--bucket") ? args[args.indexOf("--bucket") + 1] : null;
const MIN_AGE_MS = 60 * 60 * 1000;

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

// .env.local, without printing anything from it.
const env = { ...process.env };
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const at = line.indexOf("=");
    if (at > 0 && !line.startsWith("#") && env[line.slice(0, at).trim()] === undefined) env[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
}
const need = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "STORAGE_SCRIPT_EMAIL", "STORAGE_SCRIPT_PASSWORD"];
const missing = need.filter((k) => !env[k]);
if (missing.length) fail(`ناقص بالبيئة أو .env.local: ${missing.join("، ")}`);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error: signInError } = await supabase.auth.signInWithPassword({ email: env.STORAGE_SCRIPT_EMAIL, password: env.STORAGE_SCRIPT_PASSWORD });
if (signInError) fail(`تعذّر تسجيل الدخول: ${signInError.message}`);

/** Every object in a bucket: the root, then each folder (one level, as both buckets are laid out). */
async function listAll(bucket) {
  const page = async (prefix) => {
    const out = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (error) fail(`${bucket}: ${error.message}`);
      out.push(...data);
      if (data.length < 1000) return out;
    }
  };
  const files = [];
  for (const entry of await page("")) {
    if (entry.id === null) {
      for (const f of await page(entry.name)) if (f.id !== null) files.push({ path: `${entry.name}/${f.name}`, created: f.created_at, size: f.metadata?.size ?? 0 });
    } else files.push({ path: entry.name, created: entry.created_at, size: entry.metadata?.size ?? 0 });
  }
  return files;
}

/** What the database points to. */
async function referenced(bucket) {
  if (bucket === "gallery") {
    const { data, error } = await supabase.rpc("admin_gallery_items");
    if (error) fail(`admin_gallery_items: ${error.message} (الحساب لازم يكون owner)`);
    return new Set(data.flatMap((r) => [r.storage_path, r.poster_path, r.sm_path]).filter(Boolean));
  }
  const { data, error } = await supabase.from("products").select("image_path");
  if (error) fail(`products: ${error.message}`);
  const refs = new Set();
  for (const { image_path: p } of data) {
    if (!p || p.startsWith("/")) continue; // the demo pictures in public/
    refs.add(p);
    if (p.endsWith(".webp")) refs.add(p.replace(/\.webp$/, ".sm.webp"));
  }
  return refs;
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
let totalOrphans = 0;
let totalLeft = 0;

for (const bucket of ["gallery", "products"].filter((b) => !onlyBucket || b === onlyBucket)) {
  const [files, refs] = await Promise.all([listAll(bucket), referenced(bucket)]);
  if (files.length === 0 && refs.size > 0) {
    console.warn(`! ${bucket}: Storage listed nothing but the database points to ${refs.size} files: is the SELECT policy applied?`);
  }
  const now = Date.now();
  const orphans = files.filter((f) => !refs.has(f.path));
  const recent = orphans.filter((f) => f.created && now - Date.parse(f.created) < MIN_AGE_MS);
  const old = orphans.filter((f) => !recent.includes(f));
  const missingFiles = [...refs].filter((p) => !files.some((f) => f.path === p));
  console.log(`\n${bucket}: ${files.length} files, ${refs.size} referenced, ${old.length} orphans${recent.length ? ` (+${recent.length} younger than an hour, left alone)` : ""}`);
  for (const f of old) console.log(`  ${f.path}  ${kb(f.size)}  ${f.created ?? ""}`);
  if (missingFiles.length) {
    console.log(`  referenced but not in Storage (${missingFiles.length}):`);
    for (const p of missingFiles) console.log(`    ${p}`);
  }
  totalOrphans += old.length;

  if (doDelete && old.length) {
    for (let i = 0; i < old.length; i += 100) {
      const batch = old.slice(i, i + 100).map((f) => f.path);
      const { data, error } = await supabase.storage.from(bucket).remove(batch);
      const gone = new Set((data ?? []).map((o) => o.name));
      const kept = batch.filter((p) => !gone.has(p));
      if (error || kept.length) {
        console.error(`  ✗ ${bucket}: ${kept.length} not removed${error ? `: ${error.message}` : ""}`);
        for (const p of kept) console.error(`    ${p}`);
        totalLeft += kept.length;
      }
    }
    console.log(`  removed ${old.length - totalLeft} of ${old.length}`);
  }
}

await supabase.auth.signOut();
if (!doDelete) console.log(`\n${totalOrphans} orphan files. Dry run: nothing removed (--delete to remove them).`);
else if (totalLeft) fail(`${totalLeft} files could not be removed.`);
else console.log(`\n✓ ${totalOrphans} orphan files removed.`);
