/**
 * Shared UI helpers. No framework, no runtime dependencies.
 *
 * Everything here is presentation-only. Actions always come from
 * getPrimaryAction() in src/registry/action.ts — never a literal here.
 */

// Resolved at call time, not at module load, so the value always reflects the
// current environment and stays testable.
function env(name) {
  return (import.meta.env?.[name] ?? process.env?.[name] ?? '').trim();
}

/** Canonical origin, from NEXT_PUBLIC_SITE_URL. Empty for local dev. */
export function siteUrl() {
  return env('NEXT_PUBLIC_SITE_URL').replace(/\/+$/, '');
}

export const MEDIA_BASE = env('PUBLIC_MEDIA_BASE_URL').replace(/\/+$/, '');

/** Joins a registry-owned media path onto PUBLIC_MEDIA_BASE_URL. */
export function mediaUrl(path) {
  if (/^https?:\/\//.test(path)) return path;
  if (!MEDIA_BASE) return path;
  return MEDIA_BASE + (path.startsWith('/') ? path : '/' + path);
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

export function slugify(value) {
  return String(value ?? '')
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
