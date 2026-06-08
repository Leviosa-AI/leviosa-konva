import { describe, expect, it } from "vitest";
import { rectContentToKonva } from "./carousel-content-to-konva.js";
import type { RectContent } from "./carousel-types.js";

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
});
