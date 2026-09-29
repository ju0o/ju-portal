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
 * Canonical origin.
 *
 * Resolution order:
 *   1. VERCEL_PROJECT_PRODUCTION_URL  - a Vercel system variable. It always
 *      names the project's PRODUCTION domain and is present on Preview builds
 *      too, so a Preview page still canonicalises to production.
 *   2. NEXT_PUBLIC_SITE_URL            - manual/local fallback only.
 *   3. ''                              - local development, where relative URLs
 *      are correct.
 *
 * The Vercel variable deliberately wins: a stale dashboard value must never
 * override the real production domain. Never derived from the request host.
 */
export function siteUrl() {
  const vercel = env('VERCEL_PROJECT_PRODUCTION_URL');
  if (vercel) {
    // Vercel provides a bare hostname; tolerate a scheme if one is present.
    const withScheme = /^https?:\/\//i.test(vercel) ? vercel : 'https://' + vercel;
    return withScheme.replace(/\/+$/, '');
  }
  return env('NEXT_PUBLIC_SITE_URL').replace(/\/+$/, '');
}

/**
 * Resolve a registry-owned media path to a URL.
 *
 * V0 policy: the Portal hosts its own media, and the Registry path is already
 * a complete, versioned, root-relative URL. It is returned unchanged so it
 * resolves against whichever deployment is serving the page - Preview resolves
 * /media/... on the Preview, Production on Production. No host env is involved
 * and no filename is ever derived here.
 *
 * An absolute URL is passed through untouched, which leaves room for a future
 * external CDN (R2) without pre-building one.
 */
export function resolveMediaUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return path;
}

/**
 * Canonical URL for a page path.
 *
 * With an origin available this yields an absolute URL on the production
 * domain, e.g. {SITE_URL}/products/juqode. Without one it returns the path
 * relative, which is correct for local development.
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
