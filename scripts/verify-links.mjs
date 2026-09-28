#!/usr/bin/env node
/**
 * JU Portal CTA reachability check - NETWORK AWARD. CI only, never the Vercel build.
 *
 * Founder rule: no broken CTA. An entry may only claim status 'available' if its
 * primary action resolves to a live target, so this probes the ACTUAL user-facing
 * URL - not the repository page, and not merely "a release exists".
 *
 * Probe method matters. GitHub release asset URLs answer HEAD with 401 while
 * serving GET fine, so downloads are probed with a ranged GET. Registry and page
 * targets use GET too, to avoid method-specific false failures.
 *
 * Network errors are SKIP, never FAIL, so an offline runner cannot block a deploy.
 * A real HTTP error status IS a failure.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const UA = { 'User-Agent': 'ju-portal-infra', Accept: '*/*' };
const TIMEOUT_MS = 15000;

let failures = 0;
let skips = 0;
let checked = 0;

async function once(url, method, extraHeaders) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method,
      headers: { ...UA, ...extraHeaders },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (r.body) await r.arrayBuffer().catch(() => {});
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, network: true, error: e.name || 'Error' };
  } finally {
    clearTimeout(t);
  }
}

async function probe(url) {
  // ranged GET first: cheap, and works for large downloads and range-capable hosts
  let r = await once(url, 'GET', { Range: 'bytes=0-0' });
  // some hosts reject Range; retry plainly before judging
  if (r.network || r.status === 416 || r.status === 400) {
    r = await once(url, 'GET', {});
  }
  return r;
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

const srcRE = /source:\s*\{[^}]*?url:\s*['"`]([^'"`]+)['"`]/g;
const extRE = /externalUrl:\s*['"`]([^'"`]+)['"`]/g;
const pkgRE = /provider:\s*['"`](npm|pypi)['"`][\s\S]{0,240}?package:\s*['"`]([^'"`]+)['"`]/g;
const repoRE = /repo:\s*['"`]([^'"`]+)['"`]/g;
const tagRE = /tag:\s*['"`]([^'"`]+)['"`]/g;
const assetRE = /asset:\s*['"`]([^'"`]+)['"`]/g;

for (const f of files) {
  const src = await readFile(f, 'utf8');
  const rel = relative(process.cwd(), f).split(sep).join('/');
  let m;

  while ((m = srcRE.exec(src)) !== null) {
    const v = m[1];
    // source.url is often already absolute - do not re-prefix it
    targets.push({ rel, kind: 'source', url: v.startsWith('http') ? v : 'https://github.com/' + v });
  }
  while ((m = extRE.exec(src)) !== null) targets.push({ rel, kind: 'media', url: m[1] });
  while ((m = pkgRE.exec(src)) !== null) {
    // the packument lives at the bare registry path, NOT /json
    const base = m[1] === 'npm' ? 'https://registry.npmjs.org/' : 'https://pypi.org/pypi/';
    targets.push({ rel, kind: 'pkg', url: base + m[2] });
  }

  // Resolve github_release to the REAL download URL the user will click.
  const repos = [...src.matchAll(repoRE)].map((x) => x[1]);
  const tags = [...src.matchAll(tagRE)].map((x) => x[1]);
  const assets = [...src.matchAll(assetRE)].map((x) => x[1]);
  for (const repo of repos) {
    for (const tag of tags.length ? tags : [null]) {
      for (const asset of assets.length ? assets : [null]) {
        const url = asset
          ? 'https://github.com/' + repo + '/releases/download/' + (tag || 'latest') + '/' + asset
          : 'https://github.com/' + repo + '/releases/' + (tag ? 'tag/' + tag : 'latest');
        targets.push({ rel, kind: asset ? 'download' : 'release', url });
      }
    }
  }
}

const seen = new Set();
const uniq = targets.filter((t) => {
  if (seen.has(t.url)) return false;
  seen.add(t.url);
  return true;
});

console.log('[verify-links] probing ' + uniq.length + ' unique target(s)...');

for (const t of uniq) {
  const r = await probe(t.url);
  checked++;
  const label = '[' + t.kind + ']';
  const where = t.rel + ' ';
  if (r.network) {
    console.log('  SKIP  ' + where + label + ' ' + t.url + ' (' + r.error + ')');
    skips++;
  } else if (r.ok) {
    console.log('  ok    ' + where + label + ' ' + r.status + ' ' + t.url);
  } else {
    console.error('  FAIL  ' + where + label + ' ' + r.status + ' ' + t.url);
    failures++;
  }
}

console.log(
  '\n[verify-links] ' + checked + ' probed, ' + failures + ' failure(s), ' + skips + ' skip(s)',
);
process.exit(failures > 0 ? 1 : 0);
