import type { BrandConfigDict } from "./carousel-types.js";

const TEMPLATE_VAR_PATTERN = /\{\{(theme|asset)\.([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

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

// Numbering badges render their stored text as-is. Deriving a fallback from
// the slide index is wrong: numbering counts body slides only (cover excluded),
// so slide index 2 must still show "1" on the first body slide. The body
// sequence is baked into content.text at generation/backfill time.
export function resolveSlideNumberText(storedText: string | undefined): string {
  return storedText ?? "";
}

function isNumberingBlock(
  blockName: string | null | undefined,
  content: { role?: string | null; source?: string | null },
): boolean {
  return blockName === "content_number" || content.role === "content_number" || content.source === "slide.number";
}

export function resolveContentText(
  content: { text?: string | null; role?: string | null; source?: string | null },
  brandConfig?: BrandConfigDict | null,
  assetMap?: Record<string, string> | null,
  blockName?: string | null,
): string {
  if (isNumberingBlock(blockName, content)) {
    return resolveSlideNumberText(content.text ?? "");
  }
  return resolveTemplateVars(content.text ?? "", brandConfig, assetMap);
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
