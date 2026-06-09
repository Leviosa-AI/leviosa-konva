import { describe, expect, it } from "vitest";
import { emojiContentToKonva, rectContentToKonva } from "./carousel-content-to-konva.js";
import type { RectContent } from "./carousel-types.js";
import { buildSegmentedLines } from "./segmented-text.js";

describe("rectContentToKonva", () => {
  it("forces linear-gradient fillPriority so a gradient overlay is not hidden by a solid fill", () => {
    // The "그라데이션" darkening overlay: solid #000000 fill + a
    // transparent→30%-black gradient. Without fillPriority, Konva defaults to
    // "color" and the opaque fill wins → black slide regression.
    const content: RectContent = {
      fill: "#000000",
      alpha: 1.0,
      fill_linear_gradient: {
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        color_stops: [
          { offset: 0, color: "rgba(0,0,0,0.00)" },
          { offset: 1, color: "rgba(0,0,0,0.30)" },
        ],
      },
    };

    const props = rectContentToKonva(content);

    expect(props.fillPriority).toBe("linear-gradient");
    expect(props.fillLinearGradientColorStops).toEqual([
      0,
      "rgba(0,0,0,0.00)",
      1,
      "rgba(0,0,0,0.30)",
    ]);
  });

  it("does not set fillPriority for a plain solid-fill rect (no gradient)", () => {
    const content: RectContent = { fill: "#FF0000", alpha: 1.0 };
    const props = rectContentToKonva(content);

    expect(props.fill).toBe("#FF0000");
    expect((props as Record<string, unknown>).fillPriority).toBeUndefined();
    expect((props as Record<string, unknown>).fillLinearGradientColorStops).toBeUndefined();
  });

  it("uses the editor white-stroke fallback when strokeWidth exists without a stroke color", () => {
    const props = rectContentToKonva({ fill: "rgba(0,0,0,0.5)", stroke_width: 3 });

    expect(props.stroke).toBe("#FFFFFF");
    expect(props.strokeWidth).toBe(3);
  });
});

describe("emojiContentToKonva", () => {
  it("defaults missing runtime emoji values to an empty string", () => {
    const props = emojiContentToKonva({ kind: "icon" });

    expect(props.value).toBe("");
    expect(props.kind).toBe("icon");
  });
});

describe("buildSegmentedLines", () => {
  it("maps carousel content segments to per-segment fills and font weights", () => {
    const ctx = {
      font: "700 24px Pretendard",
      measureText: (value: string) => ({ width: value === " " ? 4 : 10 }),
    } as unknown as CanvasRenderingContext2D;

    const lines = buildSegmentedLines(
      ctx,
      "Hello AI",
      [
        { text: "Hello " },
        { text: "AI", color: "#FF0000", font_weight: "900" },
      ],
      "#FFFFFF",
      200,
      0,
    );

    expect(lines).toEqual([
      {
        width: 74,
        segments: [
          { text: "Hello ", fill: "#FFFFFF", fontWeight: undefined },
          { text: "AI", fill: "#FF0000", fontWeight: "900" },
        ],
      },
    ]);
  });
});
