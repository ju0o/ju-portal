/**
 * Builder render step - generates the full route surface into dist/.
 *
 * Infra's scripts/build-static.mjs assembles the published directory. This step
 * produces the pages themselves: every route is a real file, so no rewrite
 * rules are needed and every deep route is directly addressable.
 *
 * Runs AFTER verify-registry.mjs, which is the build gate.
 *
 * Consumes the Infra resolver (src/registry/action.ts) and the Infra Registry
 * (content/*). It defines no product data and no action logic of its own.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Load .env.local into process.env before anything reads the environment.
 *
 * The Infra build is plain `node`, not a bundler, so no .env file is read
 * automatically. Without this, RADAR_ORIGIN would be undefined at render time
 * and Radar would silently render "Coming soon". Vercel supplies real env
 * vars, so this only affects local builds. Existing process env always wins.
 */
async function loadEnvFile(file) {
  let text;
  try {
    text = await readFile(join(process.cwd(), file), 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

await loadEnvFile('.env.local');
await loadEnvFile('.env');

import { releaseHref, getPrimaryAction } from '../src/registry/action.ts';
import { setPosterMap, renderOverlay } from '../src/ui/components.js';
import { renderHome, renderProducts, renderSkills, renderLabs, renderRadar, renderNotFound, discoveryIndex } from '../src/ui/pages.js';
import { renderProductDetail, renderSkillDetail } from '../src/ui/detail.js';
import { readdir } from 'node:fs/promises';

/**
 * Discover poster frames that exist on disk next to a real overview video.
 *
 * The Registry is Infra-owned and may still declare a poster as `pending` after
 * the asset has been produced, so the Builder reads the filesystem to avoid the
 * empty-black-media void the design contract forbids. Nothing is invented: only
 * files that actually exist are mapped, and the video path stays authoritative.
 */
async function discoverPosters() {
  const map = {};
  const mediaRoot = join(process.cwd(), 'public', 'media');
  let dirs;
  try {
    dirs = await readdir(mediaRoot, { withFileTypes: true });
  } catch {
    return map;
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    let files;
    try {
      files = await readdir(join(mediaRoot, d.name));
    } catch {
      continue;
    }
    const video = files.find((f) => /^overview\.v\d+\.mp4$/.test(f));
    const poster = files.find((f) => /^poster\.v\d+\.png$/.test(f) || /^poster\.v\d+\.jpg$/.test(f));
    if (video && poster) {
      map[`/media/${d.name}/${video}`] = `/media/${d.name}/${poster}`;
    }
  }
  return map;
}

setPosterMap(await discoverPosters());

/**
 * Load a Registry entry by slug.
 *
 * The Registry index files (content/{section}/index.ts, Infra-owned) use
 * extensionless relative imports, which Node's ESM resolver rejects. Rather than
 * edit Infra-owned files, resolve each entry file directly. This keeps the
 * extensionless-index convention intact for every other tool.
 */
async function loadEntry(section, slug) {
  const file = join(ROOT, 'content', section, `${slug}.ts`);
  const mod = await import(pathToFileURL(file).href);
  return mod.default;
}

const ROOT = process.cwd();
const OUT = join(ROOT, 'dist');

/** Write a page to dist/, creating the directory when the route is nested. */
async function page(route, html) {
  const clean = route.replace(/^\/+/, '').replace(/\/+$/, '');
  const dir = clean === '' ? OUT : join(OUT, clean);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), html, 'utf8');
  console.log('[render] ' + (route === '' ? '/' : route + '/'));
}

// Registry entries. labs/ and radar/ index files are self-contained and import
// directly; products/index.ts re-exports extensionless './juqode', so each
// product file is resolved by slug instead (see loadEntry).
import labs from '../content/labs/index.ts';
import radar from '../content/radar/index.ts';

const products = await Promise.all(['juqode', 'jutell'].map((s) => loadEntry('products', s)));
const skills = []; // content/skills/index.ts is intentionally empty at V0.

// Section pages.
//
// Product secondary targets, resolved by the Infra resolver once and reused by
// both the deep route and the desktop overlay — so the two never drift.
const productContext = products.map((product) => {
  const action = getPrimaryAction(product);
  const secondary = (product.releases ?? [])
    .filter((r) => !r.primary)
    .map((r) => releaseHref(r))
    .filter((href) => href && href !== action.href);
  return { product, secondary };
});

/** One showroom overlay per product, for the pages that list product cards. */
function overlaysMarkup() {
  return productContext.map(({ product, secondary }) => renderOverlay(product, { releases: secondary })).join('\n');
}

const overlays = overlaysMarkup();

/**
 * Discovery dataset (DESIGN_CONTRACT §4), injected as a <body> attribute so the
 * client-side matcher needs no network request.
 *
 * The JSON is attribute-escaped: raw newlines and quotes inside an HTML
 * attribute are collapsed or terminated by the parser, which silently breaks
 * JSON.parse in the browser.
 */
const discoveryAttr = JSON.stringify(discoveryIndex(products, radar))
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const home = renderHome({ products, skills, labs, radar, currentPath: '/', overlays }).replace(
  '<body data-has-overlay="true">',
  `<body data-has-overlay="true" data-discovery-index="${discoveryAttr}">`,
);
if (!home.includes('data-discovery-index=')) {
  throw new Error('[render] home page did not receive the discovery index');
}
if (!home.includes('data-discovery')) {
  throw new Error('[render] home page is missing the discovery form');
}
// Fail the build rather than ship a discovery surface that can never match.
try {
  JSON.parse(
    home
      .match(/data-discovery-index="([^"]*)"/)[1]
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&'),
  );
} catch (e) {
  throw new Error('[render] discovery index is not parseable JSON: ' + e.message);
}
// The overlay must exist and be a real dialog, or P0-6 is not implemented.
for (const { product } of productContext) {
  if (!home.includes(`data-overlay="${product.slug}"`)) {
    throw new Error(`[render] home page is missing the ${product.slug} showroom overlay`);
  }
  if (!home.includes('role="dialog"') || !home.includes('aria-modal="true"')) {
    throw new Error('[render] showroom overlay is missing dialog semantics');
  }
}

await page('/', home);
await page('/products', renderProducts({ products, currentPath: '/products/', overlays }));
await page('/skills', renderSkills({ skills, currentPath: '/skills/' }));
await page('/labs', renderLabs({ labs, currentPath: '/labs/' }));
await page('/radar', renderRadar({ radar, currentPath: '/radar/' }));

// Real deep routes. The overlay never replaces these — a direct URL lands here.
for (const { product, secondary } of productContext) {
  await page(
    `/products/${product.slug}`,
    renderProductDetail(product, {
      releases: secondary,
      currentPath: `/products/${product.slug}/`,
    }),
  );
}

// Skill detail routes
for (const skill of skills) {
  await page(`/skills/${skill.slug}`, renderSkillDetail(skill, { currentPath: `/skills/${skill.slug}/` }));
}

// 404. Non-indexable: no canonical, no og:url, robots noindex.
await writeFile(join(OUT, '404.html'), renderNotFound({ currentPath: '/404/' }), 'utf8');
console.log('[render] /404');

// Manifest for the Preview smoke check.
await writeFile(
  join(OUT, 'render-manifest.json'),
  JSON.stringify(
    {
      routes: [
        '/',
        '/products',
        '/skills',
        '/labs',
        '/radar',
        ...products.map((p) => `/products/${p.slug}`),
        ...skills.map((s) => `/skills/${s.slug}`),
      ],
    },
    null,
    2,
  ),
  'utf8',
);

console.log('[render] done');
