#!/usr/bin/env node
/**
 * JU Portal registry verifier - OFFLINE and DETERMINISTIC.
 *
 * Runs as the Vercel build command. It must never touch the network: a transient
 * network failure must not be able to take production down. Network CTA
 * reachability lives in verify-links.mjs (CI only).
 *
 * Enforces the two Founder directives:
 *   1. The Registry owns the exact media asset path, and every asset path is
 *      immutable by construction (version segment required).
 *   2. Video-optional, video-first: absent assets are legal, but DECLARED-but-absent
 *      assets are a build failure.
 *
 * Exit 0 = ok (warnings allowed). Exit 1 = build failure.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const errors = [];
const warnings = [];

const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

/**
 * Filename must be {asset}.{version}.{ext} where version is vN or an 8-char hash.
 *   overview.v1.mp4      OK
 *   poster.a1b2c3d4.jpg  OK
 *   overview.mp4         REJECTED (unversioned canonical)
 *   poster.jpg           REJECTED
 */
const VERSIONED = /^[^/]+\.(v\d+|[0-9a-f]{8})\.[a-z0-9]+$/i;
/** Canonical unversioned names that are forbidden outright. */
const FORBIDDEN_CANONICAL = /\/(overview|poster|demo)\.(mp4|jpg)$/i;

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.name.endsWith('.ts') || e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** Repo-relative existence check. Used for real files like content/<section>/index.ts. */
async function existsRepo(rel) {
  try {
    const s = await stat(join(ROOT, rel));
    return s.isFile();
  } catch {
    return false;
  }
}

/**
 * Registry media paths are PUBLIC URL paths: /media/{slug}/{asset}.{version}.{ext}
 * They resolve on disk under public/. This mapping is the whole reason a declared
 * path that does not exist can be caught at build time. Do NOT use this for
 * ordinary repo files.
 */
async function existsPublicMedia(rel) {
  try {
    const s = await stat(join(ROOT, 'public', rel.replace(/^\//, '')));
    return s.isFile();
  } catch {
    return false;
  }
}

// 1. required IA sections exist
for (const section of ['products', 'skills', 'labs', 'radar']) {
  if (!(await existsRepo('content/' + section + '/index.ts'))) {
    err('Missing required IA section: content/' + section + '/index.ts');
  }
}

// 2. media path policy
const contentFiles = [
  ...(await walk(join(ROOT, 'content'))),
  ...(await walk(join(ROOT, 'src'))),
];
const MEDIA_STRING = /(['"`])(\/media\/[^'"`]+)\1/g;

for (const file of contentFiles) {
  const src = await readFile(file, 'utf8');
  const rel = relative(ROOT, file).split(sep).join('/');
  let m;
  while ((m = MEDIA_STRING.exec(src)) !== null) {
    const p = m[2];

    if (FORBIDDEN_CANONICAL.test(p)) {
      err(rel + ': unversioned canonical media path "' + p + '". Use {asset}.{version}.{ext}.');
      continue;
    }
    if (!VERSIONED.test(p.split('/').pop())) {
      err(rel + ': media path "' + p + '" has no version segment. Filename must end .{vN} or .{hash8}.');
      continue;
    }
    if (!(await existsPublicMedia(p))) {
      err(rel + ': declared media path "' + p + '" does not exist in public/. Remove it or add the file.');
    }
  }
}

// 3. external media must be https
const EXTERNAL_STRING = /externalUrl:\s*['"`]([^'"`]+)['"`]/g;
for (const file of contentFiles) {
  const src = await readFile(file, 'utf8');
  const rel = relative(ROOT, file).split(sep).join('/');
  let m;
  while ((m = EXTERNAL_STRING.exec(src)) !== null) {
    if (!m[1].startsWith('https://')) err(rel + ': externalUrl must be https - "' + m[1] + '"');
  }
}

// 4. no secrets behind NEXT_PUBLIC_
for (const file of contentFiles) {
  const src = await readFile(file, 'utf8');
  const rel = relative(ROOT, file).split(sep).join('/');
  if (/NEXT_PUBLIC_[A-Z0-9_]*(TOKEN|SECRET|KEY|PASSWORD)/.test(src)) {
    err(rel + ': NEXT_PUBLIC_* name suggests a secret. NEXT_PUBLIC_ is inlined into the client bundle.');
  }
}

// 5. report
for (const w of warnings) console.warn('  warn  ' + w);
for (const e of errors) console.error('  ERROR ' + e);

if (errors.length) {
  console.error('\n[verify-registry] FAILED - ' + errors.length + ' error(s), ' + warnings.length + ' warning(s)');
  process.exit(1);
}
console.log('[verify-registry] OK - ' + contentFiles.length + ' source file(s) scanned, ' + warnings.length + ' warning(s)');
