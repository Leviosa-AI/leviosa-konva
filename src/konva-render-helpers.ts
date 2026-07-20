export const TEXT_SHADOW_BLUR = 5;
export const TEXT_SHADOW_OPACITY = 0.65;
export const TEXT_SHADOW_OFFSET_Y = 1;

const DEFAULT_FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const FONT_WEIGHT_OPTIONS = new Map<string, number[]>([
  ["Pretendard", DEFAULT_FONT_WEIGHTS],
  ["Noto Sans KR", DEFAULT_FONT_WEIGHTS],
  ["Gowun Dodum", [400]],
  ["Noto Serif KR", [200, 300, 400, 500, 600, 700, 900]],
  ["Nanum Myeongjo", [400, 700, 800]],
  ["Gowun Batang", [400, 700]],
  ["Black Han Sans", [400]],
  ["Do Hyeon", [400]],
  ["Jua", [400]],
  ["Gugi", [400]],
  ["Sunflower", [300, 500, 700]],
  ["Nanum Pen Script", [400]],
  ["Gaegu", [300, 400, 700]],
  ["Dokdo", [400]],
  ["East Sea Dokdo", [400]],
]);

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export function escapeSvgText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function emojiToDataUri(emoji: string, size: number): string {
  const fontSize = Math.max(1, Math.floor(size * 0.82));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${escapeSvgText(emoji)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Bake arbitrary SVG markup into a data URI for Konva.Image. A baked SVG is a
// standalone document, so a missing xmlns makes Konva fail to load the image
// (detail-page vector-layer hard rule) — inject it when absent.
export function svgMarkupToDataUri(svg: string): string {
  const markup = (svg ?? "").trim();
  if (!markup) return "";
  const withNs = /<svg\b[^>]*\sxmlns=/i.test(markup)
    ? markup
    : markup.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withNs)}`;
}

export const EMOJI_TEXT_FONT_FAMILY = "Noto Color Emoji, Apple Color Emoji, Segoe UI Emoji, sans-serif";

export function coverCropRaw(
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  focalX = 0.5,
  focalY = 0.5,
): CropRect {
  const imgRatio = srcW / srcH;
  const targetRatio = targetW / targetH;
  let sw: number, sh: number, sx: number, sy: number;
  if (imgRatio > targetRatio) {
    sh = srcH;
    sw = sh * targetRatio;
    sx = Math.max(0, Math.min(srcW - sw, focalX * srcW - sw / 2));
    sy = 0;
  } else {
    sw = srcW;
    sh = sw / targetRatio;
    sx = 0;
    sy = Math.max(0, Math.min(srcH - sh, focalY * srcH - sh / 2));
  }
  return { sx, sy, sw, sh };
}

export function coverCrop(
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
  focalX = 0.5,
  focalY = 0.5,
): CropRect {
  return coverCropRaw(img.naturalWidth, img.naturalHeight, targetW, targetH, focalX, focalY);
}

export function normalizeKonvaFontStyle(fontWeight: unknown, fontFamily?: string | null): string {
  if (fontFamily) {
    const supportedWeights = FONT_WEIGHT_OPTIONS.get(fontFamily) || DEFAULT_FONT_WEIGHTS;
    const requestedWeight =
      fontWeight === "bold" ? 700
        : fontWeight === "normal" ? 400
          : Number(fontWeight);
    const fallbackWeight = supportedWeights.includes(400) ? 400 : supportedWeights[0];
    if (!Number.isFinite(requestedWeight)) return String(fallbackWeight);
    const closestWeight = supportedWeights.reduce((closest, weight) => (
      Math.abs(weight - requestedWeight) < Math.abs(closest - requestedWeight) ? weight : closest
    ), fallbackWeight);
    return String(closestWeight);
  }
  if (fontWeight === "bold" || fontWeight === "normal") return fontWeight;
  const numericWeight = Number(fontWeight);
  if (Number.isFinite(numericWeight) && numericWeight >= 100 && numericWeight <= 900) {
    return String(Math.round(numericWeight / 100) * 100);
  }
  return "normal";
}

export function textShadowCanvasColor(textShadowColor: string | undefined | null): string | undefined {
  if (textShadowColor === "#000000") return `rgba(0,0,0,${TEXT_SHADOW_OPACITY})`;
  if (textShadowColor === "#FFFFFF") return `rgba(255,255,255,${TEXT_SHADOW_OPACITY})`;
  return undefined;
}
