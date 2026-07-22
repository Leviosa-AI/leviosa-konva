import { describe, expect, it } from "vitest";
import { emojiContentToKonva, labelContentToKonva, mediaContentToKonva, particleField, rectContentToKonva, sortBlocksByZ, textContentToKonva } from "./carousel-content-to-konva.js";
import { TEXT_SHADOW_OFFSET_Y, TEXT_SHADOW_OPACITY } from "./konva-render-helpers.js";
import { isBrandLogoToken, resolveContentText, resolveSlideNumberText, resolveTemplateVars } from "./carousel-template-vars.js";
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

describe("textContentToKonva highlight", () => {
  it("has no highlight by default", () => {
    const props = textContentToKonva({ text: "x" }, "x");
    expect(props.highlightColor).toBeNull();
    expect(props.highlightOpacity).toBe(0.4);
  });

  it("passes highlight color through and defaults opacity to 0.4", () => {
    const props = textContentToKonva({ text: "x", highlight_color: "#FFE24D" }, "x");
    expect(props.highlightColor).toBe("#FFE24D");
    expect(props.highlightOpacity).toBe(0.4);
  });

  it("respects an explicit highlight opacity", () => {
    const props = textContentToKonva({ text: "x", highlight_color: "#FFE24D", highlight_opacity: 0.65 }, "x");
    expect(props.highlightOpacity).toBe(0.65);
  });
});

describe("textContentToKonva shadow", () => {
  it("emits no shadow when the 음영 slider is at the minimum (size 0)", () => {
    // Slider min must mean "음영 아예 없음" — not a residual offset/opacity drop line.
    const props = textContentToKonva({ text_shadow_color: "#000000", text_shadow_size: 0 }, "x");
    expect(props.shadow).toBeNull();
  });

  it("emits no shadow when size is absent", () => {
    const props = textContentToKonva({ text_shadow_color: "#000000" }, "x");
    expect(props.shadow).toBeNull();
  });

  it("emits the shadow with the slider size as blur when size > 0", () => {
    const props = textContentToKonva({ text_shadow_color: "#FFFFFF", text_shadow_size: 8 }, "x");
    expect(props.shadow).toEqual({
      color: "#FFFFFF",
      blur: 8,
      opacity: TEXT_SHADOW_OPACITY,
      offsetY: TEXT_SHADOW_OFFSET_Y,
    });
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

  it("carries per-segment highlight only on the highlighted range (word-style range)", () => {
    const ctx = {
      font: "700 24px Pretendard",
      measureText: (value: string) => ({ width: value === " " ? 4 : 10 }),
    } as unknown as CanvasRenderingContext2D;

    const lines = buildSegmentedLines(
      ctx,
      "before mid after",
      [
        { text: "before " },
        { text: "mid", highlight_color: "#FFE24D" },
        { text: " after" },
      ],
      "#FFFFFF",
      1000,
      0,
    );

    const runs = lines[0].segments;
    const highlighted = runs.filter((r) => r.highlight);
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].text).toBe("mid");
    expect(highlighted[0].highlight).toBe("#FFE24D");
    // 나머지 런은 강조 없음
    expect(runs.filter((r) => r.highlight).map((r) => r.text)).toEqual(["mid"]);
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

describe("isBrandLogoToken", () => {
  it("matches logo aliases the renderer resolves", () => {
    for (const t of ["{{theme.logo}}", "{{theme.logo_url}}", "{{theme.brand_logo}}", "{{logo}}", "{{ theme.logo }}"]) {
      expect(isBrandLogoToken(t)).toBe(true);
    }
  });
  it("rejects non-logo tokens, urls and empties", () => {
    for (const t of ["{{theme.cover}}", "{{theme.account}}", "https://x/y.png", "", null, undefined]) {
      expect(isBrandLogoToken(t)).toBe(false);
    }
  });
});

describe("mediaContentToKonva logo fit", () => {
  it("defaults brand-logo media to contain (no crop)", () => {
    expect(mediaContentToKonva({ media_type: "image", src: "{{theme.logo}}" }).fit).toBe("contain");
  });
  it("defaults photos to cover", () => {
    expect(mediaContentToKonva({ media_type: "image", src: "https://x/y.png" }).fit).toBe("cover");
  });
  it("respects an explicit fit on a logo", () => {
    expect(mediaContentToKonva({ media_type: "image", src: "{{theme.logo}}", fit: "cover" }).fit).toBe("cover");
  });
});

describe("particleField determinism", () => {
  const base = { shape: "star" as const, count: 40, seed: 7, colors: ["#f00", "#0f0"], size_min: 6, size_max: 14 };

  it("same seed → identical field", () => {
    expect(particleField(base, 300, 200)).toEqual(particleField({ ...base }, 300, 200));
  });
  it("different seed → different field", () => {
    expect(particleField(base, 300, 200)).not.toEqual(particleField({ ...base, seed: 8 }, 300, 200));
  });
  it("count is honoured and clamped to the 500 cap", () => {
    expect(particleField({ ...base, count: 40 }, 300, 200)).toHaveLength(40);
    expect(particleField({ ...base, count: 9999 }, 300, 200)).toHaveLength(500);
    expect(particleField({ ...base, count: 0 }, 300, 200)).toHaveLength(0);
  });
  it("every particle stays inside the box, in size range, with a listed colour", () => {
    for (const p of particleField(base, 300, 200)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(300);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(200);
      expect(p.size).toBeGreaterThanOrEqual(6);
      expect(p.size).toBeLessThanOrEqual(14);
      expect(base.colors).toContain(p.color);
    }
  });
  it("rotation defaults on for confetti, off for dot/star", () => {
    expect(particleField({ shape: "confetti", count: 30, seed: 3 }, 300, 200).some((p) => p.rotation !== 0)).toBe(true);
    expect(particleField({ shape: "dot", count: 30, seed: 3 }, 300, 200).every((p) => p.rotation === 0)).toBe(true);
  });
});

import { svgMarkupToDataUri } from "./konva-render-helpers.js";

describe("svgMarkupToDataUri", () => {
  it("injects xmlns when the markup lacks it (else Konva fails to load)", () => {
    const uri = svgMarkupToDataUri("<svg viewBox='0 0 10 10'><path d='M0 0h10'/></svg>");
    expect(decodeURIComponent(uri)).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(uri.startsWith("data:image/svg+xml")).toBe(true);
  });
  it("keeps an existing xmlns (no double-inject)", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const decoded = decodeURIComponent(svgMarkupToDataUri(svg));
    expect(decoded.match(/xmlns=/g)?.length).toBe(1);
  });
  it("returns empty string for empty/whitespace markup", () => {
    expect(svgMarkupToDataUri("")).toBe("");
    expect(svgMarkupToDataUri("   ")).toBe("");
  });
});

import { snapBackgroundToCanvas } from "./carousel-content-to-konva.js";
import type { Block } from "./carousel-types.js";

describe("snapBackgroundToCanvas", () => {
  const bg = (over: Partial<Block>): Block => ({
    id: "bg", type: "rect", z: 0, x: 0, y: 0, w: 1080, h: 1350,
    rotation: 0, locked: false, content: { fill: "#000000" },
    ...over,
  } as Block);
  const fg: Block = {
    id: "text", type: "text", z: 5, x: 100, y: 100, w: 500, h: 80,
    rotation: 0, locked: false, content: { text: "본문" },
  } as Block;

  it("snaps a background nudged off the canvas (템플릿 y=40.5 사례)", () => {
    const [snapped] = snapBackgroundToCanvas([bg({ y: 40.5 }), fg], 1080, 1350);
    expect([snapped.x, snapped.y, snapped.w, snapped.h]).toEqual([0, 0, 1080, 1350]);
  });

  it("snaps a hairline-short background photo (y=1.3, h=1347.5)", () => {
    const [snapped] = snapBackgroundToCanvas(
      [bg({ type: "media", y: 1.3, h: 1347.5, content: { src: "x", fit: "cover" } } as Partial<Block>), fg],
      1080, 1350,
    );
    expect([snapped.y, snapped.h]).toEqual([0, 1350]);
  });

  it("찾는 대상은 z 최소 블록 — 배열 순서와 무관", () => {
    const result = snapBackgroundToCanvas([fg, bg({ y: 40.5 })], 1080, 1350);
    expect(result[1].y).toBe(0);
    expect(result[0]).toBe(fg);
  });

  it("의도적으로 여백을 둔 레이아웃은 건드리지 않는다", () => {
    const inset = bg({ x: 100, y: 100, w: 880, h: 1150 });
    expect(snapBackgroundToCanvas([inset, fg], 1080, 1350)[0]).toBe(inset);
  });

  it("이미 딱 맞으면 같은 배열을 그대로 돌려준다", () => {
    const blocks = [bg({}), fg];
    expect(snapBackgroundToCanvas(blocks, 1080, 1350)).toBe(blocks);
  });

  it("회전된 블록·텍스트 배경은 스냅하지 않는다", () => {
    const rotated = bg({ y: 40.5, rotation: 5 });
    expect(snapBackgroundToCanvas([rotated, fg], 1080, 1350)[0]).toBe(rotated);
    const textBottom = { ...fg, z: -1 } as Block;
    expect(snapBackgroundToCanvas([textBottom, bg({})], 1080, 1350)[0]).toBe(textBottom);
  });
});
