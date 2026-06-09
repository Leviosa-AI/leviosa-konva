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
  const logoUrl = firstString(
    brandConfig.logo_url,
    brandConfig.brand_logo_url,
    brandConfig.brand_image_url,
    brandConfig.logo,
  );
  const account = firstString(
    brandConfig.account,
    brandConfig.brand_handle,
    brandConfig.handle,
    brandConfig.ig_handle,
  );
  const brandName = firstString(brandConfig.brand_name, brandConfig.name);
  const brandTagline = firstString(brandConfig.brand_tagline, brandConfig.tagline);
  const mapping: Record<string, string> = {
    logo_url: logoUrl,
    logo: logoUrl,
    brand_logo_url: logoUrl,
    brand_image_url: logoUrl,
    account,
    handle: account,
    brand_handle: account,
    ig_handle: account,
    brand_name: brandName,
    name: brandName,
    brand_tagline: brandTagline,
    tagline: brandTagline,
    cta_text: brandConfig.cta_text || "",
  };
  return mapping[key] ?? "";
}

function firstString(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}
