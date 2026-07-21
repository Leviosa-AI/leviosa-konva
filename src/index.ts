// Public API of leviosa-konva — the shared carousel block→react-konva render core.
//
// Consumed by:
//   - leviosa-frontend          (editor: composes CarouselBlockNode + interaction overlay)
//   - leviosa-rendering-server  (headless: renders <CarouselSlide> → PNG)
//
// Goal: ONE renderer, so the editor canvas is pixel-identical to the published image.

// Data contract (SSOT)
export type * from "./carousel-types.js";

// Render core
export {
  CarouselSlide,
  CarouselBlockNode,
  AssetImage,
  PresetKImage,
  resolvedText,
  fontSampleForValue,
  numberValue,
  assetBlockCount,
  type AnyBlock,
} from "./carousel-slide.js";

// block.content → konva prop mappers + z-sort
export * from "./carousel-content-to-konva.js";

// {{theme/asset}} + slide.number resolution
export * from "./carousel-template-vars.js";

// crop math, font-style normalize, emoji data-URI, shadow constants
export * from "./konva-render-helpers.js";

// font family resolution + coverage (names only; consumer supplies font bytes)
export * from "./font-coverage.js";

// lucide icon → data-URI
export * from "./lucide-icons.js";

// segmented text rendering
export * from "./segmented-text.js";

// image filter presets (editor preview == publish render)
export * from "./image-presets.js";

// Canonical font bundle lives in this package at ./fonts (woff2 bytes + font-manifest.json).
// Consumers copy the bytes and generate CSS with scripts/gen-font-css.mjs (bin: leviosa-konva-fonts).
// They MUST NOT fetch fonts from a CDN — that is what made the editor and renderer wrap text
// differently (same wrap logic, different font bytes -> different measureText -> different lines).
export const LEVIOSA_KONVA_VERSION = "0.4.10";
