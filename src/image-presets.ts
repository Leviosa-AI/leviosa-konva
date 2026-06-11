// Image filter presets — SSOT for both the editor preview (leviosa-frontend)
// and the headless publish render (leviosa-rendering-server), so a preset
// looks identical in the editor and in the published image.
//
// NOTE: leviosa-frontend/src/lib/cardnews/image-presets.ts carries the same
// value table for editor-local use while its package pin is below the version
// that exports this module. Keep the two tables in sync until the frontend
// switches its import to this file.

export type ImagePreset = "none" | "bright" | "vivid" | "muted" | "warm" | "mono";

export interface ImagePresetValues {
  /** Konva.Filters.Brighten: -1..1 */
  brightness: number;
  /** Konva.Filters.Contrast: -100..100 */
  contrast: number;
  /** Konva.Filters.HSL saturation: -2..10 (-10 ≈ grayscale) */
  saturation: number;
  /** Konva.Filters.HSL hue rotation in degrees */
  hue?: number;
  /** Konva.Filters.HSL luminance: -2..2 */
  luminance?: number;
}

export const IMAGE_PRESET_VALUES: Record<Exclude<ImagePreset, "none">, ImagePresetValues> = {
  bright: { brightness: 0.05, contrast: 3, saturation: 0.06, luminance: 0.02 },
  vivid: { brightness: 0.015, contrast: 12, saturation: 0.16 },
  muted: { brightness: -0.01, contrast: 0, saturation: -0.11, luminance: -0.01 },
  warm: { brightness: 0.02, contrast: 4, saturation: 0.08, hue: 3, luminance: 0.015 },
  mono: { brightness: 0, contrast: 8, saturation: -10 },
};

export const IMAGE_PRESET_KEYS: ImagePreset[] = ["none", "bright", "vivid", "muted", "warm", "mono"];

export function normalizeImagePreset(value: unknown): ImagePreset {
  return typeof value === "string" && IMAGE_PRESET_KEYS.includes(value as ImagePreset)
    ? (value as ImagePreset)
    : "none";
}

export function imagePresetValues(value: unknown): ImagePresetValues | null {
  const preset = normalizeImagePreset(value);
  return preset === "none" ? null : IMAGE_PRESET_VALUES[preset];
}
