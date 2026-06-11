import { describe, expect, it } from "vitest";
import {
  IMAGE_PRESET_KEYS,
  IMAGE_PRESET_VALUES,
  imagePresetValues,
  normalizeImagePreset,
} from "./image-presets.js";

describe("image-presets", () => {
  it("normalizes unknown or missing values to none", () => {
    expect(normalizeImagePreset(undefined)).toBe("none");
    expect(normalizeImagePreset(null)).toBe("none");
    expect(normalizeImagePreset("sepia")).toBe("none");
    expect(normalizeImagePreset(42)).toBe("none");
    expect(normalizeImagePreset("vivid")).toBe("vivid");
  });

  it("returns null filter values for none and a table entry otherwise", () => {
    expect(imagePresetValues("none")).toBeNull();
    expect(imagePresetValues(undefined)).toBeNull();
    expect(imagePresetValues("mono")).toEqual(IMAGE_PRESET_VALUES.mono);
  });

  it("covers every non-none key with a value table entry", () => {
    for (const key of IMAGE_PRESET_KEYS) {
      if (key === "none") continue;
      expect(IMAGE_PRESET_VALUES[key]).toBeDefined();
    }
  });

  // 에디터 프리뷰(leviosa-frontend image-presets.ts)와 발행 렌더가 같은 표를
  // 써야 픽셀 동일성이 유지된다 — 값이 바뀌면 양쪽을 같이 바꿀 것.
  it("keeps the editor-known preset numbers", () => {
    expect(IMAGE_PRESET_VALUES.bright).toEqual({
      brightness: 0.05,
      contrast: 3,
      saturation: 0.06,
      luminance: 0.02,
    });
    expect(IMAGE_PRESET_VALUES.vivid).toEqual({ brightness: 0.015, contrast: 12, saturation: 0.16 });
    expect(IMAGE_PRESET_VALUES.muted).toEqual({
      brightness: -0.01,
      contrast: 0,
      saturation: -0.11,
      luminance: -0.01,
    });
    expect(IMAGE_PRESET_VALUES.warm).toEqual({
      brightness: 0.02,
      contrast: 4,
      saturation: 0.08,
      hue: 3,
      luminance: 0.015,
    });
    expect(IMAGE_PRESET_VALUES.mono).toEqual({ brightness: 0, contrast: 8, saturation: -10 });
  });
});
