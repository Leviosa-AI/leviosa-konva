#!/usr/bin/env node
// gen-font-css.mjs — SSOT font CSS generator.
//
// Reads the FROZEN font manifest bundled in this package (fonts/font-manifest.json)
// and emits @font-face CSS for a given URL prefix. The font BYTES are identical for
// every consumer (they come from this package); only the serving URL prefix differs
// (leviosa-frontend serves /render-fonts/..., the renderer serves its own path).
//
// This is why both consumers stay pixel-identical: same bytes + same face metadata,
// CSS generated from the one manifest instead of each repo re-fetching from a CDN.
//
// Usage:
//   node gen-font-css.mjs --prefix=/render-fonts/fonts/ --out=/abs/path/render-fonts
//
// Writes <out>/font-css.css (all faces) and <out>/family-css/<slug>.css (per family),
// and copies the woff2 bytes + manifest into <out>/fonts and <out>/font-manifest.json.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE_DIR = path.resolve(HERE, "..", "fonts");
const MANIFEST_PATH = path.join(BUNDLE_DIR, "font-manifest.json");
const BUNDLE_FONTS_DIR = path.join(BUNDLE_DIR, "fonts");

function parseArgs(argv) {
  const args = {};
  for (const token of argv.slice(2)) {
    const match = token.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function slugifyFamily(family) {
  return family
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function faceBlock(face, prefix) {
  const url = `${prefix.replace(/\/$/, "")}/${face.filename}`;
  const lines = [
    "@font-face {",
    `  font-family: '${face.family}';`,
    `  font-style: ${face.style || "normal"};`,
    `  font-weight: ${face.weight};`,
    "  font-display: swap;",
    `  src: url("${url}") format('woff2');`,
  ];
  if (face.unicodeRange) lines.push(`  unicode-range: ${face.unicodeRange};`);
  lines.push("}");
  return lines.join("\n");
}

async function copyDir(src, dest) {
  await fs.rm(dest, { recursive: true, force: true });
  await fs.cp(src, dest, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv);
  const prefix = args.prefix ?? "/render-fonts/fonts/";
  const out = args.out ? path.resolve(args.out) : path.resolve("public/render-fonts");

  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  // woff2-only: the manifest also tracks legacy .woff fallbacks as separate faces,
  // but woff2 is universally supported by every target (Chrome editor + Playwright
  // Chromium). Emitting woff2-only keeps the served metrics identical and avoids
  // mislabeling a .woff file as woff2.
  const faces = (manifest.faces ?? []).filter((f) => f.filename?.endsWith(".woff2"));
  if (faces.length === 0) throw new Error(`No woff2 faces in manifest: ${MANIFEST_PATH}`);

  const header = "/* Generated from @leviosa-ai/konva font manifest. Do not edit by hand. */";

  // 1) copy the canonical woff2 bytes + manifest (no fetching, ever)
  await fs.mkdir(out, { recursive: true });
  await copyDir(BUNDLE_FONTS_DIR, path.join(out, "fonts"));
  await fs.copyFile(MANIFEST_PATH, path.join(out, "font-manifest.json"));

  // 2) combined css (all faces)
  const combined = [header, ...faces.map((f) => faceBlock(f, prefix))].join("\n");
  await fs.writeFile(path.join(out, "font-css.css"), `${combined}\n`);

  // 3) per-family css
  const familyDir = path.join(out, "family-css");
  await fs.rm(familyDir, { recursive: true, force: true });
  await fs.mkdir(familyDir, { recursive: true });
  const byFamily = new Map();
  for (const face of faces) {
    const list = byFamily.get(face.family) ?? [];
    list.push(face);
    byFamily.set(face.family, list);
  }
  for (const [family, list] of byFamily) {
    const content = [header, ...list.map((f) => faceBlock(f, prefix))].join("\n");
    await fs.writeFile(path.join(familyDir, `${slugifyFamily(family)}.css`), `${content}\n`);
  }

  console.log(
    `[konva] font css generated: ${faces.length} faces, prefix=${prefix} -> ${out}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
