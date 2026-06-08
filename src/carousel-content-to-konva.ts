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

export function labelContentToKonva(content: LabelContent, resolvedText: string) {
  const fontFamily = resolveFontFamily(content.font_family);
  return {
    text: resolvedText,
    fontSize: content.font_size ?? 18,
    fontFamily,
    fontStyle: normalizeKonvaFontStyle(content.font_weight ?? "700", fontFamily),
    fill: content.color ?? "#FFFFFF",
    align: content.align ?? "left",
    letterSpacing: content.letter_spacing ?? 0,
    background: content.background ?? undefined,
    stroke: content.stroke ?? undefined,
    strokeWidth: content.stroke_width ?? undefined,
    cornerRadius: content.corner_radius ?? 0,
    padding: content.padding ?? undefined,
  };
}
