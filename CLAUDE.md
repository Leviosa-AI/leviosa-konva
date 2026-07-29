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

Fix: the font list is **frozen in this package** — `fonts/font-manifest.json` records, per
file, the exact version-pinned URL it came from and its sha256, and the woff2 bytes sit next
to it. Every consumer generates its CSS from that one manifest.

Note what the root cause actually was: **each consumer resolving its own URLs at its own
build time**, from addresses that were not pinned. It was not "a CDN was involved". A frozen,
shared, version-pinned URL list has the same guarantee as frozen bytes — which is what makes
`--mode=cdn` below safe, and why re-resolving `fonts.googleapis.com/css2` at build time is
still forbidden.

## How consumers use the fonts (the contract)

Consumers MUST NOT decide for themselves which font bytes to fetch. At build time they run
this package's generator, which emits `@font-face` CSS from the manifest. Two delivery modes
differ **only in the `src` URL** — face metadata, unicode ranges and the resulting bytes are
identical, and `src/gen-font-css.test.mjs` asserts exactly that:

```bash
# local (default) — copy the frozen woff2, serve them yourself, zero network at render time
leviosa-konva-fonts --prefix=/render-fonts/fonts/ --out=public/render-fonts
leviosa-konva-fonts --prefix=http://leviosa-renderer.local/fonts/ --out=dist

# cdn — point src at the pinned manifest sourceUrl; only the files we cannot delegate ship
leviosa-konva-fonts --mode=cdn --prefix=/render-fonts/fonts/ --out=public/render-fonts
```

### Pinned is not the same as permanent

`cdn` mode only delegates a file whose upstream **cannot be repointed at other bytes by
someone else**: `fonts.gstatic.com/s/<family>/vNN/…` (a Google release path) and
`cdn.jsdelivr.net/npm/<pkg>@<version>/…` (npm refuses to republish a version and blocks
unpublish after 72 hours). `isImmutableSource()` is that rule.

`cdn.jsdelivr.net/gh/<user>/<repo>@<tag>/…` is neither: a git tag can be force-moved to
different bytes and the repo can be deleted outright, and it is a third party's. Those files
keep shipping as bytes even in `cdn` mode. Today that is **six woff2, 1.26MB** — Paperozi and
Presentation, whose only upstream is 눈누's `projectnoonnu` repos. Pretendard used to be in
that category; it now points at `npm/pretendard@1.3.9`, the same release, **verified
byte-identical for all 1,656 files**, so its sha256 and wrap behaviour are unchanged.

Adding a font from a `gh/` path is allowed — it just costs bundle size instead of a risk.

`leviosa-konva-fonts` is the package `bin` → `scripts/gen-font-css.mjs`. It writes
`<out>/font-manifest.json`, `<out>/font-css.css` (all faces) and `<out>/family-css/<slug>.css`
(per family, and per family+weight); in `local` mode it also writes `<out>/fonts/` (bytes).
woff2-only (universally supported by both targets). `--mode=cdn` refuses to emit a face whose
URL is missing, non-https, or unversioned, and it deletes any `<out>/fonts` a previous local
build left behind.

### Which mode to use where

- **Editor (leviosa-frontend)** — either. `cdn` drops ~81MB of byte copying per build and
  gets edge caching; the browser is online regardless.
- **Headless renderer** — `local` unless you replace what it gives up. Today the renderer
  intercepts every font request and verifies the file's sha256 against the manifest before
  serving it, so a corrupted or swapped byte cannot reach a published image. `@font-face` has
  no SRI, so a plain `cdn` build loses that check. It does **not** risk silent wrong wrapping —
  `waitForFonts` throws `FontLoadError` rather than falling back — but a font CDN outage
  becomes a failed render job.
- The safe middle for the renderer, if the bundled bytes must go: keep the `page.route`
  interception, fetch the pinned URL once, verify sha256 against the manifest, cache, fulfil.

### Keeping pinned URLs honest

`npm run fonts:check-urls` (bin: `leviosa-konva-check-fonts`) HEADs every unique `sourceUrl`
and compares Content-Length with the frozen byte count; `--full` downloads and re-hashes
instead. CI runs it on PRs and weekly, because a jsdelivr `gh/<user>/<repo>@<tag>` path dies
with its upstream repo and under `cdn` that would first surface in production.

It fails on **rot**, not on every request that did not succeed: a definitive 4xx, a byte
count that moved, or an entire upstream group (one `gh/…@<tag>`, one `/s/<family>/vNN/`)
failing together. Scattered timeouts are reported and tolerated — sweeping 5500 URLs gets
the caller throttled (a CI run timed out on 204 URLs that answered fine from a laptop
minutes earlier), and a check that goes red for that is a check people rerun until it
passes, which catches nothing. `--strict` fails on any failure.

## The font catalog — where "which fonts exist" lives

`fonts/catalog.json` is the SSOT for the font list. One entry per family: display label,
category, coarse traits (`class` gothic/myeongjo/handwriting/display × `shape`
neutral/round/angular/narrow/pixel), weights, licence, preview string. Three source types:

- `google` — folded into one `fonts.googleapis.com/css2` request (unicode-range slices)
- `css` — an upstream stylesheet fetched as-is (Pretendard)
- `files` — direct woff2 URLs, `@font-face` blocks synthesized (whole font, no slices)

Everything downstream derives from it, so **a font name must never be hardcoded anywhere else**:

- `src/font-catalog.ts` — typed view + `matchFontFamily()` trait matching
- `src/font-coverage.ts` — the supported-family set, `resolveFontFamily()`
- `src/konva-render-helpers.ts` — per-family weight snapping
- `leviosa-frontend` — the picker list and its coverage check (imports from this package)
- the frozen bundle itself — `freeze-fonts.mjs` reads the catalog

`resolveFontFamily()` accepts three things: a real family name, a trait descriptor
(`"gothic/round"`, what reference extraction emits — it describes lettering rather than
naming a font, so the server never needs to know the font list), and the legacy
`"serif"`/`"sans"` values still present in older DB rows.

Adding a font = one catalog entry + a re-freeze. `npm test` fails if the catalog and the
frozen bytes drift apart.

## Regenerating the bundle (rare, maintenance only)

The catalog plus the frozen `fonts/` IS the SSOT. To add a family or update font versions:

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
- Never hand-write a font fetch/`@font-face`/CSS-with-`local()` in a consumer, and never
  re-resolve `fonts.googleapis.com/css2` at build time. Generate from this package — that is
  what makes `--mode=cdn` a delivery choice rather than a return to the postmortem.
- Bump `version` (package.json) and `LEVIOSA_KONVA_VERSION` (src/index.ts) together on release.
- New rendering logic ships in `dist/`; new fonts ship in `fonts/`. Keep both in `files`.
- Do not promote `dev` to `main` by recreating the same final tree as a new standalone
  commit while leaving the original `dev` commits disconnected. Preserve ancestry with a
  normal merge commit or fast-forward-compatible flow; if a squash/snapshot promotion is
  unavoidable, immediately re-anchor `dev` onto the resulting `main` commit before more work
  lands on `dev`.
