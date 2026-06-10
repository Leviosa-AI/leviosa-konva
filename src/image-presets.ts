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
  bright: { brightness: 0.1, contrast: 6, saturation: 0.12, luminance: 0.04 },
  vivid: { brightness: 0.03, contrast: 24, saturation: 0.32 },
  muted: { brightness: -0.02, contrast: 10, saturation: -0.22, luminance: -0.02 },
  warm: { brightness: 0.04, contrast: 8, saturation: 0.16, hue: 6, luminance: 0.03 },
  mono: { brightness: 0, contrast: 18, saturation: -10 },
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
