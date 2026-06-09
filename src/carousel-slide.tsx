// Carousel block → react-konva render core (pure, browser + headless safe).
// Extracted verbatim from leviosa-rendering-server/src/carousel-renderer-entry.tsx
// so the editor and the headless renderer draw blocks identically. The headless
// harness (font preload, createRoot mount, Stage→PNG export, window global) stays
// in leviosa-rendering-server and imports CarouselSlide from this package.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Text } from "react-konva";
import {
  emojiContentToKonva,
  labelContentToKonva,
  mediaContentToKonva,
  rectContentToKonva,
  sortBlocksByZ,
  textContentToKonva,
} from "./carousel-content-to-konva.js";
import { resolveSlideNumberText, resolveTemplateVars } from "./carousel-template-vars.js";
import type {
  Block,
  CarouselSlideRenderInput,
  EmojiBlock,
  LabelBlock,
  MediaBlock,
  RectBlock,
  TextBlock,
} from "./carousel-types.js";
import {
  coverCrop,
  emojiToDataUri,
  EMOJI_TEXT_FONT_FAMILY,
  normalizeKonvaFontStyle,
} from "./konva-render-helpers.js";
import { iconToDataUri } from "./lucide-icons.js";
import { resolveFontFamily, shouldUseEmojiFontForChar, textRequiresEmojiFont } from "./font-coverage.js";
import { buildSegmentedLines } from "./segmented-text.js";

export type AnyBlock = Omit<Block, "type" | "content"> & { type: string; content: Record<string, any> };

interface AssetImageProps {
  src: string;
  onReady: () => void;
  children: (image: HTMLImageElement | null, errored: boolean) => React.ReactNode;
}

export function numberValue(value: unknown, fallback: number): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function fontSampleForValue(value: string): string {
  const rawSample = value.replace(/\\n/g, "\n").trim();
  return rawSample || "가Aa1";
}

function isNumberingBlock(
  blockName: string | null | undefined,
  content: { role?: string | null; source?: string | null },
): boolean {
  return blockName === "content_number" || content.role === "content_number" || content.source === "slide.number";
}

export function resolvedText(
  content: { text?: string | null; role?: string | null; source?: string | null },
  input: CarouselSlideRenderInput,
  blockName?: string | null,
): string {
  if (isNumberingBlock(blockName, content)) {
    return resolveSlideNumberText(content.text ?? "", {
      slide_number: input.slide_number,
      slide_count: input.slide_count,
    });
  }
  return resolveTemplateVars(content.text ?? "", input.brand_config, input.asset_map);
}

export function AssetImage({ src, onReady, children }: AssetImageProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [errored, setErrored] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) {
        setImage(img);
        setErrored(false);
      }
      if (!firedRef.current) {
        firedRef.current = true;
        onReady();
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setImage(null);
        setErrored(true);
      }
      if (!firedRef.current) {
        firedRef.current = true;
        onReady();
      }
    };
    img.src = src;
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
        const textFont = `${props.fontStyle} ${props.fontSize}px ${sourceFontFamily}`;
        const emojiFont = `${props.fontStyle} ${props.fontSize}px ${EMOJI_TEXT_FONT_FAMILY}`;
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
              const segmentFontStyle = normalizeKonvaFontStyle(segment.fontWeight ?? block.content.font_weight ?? "700", sourceFontFamily);
              const segmentTextFont = `${segmentFontStyle} ${props.fontSize}px ${sourceFontFamily}`;
              const segmentEmojiFont = `${segmentFontStyle} ${props.fontSize}px ${EMOJI_TEXT_FONT_FAMILY}`;
              for (const ch of segment.text) {
                canvas.font = shouldUseEmojiFontForChar(sourceFontFamily, ch) ? segmentEmojiFont : segmentTextFont;
                canvas.fillText(ch, x, y);
                x += canvas.measureText(ch).width + props.letterSpacing;
              }
            }
          }
        } else {
          let x = 0;
          let y = 0;
          for (const ch of props.text) {
            if (ch === "\n") {
              x = 0;
              y += lineHeightPx;
              continue;
            }
            canvas.font = shouldUseEmojiFontForChar(sourceFontFamily, ch) ? emojiFont : textFont;
            const width = canvas.measureText(ch).width + props.letterSpacing;
            if (block.w > 0 && x > 0 && x + width > block.w && ch !== " ") {
              x = 0;
              y += lineHeightPx;
            }
            canvas.fillText(ch, x, y);
            x += width;
          }
        }
      }}
      listening={false}
    />
  ) : (
    <Text
      width={block.w}
      height={block.h}
      text={props.text}
      fontSize={props.fontSize}
      fontFamily={props.fontFamily}
      fontStyle={props.fontStyle}
      fill={props.fill}
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
  const text = isNumberingBlock(block.name, block.content)
    ? resolveSlideNumberText(block.content.text ?? "", {
        slide_number: input.slide_number,
        slide_count: input.slide_count,
      })
    : block.content.text ?? "";
  const width = numberValue(block.w, 0);
  const height = numberValue(block.h, 0);
  const fontFamily = resolveFontFamily(block.content.font_family);
  return (
    <Group name={block.id} x={numberValue(block.x, 0)} y={numberValue(block.y, 0)} width={width} height={height} rotation={numberValue(block.rotation, 0)} opacity={props.opacity}>
      <Rect width={width} height={height} listening={false} {...props} opacity={undefined} />
      {text && (
        <Text
          width={width}
          height={height}
          text={text}
          fontSize={block.content.font_size ?? 24}
          fontFamily={fontFamily}
          fontStyle={normalizeKonvaFontStyle(block.content.font_weight ?? "700", fontFamily)}
          fill={block.content.color ?? "#FFFFFF"}
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
        const crop = coverCrop(image, width, height, props.focalX, props.focalY);
        return (
          <KImage
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

function RenderLabelBlock({ block, input }: { block: LabelBlock; input: CarouselSlideRenderInput }) {
  const props = labelContentToKonva(block.content, resolvedText(block.content, input, block.name));
  const paddingX = props.padding?.x ?? 8;
  const w = numberValue(block.w, 0);
  const h = numberValue(block.h, 0);
  // 충실 렌더: 저장된 font_size·corner_radius를 그대로 쓴다(크기·모서리는 생성 시 worker가 구움).
  // verticalAlign만 순수 primitive로 — 박스 안 세로중앙(위치/크기를 바꾸지 않음).
  return (
    <Group name={block.id} x={numberValue(block.x, 0)} y={numberValue(block.y, 0)} rotation={numberValue(block.rotation, 0)}>
      <Rect
        width={w}
        height={h}
        fill={props.background || "transparent"}
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
        lineHeight={block.content.line_height ?? 1.2}
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
  const blocks = useMemo(() => sortBlocksByZ(input.slide.blocks) as AnyBlock[], [input.slide.blocks]);
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
