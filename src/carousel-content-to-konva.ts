import type {
  Block,
  EmojiContent,
  LabelContent,
  MediaContent,
  RectContent,
  TextContent,
} from "./carousel-types.js";
import {
  TEXT_SHADOW_OFFSET_Y,
  TEXT_SHADOW_OPACITY,
  normalizeKonvaFontStyle,
} from "./konva-render-helpers.js";
import { resolveFontFamily } from "./font-coverage.js";

export function sortBlocksByZ(blocks: Block[]): Block[] {
  return [...blocks].sort((a, b) => a.z - b.z);
}

export function textContentToKonva(content: TextContent, resolvedText: string) {
  const fontFamily = resolveFontFamily(content.font_family);
  const hasShadow = content.text_shadow_color != null || content.text_shadow_size != null;
  return {
    text: resolvedText,
    fontSize: content.font_size ?? 24,
    fontFamily,
    fontStyle: normalizeKonvaFontStyle(content.font_weight ?? "700", fontFamily),
    fill: content.color ?? "#FFFFFF",
    align: content.align ?? "left",
    lineHeight: content.line_height ?? 1.2,
    letterSpacing: content.letter_spacing ?? 0,
    shadow: hasShadow
      ? {
          color: content.text_shadow_color ?? "#000000",
          blur: content.text_shadow_size ?? 0,
          opacity: TEXT_SHADOW_OPACITY,
          offsetY: TEXT_SHADOW_OFFSET_Y,
        }
      : null,
    opacity: content.opacity ?? undefined,
  };
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
    stroke: content.stroke ?? undefined,
    strokeWidth: content.stroke_width ?? undefined,
    cornerRadius: content.corner_radius ?? 0,
  };
}

export function mediaContentToKonva(content: MediaContent) {
  return {
    fit: content.fit ?? "cover",
    focalX: content.focal_x ?? 0.5,
    focalY: content.focal_y ?? 0.5,
    cornerRadius: content.corner_radius ?? 0,
    opacity: content.opacity ?? undefined,
    stroke: content.stroke ?? undefined,
  };
}

export function emojiContentToKonva(content: EmojiContent) {
  return {
    fontSize: content.font_size ?? 80,
    color: content.color ?? "#FFFFFF",
    opacity: content.opacity ?? undefined,
    kind: content.kind ?? "emoji",
    value: content.value,
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
  const hasUnreadableConfiguredFill = fill !== (content.color ?? "#FFFFFF");
  return {
    text: resolvedText,
    fontSize: content.font_size ?? 18,
    fontFamily,
    fontStyle: normalizeKonvaFontStyle(content.font_weight ?? "700", fontFamily),
    fill,
    align: hasUnreadableConfiguredFill ? "center" : content.align ?? "left",
    letterSpacing: content.letter_spacing ?? 0,
    background: content.background ?? undefined,
    stroke: content.stroke ?? undefined,
    strokeWidth: content.stroke_width ?? undefined,
    cornerRadius: content.corner_radius ?? 0,
    padding: content.padding ?? undefined,
  };
}
