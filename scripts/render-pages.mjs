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
import { renderHome, renderProducts, renderSkills, renderLabs, renderRadar } from '../src/ui/pages.js';
import { renderProductDetail, renderSkillDetail } from '../src/ui/detail.js';

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

// Section pages
await page('/', renderHome({ products, skills, labs, currentPath: '/' }));
await page('/products', renderProducts({ products, currentPath: '/products/' }));
await page('/skills', renderSkills({ skills, currentPath: '/skills/' }));
await page('/labs', renderLabs({ labs, currentPath: '/labs/' }));
await page('/radar', renderRadar({ radar, currentPath: '/radar/' }));

// Product detail routes. The secondary download targets are resolved by the
// Infra resolver, not re-derived here.
for (const product of products) {
  const action = getPrimaryAction(product);
  const secondary = (product.releases ?? [])
    .filter((r) => !r.primary)
    .map((r) => releaseHref(r))
    .filter((href) => href && href !== action.href);

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

// 404
const notFound = renderSkills({ skills: [], currentPath: '/404/' })
  .replace('<title>Skills', '<title>페이지를 찾을 수 없습니다 — JU')
  .replace(/<main id="main">[\s\S]*<\/main>/, `<main id="main"><div class="wrap stack" style="padding-block:5rem;max-width:36rem">
  <h1 class="title">찾을 수 없는 페이지입니다</h1>
  <p class="muted" style="margin:0">주소가 바뀌었거나 아직 공개되지 않은 페이지일 수 있습니다.</p>
  <div><a class="btn" href="/">홈으로 가기</a></div>
</div></main>`);
await writeFile(join(OUT, '404.html'), notFound, 'utf8');
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
