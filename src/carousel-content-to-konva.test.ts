import { describe, expect, it } from "vitest";
import { emojiContentToKonva, labelContentToKonva, rectContentToKonva, sortBlocksByZ } from "./carousel-content-to-konva.js";
import { resolveContentText, resolveSlideNumberText, resolveTemplateVars } from "./carousel-template-vars.js";
import type { RectContent, Slide } from "./carousel-types.js";
import { buildSegmentedLines, splitGraphemes } from "./segmented-text.js";

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

describe("labelContentToKonva", () => {
  it("keeps content.align as the source of truth when contrast fallback changes fill", () => {
    const props = labelContentToKonva({
      text: "CTA",
      color: "#111111",
      background: "#111111",
      align: "right",
    }, "CTA");

    expect(props.fill).not.toBe("#111111");
    expect(props.align).toBe("right");
  });

  it("preserves label background gradients as the rect fill priority", () => {
    const props = labelContentToKonva({
      text: "NEW",
      color: "#FFFFFF",
      background: "#111111",
      fill_linear_gradient: {
        start: { x: 0, y: 0 },
        end: { x: 72, y: 0 },
        color_stops: [
          { offset: 0, color: "#111111" },
          { offset: 1, color: "#333333" },
        ],
      },
    }, "NEW");

    expect(props.fillPriority).toBe("linear-gradient");
    expect(props.fillLinearGradientColorStops).toEqual([0, "#111111", 1, "#333333"]);
  });
});

describe("carousel slide render input", () => {
  it("resolves brand variables for rect text slots", () => {
    expect(resolveContentText(
      { text: "{{theme.name}}" },
      { brand_name: "LEVIO사" },
    )).toBe("LEVIO사");
  });

  it("resolves legacy and semantic brand aliases used by templates", () => {
    const brandConfig = {
      name: "Leviosa",
      ig_handle: "leviosa.ai",
      brand_logo_url: "https://cdn.example.com/logo.png",
      tagline: "AI marketing",
      cta_text: "Visit",
    };

    expect(resolveTemplateVars("{{theme.brand_name}}", brandConfig)).toBe("Leviosa");
    expect(resolveTemplateVars("{{theme.name}}", brandConfig)).toBe("Leviosa");
    expect(resolveTemplateVars("{{theme.account}}", brandConfig)).toBe("leviosa.ai");
    expect(resolveTemplateVars("{{theme.brand_handle}}", brandConfig)).toBe("leviosa.ai");
    expect(resolveTemplateVars("{{theme.logo_url}}", brandConfig)).toBe("https://cdn.example.com/logo.png");
    expect(resolveTemplateVars("{{theme.brand_image_url}}", brandConfig)).toBe("https://cdn.example.com/logo.png");
    expect(resolveTemplateVars("{{theme.brand_tagline}}", brandConfig)).toBe("AI marketing");
    expect(resolveTemplateVars("{{theme.tagline}}", brandConfig)).toBe("AI marketing");
  });

  it("resolves plain brand placeholders used by older templates", () => {
    const brandConfig = {
      name: "Leviosa",
      ig_handle: "leviosa.ai",
      brand_logo_url: "https://cdn.example.com/logo.png",
      tagline: "AI marketing",
      cta_text: "Visit",
    };

    expect(resolveTemplateVars("{{brand_name}}", brandConfig)).toBe("Leviosa");
    expect(resolveTemplateVars("{{ name }}", brandConfig)).toBe("Leviosa");
    expect(resolveTemplateVars("{{brand_handle}}", brandConfig)).toBe("leviosa.ai");
    expect(resolveTemplateVars("{{brand_logo}}", brandConfig)).toBe("https://cdn.example.com/logo.png");
    expect(resolveTemplateVars("{{brand_logo_url}}", brandConfig)).toBe("https://cdn.example.com/logo.png");
    expect(resolveTemplateVars("{{brand_tagline}}", brandConfig)).toBe("AI marketing");
    expect(resolveTemplateVars("{{brand_cta}}", brandConfig)).toBe("Visit");
    expect(resolveTemplateVars("{{headline}}", brandConfig)).toBe("{{headline}}");
  });

  it("uses readable placeholders when text brand variables are unset", () => {
    expect(resolveTemplateVars("{{theme.name}}", null)).toBe("브랜드명");
    expect(resolveTemplateVars("{{theme.brand_name}}", {})).toBe("브랜드명");
    expect(resolveTemplateVars("{{theme.account}}", {})).toBe("@brand");
    expect(resolveTemplateVars("{{brand_handle}}", null)).toBe("@brand");
    expect(resolveTemplateVars("{{theme.tagline}}", {})).toBe("브랜드 소개");
    expect(resolveTemplateVars("{{theme.cta_text}}", {})).toBe("자세히 보기");
    expect(resolveTemplateVars("{{theme.logo_url}}", {})).toBe("");
    expect(resolveTemplateVars("{{headline}}", {})).toBe("{{headline}}");
  });

  it("keeps generated body-relative content_number text instead of replacing it with absolute slide_number", () => {
    expect(resolveSlideNumberText("1")).toBe("1");
  });

  it("never derives a number from slide index — empty stored text stays empty", () => {
    expect(resolveSlideNumberText("")).toBe("");
    expect(resolveSlideNumberText(undefined)).toBe("");
  });

  it("accepts and ignores optional slide_type_key while rendering blocks", () => {
    const slide: Slide = {
      id: "slide-1",
      slide_type_key: "content_card",
      blocks: [
        {
          id: "text-1",
          type: "text",
          z: 2,
          x: 0,
          y: 0,
          w: 100,
          h: 40,
          rotation: 0,
          locked: false,
          content: { text: "본문" },
        },
        {
          id: "rect-1",
          type: "rect",
          z: 1,
          x: 0,
          y: 0,
          w: 100,
          h: 40,
          rotation: 0,
          locked: false,
          content: { fill: "#000000" },
        },
      ],
    };

    expect(sortBlocksByZ(slide.blocks).map((block) => block.id)).toEqual(["rect-1", "text-1"]);
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

  it("keeps emoji grapheme clusters intact for centered line width calculations", () => {
    const widths: Record<string, number> = {
      "✔": 18,
      " ": 4,
      "빅": 20,
      "키": 20,
      "워": 20,
      "드": 20,
      "물": 20,
      "빵": 20,
    };
    const ctx = {
      font: "700 20px Noto Sans KR",
      measureText: (value: string) => ({ width: widths[value] ?? 10 }),
    } as unknown as CanvasRenderingContext2D;

    const lines = buildSegmentedLines(
      ctx,
      "✔ 빅키워드 물빵",
      [{ text: "✔ 빅키워드 물빵" }],
      "#FFFFFF",
      300,
      0,
    );

    expect(splitGraphemes("✔ 빅키워드 물빵")).toEqual(["✔", " ", "빅", "키", "워", "드", " ", "물", "빵"]);
    expect(lines[0].segments[0].text).toBe("✔ 빅키워드 물빵");
    expect(lines[0].width).toBe(146);
  });

  it("preserves consecutive hard line breaks as empty visual lines", () => {
    const ctx = {
      font: "700 20px Noto Sans KR",
      measureText: (value: string) => ({ width: value === " " ? 4 : 10 }),
    } as unknown as CanvasRenderingContext2D;

    const lines = buildSegmentedLines(
      ctx,
      "첫 줄\n\n✅ 둘째 항목\n",
      [{ text: "첫 줄\n\n✅ 둘째 항목\n" }],
      "#FFFFFF",
      300,
      0,
    );

    expect(lines).toHaveLength(4);
    expect(lines[0].segments[0].text).toBe("첫 줄");
    expect(lines[1]).toEqual({ segments: [], width: 0 });
    expect(lines[2].segments[0].text).toBe("✅ 둘째 항목");
    expect(lines[3]).toEqual({ segments: [], width: 0 });
  });

  it("keeps checklist markers attached to the following word when wrapping", () => {
    const widths: Record<string, number> = {
      "앞": 20,
      " ": 4,
      "✓": 12,
      "D": 14,
      "+": 8,
      "1": 10,
      ":": 4,
      "검": 20,
      "색": 20,
    };
    const ctx = {
      font: "700 20px Noto Sans KR",
      measureText: (value: string) => ({ width: widths[value] ?? 10 }),
    } as unknown as CanvasRenderingContext2D;

    const lines = buildSegmentedLines(
      ctx,
      "앞 ✓ D+1: 검색",
      [{ text: "앞 ✓ D+1: 검색" }],
      "#FFFFFF",
      32,
      0,
    );

    expect(lines.map((line) => line.segments.map((segment) => segment.text).join(""))).toEqual(["앞", "✓ D+1:", "검색"]);
  });
});
