export const DEFAULT_BRAND_LOGO_URL = "/brand-assets/kamajii-logo.png";
export const DEFAULT_BRAND_FAVICON_URL = "/brand-assets/kamajii-favicon.png";

export function getBrandLogoUrl(logoUrl?: string | null) {
  return logoUrl?.trim() || DEFAULT_BRAND_LOGO_URL;
}

export function getBrandFaviconUrl(faviconUrl?: string | null) {
  return faviconUrl?.trim() || DEFAULT_BRAND_FAVICON_URL;
}
