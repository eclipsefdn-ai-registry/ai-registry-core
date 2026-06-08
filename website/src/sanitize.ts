import { sanitizeUrl as braintreeSanitizeUrl } from "@braintree/sanitize-url";

const SAFE_HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Sanitize a URL for use in href attributes.
 * Blocks dangerous protocols (javascript:, data:, vbscript:, etc.).
 * Returns undefined for invalid URLs so the link can be omitted.
 */
export function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const sanitized = braintreeSanitizeUrl(url);
  if (sanitized === "about:blank") return undefined;
  return sanitized;
}

/**
 * Validate a CSS color value. Only allows hex colors (#rrggbb).
 * Returns undefined for invalid values to prevent CSS injection.
 */
export function safeCssColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  return SAFE_HEX_COLOR.test(color) ? color : undefined;
}
