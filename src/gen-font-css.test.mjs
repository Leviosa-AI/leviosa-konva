// The generator is a .mjs CLI, so this test is too — tsconfig has allowJs off and
// typechecking the script would mean hand-writing a .d.mts for a build tool.
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import catalog from "../fonts/catalog.json" with { type: "json" };
import {
  assertPinnedUrl,
  buildSheets,
  faceBlock,
  invokedAsScript,
  readManifest,
  sourceUrlIndex,
  woff2Faces,
} from "../scripts/gen-font-css.mjs";

const manifest = await readManifest();
const faces = woff2Faces(manifest);
const sourceUrls = sourceUrlIndex(manifest);

const local = { mode: "local", prefix: "/render-fonts/fonts/", sourceUrls };
const cdn = { mode: "cdn", prefix: null, sourceUrls };

const srcUrls = (css) => Array.from(css.matchAll(/url\("([^"]+)"\)/g), (m) => m[1]);
const withoutSrc = (css) => css.replace(/^ {2}src: .*$/gm, "  src: <URL>");

describe("cdn mode vs local mode", () => {
  // The whole safety argument for --mode=cdn is that it changes the address of the
  // bytes and nothing else. If a face's family/weight/style/unicode-range could drift
  // between modes, the editor and the renderer would measure differently again.
  it("emits byte-identical CSS apart from the src URL", () => {
    const localCss = buildSheets(faces, local).combined;
    const cdnCss = buildSheets(faces, cdn).combined;
    expect(withoutSrc(cdnCss)).toBe(withoutSrc(localCss));
    expect(srcUrls(cdnCss)).toHaveLength(srcUrls(localCss).length);
    expect(srcUrls(cdnCss)).not.toEqual(srcUrls(localCss));
  });

  it("writes the same set of per-family sheets", () => {
    const localSheets = buildSheets(faces, local);
    const cdnSheets = buildSheets(faces, cdn);
    expect([...cdnSheets.familySheets.keys()]).toEqual([...localSheets.familySheets.keys()]);
    expect(cdnSheets.families).toBe(localSheets.families);
  });

  it("resolves every face to a pinned https URL", () => {
    const missing = faces.filter((face) => !sourceUrls.has(face.filename));
    expect(missing).toEqual([]);
    for (const url of srcUrls(buildSheets(faces, cdn).combined)) {
      expect(url).toMatch(/^https:\/\//);
      // gstatic pins with /vNN/, jsdelivr with @tag — an unversioned URL would let
      // upstream swap bytes under a fixed address.
      expect(/\/v\d+\//.test(url) || /@[\w.\-]+\//.test(url)).toBe(true);
    }
  });
});

describe("cdn mode refuses to emit something unsafe", () => {
  it("fails on a face with no frozen source URL", () => {
    expect(() =>
      faceBlock({ family: "X", weight: "400", filename: "nope.woff2" }, cdn),
    ).toThrow(/No sourceUrl/);
  });

  it("fails on an unpinned or non-https URL", () => {
    expect(() =>
      assertPinnedUrl("https://cdn.jsdelivr.net/gh/foo/bar/font.woff2", "a.woff2"),
    ).toThrow(/not version-pinned/);
    expect(() => assertPinnedUrl("http://fonts.gstatic.com/s/x/v1/y.woff2", "a.woff2")).toThrow(
      /must be https/,
    );
  });
});

describe("CLI entry detection", () => {
  const scriptUrl = new URL("../scripts/gen-font-css.mjs", import.meta.url);
  const scriptPath = fileURLToPath(scriptUrl);

  // npm installs a `bin` as a symlink under node_modules/.bin, so argv[1] is the link and
  // import.meta.url is its target. Comparing the two directly made the generator a silent
  // no-op — the build "succeeded" and simply produced no CSS.
  it("recognises the script when invoked through a node_modules/.bin symlink", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "konva-bin-"));
    const link = path.join(dir, "leviosa-konva-fonts");
    symlinkSync(scriptPath, link);
    expect(invokedAsScript(link, scriptUrl.href)).toBe(true);
  });

  it("recognises a direct invocation and rejects an import", () => {
    expect(invokedAsScript(scriptPath, scriptUrl.href)).toBe(true);
    expect(invokedAsScript(undefined, scriptUrl.href)).toBe(false);
    expect(
      invokedAsScript(fileURLToPath(new URL("../scripts/check-font-urls.mjs", import.meta.url)), scriptUrl.href),
    ).toBe(false);
  });

  it("falls back to the raw path when it cannot be resolved", () => {
    const ghost = path.join(tmpdir(), "does-not-exist-konva.mjs");
    expect(invokedAsScript(ghost, pathToFileURL(ghost).href)).toBe(true);
  });
});

describe("generated CSS covers the catalog", () => {
  // A consumer that hardcodes its own expected-family list drifts the moment the
  // catalog grows. The generated sheet is the thing to check against, not a copy.
  it("emits at least one face for every catalog family", () => {
    const emitted = new Set(faces.map((face) => face.family));
    const missing = catalog.fonts.filter((font) => !emitted.has(font.family));
    expect(missing.map((font) => font.family)).toEqual([]);
  });
});
