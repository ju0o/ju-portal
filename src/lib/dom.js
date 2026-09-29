/**
 * Shared UI helpers. No framework, no runtime dependencies.
 *
 * Origin and media resolution are Infra-owned and live in
 * src/registry/action.ts: canonicalOrigin(), absoluteUrl() and mediaUrl().
 * The Builder re-exports them from one place and adds no second algorithm, so
 * there is exactly one implementation of each rule in the repository.
 */

import { canonicalOrigin, absoluteUrl, mediaUrl } from '../registry/action.ts';

/** Canonical production origin. Infra-owned resolution order. */
export const siteUrl = canonicalOrigin;

/** Media URL for a Registry reference. Local paths render unchanged. */
export const resolveMediaUrl = mediaUrl;

/**
 * Canonical URL for a page path.
 *
 * Normalises the path shape first (no double slashes, no trailing slash except
 * for the root), then delegates the origin decision to Infra's absoluteUrl().
 */
export function canonicalUrl(pathname) {
  const path =
    pathname && pathname !== '/'
      ? '/' + String(pathname).replace(/^\/+|\/+$/g, '')
      : '/';
  return absoluteUrl(path);
}

/** Escapes text for safe interpolation into HTML. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
