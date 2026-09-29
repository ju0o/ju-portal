/**
 * Shared UI helpers. No framework, no runtime dependencies.
 *
 * Everything here is presentation-only. Actions and media URLs always come from
 * src/registry/action.ts (Infra-owned) - never a second implementation here.
 */

// Resolved at call time, not at module load, so the value always reflects the
// current environment and stays testable.
function env(name) {
  return (import.meta.env?.[name] ?? process.env?.[name] ?? '').trim();
}

/**
 * Canonical origin, from NEXT_PUBLIC_SITE_URL.
 *
 * Empty for local dev, where relative URLs are correct. Never derived from the
 * request host: a Preview host must never become the canonical origin.
 */
export function siteUrl() {
  return env('NEXT_PUBLIC_SITE_URL').replace(/\/+$/, '');
}

/** Media base is an ORIGIN (or origin + prefix), from PUBLIC_MEDIA_BASE_URL. */
export function mediaBase() {
  return env('PUBLIC_MEDIA_BASE_URL').replace(/\/+$/, '');
}

/**
 * Resolve a registry-owned media path to a URL.
 *
 * The Registry path is authoritative and complete: /media/{slug}/{asset}.{version}.{ext}
 * No filename is ever derived here. Joining uses URL semantics rather than
 * string concatenation, so a base that already ends in /media can never produce
 * a duplicated segment such as /media/media/....
 *
 * With no base configured the path is returned as-is (local dev, same origin).
 */
export function resolveMediaUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;

  const base = mediaBase();
  if (!base) return path;

  // `new URL(path, base)` resolves the absolute path against the base origin,
  // which is the correct behaviour for a registry path that is already absolute.
  return new URL(path, base.endsWith('/') ? base : base + '/').toString();
}

/**
 * Canonical URL for a page path.
 *
 * With NEXT_PUBLIC_SITE_URL set this yields an absolute URL on the production
 * origin, e.g. {SITE_URL}/products/juqode. Without it, the path is returned
 * relative, which is correct for local dev.
 */
export function canonicalUrl(pathname) {
  const origin = siteUrl();
  const path = pathname && pathname !== '/' ? '/' + String(pathname).replace(/^\/+|\/+$/g, '') : '/';
  if (!origin) return path;
  return new URL(path, origin + '/').toString();
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
