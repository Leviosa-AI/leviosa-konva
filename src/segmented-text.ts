import type { TextSegment } from "./carousel-types.js";

export interface SegmentedTextLine {
  segments: Array<{ text: string; fill: string; fontWeight?: string }>;
  width: number;
}

type StyledChar = { char: string; fill: string; fontWeight?: string };
type FontResolver = (char: string, fontWeight: string | undefined, originalFont: string) => string;

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

function measureSegmentChars(
  ctx: CanvasRenderingContext2D,
  chars: StyledChar[],
  letterSpacing: number,
  resolveFont?: FontResolver,
): number {
  let width = 0;
  const originalFont = ctx.font;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    ctx.font = resolveFont
      ? resolveFont(ch.char, ch.fontWeight, originalFont)
      : fontWithWeight(originalFont, ch.fontWeight);
    width += ctx.measureText(ch.char).width + letterSpacing;
  }
  if (chars.length > 0) width -= letterSpacing;
  ctx.font = originalFont;
  return width;
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
  const segmentText = segments.map((segment) => segment.text).join("");
  const segmentChars = splitGraphemes(segmentText);
  const charFills: string[] = [];
  const charFontWeights: Array<string | undefined> = [];
  let segmentCharIndex = 0;

  for (const char of displayChars) {
    if (char === "\n") {
      charFills.push(defaultFill);
      charFontWeights.push(undefined);
      segmentCharIndex += 1;
      continue;
    }

    if (segmentCharIndex < segmentChars.length) {
      let cumulativeLength = 0;
      let fill = defaultFill;
      let fontWeight: string | undefined;
      for (const segment of segments) {
        const segmentLength = splitGraphemes(segment.text).length;
        if (segmentCharIndex < cumulativeLength + segmentLength) {
          fill = segment.color ?? defaultFill;
          fontWeight = segment.font_weight ?? undefined;
          break;
        }
        cumulativeLength += segmentLength;
      }
      charFills.push(fill);
      charFontWeights.push(fontWeight);
      segmentCharIndex += 1;
    } else {
      charFills.push(defaultFill);
      charFontWeights.push(undefined);
    }
  }

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
    if (!containerWidth || containerWidth <= 0) {
      result.push({
        segments: mergeAdjacentSegments(hardLine),
        width: measureSegmentChars(ctx, hardLine, letterSpacing, resolveFont),
      });
      continue;
    }

    let currentLine: StyledChar[] = [];
    let currentWidth = 0;
    let wordBuffer: StyledChar[] = [];
    let wordWidth = 0;
    const originalFont = ctx.font;

    const flushWord = () => {
      if (wordBuffer.length === 0) return;
      const testWidth = currentLine.length > 0 ? currentWidth + wordWidth : wordWidth;
      if (currentLine.length > 0 && testWidth > containerWidth) {
        result.push({ segments: mergeAdjacentSegments(currentLine), width: currentWidth });
        currentLine = [...wordBuffer];
        currentWidth = wordWidth;
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
      const charWidth = ctx.measureText(ch.char).width + (wordBuffer.length > 0 ? letterSpacing : 0);
      if (ch.char === " ") {
        flushWord();
        currentLine.push(ch);
        currentWidth += (currentLine.length > 1 ? letterSpacing : 0) + ctx.measureText(ch.char).width;
      } else {
        wordBuffer.push(ch);
        wordWidth += charWidth;
      }
    }
    ctx.font = originalFont;
    flushWord();

    if (currentLine.length > 0 || result.length === 0) {
      result.push({ segments: mergeAdjacentSegments(currentLine), width: currentWidth });
    }
  }

  return result;
}
