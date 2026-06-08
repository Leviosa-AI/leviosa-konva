# leviosa-konva

Shared **carousel block → react-konva render core**. The single source of truth for
how a carousel slide is drawn, imported by both:

- **leviosa-frontend** — the editor renders `<CarouselSlide>` and layers a selection/
  transform/drag overlay (keyed on `block.id`) on top.
- **leviosa-rendering-server** — the headless service renders `<CarouselSlide>` and
  exports it to PNG.

**Why this exists:** the editor and the published renderer used to be two independent
react-konva implementations, so the editor canvas drifted from the published image
(text color, font size, spacing slightly off). Unifying on one renderer makes the
editor pixel-identical to the output by construction.

Stack contract (must match both consumers): React `19.2.x`, react-dom `19.2.x`,
react-konva `19.2.x`, konva `9.3.x`. These are **peer dependencies** — consumers
provide them.

## Status

Scaffold. The data contract (`src/carousel-types.ts`) is in place. The render core
is being extracted from `leviosa-rendering-server` — see below.

## Extraction plan (from leviosa-rendering-server/src)

Pure render closure — ~1,030 LOC, browser-safe (no Node/FS deps, verified):

| Source file (rendering-server) | Action | Notes |
|---|---|---|
| `carousel-types.ts` | ✅ moved | data contract / SSOT |
| `carousel-content-to-konva.ts` | move | block.content → konva props |
| `carousel-template-vars.ts` | move | `{{theme/asset}}` + `slide.number` resolution |
| `konva-render-helpers.ts` | move | crop math, font-style normalize, emoji data-URI |
| `font-coverage.ts` | move | family resolution (names only, no FS) |
| `lucide-icons.ts` | move | icon → data-URI |
| `carousel-renderer-entry.tsx` (component slice) | split | extract `<CarouselSlide>` + per-block components; the headless harness (`waitForFonts`, PNG export, `window.*` global, ready-orchestration) STAYS in rendering-server |

`SUPPORTED_FONT_FAMILIES` + `FONT_WEIGHT_OPTIONS` become the SSOT here; the
rendering-server `build-font-css.mjs` imports them instead of duplicating.

### Fonts (consumer contract)
The package only emits font-family **names**; it ships no font bytes.
- rendering-server (headless): keep the existing build-font-css → inline-CSS →
  route-fulfill pipeline + `waitForFonts`.
- frontend (editor): load the same families/weights (web fonts) before render, then
  `document.fonts.ready`. Metrics must match the headless set or text wraps differently.

### Assets (consumer contract)
The caller resolves `brand_config` + `asset_map` and puts them on
`CarouselSlideRenderInput`; the core only does `{{...}}` substitution. Byte fetching /
CDN proxying / caching stays in the consumer.

## Model gaps being fixed here
- `MediaContent.image_preset` — editor wrote it but block.content had no field (lost on
  save). Added; **TODO mirror in db-schema + frontend types.**
- Numbering badges are identified by `block.name === "content_number"` (NOT
  `content.role/source`). Detector must key on `name`.
- segments lossless, rect `alpha`/transparency polarity, label `color`/`background`
  swap, slide-field binding — reconcile during extraction.

## Build

```bash
npm install
npm run build      # tsup → dist/ (ESM + .d.ts)
npm run typecheck
```

## Consuming (git dependency)

No registry. Both consumers install from git, pinned to a tag/commit:

```jsonc
// leviosa-frontend/package.json and leviosa-rendering-server/package.json
"dependencies": {
  "leviosa-konva": "github:Leviosa-AI/leviosa-konva#v0.1.0"
}
```

Private repo → consumer CI needs read access (deploy key or PAT). The `prepare` script
builds on install; if install-time builds are undesirable, switch to committed `dist/`
or GitHub Packages (see repo setup checklist).
