import type {
  Block,
  EmojiContent,
  LabelContent,
  MediaContent,
  ParticlesContent,
  RectContent,
  TextContent,
} from "./carousel-types.js";
import {
  TEXT_SHADOW_OFFSET_Y,
  TEXT_SHADOW_OPACITY,
  normalizeKonvaFontStyle,
} from "./konva-render-helpers.js";
import { resolveFontFamily } from "./font-coverage.js";
import { isBrandLogoToken } from "./carousel-template-vars.js";

export function sortBlocksByZ(blocks: Block[]): Block[] {
  return [...blocks].sort((a, b) => a.z - b.z);
}

// 템플릿 좌표가 어긋난 채 저장된 배경(예: 배경 사각형 y=40.5, 배경 사진 y=-0.1/h=1348)이
// 실사이즈 렌더에서 캔버스 배경색을 얇은 띠로 드러낸다. 에디터는 60% 정도로 축소해 보여주니
// 안 보이고 발행본에서만 보인다. 맨 아래(배경) 블록이 거의 캔버스면 캔버스에 딱 맞춘다.
// ponytail: 표시 단계 보정 — 저장 데이터는 그대로 두고 템플릿/기존 프로젝트까지 한 번에 메운다.
const BACKGROUND_SNAP_SLACK = 0.05;

export function snapBackgroundToCanvas<T extends Block>(
  blocks: T[],
  canvasWidth: number,
  canvasHeight: number,
): T[] {
  // 맨 아래 = 배경. 호출부가 z 정렬을 했든 안 했든 같은 블록을 고르도록 직접 찾는다.
  let background: T | undefined;
  for (const block of blocks) {
    if (!background || (block.z ?? 0) < (background.z ?? 0)) background = block;
  }
  if (!background) return blocks;
  if (background.type !== "rect" && background.type !== "media") return blocks;
  if (background.rotation) return blocks;

  const x = Number(background.x) || 0;
  const y = Number(background.y) || 0;
  const w = Number(background.w) || 0;
  const h = Number(background.h) || 0;
  if (w <= 0 || h <= 0) return blocks;
  if (x === 0 && y === 0 && w === canvasWidth && h === canvasHeight) return blocks;

  const slackX = canvasWidth * BACKGROUND_SNAP_SLACK;
  const slackY = canvasHeight * BACKGROUND_SNAP_SLACK;
  const coversCanvas =
    x <= slackX &&
    y <= slackY &&
    x >= -slackX &&
    y >= -slackY &&
    x + w >= canvasWidth - slackX &&
    y + h >= canvasHeight - slackY;
  if (!coversCanvas) return blocks;

  const snapped = { ...background, x: 0, y: 0, w: canvasWidth, h: canvasHeight };
  return blocks.map((block) => (block === background ? snapped : block));
}

export function textContentToKonva(content: TextContent, resolvedText: string) {
  const fontFamily = resolveFontFamily(content.font_family);
  // 음영 slider min (size 0) means "no shadow at all" — don't emit a residual
  // offset/opacity drop line. Shadow renders only when the size is > 0.
  const shadowSize = content.text_shadow_size ?? 0;
  const hasShadow = shadowSize > 0;
  return {
    text: resolvedText,
    fontSize: content.font_size ?? 24,
    fontFamily,
    fontStyle: normalizeKonvaFontStyle(content.font_weight ?? "700", fontFamily),
    fill: content.color ?? "#FFFFFF",
    textDecoration: content.text_decoration ?? undefined,
    align: content.align ?? "left",
    lineHeight: content.line_height ?? 1.2,
    letterSpacing: content.letter_spacing ?? 0,
    shadow: hasShadow
      ? {
          color: content.text_shadow_color ?? "#000000",
          blur: shadowSize,
          opacity: TEXT_SHADOW_OPACITY,
          offsetY: TEXT_SHADOW_OFFSET_Y,
        }
      : null,
    opacity: content.opacity ?? undefined,
  };
}

export interface Particle {
  x: number;
  y: number;
  size: number;
  color: string;
  rotation: number;
  // Per-piece height/width ratio — only confetti uses it (thin strip .. square),
  // so a scatter reads as varied paper bits, not uniform blobs. Drawn for every
  // particle so switching shape never reflows positions.
  aspect: number;
}

// Seeded PRNG (mulberry32). Pure + deterministic so the editor and the headless
// renderer generate the identical particle field from the same seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PARTICLE_DEFAULT_COLORS = ["#FFFFFF"];
// ponytail: 500 cap is a runaway backstop; real scatters are 10–60 particles.
const PARTICLE_MAX_COUNT = 500;

// Deterministic particle field for a `particles` block. The block box (width x
// height) is the scatter area; each particle's position/size/color/rotation is
// drawn from the seeded PRNG in a fixed call order (position → size → color →
// rotation) so the sequence never drifts between consumers.
export function particleField(content: ParticlesContent, width: number, height: number): Particle[] {
  const count = Math.max(0, Math.min(PARTICLE_MAX_COUNT, Math.floor(content.count ?? 24)));
  const rand = mulberry32((content.seed ?? 1) >>> 0);
  const colors = content.colors && content.colors.length > 0 ? content.colors : PARTICLE_DEFAULT_COLORS;
  const sizeMin = content.size_min ?? 6;
  const sizeMax = Math.max(sizeMin, content.size_max ?? 14);
  const canRotate = content.rotate ?? content.shape === "confetti";
  const out: Particle[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = rand() * width;
    const y = rand() * height;
    const size = sizeMin + rand() * (sizeMax - sizeMin);
    const color = colors[Math.floor(rand() * colors.length)] ?? colors[0];
    const rotation = canRotate ? rand() * 360 : 0;
    const aspect = 0.25 + rand() * 0.75;
    out.push({ x, y, size, color, rotation, aspect });
  }
  return out;
}

export function rectContentToKonva(content: RectContent) {
  const fillLinearGradient = content.fill_linear_gradient
    ? {
        fillLinearGradientStartPoint: content.fill_linear_gradient.start,
        fillLinearGradientEndPoint: content.fill_linear_gradient.end,
        fillLinearGradientColorStops: content.fill_linear_gradient.color_stops.flatMap((stop) => [stop.offset, stop.color]),
        // Konva defaults fillPriority to "color", so a solid `fill` (e.g. #000000)
        // would win over the gradient and render an opaque rect, covering the slide
        // image (black-slide regression). Force the gradient to take priority when
        // present; `fill` stays only as a fallback for engines that ignore it.
        fillPriority: "linear-gradient" as const,
      }
    : {};
  return {
    fill: content.fill ?? undefined,
    ...fillLinearGradient,
    opacity: content.alpha ?? undefined,
    stroke: content.stroke ?? (content.stroke_width != null ? "#FFFFFF" : undefined),
    strokeWidth: content.stroke_width ?? undefined,
    cornerRadius: content.corner_radius ?? 0,
  };
}

export function mediaContentToKonva(content: MediaContent) {
  // Brand logos must never be cropped to fill: default them to "contain" so the
  // mark keeps its aspect ratio. Photos keep "cover". An explicit fit wins.
  const defaultFit = isBrandLogoToken(content.src) ? "contain" : "cover";
  return {
    fit: content.fit ?? defaultFit,
    focalX: content.focal_x ?? 0.5,
    focalY: content.focal_y ?? 0.5,
    cornerRadius: content.corner_radius ?? 0,
    opacity: content.opacity ?? undefined,
    stroke: content.stroke ?? undefined,
  };
}

export function emojiContentToKonva(content: Partial<EmojiContent> = {}) {
  return {
    fontSize: content.font_size ?? 80,
    color: content.color ?? "#FFFFFF",
    opacity: content.opacity ?? undefined,
    kind: content.kind ?? "emoji",
    value: content.value ?? "",
  };
}

function parseHexColor(value: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (!match) return null;
  const hex = match[1];
  const normalized = hex.length === 3
    ? hex.split("").map((char) => `${char}${char}`).join("")
    : hex;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

function readableLabelFill(color: string | null | undefined, background: string | null | undefined): string {
  const foregroundColor = color ?? "#FFFFFF";
  const foreground = parseHexColor(foregroundColor);
  const bg = parseHexColor(background);
  if (!foreground || !bg || contrastRatio(foreground, bg) >= 2) return foregroundColor;
  const white = parseHexColor("#FFFFFF")!;
  const black = parseHexColor("#000000")!;
  return contrastRatio(white, bg) >= contrastRatio(black, bg) ? "#FFFFFF" : "#000000";
}

export function labelContentToKonva(content: LabelContent, resolvedText: string) {
  const fontFamily = resolveFontFamily(content.font_family);
  const fill = readableLabelFill(content.color, content.background);
  const fillLinearGradient = content.fill_linear_gradient
    ? {
        fillLinearGradientStartPoint: content.fill_linear_gradient.start,
        fillLinearGradientEndPoint: content.fill_linear_gradient.end,
        fillLinearGradientColorStops: content.fill_linear_gradient.color_stops.flatMap((stop) => [stop.offset, stop.color]),
        fillPriority: "linear-gradient" as const,
      }
    : {};
  return {
    text: resolvedText,
    fontSize: content.font_size ?? 18,
    fontFamily,
    fontStyle: normalizeKonvaFontStyle(content.font_weight ?? "700", fontFamily),
    fill,
    align: content.align ?? "left",
    letterSpacing: content.letter_spacing ?? 0,
    background: content.background ?? undefined,
    ...fillLinearGradient,
    stroke: content.stroke ?? undefined,
    strokeWidth: content.stroke_width ?? undefined,
    cornerRadius: content.corner_radius ?? 0,
    padding: content.padding ?? undefined,
  };
}
