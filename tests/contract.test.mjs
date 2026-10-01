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

test('no UI source hardcodes the production host, slug, or a dev host', () => {
  for (const f of walk(join(ROOT, 'src')).filter((f) => /\.(js|ts)$/.test(f))) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!src.includes('ju-portal-one'), relative(ROOT, f) + ' hardcodes the production slug');
    assert.ok(!src.includes('vercel.app'), relative(ROOT, f) + ' hardcodes a vercel host');
    assert.ok(!src.includes('localhost'), relative(ROOT, f) + ' hardcodes localhost');
  }
  // The same rule for the render/verify scripts, minus .env loading.
  for (const f of walk(join(ROOT, 'scripts')).filter((f) => /\.(mjs|js|ts)$/.test(f))) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!src.includes('ju-portal-one'), relative(ROOT, f) + ' hardcodes the production slug');
  }
});

test('no built page leaks a dev host or a preview hash', () => {
  // The production origin IS expected in <link rel="canonical">, og:url, and
  // absolute media URLs - that is the point of canonicalUrl()/resolveMediaUrl().
  // What must never appear anywhere is a dev host or a per-deployment hash.
  const canonicalOrigin = process.env.NEXT_PUBLIC_SITE_URL;

  for (const f of walk(DIST).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(f, 'utf8');
    const rel = relative(DIST, f);

    assert.ok(!html.includes('localhost'), rel + ' leaks localhost');
    assert.ok(!/127\.0\.0\.1/.test(html), rel + ' leaks a loopback host');
    assert.ok(
      !/ju-portal-[a-z0-9]{6,}-[a-z0-9-]+\.vercel\.app/.test(html),
      rel + ' leaks a preview deployment hash',
    );

    // Any vercel host that does appear must be the canonical origin, never a
    // preview slug.
    for (const m of html.matchAll(/https:\/\/[a-z0-9.-]*vercel\.app[^"' <]*/gi)) {
      assert.ok(
        !/ju-portal-[a-z0-9]{6,}-[a-z0-9-]+\./.test(m[0]),
        rel + ' links to a preview deployment: ' + m[0],
      );
      if (canonicalOrigin) {
        assert.ok(
          m[0].startsWith(canonicalOrigin),
          rel + ' links to a non-canonical vercel host: ' + m[0],
        );
      }
    }
  }
});

// ---------- host resolution ----------

test('siteUrl prefers VERCEL_PROJECT_PRODUCTION_URL over a stale manual value', async () => {
  const url = new URL('src/lib/dom.js', `file://${ROOT}/`).href;
  const mod = await import(url);

  const snapshot = { ...process.env };
  const reset = () => {
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  };

  try {
    // A. The Vercel system variable alone yields an https origin.
    reset();
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'ju-portal-one.vercel.app';
    assert.equal(mod.siteUrl(), 'https://ju-portal-one.vercel.app', 'must add the https scheme');

    // A scheme, if already present, is not doubled.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'https://ju-portal-one.vercel.app';
    assert.equal(mod.siteUrl(), 'https://ju-portal-one.vercel.app', 'must not double the scheme');

    // A trailing slash is trimmed.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'ju-portal-one.vercel.app/';
    assert.equal(mod.siteUrl(), 'https://ju-portal-one.vercel.app', 'must trim the trailing slash');

    // C. A stale manual value must NOT override the Vercel system variable.
    reset();
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'ju-portal-one.vercel.app';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ju-portal.vercel.app';
    assert.equal(
      mod.siteUrl(),
      'https://ju-portal-one.vercel.app',
      'a stale NEXT_PUBLIC_SITE_URL must not override VERCEL_PROJECT_PRODUCTION_URL',
    );

    // B. A Preview build still canonicalises to the production domain.
    reset();
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'ju-portal-one.vercel.app';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ju-portal-izimdu467-ju0o.vercel.app';
    assert.equal(
      mod.canonicalUrl('/products/juqode'),
      'https://ju-portal-one.vercel.app/products/juqode',
      'a preview build must canonicalise to the production domain',
    );

    // Manual fallback when the Vercel variable is absent.
    reset();
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ju-portal-one.vercel.app/';
    assert.equal(mod.siteUrl(), 'https://ju-portal-one.vercel.app', 'manual fallback still works');

    // Local development.
    reset();
    assert.equal(mod.siteUrl(), '', 'no env at all must yield an empty origin for local dev');
    assert.equal(mod.canonicalUrl('/products'), '/products', 'local dev falls back to a relative path');
  } finally {
    for (const k of Object.keys(process.env)) {
      if (!(k in snapshot)) delete process.env[k];
    }
    Object.assign(process.env, snapshot);
  }
});

test('local media renders as the Registry pathname unchanged', async () => {
  // mediaUrl() is Infra-owned (src/registry/action.ts). At V0 a local reference
  // renders unchanged, so it is same-origin by construction.
  const action = await import(new URL('src/registry/action.ts', `file://${ROOT}/`).href);
  const path = '/media/juqode/overview.v1.mp4';

  const snapshot = { ...process.env };
  try {
    // D. Unset base is the V0 default: the pathname comes back verbatim.
    delete process.env.PUBLIC_MEDIA_BASE_URL;
    assert.equal(action.mediaUrl(path), path, 'with no external base the pathname is unchanged');
    assert.equal(action.mediaUrl(path, undefined), path, 'explicitly undefined base is unchanged');

    // G. A duplicated /media/ segment can never be produced.
    assert.ok(!action.mediaUrl(path).includes('/media/media/'));

    // An absolute external URL passes through untouched (future CDN ready).
    assert.equal(
      action.mediaUrl('https://cdn.example.com/media/juqode/overview.v1.mp4'),
      'https://cdn.example.com/media/juqode/overview.v1.mp4',
      'an absolute external media URL must be preserved',
    );

    // If an external base IS configured (future CDN), a redundant trailing
    // /media must not double-join into /media/media/.
    for (const base of [
      'https://cdn.example.com',
      'https://cdn.example.com/',
      'https://cdn.example.com/media',
      'https://cdn.example.com/media/',
    ]) {
      const resolved = action.mediaUrl(path, base);
      assert.ok(!resolved.includes('/media/media/'), 'base ' + base + ' produced ' + resolved);
      assert.ok(resolved.endsWith(path), 'base ' + base + ' must preserve the path: ' + resolved);
    }
  } finally {
    for (const k of Object.keys(process.env)) {
      if (!(k in snapshot)) delete process.env[k];
    }
    Object.assign(process.env, snapshot);
  }
});

test('preview video stays deployment-relative while canonical metadata stays production-canonical', () => {
  const html = readFileSync(join(DIST, 'products/juqode/index.html'), 'utf8');

  // The player must load from whichever deployment serves the page, even when
  // an old PUBLIC_MEDIA_BASE_URL still points at an invalid production alias.
  assert.ok(
    html.includes('src="/media/juqode/overview.v1.mp4"'),
    'the video src must be the relative registry path',
  );
  assert.ok(
    !/src="https?:\/\/[^"]*\/media\/juqode\/overview\.v1\.mp4"/.test(html),
    'media must not be absolutised to a host that may differ from the serving deployment',
  );
  // G. No duplicated segment.
  assert.ok(!html.includes('/media/media/'), 'rendered output must not contain /media/media/');

  // Runtime media and SEO metadata have different URL semantics. Keep the
  // canonical page origin on the configured production domain; do not make it
  // relative as part of the video fix.
  assert.ok(
    html.includes('<link rel="canonical" href="https://ju-portal-one.vercel.app/products/juqode"'),
    'the page canonical must remain on the production domain',
  );
  assert.ok(
    html.includes('<meta property="og:url" content="https://ju-portal-one.vercel.app/products/juqode"'),
    'og:url must remain aligned with the canonical page URL',
  );
});

// ---------- canonical / og ----------

test('canonicalUrl builds from NEXT_PUBLIC_SITE_URL and falls back to relative', async () => {
  const url = new URL('src/lib/dom.js', `file://${ROOT}/`).href;
  const mod = await import(url);

  process.env.NEXT_PUBLIC_SITE_URL = 'https://ju-portal-one.vercel.app';
  assert.equal(mod.canonicalUrl('/'), 'https://ju-portal-one.vercel.app/');
  assert.equal(mod.canonicalUrl('/products'), 'https://ju-portal-one.vercel.app/products');
  assert.equal(
    mod.canonicalUrl('/products/juqode'),
    'https://ju-portal-one.vercel.app/products/juqode',
  );
  assert.equal(mod.canonicalUrl('/labs/'), 'https://ju-portal-one.vercel.app/labs');

  delete process.env.NEXT_PUBLIC_SITE_URL;
  assert.equal(mod.canonicalUrl('/products/juqode'), '/products/juqode', 'local dev falls back to relative');
});

test('every generated page emits canonical and og:url', () => {
  const pages = walk(DIST).filter((f) => f.endsWith('.html') && !f.endsWith('404.html'));
  assert.ok(pages.length >= 7, 'expected the full route surface, found ' + pages.length);

  for (const f of pages) {
    const html = readFileSync(f, 'utf8');
    const rel = relative(DIST, f);

    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html);
    const ogUrl = /<meta property="og:url" content="([^"]+)"/.exec(html);
    assert.ok(canonical, rel + ' is missing <link rel="canonical">');
    assert.ok(ogUrl, rel + ' is missing <meta property="og:url">');
    assert.equal(canonical[1], ogUrl[1], rel + ': canonical and og:url must agree');

    // The canonical path must match the page it was emitted on.
    const route = rel === 'index.html' ? '/' : '/' + rel.replace(/index\.html$/, '').replace(/\/$/, '');
    const canonicalPath = new URL(canonical[1], 'https://x.invalid').pathname.replace(/\/$/, '') || '/';
    const expectPath = route === '/' ? '/' : route;
    assert.equal(canonicalPath, expectPath, rel + ' canonical path does not match its route');
  }
});

test('canonical origin comes from the env, never from a preview host or localhost', () => {
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  for (const f of walk(DIST).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(f, 'utf8');
    const rel = relative(DIST, f);
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1] ?? '';
    if (!canonical) continue;

    assert.ok(!canonical.includes('localhost'), rel + ' canonical leaks localhost');
    if (origin) {
      assert.ok(
        canonical.startsWith(origin),
        rel + ' canonical must start with NEXT_PUBLIC_SITE_URL (' + origin + '), got ' + canonical,
      );
    }
  }
});

// ---------- media url joining ----------

test('no rendered page contains a duplicated /media/ path segment', () => {
  for (const f of walk(DIST)) {
    const file = relative(DIST, f);
    if (/\.(mp4|png|jpg|svg|css|js)$/.test(f)) continue; // binary/asset content
    const text = readFileSync(f, 'utf8');
    assert.ok(!text.includes('/media/media/'), file + ' contains a duplicated /media/ segment');
  }
});

test('media and origin resolution have exactly one implementation, and it is Infra-owned', () => {
  // src/registry/action.ts is Infra-owned and now also owns mediaUrl(),
  // canonicalOrigin() and absoluteUrl(). The Builder must not reimplement any
  // of them, so assert the Builder source defines no origin/media join of its own.
  const builderSrc = walk(join(ROOT, 'src')).filter(
    (f) => /\.(js|ts)$/.test(f) && !f.startsWith(join(ROOT, 'src', 'registry')),
  );

  for (const f of builderSrc) {
    const src = readFileSync(f, 'utf8');
    assert.ok(
      !/'\s*\+\s*\(?\s*path/i.test(src),
      relative(ROOT, f) + ' concatenates a literal base with + path instead of delegating to the resolver',
    );
    for (const name of ['mediaUrl', 'canonicalOrigin', 'absoluteUrl']) {
      assert.ok(
        !new RegExp('export\\s+(async\\s+)?function\\s+' + name + '\\b').test(src),
        relative(ROOT, f) + ' defines its own ' + name + '(); the Infra resolver owns it',
      );
    }
  }

  // The single implementations live in the Infra module.
  const action = readFileSync(join(ROOT, 'src/registry/action.ts'), 'utf8');
  for (const name of ['mediaUrl', 'canonicalOrigin', 'absoluteUrl']) {
    assert.ok(
      new RegExp('export\\s+function\\s+' + name + '\\b').test(action),
      'src/registry/action.ts must own ' + name + '()',
    );
  }

  // The Builder delegates rather than reimplementing.
  const dom = readFileSync(join(ROOT, 'src/lib/dom.js'), 'utf8');
  assert.ok(
    dom.includes("from '../registry/action.ts'"),
    'src/lib/dom.js must re-export the Infra resolver functions',
  );
});

test('404.html declares no canonical and is not indexable', () => {
  const html = readFileSync(join(DIST, '404.html'), 'utf8');
  assert.ok(!html.includes('rel="canonical"'), '404 must not declare a canonical URL');
  assert.ok(!html.includes('og:url'), '404 must not declare og:url');
  assert.ok(html.includes('noindex'), '404 must be robots noindex');
});

// ---------- P0-6 showroom overlay ----------

test('Discovery entry is preserved on the Portal home', () => {
  // DESIGN_CONTRACT §4 defines Discovery. It was lost in a redesign once, so
  // its presence is asserted on the built output rather than left to a soft
  // browser check.
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');

  assert.ok(html.includes('data-discovery'), 'home must carry the discovery form');
  assert.ok(html.includes('data-discovery-index='), 'home must carry the discovery index');
  assert.ok(html.includes('data-banner'), 'home must carry the recommendation banner');

  const chips = html.match(/data-hint="/g) ?? [];
  assert.ok(chips.length >= 3, `expected >=3 hint chips, found ${chips.length}`);

  // The index must be real, parseable JSON, and every entry must point at a
  // real Portal route so a recommendation can never dead-link.
  const raw = html
    .match(/data-discovery-index="([^"]*)"/)[1]
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  const index = JSON.parse(raw);
  assert.ok(Array.isArray(index) && index.length >= 3, 'discovery index needs entries');

  for (const entry of index) {
    assert.ok(
      /^\/(products\/[a-z0-9-]+\/|skills\/|radar\/)/.test(entry.href),
      `discovery href is not a real Portal route: ${entry.href}`,
    );
    assert.ok(entry.name && entry.haystack, 'each discovery entry needs a name and keywords');
  }
});

test('Home carries the approved JU brand story before real Registry products', () => {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const order = [
    'data-hero', '01 · BRAND VALUE', '02 · YOU INSTRUCT', '03 · AI WORKS',
    '04 · REAL TOOL', 'id="skills"', 'id="labs"', 'id="radar"', 'data-section="notify"',
  ].map((token) => html.indexOf(token));
  assert.ok(order.every((index) => index >= 0), 'all Home narrative sections must be present');
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'Home story and product order must remain canonical');
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  assert.equal((main.match(/<h1\b/g) ?? []).length, 1, 'Home content must have exactly one meaningful h1');
  assert.ok(html.includes('비개발자의 생각이 말이 되고,'));
  assert.ok(html.includes('말이 AI의 작업이 되고,'));
  assert.ok(html.includes('그 결과가 다시 사람이 이해할 수 있는'));
  assert.ok(html.includes('도구가 됩니다.'));
  assert.ok(html.includes('data-cta data-slug="juqode"'), 'JuQode must keep its Registry-resolved CTA');
  assert.ok(html.includes('data-showroom="juqode"') && html.includes('data-showroom="jutell"'), 'both real Registry product routes must remain reachable');
  assert.ok(html.includes('알림 기능 준비 중 · 지금은 입력을 받지 않습니다'));
});

test('Home motion is deterministic and reduced motion resolves content immediately', () => {
  const css = readFileSync(join(ROOT, 'public/assets/portal.css'), 'utf8');
  const js = readFileSync(join(ROOT, 'public/assets/portal.js'), 'utf8');
  assert.ok(css.includes('white-space: nowrap') && css.includes('word-break: keep-all'));
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(css.includes('animation: none !important') && css.includes('transition: none !important'));
  assert.ok(css.includes('APPEAR') && css.includes('ASSEMBLE') && css.includes('RESOLVE'));
  assert.ok(js.includes("window.matchMedia('(prefers-reduced-motion: reduce)')"));
  assert.ok(js.includes('IntersectionObserver'));
  assert.ok(!js.includes('Math.random'));
  assert.ok(js.includes("'(hover: hover) and (pointer: fine)'"));
});

test('the side rail keeps every production section', () => {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  for (const section of ['top', 'products', 'skills', 'labs', 'radar']) {
    assert.ok(
      html.includes(`class="rail-item" href=`) || html.includes(`data-rail="${section}"`),
      'rail must expose ' + section,
    );
    assert.ok(html.includes(`data-rail="${section}"`), 'rail is missing data-rail=' + section);
  }
  // Exactly one server-rendered active item on a page that has an active section.
  const current = html.match(/aria-current="page"/g) ?? [];
  assert.equal(current.length, 1, 'home must render exactly one aria-current rail item');
});

// ---------- P0-6 showroom overlay ----------

test('product listing pages ship an accessible showroom overlay per product', () => {
  for (const page of ['index.html', 'products/index.html']) {
    const html = readFileSync(join(DIST, page), 'utf8');

    for (const slug of ['juqode', 'jutell']) {
      assert.ok(
        html.includes(`data-overlay="${slug}"`),
        page + ' must ship a showroom overlay for ' + slug,
      );
    }

    // Real dialog semantics, not a visual fake.
    assert.ok(html.includes('role="dialog"'), page + ' overlay must be role="dialog"');
    assert.ok(html.includes('aria-modal="true"'), page + ' overlay must be aria-modal');
    assert.ok(html.includes('aria-labelledby="ov-juqode-title"'), page + ' overlay needs a labelled title');
    assert.ok(html.includes('data-overlay-close'), page + ' overlay needs a close control');
    assert.ok(html.includes('&times;'), page + ' close control must be visible');

    // The prototype shell values (contract §6).
    assert.ok(html.includes('min(960px, 100%)') === false, 'width lives in CSS, not inline');
    const css = readFileSync(join(DIST, 'assets/portal.css'), 'utf8');
    assert.ok(/width:\s*min\(960px,\s*100%\)/.test(css), 'modal must be min(960px,100%)');
    assert.ok(/max-height:\s*90vh/.test(css), 'modal max-height must be 90vh');
    assert.ok(/border-radius:\s*24px/.test(css), 'modal radius must be 24px');
    assert.ok(/grid-template-columns:\s*1\.2fr\s*\.8fr/.test(css), 'showroom must be 1.2fr/.8fr');
    assert.ok(/background:\s*rgba\(0,\s*0,\s*0,\s*0\.72\)/.test(css), 'backdrop must be rgba(0,0,0,.72)');
    // Close control must clear the 44px touch floor.
    const closeRule = /\.close\s*\{([^}]*)\}/.exec(css);
    assert.ok(closeRule, '.close rule must exist');
    assert.ok(/min-height:\s*44px/.test(closeRule[1]), 'close control must be >=44px');
  }
});

test('overlay never replaces the real deep routes', () => {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');

  // Every product still has a real, navigable href on its card.
  for (const slug of ['juqode', 'jutell']) {
    assert.ok(
      html.includes(`href="/products/${slug}/" data-showroom="${slug}"`),
      'card must keep a real href alongside the overlay trigger',
    );
    // Class naming is presentation, so assert on the anchor count rather than
    // an exact button class string.
    const anchors = [
      ...html.matchAll(new RegExp(`href="/products/${slug}/"[^>]*>([^<]*)<`, 'g')),
    ];
    assert.ok(anchors.length >= 3, slug + ' must keep a media link, a title link and a details link');
    assert.ok(existsSync(join(DIST, 'products', slug, 'index.html')), slug + ' deep route must exist');
  }
});

test('the overlay and the deep route share one showroom presentation', () => {
  // Contract §6: one component may serve both; there must not be a second
  // visual design. The same 1.2fr/.8fr heroProduct shell carries both.
  const home = readFileSync(join(DIST, 'index.html'), 'utf8');
  const route = readFileSync(join(DIST, 'products/juqode/index.html'), 'utf8');

  for (const [name, html] of [['overlay', home], ['route', route]]) {
    assert.ok(html.includes('class="heroProduct"'), name + ' must use the shared heroProduct shell');
    assert.ok(html.includes('class="info"') && html.includes('class="demo"'), name + ' must be two-column');
  }
});

test('overlay markup is not emitted on pages without product cards', () => {
  for (const page of ['skills/index.html', 'labs/index.html', 'radar/index.html']) {
    const html = readFileSync(join(DIST, page), 'utf8');
    assert.ok(!html.includes('class="overlay"'), page + ' must not ship a showroom overlay');
  }
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
