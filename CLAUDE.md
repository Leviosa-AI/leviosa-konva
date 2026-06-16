# leviosa-konva — rendering SSOT

This package is the **single source of truth (SSOT) for everything that affects how a
carousel slide is rendered**. Two repos consume it and must stay pixel-identical:

- `leviosa-frontend` — the editor canvas (react-konva in the browser)
- `leviosa-rendering-server` — the headless renderer (react-konva in Playwright/Chromium → PNG)

The editor preview and the published image **must match**. If they ever diverge, the
divergence is a bug in how this SSOT is consumed, not an acceptable difference.

## What "rendering" means here — two inputs, both owned by this package

Text layout (line wrapping, line count) is computed by `canvas.measureText()` against the
loaded font. So a rendered slide is a function of **two** inputs, and BOTH must be identical
across the editor and the renderer:

1. **Render logic** — block→konva mapping, `wrap="word"` path, the manual
   `buildSegmentedLines()` path, crop math, shadow/letter-spacing, image presets.
   Lives in `src/` and ships in `dist/`.
2. **Font bytes** — the exact woff2 files used to measure and draw glyphs.
   Lives in `fonts/` (`fonts/fonts/*.woff2` + `fonts/font-manifest.json`).

Identical logic + identical fonts ⇒ identical `measureText` ⇒ identical wrapping ⇒
identical output. Drift in *either* breaks fidelity.

## Postmortem: why fonts are now in this package

Symptom: the editor wrapped a title into 2 lines; the published image wrapped it
differently. The `dist/` render logic was byte-identical in both repos (same `@leviosa-ai/konva`
version), so the logic was **not** the cause.

Root cause: each consumer ran its **own** `scripts/build-font-css.mjs` that **fetched fonts
from a CDN at build time** (`fonts.googleapis.com`, unpinned `cdn.jsdelivr.net/gh/orioncactus/pretendard`).
Neither repo committed the bundle (both `render-fonts`/`dist` are gitignored). Built at
different times, the two repos pulled **different font bytes** → different glyph advance
widths → different wrap points → different line counts. Same logic, different measuring stick.

Fix: the font bytes are **frozen in this package** and both consumers copy them from here.
No consumer fetches fonts anymore.

## How consumers use the fonts (the contract)

Consumers MUST NOT fetch fonts. At build time they run this package's generator, which
copies the canonical woff2 bytes and emits `@font-face` CSS for their own serving prefix
(the bytes are identical; only the URL prefix differs):

```bash
# frontend
leviosa-konva-fonts --prefix=/render-fonts/fonts/ --out=public/render-fonts
# renderer
leviosa-konva-fonts --prefix=http://leviosa-renderer.local/fonts/ --out=dist
```

`leviosa-konva-fonts` is the package `bin` → `scripts/gen-font-css.mjs`. It writes
`<out>/fonts/` (bytes), `<out>/font-manifest.json`, `<out>/font-css.css` (all faces) and
`<out>/family-css/<slug>.css` (per family). woff2-only (universally supported by both targets).

## Regenerating the bundle (rare, maintenance only)

The frozen `fonts/` IS the SSOT. To intentionally update font versions (new family, new
Pretendard release):

```bash
ALLOW_FONT_MANIFEST_UPDATE=1 npm run fonts:freeze   # scripts/freeze-fonts.mjs — re-fetch + re-hash
```

Then commit `fonts/fonts/*` + `fonts/font-manifest.json`, bump the package version, publish,
and bump the dep in both consumers. Pin upstream font URLs to exact versions when you do this;
the hashed manifest is the real freeze. After publish, both consumers pick up the SAME bytes
on their next `npm install`.

## Hard rules for any change in this org

- Anything that changes rendered pixels (wrap, fonts, crop, presets, glyph metrics) belongs
  **here**, not in a consumer. A consumer-local copy is drift waiting to happen.
- Never add a font fetch/`@font-face`/CSS-with-`local()` in a consumer. Consume this package.
- Bump `version` (package.json) and `LEVIOSA_KONVA_VERSION` (src/index.ts) together on release.
- New rendering logic ships in `dist/`; new fonts ship in `fonts/`. Keep both in `files`.
