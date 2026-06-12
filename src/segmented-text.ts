import type { TextSegment } from "./carousel-types.js";

export interface SegmentedTextLine {
  segments: Array<{ text: string; fill: string; fontWeight?: string }>;
  width: number;
}

type StyledChar = { char: string; fill: string; fontWeight?: string };
type FontResolver = (char: string, fontWeight: string | undefined, originalFont: string) => string;
const NON_ORPHAN_PREFIX_MARKERS = new Set(["✓", "✔", "✅", "☑", "☑️", "•"]);

const graphemeSegmenter = typeof Intl !== "undefined" && "Segmenter" in Intl
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

export function splitGraphemes(text: string): string[] {
  if (!text) return [];
  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(text), (segment) => segment.segment);
  }
  return Array.from(text);
}

function fontWithWeight(font: string, fontWeight?: string): string {
  if (!fontWeight) return font;
  const normalized = String(fontWeight);
  const replaced = font.replace(/^(\S+)(?=\s+\d+(?:\.\d+)?px)/, normalized);
  return replaced === font ? `${normalized} ${font}` : replaced;
}

function mergeAdjacentSegments(chars: StyledChar[]): SegmentedTextLine["segments"] {
  if (chars.length === 0) return [];
  const result: SegmentedTextLine["segments"] = [];
  let current = { text: chars[0].char, fill: chars[0].fill, fontWeight: chars[0].fontWeight };
  for (let i = 1; i < chars.length; i += 1) {
    if (chars[i].fill === current.fill && chars[i].fontWeight === current.fontWeight) {
      current.text += chars[i].char;
    } else {
      result.push(current);
      current = { text: chars[i].char, fill: chars[i].fill, fontWeight: chars[i].fontWeight };
    }
  }
  result.push(current);
  return result;
}

function isMarkerOnlyLine(chars: StyledChar[]): boolean {
  return NON_ORPHAN_PREFIX_MARKERS.has(chars.map((ch) => ch.char).join("").trim());
}

function measureSegmentChars(
  ctx: CanvasRenderingContext2D,
  chars: StyledChar[],
  letterSpacing: number,
  resolveFont?: FontResolver,
  measureCache?: Map<string, number>,
): number {
  let width = 0;
  const originalFont = ctx.font;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const font = resolveFont
      ? resolveFont(ch.char, ch.fontWeight, originalFont)
      : fontWithWeight(originalFont, ch.fontWeight);
    const cacheKey = `${font}\u0000${ch.char}`;
    let measured = measureCache?.get(cacheKey);
    if (measured === undefined) {
      ctx.font = font;
      measured = ctx.measureText(ch.char).width;
      measureCache?.set(cacheKey, measured);
    }
    width += measured + letterSpacing;
  }
  if (chars.length > 0) width -= letterSpacing;
  ctx.font = originalFont;
  return width;
}

function segmentStyles(
  displayChars: string[],
  segments: TextSegment[],
  defaultFill: string,
): { fills: string[]; fontWeights: Array<string | undefined> } {
  const fills: string[] = [];
  const fontWeights: Array<string | undefined> = [];
  const segmentRanges = segments.map((segment) => ({
    length: splitGraphemes(segment.text).length,
    fill: segment.color ?? defaultFill,
    fontWeight: segment.font_weight ?? undefined,
  }));
  let segmentIndex = 0;
  let segmentOffset = 0;

  for (const char of displayChars) {
    if (char === "\n") {
      fills.push(defaultFill);
      fontWeights.push(undefined);
      segmentOffset += 1;
    } else if (segmentIndex < segmentRanges.length) {
      while (segmentIndex < segmentRanges.length && segmentOffset >= segmentRanges[segmentIndex].length) {
        segmentOffset = 0;
        segmentIndex += 1;
      }
      const range = segmentRanges[segmentIndex];
      fills.push(range?.fill ?? defaultFill);
      fontWeights.push(range?.fontWeight);
      segmentOffset += 1;
    } else {
      fills.push(defaultFill);
      fontWeights.push(undefined);
    }
  }

  return { fills, fontWeights };
}

export function buildSegmentedLines(
  ctx: CanvasRenderingContext2D,
  displayText: string,
  segments: TextSegment[],
  defaultFill: string,
  containerWidth: number,
  letterSpacing: number,
  resolveFont?: FontResolver,
): SegmentedTextLine[] {
  const displayChars = splitGraphemes(displayText);
  const { fills: charFills, fontWeights: charFontWeights } = segmentStyles(displayChars, segments, defaultFill);
  const measureCache = new Map<string, number>();

  const hardLines: StyledChar[][] = [[]];
  for (let i = 0; i < displayChars.length; i += 1) {
    if (displayChars[i] === "\n") {
      hardLines.push([]);
    } else {
      hardLines[hardLines.length - 1].push({
        char: displayChars[i],
        fill: charFills[i],
        fontWeight: charFontWeights[i],
      });
    }
  }

  const result: SegmentedTextLine[] = [];
  for (const hardLine of hardLines) {
    if (hardLine.length === 0) {
      result.push({ segments: [], width: 0 });
      continue;
    }

    if (!containerWidth || containerWidth <= 0) {
      result.push({
        segments: mergeAdjacentSegments(hardLine),
        width: measureSegmentChars(ctx, hardLine, letterSpacing, resolveFont, measureCache),
      });
      continue;
    }

    let currentLine: StyledChar[] = [];
    let currentWidth = 0;
    let wordBuffer: StyledChar[] = [];
    let wordWidth = 0;
    const originalFont = ctx.font;
    const pushCurrentLine = () => {
      while (currentLine.at(-1)?.char === " ") currentLine.pop();
      result.push({
        segments: mergeAdjacentSegments(currentLine),
        width: measureSegmentChars(ctx, currentLine, letterSpacing, resolveFont, measureCache),
      });
    };

    const flushWord = () => {
      if (wordBuffer.length === 0) return;
      const testWidth = currentLine.length > 0 ? currentWidth + wordWidth : wordWidth;
      if (currentLine.length > 0 && testWidth > containerWidth) {
        if (isMarkerOnlyLine(currentLine)) {
          currentLine.push(...wordBuffer);
          currentWidth = testWidth;
        } else {
          pushCurrentLine();
          currentLine = [...wordBuffer];
          currentWidth = wordWidth;
        }
      } else {
        currentLine.push(...wordBuffer);
        currentWidth = testWidth;
      }
      wordBuffer = [];
      wordWidth = 0;
    };

    for (const ch of hardLine) {
      ctx.font = resolveFont
        ? resolveFont(ch.char, ch.fontWeight, originalFont)
        : fontWithWeight(originalFont, ch.fontWeight);
      const cacheKey = `${ctx.font}\u0000${ch.char}`;
      let measured = measureCache.get(cacheKey);
      if (measured === undefined) {
        measured = ctx.measureText(ch.char).width;
        measureCache.set(cacheKey, measured);
      }
      const charWidth = measured + (wordBuffer.length > 0 ? letterSpacing : 0);
      if (ch.char === " ") {
        if (isMarkerOnlyLine(wordBuffer)) {
          wordBuffer.push(ch);
          wordWidth += charWidth;
        } else {
          flushWord();
          currentLine.push(ch);
          currentWidth += (currentLine.length > 1 ? letterSpacing : 0) + measured;
        }
      } else {
        wordBuffer.push(ch);
        wordWidth += charWidth;
      }
    }
    ctx.font = originalFont;
    flushWord();

    if (currentLine.length > 0) {
      pushCurrentLine();
    }
  }

  return result;
}
