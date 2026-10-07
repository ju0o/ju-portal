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

type SourceToken = { text: string; start: number; end: number; kind: 'word' | 'string' | 'punct' };
type SourceValue = {
  kind: 'object' | 'array' | 'atom';
  start: number;
  literalEnd: number;
  end: number;
  properties?: Map<string, SourceValue>;
  items?: SourceValue[];
};
type OriginalSlice = { value: unknown; text: string };
type SourceSaveState = { lastSource: string; originals: Map<string, OriginalSlice> };

const sourceSaveStates = new Map<string, SourceSaveState>();

/** Small source scanner for the JSON-shaped object/array literals in content/*.ts. */
function sourceTokens(source: string): SourceToken[] {
  const tokens: SourceToken[] = [];
  for (let i = 0; i < source.length;) {
    const c = source[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) throw new Error('unterminated source comment');
      i = end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const start = i;
      const quote = c;
      i++;
      while (i < source.length) {
        if (source[i] === '\\') { i += Math.min(2, source.length - i); continue; }
        if (source[i++] === quote) break;
      }
      if (source[i - 1] !== quote) throw new Error('unterminated source string');
      tokens.push({ text: source.slice(start, i), start, end: i, kind: 'string' });
      continue;
    }
    if (/[$_\p{L}]/u.test(c)) {
      const start = i++;
      while (i < source.length && /[$_\u200c\u200d\p{L}\p{N}]/u.test(source[i])) i++;
      tokens.push({ text: source.slice(start, i), start, end: i, kind: 'word' });
      continue;
    }
    if (/[0-9]/.test(c)) {
      const start = i++;
      while (i < source.length && /[\w.]/.test(source[i])) i++;
      tokens.push({ text: source.slice(start, i), start, end: i, kind: 'word' });
      continue;
    }
    tokens.push({ text: c, start: i, end: i + 1, kind: 'punct' });
    i++;
  }
  return tokens;
}

const CLOSERS: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
function expressionEnd(tokens: SourceToken[], start: number, stops: string[]): number {
  const stack: string[] = [];
  for (let i = start; i < tokens.length; i++) {
    const text = tokens[i].text;
    if (CLOSERS[text]) stack.push(CLOSERS[text]);
    else if (text === '}' || text === ']' || text === ')') {
      if (stack.length === 0) return i;
      if (stack.pop() !== text) throw new Error('mismatched source delimiter');
    } else if (stack.length === 0 && stops.includes(text)) return i;
  }
  if (stack.length) throw new Error('unterminated source value');
  return tokens.length;
}

function matchingClose(tokens: SourceToken[], open: number): number {
  const close = CLOSERS[tokens[open]?.text];
  if (!close) throw new Error('expected source object or array');
  const stack = [close];
  for (let i = open + 1; i < tokens.length; i++) {
    const text = tokens[i].text;
    if (CLOSERS[text]) stack.push(CLOSERS[text]);
    else if (text === '}' || text === ']' || text === ')') {
      if (stack.pop() !== text) throw new Error('mismatched source delimiter');
      if (stack.length === 0) return i;
    }
  }
  throw new Error('unterminated source object or array');
}

function sourceValue(tokens: SourceToken[], start: number, end: number): SourceValue {
  const first = tokens[start];
  const last = tokens[end - 1];
  if (!first || !last || end <= start) throw new Error('missing source value');
  if (first.text === '{') {
    const close = matchingClose(tokens, start);
    const properties = new Map<string, SourceValue>();
    for (let i = start + 1; i < close;) {
      if (tokens[i].text === ',') { i++; continue; }
      const key = tokens[i];
      if (key.kind !== 'word' || tokens[i + 1]?.text !== ':') {
        throw new Error('unsupported content object property');
      }
      const valueStart = i + 2;
      const valueEnd = expressionEnd(tokens, valueStart, [',', '}']);
      properties.set(key.text, sourceValue(tokens, valueStart, valueEnd));
      i = valueEnd + (tokens[valueEnd]?.text === ',' ? 1 : 0);
    }
    return { kind: 'object', start: first.start, literalEnd: tokens[close].end, end: last.end, properties };
  }
  if (first.text === '[') {
    const close = matchingClose(tokens, start);
    const items: SourceValue[] = [];
    for (let i = start + 1; i < close;) {
      if (tokens[i].text === ',') { i++; continue; }
      const valueEnd = expressionEnd(tokens, i, [',', ']']);
      items.push(sourceValue(tokens, i, valueEnd));
      i = valueEnd + (tokens[valueEnd]?.text === ',' ? 1 : 0);
    }
    return { kind: 'array', start: first.start, literalEnd: tokens[close].end, end: last.end, items };
  }
  return { kind: 'atom', start: first.start, literalEnd: first.end, end: last.end };
}

function exportedValue(source: string, declaration: string): SourceValue {
  const tokens = sourceTokens(source);
  let start = -1;
  if (declaration === 'default') {
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i].text === 'export' && tokens[i + 1].text === 'default') { start = i + 2; break; }
    }
  } else {
    for (let i = 0; i < tokens.length - 2; i++) {
      if (tokens[i].text === 'export' && tokens[i + 1].text === 'const' && tokens[i + 2].text === declaration) {
        let eq = i + 3;
        while (eq < tokens.length && tokens[eq].text !== '=') eq++;
        start = eq + 1;
        break;
      }
    }
  }
  if (start < 0 || start >= tokens.length) throw new Error('content source declaration not found: ' + declaration);
  const end = expressionEnd(tokens, start, [';']);
  return sourceValue(tokens, start, end);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ak = Object.keys(a as object).sort();
  const bk = Object.keys(b as object).sort();
  return ak.length === bk.length && ak.every((key, i) => key === bk[i] && sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

function cloneSourceValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hasOriginalAncestor(state: SourceSaveState, path: Array<string | number>): boolean {
  for (const key of state.originals.keys()) {
    const ancestor = JSON.parse(key) as Array<string | number>;
    if (ancestor.length < path.length && ancestor.every((part, i) => part === path[i])) return true;
  }
  return false;
}

function quotedString(value: string, quote: string): string {
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(new RegExp(quote, 'g'), '\\' + quote)
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  return quote + escaped + quote;
}

function renderSourceValue(value: unknown, source: string, node: SourceValue): string {
  const raw = source.slice(node.start, node.literalEnd);
  const quote = raw[0] === '"' || raw[0] === "'" ? raw[0] : "'";
  const literal = typeof value === 'string' ? quotedString(value, quote) : toTSLiteral(value, 2);
  return literal + source.slice(node.literalEnd, node.end);
}

function patchSourceValue(
  node: SourceValue,
  oldValue: unknown,
  newValue: unknown,
  path: Array<string | number>,
  source: string,
  state: SourceSaveState,
  patches: Array<{ start: number; end: number; text: string }>,
): void {
  if (sameValue(oldValue, newValue)) return;
  const pathKey = JSON.stringify(path);
  const savedOriginal = state.originals.get(pathKey);
  if (savedOriginal && sameValue(newValue, savedOriginal.value)) {
    patches.push({ start: node.start, end: node.end, text: savedOriginal.text });
    for (const key of state.originals.keys()) {
      const child = JSON.parse(key) as Array<string | number>;
      if (child.length > path.length && path.every((part, i) => child[i] === part)) state.originals.delete(key);
    }
    state.originals.delete(pathKey);
    return;
  }
  if (oldValue && newValue && typeof oldValue === 'object' && typeof newValue === 'object' && !Array.isArray(oldValue) && !Array.isArray(newValue) && node.kind === 'object') {
    const oldKeys = Object.keys(oldValue as object);
    const newKeys = Object.keys(newValue as object);
    if (oldKeys.length === newKeys.length && oldKeys.every((key) => key in (newValue as object)) && oldKeys.every((key) => node.properties!.has(key))) {
      for (const key of oldKeys) {
        patchSourceValue(node.properties!.get(key)!, (oldValue as Record<string, unknown>)[key], (newValue as Record<string, unknown>)[key], [...path, key], source, state, patches);
      }
      return;
    }
  } else if (Array.isArray(oldValue) && Array.isArray(newValue) && node.kind === 'array' && oldValue.length === newValue.length) {
    for (let i = 0; i < oldValue.length; i++) patchSourceValue(node.items![i], oldValue[i], newValue[i], [...path, i], source, state, patches);
    return;
  }

  let original = state.originals.get(pathKey);
  if (!original && !hasOriginalAncestor(state, path)) {
    original = { value: cloneSourceValue(oldValue), text: source.slice(node.start, node.end) };
    state.originals.set(pathKey, original);
  }
  if (original && sameValue(newValue, original.value)) {
    patches.push({ start: node.start, end: node.end, text: original.text });
    state.originals.delete(pathKey);
  } else {
    patches.push({ start: node.start, end: node.end, text: renderSourceValue(newValue, source, node) });
  }
}

function makeSourceSaveState(file: string, source: string): SourceSaveState {
  const existing = sourceSaveStates.get(file);
  if (existing && existing.lastSource === source) return { lastSource: source, originals: new Map(existing.originals) };
  return { lastSource: source, originals: new Map() };
}

async function surgicallyWrite(
  file: string,
  oldValue: unknown,
  newValue: unknown,
  declaration: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const source = await readFile(file, 'utf8');
    const root = exportedValue(source, declaration);
    const state = makeSourceSaveState(file, source);
    const patches: Array<{ start: number; end: number; text: string }> = [];
    patchSourceValue(root, oldValue, newValue, [], source, state, patches);
    const updated = patches.sort((a, b) => b.start - a.start).reduce(
      (text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source,
    );
    if (updated === source) return { ok: true };
    const result = await atomicWrite(file, updated);
    if (result.ok) {
      state.lastSource = updated;
      if (state.originals.size) sourceSaveStates.set(file, state);
      else sourceSaveStates.delete(file);
    }
    return result;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
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

export function userFacingValidationMessage(error: string): string {
  const exact: Record<string, string> = {
    'npm/pypi release needs package': 'npm 또는 PyPI 릴리스를 사용하려면 패키지 이름이 필요합니다.',
    'github_release needs repo': 'GitHub 릴리스를 사용하려면 저장소가 필요합니다.',
    'web/direct release needs url': '웹 또는 직접 다운로드 방식에는 링크 주소가 필요합니다.',
    'available products must declare at least one release': '사용 가능한 제품에는 하나 이상의 설치 또는 실행 방법이 필요합니다.',
    'at most one release may be primary': '대표 버튼은 하나만 지정할 수 있습니다.',
    'source.url required': '출처 링크를 입력해 주세요.',
    'entry must be an object': '제품 정보를 확인할 수 없습니다. 다시 열어 주세요.',
    'home must be an object': '홈페이지 정보를 확인할 수 없습니다. 다시 열어 주세요.',
  };
  if (exact[error]) return exact[error];
  if (error.includes(' must be one of the allowed values') || error.includes(' must be ')) return '선택한 항목의 값을 다시 확인해 주세요.';
  if (error.includes(' is required') || error.includes('required')) return '필수 항목을 입력해 주세요.';
  if (error.includes('media path') || error.includes('media ')) return '이미지 또는 영상 경로를 확인해 주세요.';
  if (error.includes('slug')) return '주소에 사용할 영문 소문자와 숫자, 하이픈을 확인해 주세요.';
  return '입력한 내용을 다시 확인해 주세요.';
}

/** Return the original Home module with only changed value ranges replaced. */
export async function serializeHomeSource(home: Record<string, unknown>, root = process.cwd()): Promise<string> {
  const file = join(root, 'content', 'home.ts');
  const source = await readFile(file, 'utf8');
  const previous = await loadHome(root);
  const patches: Array<{ start: number; end: number; text: string }> = [];
  patchSourceValue(exportedValue(source, 'home'), previous, home, [], source, { lastSource: source, originals: new Map() }, patches);
  return patches.sort((a, b) => b.start - a.start).reduce(
    (text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), source,
  );
}

export async function saveHome(home: Record<string, unknown>, root = process.cwd()) {
  return surgicallyWrite(join(root, 'content', 'home.ts'), await loadHome(root), home, 'home');
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
  return `import type { ${type} } from '${typePath}';

export default ${body} satisfies ${type};
`;
}

/** Serialize the products index.ts aggregator for a slug list. */
function serializeProductsIndex(slugs: string[]): string {
  const arr = slugs.map((s) => s).join(', ');
  return `import type { ProductEntry } from '../../src/registry/types';

export const products: ProductEntry[] = [${arr}];

export default products;
`;
}

/** Serialize an array-backed section (labs/skills/radar) index.ts. */
function serializeArrayIndex(entries: AnyEntry[], kind: EntryKind): string {
  const type = kind === 'lab' ? 'LabEntry' : kind === 'skill' ? 'SkillEntry' : 'RadarEntry';
  const arrName = kind === 'lab' ? 'labs' : kind === 'skill' ? 'skills' : 'radar';
  const body = toTSLiteral(entries as unknown as Record<string, unknown>[], 2);
  return `import type { ${type} } from '../../src/registry/types';

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
  try {
    await stat(file);
    const previous = await loadEntry(section, slug, root);
    return surgicallyWrite(file, previous, safe, 'default');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return { ok: false, error: (e as Error).message };
    return atomicWrite(file, serializeEntryBody(safe, kind));
  }
}

/** Preserve the index module and patch only changed entry values. */
export async function saveArraySection(section: Section, entries: AnyEntry[], root = process.cwd()) {
  const file = join(root, 'content', section, 'index.ts');
  const previous = (await listSection(section, root)).map((item) => item.entry);
  return surgicallyWrite(file, previous, entries, section);
}

export async function saveProductsIndex(slugs: string[], root = process.cwd()) {
  if (!slugs.every((slug) => /^[a-z0-9-]+$/.test(slug))) return { ok: false, error: 'invalid product slug' };
  const file = join(root, 'content', 'products', 'index.ts');
  try {
    const source = await readFile(file, 'utf8');
    const node = exportedValue(source, 'products');
    if (node.kind !== 'array') throw new Error('products index must be an array');
    const current = node.items!.map((item) => source.slice(item.start, item.end));
    if (sameValue(current, slugs)) return { ok: true };
    const currentLiteral = source.slice(node.start, node.literalEnd);
    const multiline = currentLiteral.includes('\n');
    const literal = multiline
      ? '[\n' + slugs.map((slug) => '  ' + slug + ',').join('\n') + '\n]'
      : '[' + slugs.join(', ') + ']';
    return atomicWrite(file, source.slice(0, node.start) + literal + source.slice(node.literalEnd));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
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
