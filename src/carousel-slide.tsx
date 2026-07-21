// Carousel block → react-konva render core (pure, browser + headless safe).
// Extracted verbatim from leviosa-rendering-server/src/carousel-renderer-entry.tsx
// so the editor and the headless renderer draw blocks identically. The headless
// harness (font preload, createRoot mount, Stage→PNG export, window global) stays
// in leviosa-rendering-server and imports CarouselSlide from this package.

import Konva from "konva";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Star, Text } from "react-konva";
import { imagePresetValues } from "./image-presets.js";
import {
  emojiContentToKonva,
  labelContentToKonva,
  mediaContentToKonva,
  particleField,
  rectContentToKonva,
  snapBackgroundToCanvas,
  sortBlocksByZ,
  textContentToKonva,
} from "./carousel-content-to-konva.js";
import { resolveContentText, resolveTemplateVars } from "./carousel-template-vars.js";
import type {
  Block,
  CarouselSlideRenderInput,
  EmojiBlock,
  LabelBlock,
  MediaBlock,
  ParticlesBlock,
  RectBlock,
  SvgBlock,
  TextBlock,
} from "./carousel-types.js";
import {
  coverCrop,
  emojiToDataUri,
  svgMarkupToDataUri,
  EMOJI_TEXT_FONT_FAMILY,
  normalizeKonvaFontStyle,
} from "./konva-render-helpers.js";
import { iconToDataUri } from "./lucide-icons.js";
import { resolveFontFamily, shouldUseEmojiFontForChar, textRequiresEmojiFont } from "./font-coverage.js";
import { buildSegmentedLines, splitGraphemes } from "./segmented-text.js";

export type AnyBlock = Omit<Block, "type" | "content"> & { type: string; content: Record<string, any> };

interface AssetImageProps {
  src: string;
  onReady: () => void;
  children: (image: HTMLImageElement | null, errored: boolean) => React.ReactNode;
}

const MAX_ASSET_IMAGE_CACHE_SIZE = 256;
const MAX_TEXT_MEASURE_CACHE_SIZE = 4096;
const assetImageCache = new Map<string, HTMLImageElement>();
const assetImageRequests = new Map<string, Promise<HTMLImageElement>>();
let textMeasureCanvas: HTMLCanvasElement | null = null;
let textMeasureContext: CanvasRenderingContext2D | null = null;
const textMeasureCache = new Map<string, number>();

export function numberValue(value: unknown, fallback: number): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function fontSampleForValue(value: string): string {
  const rawSample = value.replace(/\\n/g, "\n").trim();
  return rawSample || "가Aa1";
}

function isPositiveNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function rememberAssetImage(src: string, image: HTMLImageElement): HTMLImageElement {
  assetImageCache.delete(src);
  assetImageCache.set(src, image);
  while (assetImageCache.size > MAX_ASSET_IMAGE_CACHE_SIZE) {
    const oldest = assetImageCache.keys().next().value;
    if (oldest === undefined) break;
    assetImageCache.delete(oldest);
  }
  return image;
}

function cachedAssetImage(src: string): HTMLImageElement | null {
  const image = assetImageCache.get(src);
  if (!image) return null;
  rememberAssetImage(src, image);
  return image;
}

function loadAssetImage(src: string): Promise<HTMLImageElement> {
  const cached = cachedAssetImage(src);
  if (cached) return Promise.resolve(cached);

  const inFlight = assetImageRequests.get(src);
  if (inFlight) return inFlight;

  const request = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const decode = typeof img.decode === "function" ? img.decode().catch(() => undefined) : Promise.resolve();
      decode.then(() => resolve(rememberAssetImage(src, img)));
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  }).finally(() => {
    assetImageRequests.delete(src);
  });

  assetImageRequests.set(src, request);
  return request;
}

function rememberTextMeasurement(key: string, width: number): number {
  textMeasureCache.delete(key);
  textMeasureCache.set(key, width);
  while (textMeasureCache.size > MAX_TEXT_MEASURE_CACHE_SIZE) {
    const oldest = textMeasureCache.keys().next().value;
    if (oldest === undefined) break;
    textMeasureCache.delete(oldest);
  }
  return width;
}

function getTextMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!textMeasureContext) {
    textMeasureCanvas = textMeasureCanvas || document.createElement("canvas");
    textMeasureContext = textMeasureCanvas.getContext("2d");
  }
  return textMeasureContext;
}

function estimateTextLineWidth(text: string, fontSize: number, fontStyle: string, fontFamily: string, letterSpacing: number): number {
  const spacing = Math.max(0, Array.from(text).length - 1) * letterSpacing;
  const font = `${fontStyle} ${fontSize}px ${fontFamily}`;
  const cacheKey = `${font}\u0000${letterSpacing}\u0000${text}`;
  const cached = textMeasureCache.get(cacheKey);
  if (cached !== undefined) {
    textMeasureCache.delete(cacheKey);
    textMeasureCache.set(cacheKey, cached);
    return cached;
  }

  const context = getTextMeasureContext();
  if (context) {
    context.font = font;
    return rememberTextMeasurement(cacheKey, context.measureText(text).width + spacing);
  }

  let width = 0;
  for (const char of text) {
    if (char === " ") width += fontSize * 0.33;
    else if (/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u3000-\u9FFF]/u.test(char)) width += fontSize;
    else if (/[A-Z0-9]/u.test(char)) width += fontSize * 0.62;
    else width += fontSize * 0.54;
  }
  return rememberTextMeasurement(cacheKey, width + spacing);
}

function estimateLabelBox(
  text: string,
  fontSize: number,
  fontStyle: string,
  fontFamily: string,
  lineHeight: number,
  letterSpacing: number,
  padding: number,
): { width: number; height: number } {
  const lines = text.replace(/\\n/g, "\n").split("\n");
  const textWidth = Math.max(0, ...lines.map((line) => estimateTextLineWidth(line, fontSize, fontStyle, fontFamily, letterSpacing)));
  const lineCount = Math.max(1, lines.length);
  return {
    width: Math.max(1, Math.ceil(textWidth + padding * 2)),
    height: Math.max(1, Math.ceil(fontSize * lineHeight * lineCount + padding * 2)),
  };
}

function containRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): { x: number; y: number; width: number; height: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return { x: 0, y: 0, width: targetWidth, height: targetHeight };
  }
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  };
}

export function resolvedText(
  content: { text?: string | null; role?: string | null; source?: string | null },
  input: CarouselSlideRenderInput,
  blockName?: string | null,
): string {
  return resolveContentText(content, input.brand_config, input.asset_map, blockName);
}

export function AssetImage({ src, onReady, children }: AssetImageProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(() => cachedAssetImage(src));
  const [errored, setErrored] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    let cancelled = false;
    const markReady = () => {
      if (!firedRef.current) {
        firedRef.current = true;
        onReady();
      }
    };

    const cached = cachedAssetImage(src);
    if (cached) {
      setImage(cached);
      setErrored(false);
      markReady();
      return () => {
        cancelled = true;
      };
    }

    setImage(null);
    setErrored(false);
    loadAssetImage(src)
      .then((img) => {
        if (!cancelled) {
          setImage(img);
          setErrored(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImage(null);
          setErrored(true);
        }
      })
      .finally(() => {
        if (!cancelled) markReady();
      });

    return () => {
      cancelled = true;
    };
  }, [src, onReady]);

  return <>{children(image, errored)}</>;
}

function EmptyMediaBlock({ block }: { block: MediaBlock }) {
  return (
    <Rect
      name={block.id}
      x={numberValue(block.x, 0)}
      y={numberValue(block.y, 0)}
      width={numberValue(block.w, 0)}
      height={numberValue(block.h, 0)}
      rotation={numberValue(block.rotation, 0)}
      fill="rgba(0,0,0,0)"
      listening={false}
    />
  );
}

function VideoPlaceholder({ block, canvasBackground }: { block: MediaBlock; canvasBackground: string }) {
  const props = mediaContentToKonva(block.content);
  const width = numberValue(block.w, 400);
  const height = numberValue(block.h, 400);
  const iconSize = Math.min(width, height) * 0.18;
  const cx = width / 2;
  const cy = height / 2;
  return (
    <Group name={block.id} x={numberValue(block.x, 0)} y={numberValue(block.y, 0)} width={width} height={height} rotation={numberValue(block.rotation, 0)}>
      <Rect width={width} height={height} fill={canvasBackground || "#1a1a2e"} cornerRadius={props.cornerRadius} stroke={props.stroke} opacity={props.opacity} />
      <Line points={[cx - iconSize * 0.3, cy - iconSize * 0.5, cx + iconSize * 0.5, cy, cx - iconSize * 0.3, cy + iconSize * 0.5]} fill="#666666" closed listening={false} />
      <Text x={0} y={cy + iconSize * 0.8} width={width} text="영상 불러오는 중..." fontSize={Math.max(14, iconSize * 0.45)} fontFamily="Pretendard" fill="#666666" align="center" listening={false} />
    </Group>
  );
}

function RenderTextBlock({ block, input }: { block: TextBlock; input: CarouselSlideRenderInput }) {
  const props = textContentToKonva(block.content, resolvedText(block.content, input, block.name));
  const hasSegments = !!block.content.segments?.length;
  const textNode = hasSegments || textRequiresEmojiFont(resolveFontFamily(block.content.font_family), props.text) ? (
    <Shape
      width={block.w}
      height={block.h}
      sceneFunc={(ctx) => {
        const canvas = ctx._context as CanvasRenderingContext2D;
        const sourceFontFamily = resolveFontFamily(block.content.font_family);
        const fontForChar = (char: string, fontWeight: string | undefined = block.content.font_weight ?? "700") => {
          const segmentFontStyle = normalizeKonvaFontStyle(fontWeight, sourceFontFamily);
          const family = shouldUseEmojiFontForChar(sourceFontFamily, char) ? EMOJI_TEXT_FONT_FAMILY : sourceFontFamily;
          return `${segmentFontStyle} ${props.fontSize}px ${family}`;
        };
        const textFont = `${props.fontStyle} ${props.fontSize}px ${sourceFontFamily}`;
        canvas.textBaseline = "top";
        canvas.fillStyle = props.fill;
        if (props.shadow?.color) {
          canvas.shadowColor = props.shadow.color;
          canvas.shadowBlur = props.shadow.blur ?? 0;
          canvas.shadowOffsetX = 0;
          canvas.shadowOffsetY = props.shadow.offsetY ?? 0;
        }
        const lineHeightPx = props.fontSize * props.lineHeight;
        if (hasSegments) {
          canvas.font = textFont;
          const lines = buildSegmentedLines(
            canvas,
            props.text,
            block.content.segments ?? [],
            props.fill,
            block.w,
            props.letterSpacing,
            (char, fontWeight) => fontForChar(char, fontWeight),
          );
          for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i];
            const y = i * lineHeightPx;
            let x = 0;
            if (block.w > 0) {
              if (props.align === "center") x = (block.w - line.width) / 2;
              else if (props.align === "right") x = block.w - line.width;
            }
            for (const segment of line.segments) {
              canvas.fillStyle = segment.fill;
              for (const ch of splitGraphemes(segment.text)) {
                canvas.font = fontForChar(ch, segment.fontWeight ?? block.content.font_weight ?? "700");
                canvas.fillText(ch, x, y);
                x += canvas.measureText(ch).width + props.letterSpacing;
              }
            }
          }
        } else {
          canvas.font = textFont;
          const lines = buildSegmentedLines(
            canvas,
            props.text,
            [{ text: props.text }],
            props.fill,
            block.w,
            props.letterSpacing,
            (char, fontWeight) => fontForChar(char, fontWeight),
          );
          for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i];
            const y = i * lineHeightPx;
            let x = 0;
            if (block.w > 0) {
              if (props.align === "center") x = (block.w - line.width) / 2;
              else if (props.align === "right") x = block.w - line.width;
            }
            for (const segment of line.segments) {
              canvas.fillStyle = segment.fill;
              for (const ch of splitGraphemes(segment.text)) {
                canvas.font = fontForChar(ch, segment.fontWeight ?? block.content.font_weight ?? "700");
                canvas.fillText(ch, x, y);
                x += canvas.measureText(ch).width + props.letterSpacing;
              }
            }
          }
        }
      }}
      listening={false}
    />
  ) : (
    <Text
      width={block.w}
      text={props.text}
      fontSize={props.fontSize}
      fontFamily={props.fontFamily}
      fontStyle={props.fontStyle}
      fill={props.fill}
      textDecoration={props.textDecoration}
      shadowColor={props.shadow?.color}
      shadowBlur={props.shadow?.blur ?? 0}
      shadowOpacity={props.shadow?.opacity ?? 0}
      shadowOffsetX={0}
      shadowOffsetY={props.shadow?.offsetY ?? 0}
      align={props.align}
      lineHeight={props.lineHeight}
      letterSpacing={props.letterSpacing}
      wrap="word"
      listening={false}
    />
  );
  return (
    <Group name={block.id} x={numberValue(block.x, 0)} y={numberValue(block.y, 0)} width={block.w} height={block.h} rotation={numberValue(block.rotation, 0)} opacity={props.opacity}>
      <Rect width={block.w} height={block.h} fill="rgba(0,0,0,0)" cornerRadius={block.content.corner_radius ?? 0} listening={false} />
      {textNode}
    </Group>
  );
}

function RenderRectBlock({ block, input }: { block: RectBlock; input: CarouselSlideRenderInput }) {
  const props = rectContentToKonva(block.content);
  const text = resolvedText(block.content, input, block.name);
  const width = numberValue(block.w, 0);
  const height = numberValue(block.h, 0);
  const fontFamily = resolveFontFamily(block.content.font_family);
  return (
    <Group name={block.id} x={numberValue(block.x, 0)} y={numberValue(block.y, 0)} width={width} height={height} rotation={numberValue(block.rotation, 0)} opacity={props.opacity}>
      <Rect width={width} height={height} listening={false} {...props} opacity={undefined} />
      {text !== "" && (
        <Text
          width={width}
          height={height}
          text={text}
          fontSize={block.content.font_size ?? 24}
          fontFamily={fontFamily}
          fontStyle={normalizeKonvaFontStyle(block.content.font_weight ?? "700", fontFamily)}
          fill={block.content.color ?? "#FFFFFF"}
          textDecoration={block.content.text_decoration ?? undefined}
          align={block.content.align ?? "center"}
          verticalAlign="middle"
          lineHeight={block.content.line_height ?? 1.2}
          letterSpacing={block.content.letter_spacing ?? 0}
          listening={false}
        />
      )}
    </Group>
  );
}

type PresetKImageProps = React.ComponentProps<typeof KImage> & { preset?: string | null };

// KImage + image_preset 필터. Konva 필터는 node.cache()가 있어야 적용되므로
// 프리셋이 있을 때만 캐시를 잡고, 프리셋이 빠지면 캐시를 풀어 일반 경로로
// 되돌린다. 이미지는 AssetImage가 crossOrigin="anonymous"로 로드해 캔버스
// 오염(taint) 없이 캐시 가능하다.
export function PresetKImage({ preset, ...props }: PresetKImageProps) {
  const nodeRef = useRef<Konva.Image>(null);
  const values = imagePresetValues(preset);
  const crop = props.crop as { x: number; y: number; width: number; height: number } | undefined;
  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    if (values && props.image) {
      node.cache();
    } else if (node.isCached()) {
      node.clearCache();
    }
    node.getLayer()?.batchDraw();
  }, [
    values?.brightness,
    values?.contrast,
    values?.saturation,
    values?.hue,
    values?.luminance,
    props.image,
    props.width,
    props.height,
    crop?.x,
    crop?.y,
    crop?.width,
    crop?.height,
  ]);
  if (!values) return <KImage {...props} />;
  return (
    <KImage
      ref={nodeRef}
      {...props}
      filters={[Konva.Filters.Brighten, Konva.Filters.Contrast, Konva.Filters.HSL]}
      brightness={values.brightness}
      contrast={values.contrast}
      saturation={values.saturation}
      hue={values.hue ?? 0}
      luminance={values.luminance ?? 0}
    />
  );
}

function RenderImageBlock({ block, input, onReady }: { block: MediaBlock; input: CarouselSlideRenderInput; onReady: () => void }) {
  const src = resolveTemplateVars(block.content.src ?? "", input.brand_config, input.asset_map);
  const props = mediaContentToKonva(block.content);
  if (!src) return <EmptyMediaBlock block={block} />;
  return (
    <AssetImage src={src} onReady={onReady}>
      {(image) => {
        if (!image) return <EmptyMediaBlock block={block} />;
        const width = numberValue(block.w, image.naturalWidth || image.width || 0);
        const height = numberValue(block.h, image.naturalHeight || image.height || 0);
        if (props.fit === "contain") {
          const contained = containRect(image.naturalWidth || image.width || 0, image.naturalHeight || image.height || 0, width, height);
          return (
            <Group
              name={block.id}
              x={numberValue(block.x, 0)}
              y={numberValue(block.y, 0)}
              width={width}
              height={height}
              rotation={numberValue(block.rotation, 0)}
              opacity={props.opacity}
            >
              <Rect width={width} height={height} fill="rgba(0,0,0,0)" cornerRadius={props.cornerRadius} listening={false} />
              <PresetKImage
                preset={block.content.image_preset}
                x={contained.x}
                y={contained.y}
                width={contained.width}
                height={contained.height}
                image={image}
                cornerRadius={props.cornerRadius}
                listening={false}
              />
            </Group>
          );
        }
        const crop = coverCrop(image, width, height, props.focalX, props.focalY);
        return (
          <PresetKImage
            preset={block.content.image_preset}
            name={block.id}
            x={numberValue(block.x, 0)}
            y={numberValue(block.y, 0)}
            width={width}
            height={height}
            image={image}
            crop={{ x: crop.sx, y: crop.sy, width: crop.sw, height: crop.sh }}
            rotation={numberValue(block.rotation, 0)}
            opacity={props.opacity}
            cornerRadius={props.cornerRadius}
            listening={false}
          />
        );
      }}
    </AssetImage>
  );
}

function RenderEmojiBlock({ block, onReady }: { block: EmojiBlock; onReady: () => void }) {
  const props = emojiContentToKonva(block.content);
  const size = props.fontSize;
  const iconName = props.value.startsWith("lucide:") ? props.value.slice(7) : props.value;
  const src = props.kind === "icon"
    ? iconToDataUri(iconName, props.color, 2, size)
    : emojiToDataUri(props.value, Math.ceil(size * 2));
  if (!src) return null;
  return (
    <AssetImage src={src} onReady={onReady}>
      {(image) => (
        <Group name={block.id} x={numberValue(block.x, 0)} y={numberValue(block.y, 0)} width={block.w} height={block.h} rotation={numberValue(block.rotation, 0)} opacity={props.opacity}>
          <Rect width={block.w} height={block.h} fill="rgba(0,0,0,0)" listening={false} />
          {image && <KImage width={block.w || size} height={block.h || size} image={image} listening={false} />}
        </Group>
      )}
    </AssetImage>
  );
}

function RenderSvgBlock({ block, onReady }: { block: SvgBlock; onReady: () => void }) {
  const src = svgMarkupToDataUri(block.content.svg ?? "");
  const width = numberValue(block.w, 0);
  const height = numberValue(block.h, 0);
  if (!src) return null;
  return (
    <AssetImage src={src} onReady={onReady}>
      {(image) => (
        <Group name={block.id} x={numberValue(block.x, 0)} y={numberValue(block.y, 0)} width={width} height={height} rotation={numberValue(block.rotation, 0)} opacity={block.content.opacity ?? undefined}>
          <Rect width={width} height={height} fill="rgba(0,0,0,0)" listening={false} />
          {image && <KImage width={width} height={height} image={image} listening={false} />}
        </Group>
      )}
    </AssetImage>
  );
}

function RenderParticlesBlock({ block }: { block: ParticlesBlock }) {
  const content = block.content;
  const width = numberValue(block.w, 0);
  const height = numberValue(block.h, 0);
  const shape = content.shape ?? "dot";
  const particles = particleField(content, width, height);
  return (
    <Group
      name={block.id}
      x={numberValue(block.x, 0)}
      y={numberValue(block.y, 0)}
      width={width}
      height={height}
      rotation={numberValue(block.rotation, 0)}
      opacity={content.opacity ?? undefined}
    >
      {particles.map((p, i) => {
        if (shape === "star") {
          return (
            <Star key={i} x={p.x} y={p.y} numPoints={5} innerRadius={p.size * 0.4} outerRadius={p.size * 0.9} fill={p.color} rotation={p.rotation} listening={false} />
          );
        }
        if (shape === "confetti") {
          const h = Math.max(2, p.size * p.aspect);
          return (
            <Rect key={i} x={p.x} y={p.y} width={p.size} height={h} offsetX={p.size / 2} offsetY={h / 2} fill={p.color} rotation={p.rotation} cornerRadius={Math.min(p.size, h) * 0.35} listening={false} />
          );
        }
        return <Circle key={i} x={p.x} y={p.y} radius={p.size / 2} fill={p.color} listening={false} />;
      })}
    </Group>
  );
}

function RenderLabelBlock({ block, input }: { block: LabelBlock; input: CarouselSlideRenderInput }) {
  const props = labelContentToKonva(block.content, resolvedText(block.content, input, block.name));
  const paddingX = props.padding?.x ?? 8;
  const lineHeight = block.content.line_height ?? 1.2;
  const fallbackBox = estimateLabelBox(
    props.text,
    props.fontSize,
    props.fontStyle,
    props.fontFamily,
    lineHeight,
    props.letterSpacing,
    paddingX,
  );
  const storedW = numberValue(block.w, 0);
  const storedH = numberValue(block.h, 0);
  const w = isPositiveNumber(storedW) ? storedW : fallbackBox.width;
  const h = isPositiveNumber(storedH) ? storedH : fallbackBox.height;
  // 충실 렌더: 저장된 font_size·corner_radius를 그대로 쓴다(크기·모서리는 생성 시 worker가 구움).
  // verticalAlign만 순수 primitive로 — 박스 안 세로중앙(위치/크기를 바꾸지 않음).
  return (
    <Group name={block.id} x={numberValue(block.x, 0)} y={numberValue(block.y, 0)} rotation={numberValue(block.rotation, 0)}>
      <Rect
        width={w}
        height={h}
        fill={props.background || "transparent"}
        fillLinearGradientStartPoint={props.fillLinearGradientStartPoint}
        fillLinearGradientEndPoint={props.fillLinearGradientEndPoint}
        fillLinearGradientColorStops={props.fillLinearGradientColorStops}
        fillPriority={props.fillPriority}
        stroke={props.stroke}
        strokeWidth={props.strokeWidth}
        cornerRadius={props.cornerRadius}
        listening={false}
      />
      <Text
        width={w}
        height={h}
        text={props.text}
        fontSize={props.fontSize}
        fontFamily={props.fontFamily}
        fontStyle={props.fontStyle}
        fill={props.fill}
        align={props.align}
        verticalAlign="middle"
        lineHeight={lineHeight}
        letterSpacing={props.letterSpacing}
        padding={paddingX}
        listening={false}
      />
    </Group>
  );
}

export function CarouselBlockNode({
  block,
  input,
  onAssetReady,
}: {
  block: AnyBlock;
  input: CarouselSlideRenderInput;
  onAssetReady: () => void;
}) {
  switch (block.type) {
    case "text":
      return <RenderTextBlock block={block as TextBlock} input={input} />;
    case "media": {
      const mediaBlock = block as MediaBlock;
      if (mediaBlock.content.media_type === "image") return <RenderImageBlock block={mediaBlock} input={input} onReady={onAssetReady} />;
      if (mediaBlock.content.media_type === "video") return <VideoPlaceholder block={mediaBlock} canvasBackground={input.canvas_background ?? "#000000"} />;
      return null;
    }
    case "rect":
      return <RenderRectBlock block={block as RectBlock} input={input} />;
    case "emoji":
      return <RenderEmojiBlock block={block as EmojiBlock} onReady={onAssetReady} />;
    case "svg":
      return <RenderSvgBlock block={block as SvgBlock} onReady={onAssetReady} />;
    case "particles":
      return <RenderParticlesBlock block={block as ParticlesBlock} />;
    case "label":
      return <RenderLabelBlock block={block as LabelBlock} input={input} />;
    default:
      console.warn(`unsupported block type: ${block.type}`);
      return null;
  }
}

export function assetBlockCount(input: CarouselSlideRenderInput, blocks: AnyBlock[]): number {
  return blocks.filter((block) => {
    if (block.type === "emoji") {
      const content = block.content as EmojiBlock["content"];
      if ((content.kind ?? "emoji") === "icon") {
        const value = content.value ?? "";
        const iconName = value.startsWith("lucide:") ? value.slice(7) : value;
        return !!iconToDataUri(iconName, content.color ?? "#FFFFFF", 2, content.font_size ?? 80);
      }
      return true;
    }
    if (block.type === "svg") {
      // Baked SVG loads through AssetImage like an image, so it must be counted
      // in the ready-gate or the headless render can fire before it draws.
      return !!svgMarkupToDataUri((block.content as SvgBlock["content"]).svg ?? "");
    }
    if (block.type !== "media") return false;
    const content = block.content as MediaBlock["content"];
    return content.media_type === "image" && !!resolveTemplateVars(content.src ?? "", input.brand_config, input.asset_map);
  }).length;
}

/**
 * Full carousel slide on its own Konva Stage. Used directly by the headless
 * renderer; the editor composes CarouselBlockNode into its own Stage so it can
 * add a selection/transform overlay layer.
 *
 * onReady fires once every asset image has loaded and the stage has drawn
 * (double-rAF), passing the Konva Stage so the harness can export it to PNG.
 */
export function CarouselSlide({ input, onReady }: { input: CarouselSlideRenderInput; onReady?: (stage: any) => void }) {
  const width = Number(input.canvas_width || 1080);
  const height = Number(input.canvas_height || 1350);
  const stageRef = useRef<any>(null);
  const blocks = useMemo(
    () => snapBackgroundToCanvas(sortBlocksByZ(input.slide.blocks), width, height) as AnyBlock[],
    [height, input.slide.blocks, width],
  );
  const expectedAssets = useMemo(() => assetBlockCount(input, blocks), [input, blocks]);
  const [readyAssets, setReadyAssets] = useState(0);
  const firedRef = useRef(false);
  const onAssetReady = useCallback(() => setReadyAssets((count) => count + 1), []);

  useEffect(() => {
    if (firedRef.current || readyAssets < expectedAssets || !stageRef.current) return;
    firedRef.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      stageRef.current?.draw();
      if (stageRef.current && onReady) onReady(stageRef.current);
    }));
  }, [expectedAssets, onReady, readyAssets]);

  return (
    <Stage ref={stageRef} width={width} height={height}>
      <Layer>
        <Rect x={0} y={0} width={width} height={height} fill={input.canvas_background ?? "#000000"} listening={false} />
        {blocks.map((block) => (
          <CarouselBlockNode key={block.id} block={block} input={input} onAssetReady={onAssetReady} />
        ))}
      </Layer>
    </Stage>
  );
}
