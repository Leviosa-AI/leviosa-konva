import type { TextSegment } from "./carousel-types.js";

export interface SegmentedTextLine {
  segments: Array<{ text: string; fill: string; fontWeight?: string }>;
  width: number;
}

type StyledChar = { char: string; fill: string; fontWeight?: string };

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
): number {
  let width = 0;
  const originalFont = ctx.font;
  for (const ch of chars) {
    ctx.font = fontWithWeight(originalFont, ch.fontWeight);
    width += ctx.measureText(ch.char).width + letterSpacing;
  }
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
): SegmentedTextLine[] {
  const segmentText = segments.map((segment) => segment.text).join("");
  const charFills: string[] = [];
  const charFontWeights: Array<string | undefined> = [];
  let segmentCharIndex = 0;

  for (let i = 0; i < displayText.length; i += 1) {
    if (displayText[i] === "\n") {
      charFills.push(defaultFill);
      charFontWeights.push(undefined);
      segmentCharIndex += 1;
      continue;
    }

    if (segmentCharIndex < segmentText.length) {
      let cumulativeLength = 0;
      let fill = defaultFill;
      let fontWeight: string | undefined;
      for (const segment of segments) {
        if (segmentCharIndex < cumulativeLength + segment.text.length) {
          fill = segment.color ?? defaultFill;
          fontWeight = segment.font_weight ?? undefined;
          break;
        }
        cumulativeLength += segment.text.length;
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
  for (let i = 0; i < displayText.length; i += 1) {
    if (displayText[i] === "\n") {
      hardLines.push([]);
    } else {
      hardLines[hardLines.length - 1].push({
        char: displayText[i],
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
        width: measureSegmentChars(ctx, hardLine, letterSpacing),
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
      ctx.font = fontWithWeight(originalFont, ch.fontWeight);
      const charWidth = ctx.measureText(ch.char).width + letterSpacing;
      if (ch.char === " ") {
        flushWord();
        currentLine.push(ch);
        currentWidth += charWidth;
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
