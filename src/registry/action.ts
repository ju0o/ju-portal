/**
 * getPrimaryAction - the single resolver for every user-facing action in JU Portal.
 *
 * NORMATIVE. Owned by Infrastructure / Web Operations. The Builder consumes this;
 * do not reimplement it and do not branch on `provider` inside a component.
 *
 * Why it exists: a user must never see a provider name, and must never see a link
 * that fails. This module is the only place that turns a Registry entry into an
 * action, which makes both rules enforceable in one place instead of N.
 *
 * Contract:
 *   - verb is one of exactly four: Download | Install | Open | Try
 *   - provider names NEVER appear in user-facing text
 *   - unresolvable => resolved:false, href:null => render disabled "Coming soon".
 *     NEVER a link that 404s.
 */

import type {
  ActionVerb,
  AnyEntry,
  LabEntry,
  ProductEntry,
  RadarEntry,
  Release,
  SkillEntry,
} from './types';

export interface PrimaryAction {
  /** The ONLY four user-facing verbs. */
  verb: ActionVerb;
  /**
   * Where the user goes, or null when nothing resolves. A null href MUST render a
   * disabled control labelled "Coming soon" - not a link.
   */
  href: string | null;
  /** Install command for npm/pypi/copy, else undefined. Render as a copyable block. */
  command?: string;
  /** Human-readable version, when known. */
  version?: string;
  /** Machine-readable provider. For analytics only - NEVER render this. */
  provider?: string;
  /** False when nothing resolves. Check this before rendering an anchor. */
  resolved: boolean;
  /** Why it is unresolved. Safe to render; used for the "Coming soon" affordance. */
  reason?: string;
}

const UNRESOLVED = (reason: string, verb: ActionVerb = 'Download'): PrimaryAction => ({
  verb,
  href: null,
  command: undefined,
  version: undefined,
  provider: undefined,
  resolved: false,
  reason,
});

/**
 * Resolve a github_release entry to a real download URL.
 *
 * A pinned `tag` is strongly preferred: it makes the URL immutable, which is the
 * same reasoning that makes media paths immutable. Without a tag we fall back to
 * "latest", which is resolvable but NOT immutable - the resolved href then
 * changes over time and must not be cached long-term.
 */
export function releaseHref(release: Release): string | null {
  switch (release.provider) {
    case 'github_release': {
      if (!release.repo) return null;
      const base = 'https://github.com/' + release.repo + '/releases/download/';
      const tag = release.tag ?? 'latest';
      if (!release.asset) return 'https://github.com/' + release.repo + '/releases/' + tag;
      return base + tag + '/' + encodeURIComponent(release.asset);
    }
    case 'npm':
      if (!release.package) return null;
      return 'https://www.npmjs.com/package/' + release.package;
    case 'pypi':
      if (!release.package) return null;
      return 'https://pypi.org/project/' + release.package + '/';
    case 'web':
    case 'direct':
      return release.url ?? null;
    case 'microsoft_store':
      if (!release.productId) return null;
      return 'https://apps.microsoft.com/detail/' + release.productId;
    case 'app_store':
      if (!release.appId) return null;
      return 'https://apps.apple.com/app/id' + release.appId;
    case 'google_play':
      if (!release.packageName) return null;
      return 'https://play.google.com/store/apps/details?id=' + release.packageName;
    default:
      return null;
  }
}

/** Install command for providers that have one. Copyable, never a provider name in prose. */
export function releaseCommand(release: Release): string | undefined {
  switch (release.provider) {
    case 'npm':
      return release.package ? 'npm i ' + release.package : undefined;
    case 'pypi':
      return release.package ? 'pip install ' + release.package : undefined;
    case 'github_release':
      // A shell installer is a provider name in the UI. Use the plain action.
      return undefined;
    default:
      return undefined;
  }
}

/**
 * The primary action for any Registry entry.
 *
 * Products: first release that resolves. If a pinned download is available it is
 * preferred over an unpinned one, so the primary CTA is the stable one.
 * Skills: the install method.
 * Labs:   never a CTA by design - that is the whole point of the section.
 * Radar:  link-out to the existing JU Radar surface. Embed is opt-in per entry.
 */
export function getPrimaryAction(entry: AnyEntry): PrimaryAction {
  if (isLab(entry)) return labAction(entry);
  if (isSkill(entry)) return skillAction(entry);
  if (isRadar(entry)) return radarAction(entry);
  return productAction(entry);
}

function isProduct(e: AnyEntry): e is ProductEntry {
  return Array.isArray((e as ProductEntry).releases);
}
function isSkill(e: AnyEntry): e is SkillEntry {
  return typeof (e as SkillEntry).installMethod === 'string';
}
function isLab(e: AnyEntry): e is LabEntry {
  return (e as LabEntry).status === 'coming_soon' || (e as LabEntry).status === 'beta';
}
function isRadar(e: AnyEntry): e is RadarEntry {
  return (e as RadarEntry).external !== undefined;
}

function productAction(entry: ProductEntry): PrimaryAction {
  if (entry.status !== 'available') {
    return UNRESOLVED(entry.unavailableReason ?? 'Not released yet.', 'Download');
  }
  const releases = entry.releases ?? [];
  if (!releases.length) {
    return UNRESOLVED('No release is published yet.', 'Download');
  }

  // Prefer a pinned (immutable) release as the primary CTA.
  const ordered = [...releases].sort((a, b) => rank(b) - rank(a));
  for (const release of ordered) {
    const href = releaseHref(release);
    if (href) {
      return {
        verb: release.verb,
        href,
        command: releaseCommand(release),
        version: release.version,
        provider: release.provider,
        resolved: true,
      };
    }
  }
  return UNRESOLVED('Every declared release target failed to resolve.', 'Download');
}

/** Pinned tags first, then explicit URLs, then unpinned "latest". */
function rank(release: Release): number {
  let score = 0;
  if (release.tag) score += 2;
  if (release.url) score += 1;
  if (release.package || release.productId || release.appId || release.packageName) score += 1;
  return score;
}

function skillAction(entry: SkillEntry): PrimaryAction {
  if (entry.status !== 'available') {
    return UNRESOLVED(entry.unavailableReason ?? 'Not published yet.', 'Install');
  }
  const verb: ActionVerb = entry.installMethod === 'link' ? 'Open' : 'Install';
  let command: string | undefined;
  switch (entry.installMethod) {
    case 'npm':
      command = entry.installTarget ? 'npm i ' + entry.installTarget : undefined;
      break;
    case 'pypi':
      command = entry.installTarget ? 'pip install ' + entry.installTarget : undefined;
      break;
    case 'copy':
      command = entry.installTarget;
      break;
    default:
      command = undefined;
  }
  const href = entry.installTarget
    ? entry.installMethod === 'link'
      ? entry.installTarget
      : undefined
    : entry.source?.url;
  if (!href && !command) return UNRESOLVED('No install target declared.', verb);
  return {
    verb,
    href: href ?? null,
    command,
    version: entry.version,
    provider: 'skill',
    resolved: true,
  };
}

function labAction(entry: LabEntry): PrimaryAction {
  return UNRESOLVED(
    entry.unavailableReason ?? 'In development. Not installable yet.',
    'Download',
  );
}

function radarAction(entry: RadarEntry): PrimaryAction {
  if (entry.status !== 'available' || !entry.external) {
    return UNRESOLVED(entry.unavailableReason ?? 'Not available.', 'Open');
  }
  const origin = resolveEnv(entry.external.originEnv);
  if (!origin) {
    return UNRESOLVED(
      'Origin is not configured (' + entry.external.originEnv + ').',
      'Open',
    );
  }
  const base = origin.replace(/\/+$/, '');
  const path = entry.external.path === '/' ? '' : entry.external.path;
  return {
    verb: 'Open',
    href: base + path,
    command: undefined,
    version: undefined,
    provider: 'radar',
    resolved: true,
  };
}

/**
 * Read a public env var. Vite exposes these on import.meta.env, Next.js on
 * process.env. Kept in one place so the app never hardcodes a Radar host and the
 * JU Radar service can move without a code change.
 */
function resolveEnv(name: string): string | undefined {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
  const raw = viteEnv?.[name] ?? process.env?.[name];
  if (!raw) return undefined;
  const value = raw.trim();
  return value ? value.replace(/\/+$/, '') : undefined;
}

/**
 * Absolute media URL for a Registry media reference.
 *
 * A local reference is already a complete versioned path, so this only joins it
 * against PUBLIC_MEDIA_BASE_URL for canonical/OG use. It deliberately does NOT
 * build a path from a slug - that is forbidden by the media contract.
 *
 * NB: do not write a literal media path in a comment in this file. The registry
 * verifier scans raw source text for such literals and will (correctly) reject an
 * unversioned one, breaking the build for a reason that is invisible in review.
 */
export function mediaUrl(path: string, base = process.env.PUBLIC_MEDIA_BASE_URL): string {
  if (/^https?:\/\//.test(path)) return path;
  if (!base) return path;
  return base.replace(/\/+$/, '') + (path.startsWith('/') ? path : '/' + path);
}
