# AGENTS.md - leviosa-konva

Rendering SSOT for the carousel editor (`leviosa-frontend`) and the headless renderer
(`leviosa-rendering-server`). The frozen font bundle moved to
`@leviosa-ai/canvas/fonts`. See **CLAUDE.md** for the full contract.

TL;DR:
- This package owns render logic; `@leviosa-ai/canvas/fonts` owns canonical font bytes.
- Consumers never fetch fonts. They run `leviosa-konva-fonts` from `@leviosa-ai/canvas` to
  copy the woff2 bytes and generate `@font-face` CSS for their own URL prefix.
- Bump `version` and `LEVIOSA_KONVA_VERSION` together when this renderer is released.

## Commands

```bash
npm run build            # tsup → dist/
npm run test
```
