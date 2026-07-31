import type {
  Block,
  EmojiContent,
  FillLinearGradient,
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
    highlightColor: content.highlight_color ?? null,
    highlightOpacity: content.highlight_opacity ?? 0.4,
    highlightHeight: content.highlight_height ?? 1.02,
    highlightRadius: content.highlight_radius ?? 0.25,
    highlightPadX: content.highlight_pad_x ?? 0.1,
    highlightOffsetY: content.highlight_offset_y ?? 0,
    highlightMultiply: content.highlight_multiply ?? false,
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

/** 그라데이션을 계산할 도형의 크기. 없으면 좌표를 그대로 쓴다. */
export interface GradientBox {
  width?: number | null;
  height?: number | null;
}

/** 그라데이션 좌표를 도형 픽셀 좌표로 맞춘다.
 *
 * konva는 도형 안의 **픽셀 오프셋**을 기대하는데, 레퍼런스 추출은 정규화 좌표(0~1)를 준다.
 * 그대로 넘기면 1px 구간 그라데이션이 되고 나머지는 마지막 색으로 덮여 평면색으로 보인다.
 * 네 좌표가 모두 1 이하면 정규화로 보고 폭·높이를 곱한다. 도형을 가로지르는 픽셀 좌표는
 * 반드시 하나가 1을 넘으므로 오판하지 않는다.
 */
function gradientPoints(gradient: FillLinearGradient, size?: GradientBox) {
  const { start, end } = gradient;
  const width = size?.width ?? 0;
  const height = size?.height ?? 0;
  const normalized = [start.x, start.y, end.x, end.y].every(
    (value) => Number.isFinite(value) && Math.abs(value) <= 1,
  );
  if (!normalized || !(width > 0) || !(height > 0)) return { start, end };
  return {
    start: { x: start.x * width, y: start.y * height },
    end: { x: end.x * width, y: end.y * height },
  };
}

/** 칠하지 않음을 뜻하는 값은 konva 에 넘기지 않는다.
 *
 * 캔버스는 `none`/`transparent` 를 색으로 못 읽고 직전 색(대개 검정)으로 칠해 버려서,
 * 테두리만 있어야 할 박스가 검은 판이 된다. 추출 지시가 "테두리만인 박스는 fill 을 none 으로
 * 둬도 된다"고 안내하므로 이 값은 계속 들어온다.
 */
function paintOrNone(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized === "none" || normalized === "transparent" ? undefined : value;
}

export function rectContentToKonva(content: RectContent, size?: GradientBox) {
  const points = content.fill_linear_gradient
    ? gradientPoints(content.fill_linear_gradient, size)
    : null;
  const fillLinearGradient = content.fill_linear_gradient
    ? {
        fillLinearGradientStartPoint: points!.start,
        fillLinearGradientEndPoint: points!.end,
        fillLinearGradientColorStops: content.fill_linear_gradient.color_stops.flatMap((stop) => [stop.offset, stop.color]),
        // Konva defaults fillPriority to "color", so a solid `fill` (e.g. #000000)
        // would win over the gradient and render an opaque rect, covering the slide
        // image (black-slide regression). Force the gradient to take priority when
        // present; `fill` stays only as a fallback for engines that ignore it.
        fillPriority: "linear-gradient" as const,
      }
    : {};
  return {
    fill: paintOrNone(content.fill),
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

export function labelContentToKonva(
  content: LabelContent,
  resolvedText: string,
  size?: GradientBox,
) {
  const fontFamily = resolveFontFamily(content.font_family);
  const points = content.fill_linear_gradient
    ? gradientPoints(content.fill_linear_gradient, size)
    : null;
  const fillLinearGradient = content.fill_linear_gradient
    ? {
        fillLinearGradientStartPoint: points!.start,
        fillLinearGradientEndPoint: points!.end,
        fillLinearGradientColorStops: content.fill_linear_gradient.color_stops.flatMap((stop) => [stop.offset, stop.color]),
        fillPriority: "linear-gradient" as const,
      }
    : {};
  return {
    text: resolvedText,
    fontSize: content.font_size ?? 18,
    fontFamily,
    fontStyle: normalizeKonvaFontStyle(content.font_weight ?? "700", fontFamily),
    fill: content.color ?? "#FFFFFF",
    align: content.align ?? "left",
    letterSpacing: content.letter_spacing ?? 0,
    background: content.background ?? undefined,
    ...fillLinearGradient,
    stroke: content.stroke ?? undefined,
    strokeWidth: content.stroke_width ?? undefined,
    cornerRadius: content.corner_radius ?? 0,
    padding: content.padding ?? undefined,
    tailDirection: content.tail_direction ?? undefined,
  };
}
