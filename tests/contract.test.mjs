import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const sourceFiles = [
  ...walk(join(ROOT, 'src')),
  ...walk(join(ROOT, 'scripts')),
  ...walk(join(ROOT, 'content')),
].filter((f) => /\.(ts|js|mjs)$/.test(f));

const readAll = (files) => files.map((f) => readFileSync(f, 'utf8')).join('\n');
const builderSource = readAll(sourceFiles.filter((f) => !f.includes('verify-registry')));

// ---------- resolver ownership ----------

test('getPrimaryAction has exactly ONE implementation in the repo', () => {
  const defs = sourceFiles.filter((f) =>
    /function\s+getPrimaryAction\s*\(/.test(readFileSync(f, 'utf8')),
  );
  assert.equal(defs.length, 1, 'expected one getPrimaryAction definition, got: ' + defs.join(', '));
  assert.ok(defs[0].endsWith('src/registry/action.ts'), 'the resolver must live in src/registry/action.ts');
});

test('Builder code consumes the resolver and never reimplements it', () => {
  // pages.js / detail.js / components.js must import the Infra resolver.
  for (const f of ['src/ui/pages.js', 'src/ui/detail.js', 'src/ui/components.js']) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    assert.ok(src.includes("from '../registry/action.ts'"), f + ' must import the Infra resolver');
  }
});

// ---------- products ----------

test('Products contains JuQode and JuTell only', () => {
  const html = readFileSync(join(DIST, 'products/index.html'), 'utf8');
  assert.ok(html.includes('JuQode'), 'JuQode missing');
  assert.ok(html.includes('JuTell'), 'JuTell missing');
  for (const banned of ['JuCoding', 'JuRelay', 'Dios']) {
    assert.ok(!html.includes(banned), banned + ' must not be promoted');
  }
});

test('Labs entries are absent from the Products catalog', () => {
  const html = readFileSync(join(DIST, 'products/index.html'), 'utf8');
  for (const lab of ['JuDoctor', 'JuControler', 'JuCeipt', 'JuMiner']) {
    assert.ok(!html.includes(lab), lab + ' must not appear on /products');
  }
});

test('Labs never advertise a distribution or an install control', () => {
  const html = readFileSync(join(DIST, 'labs/index.html'), 'utf8');
  assert.ok(!/<a[^>]+class="btn"[^>]*>\s*Download/.test(html), 'Labs must have no Download CTA');
  assert.ok(!/npm i /.test(html), 'Labs must not show an install command');
  assert.ok(html.includes('aria-disabled="true"') || !html.includes('Download'), 'Labs CTA must be disabled');
});

// ---------- actions ----------

test('JuQode primary resolves to the verified web Try target', async () => {
  const { default: juqode } = await import(
    new URL('content/products/juqode.ts', `file://${ROOT}/`).href
  );
  const { getPrimaryAction } = await import(
    new URL('src/registry/action.ts', `file://${ROOT}/`).href
  );
  const a = getPrimaryAction(juqode);
  assert.equal(a.resolved, true);
  assert.equal(a.verb, 'Try');
  assert.equal(a.href, 'https://ju0o.github.io/JuQode/');
});

test('JuTell primary resolves to an Install through the resolver', async () => {
  const { default: jutell } = await import(
    new URL('content/products/jutell.ts', `file://${ROOT}/`).href
  );
  const { getPrimaryAction } = await import(
    new URL('src/registry/action.ts', `file://${ROOT}/`).href
  );
  const a = getPrimaryAction(jutell);
  assert.equal(a.resolved, true);
  assert.equal(a.verb, 'Install');
  assert.equal(a.command, 'npm i jutell');
});

test('no rendered page exposes a provider name', () => {
  for (const f of walk(DIST).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(f, 'utf8');
    for (const provider of ['github_release', 'npmjs.com', 'pypi.org/project']) {
      assert.ok(!html.includes(provider), relative(DIST, f) + ' leaks provider "' + provider + '"');
    }
  }
});

test('every anchor that is a CTA has an href', () => {
  for (const f of walk(DIST).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(f, 'utf8');
    assert.ok(!/href=""/.test(html), relative(DIST, f) + ' has an empty href');
    assert.ok(!/href="undefined"/.test(html), relative(DIST, f) + ' has an undefined href');
  }
});

// ---------- media ----------

test('JuQode overview video is declared, versioned, and present', () => {
  const html = readFileSync(join(DIST, 'products/juqode/index.html'), 'utf8');
  assert.ok(html.includes('/media/juqode/overview.v1.mp4'), 'versioned video path missing');
  assert.ok(existsSync(join(DIST, 'media/juqode/overview.v1.mp4')), 'video file missing from dist');
  assert.ok(html.includes('preload="none"'), 'video must not preload eagerly');
  assert.ok(html.includes('playsinline'), 'video must be playsinline');
});

test('no unversioned canonical media path anywhere in the app', () => {
  assert.ok(
    !/\/media\/[a-z0-9-]+\/(overview|poster|demo)\.(mp4|jpg)/i.test(builderSource),
    'unversioned media path found in Builder source',
  );
});

test('media path is never constructed from a slug', () => {
  // A template like `${slug}.mp4` or '.mp4'` concatenation is forbidden.
  assert.ok(
    !/\$\{[^}]*slug[^}]*\}\.(mp4|jpg)/.test(builderSource),
    'media filename is derived from a slug',
  );
});

test('a missing video degrades to an explicit state, never a broken player', () => {
  const html = readFileSync(join(DIST, 'products/jutell/index.html'), 'utf8');
  assert.ok(!html.includes('<video'), 'JuTell has no video, so none may render');
  assert.ok(html.includes('media-empty') || html.includes('준비'), 'must show an explicit pending state');
});

// ---------- env / site url ----------

test('no component hardcodes the production host or a slug', () => {
  for (const f of walk(join(ROOT, 'src')).filter((f) => /\.(js|ts)$/.test(f))) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!src.includes('ju-portal-one'), relative(ROOT, f) + ' hardcodes the production slug');
    assert.ok(!src.includes('vercel.app'), relative(ROOT, f) + ' hardcodes a vercel host');
    assert.ok(!src.includes('localhost'), relative(ROOT, f) + ' hardcodes localhost');
  }
});

test('no built page leaks a dev host, preview hash, or the production slug', () => {
  for (const f of walk(DIST).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(f, 'utf8');
    assert.ok(!html.includes('localhost'), relative(DIST, f) + ' leaks localhost');
    assert.ok(!html.includes('ju-portal-one.vercel.app'), relative(DIST, f) + ' leaks the production origin');
    assert.ok(!/\.vercel\.app/.test(html), relative(DIST, f) + ' leaks a vercel preview hash');
  }
});

test('site url resolution comes from NEXT_PUBLIC_SITE_URL and falls back locally', async () => {
  const url = new URL('src/lib/dom.js', `file://${ROOT}/`).href;
  const mod = await import(url);

  delete process.env.NEXT_PUBLIC_SITE_URL;
  assert.equal(mod.siteUrl(), '', 'unset env must yield an empty site url (local dev)');

  process.env.NEXT_PUBLIC_SITE_URL = 'https://ju-portal-one.vercel.app/';
  assert.equal(
    mod.siteUrl(),
    'https://ju-portal-one.vercel.app',
    'must read the env value and trim the trailing slash',
  );

  // A preview hash must never become the canonical origin.
  process.env.NEXT_PUBLIC_SITE_URL = 'https://ju-portal-abc123-jiuhans-projects.vercel.app';
  assert.equal(
    mod.siteUrl(),
    'https://ju-portal-abc123-jiuhans-projects.vercel.app',
    'siteUrl returns whatever the env declares; the build must not inject a preview hash',
  );

  delete process.env.NEXT_PUBLIC_SITE_URL;
});

// ---------- routes ----------

test('every required route exists as a real file', () => {
  const routes = [
    'index.html',
    'products/index.html',
    'skills/index.html',
    'labs/index.html',
    'radar/index.html',
    'products/juqode/index.html',
    'products/jutell/index.html',
    '404.html',
  ];
  for (const r of routes) assert.ok(existsSync(join(DIST, r)), 'missing route: ' + r);
});

test('Radar resolves through RADAR_ORIGIN and never hardcodes the host', async () => {
  const html = readFileSync(join(DIST, 'radar/index.html'), 'utf8');
  const origin = process.env.RADAR_ORIGIN ?? 'https://juradar-907c6.web.app';

  // The rendered link MAY carry the origin - that is the resolver doing its job.
  // What must never exist is the host as a literal in Builder SOURCE.
  for (const f of walk(join(ROOT, 'src')).filter((f) => /\.(js|ts)$/.test(f))) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!src.includes('juradar-907c6'), relative(ROOT, f) + ' hardcodes the radar host');
    assert.ok(!src.includes('web.app'), relative(ROOT, f) + ' hardcodes a firebase host');
  }
  // The registry must still point at the env var, not a literal URL.
  const radarRegistry = readFileSync(join(ROOT, 'content/radar/index.ts'), 'utf8');
  assert.ok(radarRegistry.includes('RADAR_ORIGIN'), 'registry must use the originEnv indirection');

  // The admin route is permanently out of scope.
  assert.ok(!html.includes('/admin'), 'the admin route must never be linked or embedded');
  assert.ok(!/juradar[^"']*\/admin/.test(html), 'no admin URL may be rendered');

  // If the env was set at build time, the link must have resolved.
  if (process.env.RADAR_ORIGIN) {
    assert.ok(html.includes(origin), 'radar link should resolve when RADAR_ORIGIN is set');
  }
});

test('JuDoctor / JuControler / JuCeipt / JuMiner are not promoted as usable products', () => {
  for (const slug of ['jucontroler', 'juceipt', 'juminer', 'judoctor']) {
    assert.ok(
      !existsSync(join(DIST, 'products', slug, 'index.html')),
      slug + ' must not have a public product route',
    );
  }
});
