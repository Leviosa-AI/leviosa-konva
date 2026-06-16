# AGENTS.md - leviosa-konva

Rendering SSOT for the carousel editor (`leviosa-frontend`) and the headless renderer
(`leviosa-rendering-server`). See **CLAUDE.md** in this repo for the full contract.

TL;DR:
- This package owns BOTH the render logic (`src/` → `dist/`) AND the canonical font bytes
  (`fonts/`). Identical logic + identical fonts ⇒ identical `measureText` ⇒ identical wrapping.
- Consumers never fetch fonts. They run `leviosa-konva-fonts` (`scripts/gen-font-css.mjs`) to
  copy the woff2 bytes and generate `@font-face` CSS for their own URL prefix.
- Bump `version` (package.json) and `LEVIOSA_KONVA_VERSION` (src/index.ts) together on release.

## Commands

```bash
npm run build            # tsup → dist/
npm run test
npm run fonts:gen -- --prefix=/render-fonts/fonts/ --out=/tmp/out   # generate CSS from frozen bundle
ALLOW_FONT_MANIFEST_UPDATE=1 npm run fonts:freeze                   # re-fetch + re-freeze fonts (rare)
```
