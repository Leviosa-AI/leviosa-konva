#!/usr/bin/env node
// check-font-urls.mjs — liveness check for the frozen font URLs.
//
// --mode=cdn makes every consumer fetch woff2 straight from the address recorded in
// fonts/font-manifest.json. Those addresses are version-pinned, but pinned is not the
// same as permanent: a jsdelivr `gh/<user>/<repo>@<tag>` path dies if the upstream repo
// or tag is deleted, and that failure would only surface as a render error in prod.
// This walks every unique sourceUrl and checks it still serves the exact byte count the
// manifest froze, so a disappearing font is caught by CI instead of by a customer.
//
// Byte count, not sha256, on purpose: a full download of all files is ~81MB, while a
// HEAD is a few hundred bytes. Content-Length disagreeing with the manifest already
// means the bytes moved. Use --full to actually download and hash instead.
//
// Usage:
//   node scripts/check-font-urls.mjs
//   node scripts/check-font-urls.mjs --limit=50 --concurrency=16
//   node scripts/check-font-urls.mjs --full

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(HERE, "..", "fonts", "font-manifest.json");

function parseArgs(argv) {
  const args = {};
  for (const token of argv.slice(2)) {
    const match = token.match(/^--([^=]+)(?:=(.*))?$/);
    if (match) args[match[1]] = match[2] ?? "true";
  }
  return args;
}

async function checkHead(file) {
  const response = await fetch(file.sourceUrl, { method: "HEAD", redirect: "follow" });
  if (!response.ok) return `HTTP ${response.status}`;
  const length = Number(response.headers.get("content-length"));
  // A CDN that omits Content-Length (or answers a HEAD without one) is not a failure —
  // it just means this cheap check cannot prove the size. --full can.
  if (!Number.isFinite(length) || length === 0) return null;
  if (length !== file.bytes) return `size ${length} != manifest ${file.bytes}`;
  return null;
}

async function checkFull(file) {
  const response = await fetch(file.sourceUrl, { redirect: "follow" });
  if (!response.ok) return `HTTP ${response.status}`;
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length !== file.bytes) return `size ${body.length} != manifest ${file.bytes}`;
  const sha256 = crypto.createHash("sha256").update(body).digest("hex");
  if (sha256 !== file.sha256) return `sha256 ${sha256.slice(0, 12)}… != manifest ${file.sha256.slice(0, 12)}…`;
  return null;
}

/** Fixed-size worker pool — 5500 concurrent fetches would just get us rate-limited. */
async function pooled(items, size, worker) {
  const results = [];
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  const concurrency = Number(args.concurrency ?? 16);
  const full = args.full === "true";

  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  // One entry per URL: the manifest lists a file per (family, slice), and Pretendard's
  // woff/woff2 pair can share nothing, but duplicates would still double the requests.
  const byUrl = new Map();
  for (const file of manifest.files ?? []) {
    if (file.sourceUrl && !byUrl.has(file.sourceUrl)) byUrl.set(file.sourceUrl, file);
  }
  let files = [...byUrl.values()];
  const missing = (manifest.files ?? []).filter((file) => !file.sourceUrl);
  if (args.limit) files = files.slice(0, Number(args.limit));

  const check = full ? checkFull : checkHead;
  let done = 0;
  const failures = [];
  await pooled(files, concurrency, async (file) => {
    let reason;
    try {
      reason = await check(file);
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    if (reason) failures.push({ file, reason });
    done += 1;
    if (done % 500 === 0) console.log(`[konva] checked ${done}/${files.length}`);
  });

  for (const file of missing) failures.push({ file, reason: "no sourceUrl in manifest" });

  if (failures.length > 0) {
    console.error(`[konva] ${failures.length} font URL(s) failed:`);
    for (const { file, reason } of failures.slice(0, 40)) {
      console.error(`- ${file.filename}: ${reason}\n  ${file.sourceUrl ?? "(none)"}`);
    }
    if (failures.length > 40) console.error(`- …and ${failures.length - 40} more`);
    process.exit(1);
  }

  console.log(
    `[konva] ${files.length} font URL(s) live, ${full ? "sha256" : "size"} matches the manifest`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
