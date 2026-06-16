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

`SUPPORTED_FONT_FAMILIES` + `FONT_WEIGHT_OPTIONS` are the SSOT here.

### Fonts (consumer contract) — bytes are bundled in this package
This package ships the canonical font **bytes** at `fonts/` (`fonts/fonts/*.woff2` +
`fonts/font-manifest.json`), not just family names. This is deliberate: text wrapping is
`canvas.measureText()` against the loaded font, so identical bytes are as load-bearing as
identical wrap logic. When the two consumers fetched fonts independently from a CDN they got
different bytes at different build times → different metrics → different line counts.

Consumers MUST NOT fetch fonts. At build time they run `leviosa-konva-fonts`
(`scripts/gen-font-css.mjs`, exposed as the package `bin`), which copies the bytes and emits
`@font-face` CSS for the consumer's own URL prefix (bytes identical, only the prefix differs):

```bash
# frontend (editor)
leviosa-konva-fonts --prefix=/render-fonts/fonts/ --out=public/render-fonts
# rendering-server (headless)
leviosa-konva-fonts --prefix=http://leviosa-renderer.local/fonts/ --out=dist
```

The renderer still inlines the generated CSS + route-fulfills the bytes + blocks on
`document.fonts.ready`; the editor still loads the families before render then awaits
`document.fonts.ready`. The difference is both now measure against the SAME bytes.
See `CLAUDE.md` for the full contract and the regen procedure (`fonts:freeze`).

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

## Publishing

GitHub Packages (private, org-scoped `@leviosa-ai`). Publish by pushing a version tag —
`.github/workflows/publish.yml` builds and publishes:

```bash
# bump version in package.json first, then:
git tag v0.1.0 && git push origin v0.1.0
```

## Consuming (GitHub Packages)

Both consumers add a scope→registry mapping and a read token, then depend on a pinned
version:

```ini
# leviosa-frontend/.npmrc and leviosa-rendering-server/.npmrc
@leviosa-ai:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```jsonc
// package.json
"dependencies": {
  "@leviosa-ai/konva": "0.1.0"
}
```

`NODE_AUTH_TOKEN` = a GitHub token with `read:packages` (a classic PAT for local dev; in
CI, a repo secret). The package must grant those consumer repos read access (Package
settings → Manage Actions access).
