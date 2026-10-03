/**
 * JU Portal Studio — content layer.
 *
 * Reads the committed Registry/SSOT (content/*) as live objects, validates edits
 * against the Registry contract, and writes back valid, importable TypeScript
 * using an atomic temp-file-then-rename cycle. The temp file is import-checked
 * before it replaces the target, so a corrupt write can never clobber a good
 * file: on any failure the original is left untouched.
 *
 * All public functions take an optional `root` (defaulting to process.cwd()) so
 * the same logic can be tested against a scratch copy of the repo.
 */
import { readFile, readdir, writeFile, stat, rename, unlink, mkdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import type {
  ProductEntry,
  LabEntry,
  SkillEntry,
  RadarEntry,
  AnyEntry,
  Release,
  Media,
  LocalMediaRef,
  ExternalMediaRef,
  SourceRef,
} from '../registry/types';

export type Section = 'products' | 'labs' | 'skills' | 'radar';
export type EntryKind = 'product' | 'lab' | 'skill' | 'radar';

/** Fallback header (interface + contract) used only if home.ts is missing/corrupt. */
const DEFAULT_HOME_HEADER = `/**
 * Home copy — the ONLY editable Home content, in one committed file.
 *
 * Studio edits this file. It is deliberately COPY-ONLY: no layout, no CSS, no
 * animation, no component configuration lives here.
 */
export interface HomeCopy {
  hero: {
    label: string;
    titleLines: string[];
    titleAccent: string;
    subtitleLines: string[];
    discoverPlaceholder: string;
    discoverLabel: string;
    hints: string[];
    primaryCta: string;
    secondaryCta: string;
    exampleAria: string;
  };
  brand: {
    index: string;
    titleLines: string[];
    bodyLines: string[];
    chain: string[];
    listLabel: string;
  };
  instruct: {
    index: string;
    titleLines: string[];
    bodyLines: string[];
    exampleLabel: string;
    exampleAria: string;
    exampleText: string;
  };
  works: {
    index: string;
    titleLines: string[];
    bodyLines: string[];
    statesLabel: string;
    states: string[];
  };
  resolve: {
    index: string;
    titleLines: string[];
    bodyLines: string[];
  };
  sections: {
    skillsTitle: string;
    skillsBody: string;
    labsTitle: string;
    labsBody: string;
    radarTitle: string;
    radarBody: string;
    radarCta: string;
    radarDetails: string;
    radarPending: string;
  };
  notify: {
    titleLines: string[];
    body: string;
    button: string;
    state: string;
    footnote: string;
  };
  meta: {
    title: string;
    description: string;
  };
}

`;

export interface EntryInfo {
  section: Section;
  slug: string;
  path: string;
  entry: AnyEntry;
}

export interface HomeCopy {
  hero: Record<string, unknown>;
  [k: string]: unknown;
}

const KIND_FOR_SECTION: Record<Section, EntryKind> = {
  products: 'product',
  labs: 'lab',
  skills: 'skill',
  radar: 'radar',
};

const IMPORT_TYPE: Record<EntryKind, string> = {
  product: 'ProductEntry',
  lab: 'LabEntry',
  skill: 'SkillEntry',
  radar: 'RadarEntry',
};

const STATUS_VALUES = new Set(['available', 'coming_soon', 'beta']);
const ACTION_VERBS = new Set(['Download', 'Install', 'Open', 'Try']);
const RELEASE_PROVIDERS = new Set([
  'github_release', 'npm', 'pypi', 'web', 'direct',
  'microsoft_store', 'app_store', 'google_play',
]);

const VERSIONED_MEDIA = /\/media\/[a-z0-9-]+\/(overview|poster|demo)\.(v\d+|[0-9a-f]{8})\.(mp4|jpg)/i;
const UNVERSIONED_MEDIA = /\/media\/[a-z0-9-]+\/(overview|poster|demo)\.(mp4|jpg)/i;

/** Canonical field order for each entry kind, so rewrites are stable diffs. */
const FIELD_ORDER: Record<EntryKind, string[]> = {
  product: ['slug', 'title', 'summary', 'status', 'media', 'releases', 'source', 'updatedAt'],
  lab: ['slug', 'title', 'summary', 'status', 'source', 'updatedAt', 'unavailableReason'],
  skill: ['slug', 'title', 'summary', 'status', 'compatibleAgents', 'version', 'installMethod', 'installTarget', 'source', 'updatedAt'],
  radar: ['slug', 'title', 'summary', 'status', 'external', 'source', 'updatedAt', 'unavailableReason'],
};

function esc(str: string): string {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/** Serialize a JS value into a TS literal using single quotes (repo style). */
function toTSLiteral(value: unknown, indent = 2): string {
  const pad = (n: number) => ' '.repeat(n);
  const write = (v: unknown, depth: number): string => {
    const ind = pad(depth * indent);
    const indChild = pad((depth + 1) * indent);
    if (v === null) return 'null';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return String(v);
    if (typeof v === 'string') return "'" + esc(v) + "'";
    if (Array.isArray(v)) {
      if (v.length === 0) return '[]';
      return '[\n' + v.map((x) => indChild + write(x, depth + 1)).join(',\n') + ',\n' + ind + ']';
    }
    // object — preserve insertion order, skip undefined values
    const keys = Object.keys(v as Record<string, unknown>).filter((k) => (v as Record<string, unknown>)[k] !== undefined);
    if (keys.length === 0) return '{}';
    return '{\n' + keys.map((k) => {
      const val = (v as Record<string, unknown>)[k];
      const kk = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : "'" + esc(k) + "'";
      return indChild + kk + ': ' + write(val, depth + 1);
    }).join(',\n') + ',\n' + ind + '}';
  };
  return write(value, 0);
}

/** Validate a single entry object against the Registry contract. Returns error strings. */
export function validateEntry(entry: unknown, kind: EntryKind): string[] {
  const errors: string[] = [];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return ['entry must be an object'];
  }
  const e = entry as Record<string, unknown>;
  const req = FIELD_ORDER[kind];
  for (const f of ['slug', 'title', 'summary', 'updatedAt']) {
    if (f in req) {
      const v = e[f];
      if (typeof v !== 'string' || !v.trim()) errors.push(f + ' is required and must be a non-empty string');
    }
  }
  if (typeof e.slug !== 'string') errors.push('slug must be a string');
  else if (!/^[a-z0-9-]+$/.test(e.slug as string)) errors.push('slug must be kebab lowercase');

  if (e.status !== undefined && !STATUS_VALUES.has(e.status as string)) {
    errors.push('status must be available | coming_soon | beta');
  }

  // media block
  const media = e.media as Media | undefined;
  if (media) {
    for (const slot of ['poster', 'overviewVideo', 'actualDemo'] as const) {
      const ref = media[slot] as LocalMediaRef | undefined;
      if (ref && typeof ref === 'object') {
        const p = ref.path as string;
        if (typeof p !== 'string') { errors.push('media ' + slot + ' path missing'); }
        else if (UNVERSIONED_MEDIA.test(p)) { errors.push('media path unversioned: ' + p); }
        else if (!VERSIONED_MEDIA.test(p)) { errors.push('media path not a versioned /media/{slug}/{asset}.{vN}.{ext}: ' + p); }
      }
    }
    for (const slot of ['posterExternal', 'overviewVideoExternal', 'actualDemoExternal'] as const) {
      const ref = media[slot] as ExternalMediaRef | undefined;
      if (ref) {
        if (typeof ref.externalUrl !== 'string' || !ref.externalUrl.startsWith('https://')) {
          errors.push('external media must use an https URL');
        }
        if (typeof ref.version !== 'string' || !ref.version.trim()) {
          errors.push('external media requires a version');
        }
      }
    }
    if (!Array.isArray(media.pending)) {
      errors.push('media.pending must be an array of slot names');
    } else {
      for (const s of media.pending as unknown[]) {
        if (!['poster', 'overviewVideo', 'actualDemo'].includes(s as string)) {
          errors.push('media.pending has unknown slot: ' + String(s));
        }
      }
    }
  }

  // releases
  if (kind === 'product') {
    const rels = e.releases as Release[] | undefined;
    if (Array.isArray(rels)) {
      if (e.status === 'available' && rels.length === 0) {
        errors.push('available products must declare at least one release');
      }
      let primaries = 0;
      for (const r of rels as unknown[]) {
        const rr = r as Record<string, unknown>;
        if (!RELEASE_PROVIDERS.has(rr.provider as string)) {
          errors.push('release provider must be one of the allowed values');
        }
        if (rr.verb !== undefined && !ACTION_VERBS.has(rr.verb as string)) {
          errors.push('release verb must be Download|Install|Open|Try');
        }
        if (rr.primary === true) primaries++;
        // a resolved release needs a target
        if (rr.provider === 'web' || rr.provider === 'direct') {
          if (!rr.url) errors.push('web/direct release needs url');
        }
        if (rr.provider === 'npm' || rr.provider === 'pypi') {
          if (!rr.package) errors.push('npm/pypi release needs package');
        }
        if (rr.provider === 'github_release') {
          if (!rr.repo) errors.push('github_release needs repo');
        }
      }
      if (primaries > 1) errors.push('at most one release may be primary');
    } else if (rels !== undefined) {
      errors.push('releases must be an array when present');
    } else if (e.status === 'available') {
      errors.push('available products must declare at least one release');
    }
  }

  // skill install method
  if (kind === 'skill') {
    const m = e.installMethod as string;
    if (m !== undefined && !['npm', 'pypi', 'copy', 'link'].includes(m)) {
      errors.push('installMethod must be npm|pypi|copy|link');
    }
  }

  // radar external
  if (kind === 'radar') {
    const ext = e.external as { originEnv?: string; path?: string; embed?: boolean } | undefined;
    if (ext) {
      if (typeof ext.originEnv !== 'string' || !ext.originEnv) errors.push('radar external needs originEnv');
      if (typeof ext.path !== 'string' || !ext.path) errors.push('radar external needs path');
      if (typeof ext.embed !== 'boolean') errors.push('radar external.embed must be boolean');
    }
  }

  // source
  const src = e.source as SourceRef | undefined;
  if (src) {
    if (typeof src.url !== 'string' || !src.url.trim()) errors.push('source.url required');
  }

  if (/NEXT_PUBLIC_[A-Z0-9_]*(TOKEN|SECRET|KEY|PASSWORD)/.test(JSON.stringify(e))) {
    errors.push('a NEXT_PUBLIC_* name looks secret');
  }

  return errors;
}

/** Validate the whole HomeCopy object. */
export function validateHome(home: unknown): string[] {
  const errors: string[] = [];
  if (!home || typeof home !== 'object' || Array.isArray(home)) return ['home must be an object'];
  const checkStrings = (prefix: string, obj: Record<string, unknown>, req: string[]) => {
    for (const k of req) {
      const v = obj[k];
      if (Array.isArray(v)) {
        for (const item of v) if (typeof item !== 'string' || !item) errors.push(prefix + k + ' has an empty line');
      } else if (typeof v !== 'string' || !v) {
        errors.push(prefix + k + ' is required');
      }
    }
  };
  checkStrings('hero.', home.hero as Record<string, unknown>, ['label', 'titleAccent', 'discoverPlaceholder', 'discoverLabel', 'primaryCta', 'secondaryCta']);
  for (const b of ['brand', 'instruct', 'works', 'resolve']) {
    checkStrings(b + '.', (home as Record<string, unknown>)[b] as Record<string, unknown>, ['index']);
  }
  return errors;
}

/**
 * Serialize a HomeCopy object back to content/home.ts, preserving the existing
 * file header (the `HomeCopy` interface and its doc comments) and rewriting only
 * the editable value + default export. Falls back to the canonical header above
 * if the file is missing or has no `export const home` marker.
 */
export async function serializeHomeSource(home: Record<string, unknown>, root = process.cwd()): Promise<string> {
  let header = DEFAULT_HOME_HEADER;
  try {
    const existing = await readFile(join(root, 'content', 'home.ts'), 'utf8');
    const marker = 'export const home';
    const idx = existing.indexOf(marker);
    if (idx >= 0) header = existing.slice(0, idx);
  } catch {
    /* first time / file missing — use DEFAULT_HOME_HEADER */
  }
  return header + 'export const home: HomeCopy = ' + toTSLiteral(home, 2) + ';\n\nexport default home;\n';
}

export async function saveHome(home: Record<string, unknown>, root = process.cwd()) {
  const source = await serializeHomeSource(home, root);
  return atomicWrite(join(root, 'content', 'home.ts'), source);
}

/** Serialize one entry to a content file body (no header/footer). */
function serializeEntryBody(entry: Record<string, unknown>, kind: EntryKind): string {
  const ordered: Record<string, unknown> = {};
  const keys = FIELD_ORDER[kind];
  // keep declared order; include any extra keys the editor sent that are valid
  for (const k of keys) if (k in entry) ordered[k] = entry[k];
  for (const k of Object.keys(entry)) if (!(k in ordered)) ordered[k] = entry[k];
  const body = toTSLiteral(ordered, 2);
  const typePath = '../../src/registry/types';
  const type = IMPORT_TYPE[kind];
  const slug = String((entry.slug as string) ?? 'entry');
  return `// Studio: ${slug} (${kind}). Editable registry copy.
import type { ${type} } from '${typePath}';

export default ${body} satisfies ${type};
`;
}

/** Serialize the products index.ts aggregator for a slug list. */
function serializeProductsIndex(slugs: string[]): string {
  const lines = slugs.map((s) => `import ${s} from './${s}';`);
  const arr = slugs.map((s) => s).join(', ');
  return `// Studio-generated index. Keep in sync with content/products/*.ts.
import type { ProductEntry } from '../../src/registry/types';

export const products: ProductEntry[] = [${arr}];

export default products;
`;
}

/** Serialize an array-backed section (labs/skills/radar) index.ts. */
function serializeArrayIndex(entries: AnyEntry[], kind: EntryKind): string {
  const type = kind === 'lab' ? 'LabEntry' : kind === 'skill' ? 'SkillEntry' : 'RadarEntry';
  const arrName = kind === 'lab' ? 'labs' : kind === 'skill' ? 'skills' : 'radar';
  const body = toTSLiteral(entries as unknown as Record<string, unknown>[], 2);
  return `// Studio: ${arrName} registry. Editable by Studio.
import type { ${type} } from '../../src/registry/types';

export const ${arrName}: ${type}[] = ${body};

export default ${arrName};
`;
}

/**
 * Atomic, import-validated write. Writes to a temp file ending in `.ts` so the
 * Studio's own tsx loader can import-check it, then renames into place. If the
 * temp file fails to import, the original is left untouched and an error is
 * returned. A pre-write backup is kept only for the in-flight rename safety.
 */
export async function atomicWrite(filePath: string, content: string): Promise<{ ok: boolean; error?: string }> {
  const tmp = filePath + '.__studio_tmp__' + process.pid + '.' + Math.random().toString(36).slice(2) + '.ts';
  try {
    await writeFile(tmp, content, 'utf8');
    // Validate the serialized TS actually loads before it can replace the target.
    try {
      const mod = await import(pathToFileURL(tmp).href);
      if (mod.default === undefined && mod.home === undefined && Object.keys(mod).length === 0) {
        throw new Error('temp file exported nothing');
      }
    } catch (e) {
      await unlink(tmp).catch(() => {});
      return { ok: false, error: 'serialized content failed to load: ' + (e as Error).message };
    }
    await rename(tmp, filePath);
    return { ok: true };
  } catch (e) {
    await unlink(tmp).catch(() => {});
    return { ok: false, error: (e as Error).message };
  }
}

/** Dynamic import that always reflects a file's CURRENT bytes. Node/tsx cache
 * ES modules by resolved path, so query-busters do not work; instead we write a
 * fresh, uniquely-named temp copy (which inherits the original's relative
 * import resolution since it sits in the same directory), import THAT, then
 * delete it. The temp is a verbatim copy of an already-valid content file, so it
 * can never introduce verify-registry / build errors even if a build overlaps. */
async function reload(file: string): Promise<any> {
  const tmp = file + '.__l' + Date.now() + '.' + Math.random().toString(36).slice(2) + '.ts';
  const src = await readFile(file, 'utf8');
  await writeFile(tmp, src);
  try {
    return await import(pathToFileURL(tmp).href);
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

export async function loadHome(root = process.cwd()): Promise<Record<string, unknown>> {
  const mod = await reload(join(root, 'content', 'home.ts'));
  return mod.default ?? mod.home ?? {};
}

export async function loadEntry(section: Section, slug: string, root = process.cwd()): Promise<AnyEntry> {
  if (section === 'products') {
    const file = join(root, 'content', 'products', slug + '.ts');
    const mod = await reload(file);
    return mod.default;
  }
  const mod = await reload(join(root, 'content', section, 'index.ts'));
  const arr: AnyEntry[] = mod[section] ?? mod.default ?? [];
  return arr.find((e) => e.slug === slug) ?? null;
}

export async function listSection(section: Section, root = process.cwd()): Promise<EntryInfo[]> {
  if (section === 'products') {
    const dir = join(root, 'content', 'products');
    const out: EntryInfo[] = [];
    for (const name of await readdir(dir)) {
      // Only plain slug.ts product files are registry entries; this excludes
      // index.ts and any in-flight .__l/.__studio_tmp reload/atomic temp files.
      if (name === 'index.ts' || !/^[a-z0-9-]+\.ts$/.test(name)) continue;
      const slug = name.slice(0, -3);
      const file = join(dir, name);
      const entry = (await reload(file)).default;
      out.push({ section, slug, path: 'content/products/' + name, entry });
    }
    return out;
  }
  const mod = await reload(join(root, 'content', section, 'index.ts'));
  const arr: AnyEntry[] = mod[section] ?? mod.default ?? [];
  return arr.map((entry) => ({
    section,
    slug: String(entry.slug),
    path: 'content/' + section + '/index.ts',
    entry,
  }));
}

export async function saveEntry(section: Section, slug: string, entry: Record<string, unknown>, root = process.cwd()) {
  const kind = KIND_FOR_SECTION[section];
  // sanitize: keep only allowed, schema-shaped data; strip the slug mismatch
  const safe = { ...entry, slug: String(entry.slug ?? slug) };
  const file = join(root, 'content', section, slug + '.ts');
  return atomicWrite(file, serializeEntryBody(safe, kind));
}

/** Rewrite an array-backed section index with `entries` in the given order. */
export async function saveArraySection(section: Section, entries: AnyEntry[], root = process.cwd()) {
  const kind = KIND_FOR_SECTION[section];
  const file = join(root, 'content', section, 'index.ts');
  return atomicWrite(file, serializeArrayIndex(entries as AnyEntry[], kind));
}

export async function saveProductsIndex(slugs: string[], root = process.cwd()) {
  return atomicWrite(join(root, 'content', 'products', 'index.ts'), serializeProductsIndex(slugs));
}

export async function deleteEntryFile(section: Section, slug: string, root = process.cwd()) {
  const file = join(root, 'content', section, slug + '.ts');
  try {
    await unlink(file);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export { serializeEntryBody, serializeProductsIndex, serializeArrayIndex };
export { FIELD_ORDER, VERSIONED_MEDIA, UNVERSIONED_MEDIA, ACTION_VERBS, STATUS_VALUES, RELEASE_PROVIDERS };
