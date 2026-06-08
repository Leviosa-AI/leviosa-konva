// Public API of leviosa-konva — the shared carousel block→react-konva render core.
//
// Consumed by:
//   - leviosa-frontend          (editor: renders <CarouselSlide> + interaction overlay)
//   - leviosa-rendering-server  (headless: renders <CarouselSlide> → PNG)
//
// Goal: ONE renderer, so the editor canvas is pixel-identical to the published image.

// ---- Data contract (available now) ----
export type * from "./carousel-types.js";

// ---- Render core (TODO: extract from leviosa-rendering-server) ----
// The following are planned exports. Each maps to code currently living in
// leviosa-rendering-server/src that will be MOVED here (see README "Extraction plan").
//
//   export { CarouselSlide } from "./carousel-slide.js";           // <Stage><Layer>…blocks.map</Layer></Stage>
//   export { CarouselBlockNode } from "./carousel-block-node.js";  // = current RenderBlock dispatch
//   export { AssetImage } from "./asset-image.js";
//   export { resolvedText, fontSampleForValue, assetBlockCount } from "./carousel-slide.js";
//   export * from "./carousel-content-to-konva.js";                // textContentToKonva, rectContentToKonva, ...
//   export * from "./carousel-template-vars.js";                   // resolveTemplateVars, resolveSlideNumberText
//   export * from "./konva-render-helpers.js";                     // coverCrop, normalizeKonvaFontStyle, EMOJI_TEXT_FONT_FAMILY, ...
//   export * from "./font-coverage.js";                            // resolveFontFamily, textRequiresEmojiFont, SUPPORTED_FONT_FAMILIES (SSOT)
//   export * from "./lucide-icons.js";                             // iconToDataUri, isLucideIcon, ...

export const LEVIOSA_KONVA_VERSION = "0.0.1";
