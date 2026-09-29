/**
 * JU Portal Registry types - NORMATIVE.
 *
 * Infra owner: Web Operations. Changing this file changes the Builder contract
 * and requires Founder sign-off, because the Builder builds against it.
 *
 * Founder directives encoded here:
 *   1. The Registry owns the exact media asset path, and every asset path is
 *      immutable by construction (a version segment is mandatory).
 *   2. V0 is video-optional but video-first: the media slots are first-class and
 *      typed, and "not made yet" is expressed as `pending`, never as a path that
 *      does not exist.
 */

export type Section = 'products' | 'skills' | 'labs' | 'radar';

/** The ONLY four user-facing verbs. Provider names must never be rendered. */
export type ActionVerb = 'Download' | 'Install' | 'Open' | 'Try';

export type ReleaseProvider =
  | 'github_release'
  | 'npm'
  | 'pypi'
  | 'web'
  | 'direct'
  | 'microsoft_store'
  | 'app_store'
  | 'google_play';

export type Availability = 'available' | 'coming_soon' | 'beta';

export type MediaSlot = 'poster' | 'overviewVideo' | 'actualDemo';

/**
 * A LOCAL media asset. The path is owned by the Registry and immutable by
 * construction: /media/{slug}/{asset}.{version}.{ext}
 * Unversioned canonical names (overview.mp4) are FORBIDDEN and fail the build.
 */
export interface LocalMediaRef {
  path: string;
  alt?: string;
  byteSize?: number;
  durationSec?: number;
}

/**
 * An EXTERNAL media asset hosted elsewhere, typically a GitHub Release asset.
 * Immutability is provided by a pinned versioned URL, so the local
 * version-segment rule does not apply - but the URL must still never be reused
 * for different bytes.
 */
export interface ExternalMediaRef {
  externalUrl: string;
  version: string;
  byteSize?: number;
  durationSec?: number;
}

export interface Media {
  /** Versioned local assets. Rendered when present, omitted when not. */
  poster?: LocalMediaRef;
  overviewVideo?: LocalMediaRef;
  actualDemo?: LocalMediaRef;

  /** Versioned external assets, currently used for the JuQode overview video. */
  posterExternal?: ExternalMediaRef;
  overviewVideoExternal?: ExternalMediaRef;
  actualDemoExternal?: ExternalMediaRef;

  /**
   * Intended but not yet produced. Declares intent WITHOUT creating a path that
   * does not exist. This is what makes V0 video-optional while keeping the
   * schema video-first.
   */
  pending?: MediaSlot[];
}

export interface Release {
  provider: ReleaseProvider;

  /** github_release: "owner/repo" */
  repo?: string;
  /** github_release: exact asset filename */
  asset?: string;
  /** github_release: pin to a tag instead of resolving 'latest' */
  tag?: string;

  /** npm / pypi */
  package?: string;

  /** web / direct */
  url?: string;

  /** microsoft_store / app_store / google_play */
  productId?: string;
  appId?: string;
  packageName?: string;

  version?: string;
  platforms?: string[];
  verb: ActionVerb;

  /**
   * Marks this release as THE primary action for the entry. Exactly one release
   * per product may set it; the resolver prefers it over any heuristic ordering.
   *
   * Founder decision 2026-09-29: JuQode's primary is the zero-install web Try
   * experience, with the installer kept as a secondary Download. The reason is the
   * audience - vibe-coding beginners, for whom "try it in the browser right now"
   * beats "download an exe". An explicit flag is used instead of a heuristic so the
   * choice is visible in the Registry and cannot be silently reordered later.
   */
  primary?: boolean;
}

export interface SourceRef {
  url: string;
  license?: string;
}

interface BaseEntry {
  slug: string;
  title: string;
  summary: string;
  media?: Media;
  /** Secondary link only. Never the primary action. */
  source?: SourceRef;
  updatedAt: string;
  /** Human-readable reason shown when status is not 'available'. */
  unavailableReason?: string;
}

export interface ProductEntry extends BaseEntry {
  status: Availability;
  releases: Release[];
}

export interface SkillEntry extends BaseEntry {
  status: Availability;
  compatibleAgents: string[];
  version: string;
  installMethod: 'npm' | 'pypi' | 'copy' | 'link';
  installTarget?: string;
}

export interface LabEntry extends BaseEntry {
  status: 'coming_soon' | 'beta';
  releases?: Release[];
}

export interface RadarEntry extends BaseEntry {
  status: Availability;
  external?: {
    originEnv: string;
    path: string;
    embed: boolean;
  };
}

export type AnyEntry = ProductEntry | SkillEntry | LabEntry | RadarEntry;
