import type { BrandConfigDict } from "./carousel-types.js";

const TEMPLATE_VAR_PATTERN = /\{\{(theme|asset)\.([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

export interface SlideVarContext {
  slide_number?: number | null;
  slide_count?: number | null;
}

export function resolveTemplateVars(
  s: string,
  brandConfig?: BrandConfigDict | null,
  assetMap?: Record<string, string> | null,
): string {
  if (!s) return s || "";

  return s.replace(TEMPLATE_VAR_PATTERN, (_match, namespace: string, key: string) => {
    if (namespace === "theme") {
      if (brandConfig == null) return "";
      return resolveThemeKey(brandConfig, key);
    }
    if (namespace === "asset") {
      if (assetMap == null) return "";
      return assetMap[key] ?? "";
    }
    return "";
  });
}

export function resolveSlideNumberText(
  storedText: string | undefined,
  slideContext?: SlideVarContext | null,
): string {
  if (storedText != null && storedText !== "") return storedText;
  const slideNumber = Number(slideContext?.slide_number);
  if (!Number.isFinite(slideNumber) || slideNumber <= 0) return storedText ?? "";
  return String(slideNumber);
}

function resolveThemeKey(brandConfig: BrandConfigDict, key: string): string {
  const mapping: Record<string, string> = {
    logo_url: brandConfig.logo_url || "",
    account: brandConfig.account || "",
    brand_name: brandConfig.brand_name || "",
    brand_tagline: brandConfig.brand_tagline || "",
    cta_text: brandConfig.cta_text || "",
  };
  return mapping[key] ?? "";
}
