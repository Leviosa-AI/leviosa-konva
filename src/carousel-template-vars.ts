import type { BrandConfigDict } from "./carousel-types.js";

const TEMPLATE_VAR_PATTERN = /\{\{\s*(?:(theme|asset)\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
const THEME_KEY_ALIASES: Record<string, string> = {
  logo_url: "logo_url",
  logo: "logo_url",
  brand_logo: "logo_url",
  brand_logo_url: "logo_url",
  brand_image_url: "logo_url",
  account: "account",
  handle: "account",
  brand_handle: "account",
  ig_handle: "account",
  brand_name: "brand_name",
  name: "brand_name",
  brand_tagline: "brand_tagline",
  tagline: "brand_tagline",
  cta: "cta_text",
  brand_cta: "cta_text",
  cta_text: "cta_text",
};

const THEME_TEXT_PLACEHOLDERS: Record<string, string> = {
  account: "@brand",
  handle: "@brand",
  brand_handle: "@brand",
  ig_handle: "@brand",
  brand_name: "브랜드명",
  name: "브랜드명",
  brand_tagline: "브랜드 소개",
  tagline: "브랜드 소개",
  cta: "자세히 보기",
  brand_cta: "자세히 보기",
  cta_text: "자세히 보기",
};

// Keys (incl. aliases) that resolve to the brand logo image. Mirrors the
// db-schema derive_kind / is_brand_logo_token so the renderer and generator
// agree on what a logo slot is.
const BRAND_LOGO_TOKEN_KEYS = new Set([
  "logo_url",
  "logo",
  "brand_logo",
  "brand_logo_url",
  "brand_image_url",
]);
const SINGLE_TEMPLATE_TOKEN_PATTERN = /^\{\{\s*(?:theme\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}$/;

/** True when the whole string is a brand-logo placeholder (any resolved alias). */
export function isBrandLogoToken(value: string | null | undefined): boolean {
  if (!value) return false;
  const match = SINGLE_TEMPLATE_TOKEN_PATTERN.exec(value.trim());
  return match ? BRAND_LOGO_TOKEN_KEYS.has(match[1].toLowerCase()) : false;
}

export function resolveTemplateVars(
  s: string,
  brandConfig?: BrandConfigDict | null,
  assetMap?: Record<string, string> | null,
): string {
  if (!s) return s || "";

  return s.replace(TEMPLATE_VAR_PATTERN, (match, namespace: string | undefined, key: string) => {
    if (namespace === "theme") {
      if (brandConfig == null) return themeTextPlaceholder(key);
      return resolveThemeKey(brandConfig, key);
    }
    if (namespace === "asset") {
      if (assetMap == null) return "";
      return assetMap[key] ?? "";
    }
    if (namespace == null && key in THEME_KEY_ALIASES) {
      if (brandConfig == null) return themeTextPlaceholder(key);
      return resolveThemeKey(brandConfig, key);
    }
    return match;
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
    brand_logo: logoUrl,
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
    cta: brandConfig.cta_text || "",
    brand_cta: brandConfig.cta_text || "",
    cta_text: brandConfig.cta_text || "",
  };
  return mapping[key] || themeTextPlaceholder(key);
}

function firstString(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function themeTextPlaceholder(key: string): string {
  const canonicalKey = THEME_KEY_ALIASES[key] ?? key;
  return THEME_TEXT_PLACEHOLDERS[key] ?? THEME_TEXT_PLACEHOLDERS[canonicalKey] ?? "";
}
