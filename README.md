# leviosa-konva

Shared carousel-slide render core and canonical font bundle, published as `@leviosa-ai/konva`.

## Overview
- **Service:** Leviosa platform (leviosa.ai.kr) carousel / card-news rendering.
- **Role:** Single source of truth for how a carousel slide is drawn (block → react-konva mapping, text wrapping, crop math, image presets) and for the exact font bytes used to measure and draw text.
- **Integration:** Imported by `leviosa-frontend` (carousel editor canvas) and `leviosa-rendering-server` (headless PNG renderer) so the editor matches the published image; `agency-fe` pins the same tarball. Not a runtime dependency of `@leviosa-ai/canvas` (see Related Repositories).
- **Runtime:** TypeScript library built with tsup (ESM + `.d.ts`); peer dependencies `react`/`react-dom` 19.2, `react-konva` 19.2, `konva` ^9.3 or ^10. Ships `fonts/` (woff2 + `font-manifest.json`) and the `leviosa-konva-fonts` CLI.
- **Deployment:** Per CI config, pushing a `v<version>` tag publishes to the **public npm registry** via npm Trusted Publishing (OIDC, no stored token); `ci.yml` runs typecheck/tests on PRs plus a weekly font-URL check.

## Documentation
| Category | Document | Description |
| --- | --- | --- |
| Handbook | [AGENTS.md](AGENTS.md) | Agent quick reference: commands and release rule (bump `package.json` and `LEVIOSA_KONVA_VERSION` together). |
| Architecture | [CLAUDE.md](CLAUDE.md) | Full rendering-SSOT contract: why fonts live here (postmortem), `local` vs `cdn` font modes, font catalog, regenerating the bundle. |
| Reference | [src/carousel-types.ts](src/carousel-types.ts) | Data contract (`CarouselSlideRenderInput`, block types) shared by both consumers. |
| Reference | [fonts/THIRD_PARTY_FONT_NOTICES.md](fonts/THIRD_PARTY_FONT_NOTICES.md) | Licenses for the bundled fonts. |
| Reference | [.github/workflows/publish.yml](.github/workflows/publish.yml) | Tag-driven npm publish. |

## Related Repositories
- [leviosa-frontend](https://github.com/Leviosa-AI/leviosa-frontend) — consumer: the carousel editor renders `<CarouselSlide>` and layers the selection/transform overlay on top.
- [leviosa-rendering-server](https://github.com/Leviosa-AI/leviosa-rendering-server) — consumer: renders `<CarouselSlide>` in Playwright/Chromium and exports PNGs; keeps the headless harness (font wait, PNG export) itself.
- [agency-fe](https://github.com/Leviosa-AI/agency-fe) — pins the `0.8.0` npm tarball alongside the private `@leviosa-ai/canvas` packages.
- [leviosa-canvas](https://github.com/Leviosa-AI/leviosa-canvas) — separate editor engine (`@leviosa-ai/canvas`, private GitHub Packages). It carries its own copy of this font-bundle tooling (same `leviosa-konva-fonts` bin name, its own manifest) and does not import this package at runtime.
- [Service registry](https://github.com/Leviosa-AI/leviosa-standards/blob/main/services/README.md) — all Leviosa repos and how they connect

---

## Why this exists

The editor and the published renderer used to be two independent react-konva implementations, so the
editor canvas drifted from the published image (text color, size, spacing). Text wrapping is
`canvas.measureText()` against the loaded font, so a rendered slide depends on two inputs that must be
identical in both consumers: the render logic (`src/` → `dist/`) and the font bytes (`fonts/`). The
render core was extracted from `leviosa-rendering-server/src`; the headless harness (`waitForFonts`,
PNG export, ready orchestration) stays there.

## Fonts (consumer contract)

`fonts/font-manifest.json` records, per file, the version-pinned URL it was frozen from and its sha256;
the woff2 bytes ship in `fonts/fonts/`. Consumers must not resolve font URLs themselves. At build time
they run `leviosa-konva-fonts` (`scripts/gen-font-css.mjs`), which emits `@font-face` CSS from the
manifest. The two modes differ only in the `src` URL:

```bash
# local (default) — copy the bytes, serve them yourself, zero network at render time
leviosa-konva-fonts --prefix=/render-fonts/fonts/ --out=public/render-fonts    # editor
leviosa-konva-fonts --prefix=http://leviosa-renderer.local/fonts/ --out=dist   # renderer

# cdn — immutable sources use pinned URLs; mutable sources still ship with the package
leviosa-konva-fonts --mode=cdn --prefix=/render-fonts/fonts/ --out=public/render-fonts
```

`cdn` only delegates files whose upstream cannot be repointed (gstatic release paths, npm versions).
`npm run fonts:check-urls` verifies every pinned URL is still live. See [CLAUDE.md](CLAUDE.md) for
which mode belongs where and the `fonts:freeze` regeneration procedure.

Assets: the caller resolves `brand_config` + `asset_map` onto `CarouselSlideRenderInput`; the core only
does `{{...}}` substitution. Fetching, proxying and caching bytes stays in the consumer.

## Model notes (carried over from the extraction; not re-verified)

- `MediaContent.image_preset` was added here; mirroring it in the db schema and frontend types was an open TODO.
- Numbering badges are identified by `block.name === "content_number"` (not `content.role/source`).
- Segments losslessness, rect `alpha` polarity, label `color`/`background` swap, and slide-field binding were flagged for reconciliation during extraction.

## Build and test

```bash
npm install
npm run build      # tsup → dist/ (ESM + .d.ts)
npm run typecheck
npm test
```

## Publishing

Published to public npm with Trusted Publishing (OIDC): npm is configured for organization
`Leviosa-AI`, repository `leviosa-konva`, workflow `publish.yml`. Bump `package.json` and
`LEVIOSA_KONVA_VERSION` (`src/index.ts`) together, then push the tag; the workflow fails if the tag and
`package.json` version differ.

```bash
VERSION=$(node -p "require('./package.json').version")
git tag "v$VERSION" && git push origin "v$VERSION"
```

## Consuming

Consumers pin an exact version from the public registry (current: `0.8.0`):

```json
{ "dependencies": { "@leviosa-ai/konva": "0.8.0" } }
```

A consumer whose `.npmrc` maps the whole `@leviosa-ai` scope to GitHub Packages (for the private
`@leviosa-ai/canvas` packages) cannot resolve this package by name; pin the npm tarball URL instead,
as `agency-fe` does: `"@leviosa-ai/konva": "https://registry.npmjs.org/@leviosa-ai/konva/-/konva-0.8.0.tgz"`.
