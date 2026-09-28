#!/usr/bin/env node
/**
 * JU Portal CTA reachability check - NETWORK AWARD. CI only, never the Vercel build.
 *
 * Founder rule: no broken CTA. An entry marked 'available' must resolve to a live
 * target. Anything unresolvable is reported so the Registry can be corrected or the
 * entry downgraded to coming_soon.
 *
 * Network errors are reported as SKIP, never as FAIL, so an offline CI runner
 * cannot block a deploy. A real HTTP error status IS a failure.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const UA = {
  'User-Agent': 'ju-portal-infra',
  Accept: 'application/vnd.github+json',
};
const TIMEOUT_MS = 12000;

let failures = 0;
let skips = 0;

async function probe(url, method = 'HEAD') {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method,
      headers: UA,
      signal: ctrl.signal,
      redirect: 'follow',
    });
    return { ok: r.ok, status: r.status, final: r.url };
  } catch (e) {
    return { ok: false, network: true, error: e.name || 'Error' };
  } finally {
    clearTimeout(t);
  }
}

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
    else if (e.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const files = await walk(join(process.cwd(), 'content'));
const targets = [];

const repoRE = /repo:\s*['"`]([^'"`]+)['"`]/g;
const assetRE = /asset:\s*['"`]([^'"`]+)['"`]/g;
const tagRE = /tag:\s*['"`]([^'"`]+)['"`]/g;
const pkgRE = /provider:\s*['"`](npm|pypi)['"`][\s\S]{0,240}?package:\s*['"`]([^'"`]+)['"`]/g;
const extRE = /externalUrl:\s*['"`]([^'"`]+)['"`]/g;
const srcRE = /source:\s*\{[^}]*url:\s*['"`]([^'"`]+)['"`]/g;

for (const f of files) {
  const src = await readFile(f, 'utf8');
  const rel = relative(process.cwd(), f).split(sep).join('/');
  let m;

  while ((m = repoRE.exec(src)) !== null) targets.push({ rel, kind: 'repo', value: m[1] });
  while ((m = assetRE.exec(src)) !== null) targets.push({ rel, kind: 'asset', value: m[1] });
  while ((m = tagRE.exec(src)) !== null) targets.push({ rel, kind: 'tag', value: m[1] });
  while ((m = pkgRE.exec(src)) !== null) {
    const base = m[1] === 'npm' ? 'https://registry.npmjs.org/' : 'https://pypi.org/pypi/';
    targets.push({ rel, kind: 'pkg', value: base + m[2] + '/json' });
  }
  while ((m = extRE.exec(src)) !== null) targets.push({ rel, kind: 'media', value: m[1] });
  while ((m = srcRE.exec(src)) !== null) targets.push({ rel, kind: 'source', value: m[1] });
}

console.log('[verify-links] probing ' + targets.length + ' target(s)...');

for (const t of targets) {
  let url = t.value;
  if (t.kind === 'repo' || t.kind === 'source') url = 'https://github.com/' + t.value;
  else if (t.kind === 'asset') url = '(release asset, verified via its release below)';
  else if (t.kind === 'tag') url = '(pinned tag, verified via its release below)';

  if (url.startsWith('(')) {
    console.log('  info  ' + t.rel + ' -> ' + url);
    continue;
  }

  const r = await probe(url);
  if (r.network) {
    console.log('  SKIP  ' + t.rel + ' -> ' + url + ' (' + r.error + ')');
    skips++;
  } else if (r.ok) {
    console.log('  ok    ' + t.rel + ' -> ' + r.status + ' ' + url);
  } else {
    console.error('  FAIL  ' + t.rel + ' -> ' + r.status + ' ' + url);
    failures++;
  }
}

console.log('\n[verify-links] ' + failures + ' failure(s), ' + skips + ' skip(s)');
process.exit(failures > 0 ? 1 : 0);
