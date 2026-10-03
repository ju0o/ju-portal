/**
 * JU Portal Studio — local-only HTTP server.
 *
 *   npm run studio     # -> http://127.0.0.1:4012/studio
 *
 * Bound to 127.0.0.1 ONLY. The Studio UI, API, and /preview mount are served from
 * this process; they are never written into the public `dist/` (so the Vercel
 * build cannot expose /studio as an admin surface).
 *
 * Git writes (Publish) are delegated to `publish.ts`, which is gated behind
 * STUDIO_ALLOW_GIT — off by default, so no commit/push/PR can ever fire from a
 * default `npm run studio` invocation.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  loadHome, loadEntry, listSection, saveHome, serializeHomeSource,
  validateHome, validateEntry, saveEntry, saveArraySection, saveProductsIndex,
  deleteEntryFile, type Section, type EntryInfo,
} from './content';
import { getState, buildPublishPlan } from './git';
import { listMedia, acceptUpload, MEDIA_SLOTS } from './media';
import { runPortalBuild, type BuildResult } from './preview';
import { runVerify, type VerifyReport } from './verify';
import { executePublish, isGitAllowed, type PublishResult } from './publish';

const ROOT = process.cwd();
const HOST = '127.0.0.1';
const PORT = Number(process.env.JU_STUDIO_PORT || '4012');
const BUILD_TIMEOUT_MS = 240000;

let lastVerify: VerifyReport | null = null;

/* ---- env loading (mirrors scripts/render-pages.mjs: lowest precedence first) ---- */
async function loadEnvFile(file: string) {
  try {
    const text = await readFile(join(ROOT, file), 'utf8');
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let value = t.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch { /* optional */ }
}

function safeJoin(base: string, requested: string): string | null {
  const clean = requested.split('?')[0].split('#')[0].replace(/%20/g, ' ');
  if (clean.includes('..')) return null;
  const target = resolve(base, '.' + sep + clean);
  const baseAbs = resolve(base);
  if (target !== baseAbs && !target.startsWith(baseAbs + sep)) return null;
  return target;
}

function json(res: ServerResponse, code: number, body: unknown) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
}

function bytes(res: ServerResponse, code: number, buf: Buffer, type: string) {
  res.writeHead(code, { 'Content-Type': type, 'Content-Length': buf.length });
  res.end(buf);
}

async function readJson(req: IncomingMessage, limit = 5 * 1024 * 1024): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let len = 0;
  for await (const chunk of req) {
    len += (chunk as Buffer).length;
    if (len > limit) throw new Error('body too large');
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw || '{}'); }
  catch (e) { throw new Error('invalid JSON: ' + (e as Error).message); }
}

async function readRaw(req: IncomingMessage, limit = 100 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let len = 0;
  for await (const chunk of req) {
    len += (chunk as Buffer).length;
    if (len > limit) throw new Error('body too large');
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/* ---------------- handlers ---------------- */

async function handleState(_req: IncomingMessage, res: ServerResponse) {
  const state = getState(ROOT);
  const counts: Record<string, number> = {};
  const sections: Section[] = ['products', 'labs', 'skills', 'radar'];
  for (const s of sections) {
    try { counts[s] = (await listSection(s, ROOT)).length; } catch { counts[s] = 0; }
  }
  json(res, 200, {
    branch: state.branch,
    head: state.head,
    dirty: state.dirty,
    changedFiles: state.changedFiles,
    productionUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
    counts,
    studioUrl: 'http://' + HOST + ':' + PORT + '/studio/',
    gitAllowed: isGitAllowed(),
  });
}

async function handleHomeGet(_req: IncomingMessage, res: ServerResponse) {
  const home = await loadHome(ROOT);
  const errors = validateHome(home);
  json(res, 200, { home, valid: errors.length === 0, errors });
}

async function handleHomeValidate(body: Record<string, unknown>) {
  const home = body.home ?? body;
  const errors = validateHome(home);
  return { valid: errors.length === 0, errors };
}

async function handleHomeSave(req: IncomingMessage, res: ServerResponse) {
  const body = await readJson(req);
  const home = body.home ?? body;
  const errors = validateHome(home);
  if (errors.length) return json(res, 400, { ok: false, errors });
  const r = await saveHome(home as Record<string, unknown>, ROOT);
  json(res, r.ok ? 200 : 500, { ok: r.ok, changedFiles: ['content/home.ts'], error: r.error });
}

async function handleEntriesList(_req: IncomingMessage, res: ServerResponse, section: Section) {
  const entries = await listSection(section, ROOT);
  json(res, 200, { section, entries });
}

async function handleEntryGet(_req: IncomingMessage, res: ServerResponse, section: Section, slug: string) {
  const entry = await loadEntry(section, slug, ROOT);
  if (entry === null) return json(res, 404, { ok: false, error: 'entry not found' });
  json(res, 200, { section, slug, entry });
}

async function handleEntrySave(req: IncomingMessage, res: ServerResponse, section: Section, slugParam: string) {
  const body = await readJson(req);
  const incoming = (body.entry ?? body) as Record<string, unknown>;
  const slugRaw = String(incoming.slug ?? slugParam);
  if (!slugRaw) return json(res, 400, { ok: false, error: 'slug required' });
  const slug = slugOf(slugRaw);
  // Merge over the existing entry so partial edits preserve untouched fields.
  let existing: Record<string, unknown> = {};
  try { existing = (await loadEntry(section, slug, ROOT)) as Record<string, unknown> ?? {}; } catch {}
  const entry: Record<string, unknown> = { ...existing, ...incoming, slug };
  const errors = validateEntry(entry, toEntryKind(section));
  if (errors.length) return json(res, 400, { ok: false, errors });

  if (section === 'products') {
    const r = await saveEntry(section, slug, entry, ROOT);
    const changed = ['content/products/' + slug + '.ts'];
    // new product? keep the index in sync
    if (r.ok) {
      try {
        const idx = await listSection('products', ROOT);
        const slugs = idx.map((e) => e.slug);
        if (!slugs.includes(slug)) { slugs.push(slug); await saveProductsIndex(slugs, ROOT); changed.push('content/products/index.ts'); }
      } catch {}
    }
    return json(res, r.ok ? 200 : 500, { ok: r.ok, changedFiles: changed, error: r.error });
  }

  const entries = await listSection(section, ROOT);
  const list: Record<string, unknown>[] = entries.map((e) => e.entry as Record<string, unknown>);
  const idx = list.findIndex((e) => e.slug === slug);
  const normalized = { ...entry, slug };
  if (idx >= 0) list[idx] = normalized; else list.push(normalized);
  const r = await saveArraySection(section, list as never, ROOT);
  return json(res, r.ok ? 200 : 500, { ok: r.ok, changedFiles: ['content/' + section + '/index.ts'], error: r.error });
}

async function handleEntryDelete(_req: IncomingMessage, res: ServerResponse, section: Section, slug: string) {
  if (section !== 'products') return json(res, 400, { ok: false, error: 'delete only supported for products' });
  const r = await deleteEntryFile(section, slug, ROOT);
  json(res, r.ok ? 200 : 500, { ok: r.ok, changedFiles: ['content/products/' + slug + '.ts'], error: r.error });
}

async function handlePromoteLabToProduct(req: IncomingMessage, res: ServerResponse, slug: string) {
  const body = await readJson(req);
  const lab = await loadEntry('labs', slug, ROOT);
  if (lab === null) return json(res, 404, { ok: false, error: 'lab not found: ' + slug });
  // Draft ProductEntry. No release is invented: status is coming_soon and the
  // release list is empty until the Founder adds a real one.
  const product: Record<string, unknown> = {
    slug: String(body.slug ?? lab.slug),
    title: lab.title,
    summary: lab.summary,
    status: 'coming_soon',
    media: { pending: ['poster', 'overviewVideo', 'actualDemo'] },
    releases: [],
    source: lab.source,
    updatedAt: new Date().toISOString().split('T')[0],
  };
  const errors = validateEntry(product, 'product');
  if (errors.length) return json(res, 400, { ok: false, errors });

  if (body.create === true) {
    const r = await saveEntry('products', product.slug as string, product, ROOT);
    if (!r.ok) return json(res, 500, { ok: false, error: r.error });
    const changed = ['content/products/' + product.slug + '.ts'];
    const idx = await listSection('products', ROOT);
    const slugs = idx.map((e) => e.slug);
    if (!slugs.includes(product.slug as string)) {
      slugs.push(product.slug as string);
      await saveProductsIndex(slugs, ROOT);
      changed.push('content/products/index.ts');
    }
    return json(res, 200, { ok: true, created: true, slug: product.slug, changedFiles: changed });
  }
  json(res, 200, { kind: 'product', slug: product.slug, entry: product, preview: true });
}

async function handleMediaList(_req: IncomingMessage, res: ServerResponse, slug: string) {
  json(res, 200, await listMedia(slug, ROOT));
}

async function handleMediaUpload(req: IncomingMessage, res: ServerResponse, slug: string, slot: string) {
  if (!MEDIA_SLOTS.includes(slot as (typeof MEDIA_SLOTS)[number])) return json(res, 400, { ok: false, error: 'bad slot' });
  const buf = await readRaw(req, 100 * 1024 * 1024);
  const filename = req.headers['x-file-name']?.toString() ?? 'upload.bin';
  const r = await acceptUpload(slug, slot, buf, filename, ROOT);
  // reflect the new media ref into the product entry (media.{slot} = { path, ... })
  if (r.ok) {
    const entry = await loadEntry('products', slug, ROOT) as Record<string, unknown>;
    const media = (entry.media as Record<string, unknown> | undefined) ?? {};
    const slotKey = { poster: 'poster', overviewVideo: 'overviewVideo', actualDemo: 'actualDemo' }[slot];
    if (slotKey) {
      const pending = (media.pending as string[] | undefined) ?? [];
      media[slotKey] = { path: r.path, byteSize: r.byteSize, version: r.version, createdAt: new Date().toISOString() };
      media.pending = pending.filter((s) => s !== slot);
      entry.media = media;
      await saveEntry('products', slug, entry, ROOT);
    }
  }
  json(res, r.ok ? 200 : 400, r);
}

async function handlePreview(_req: IncomingMessage, res: ServerResponse) {
  const build = runPortalBuild(ROOT, BUILD_TIMEOUT_MS);
  json(res, build.ok ? 200 : 500, {
    build: build.ok,
    buildPass: build.ok,
    buildFail: !build.ok,
    url: '/preview/',
    durationMs: build.durationMs,
    output: build.output,
  });
}

async function handleVerify(_req: IncomingMessage, res: ServerResponse) {
  lastVerify = runVerify(ROOT);
  return verifyJson(res, lastVerify!);
}

async function handleVerifyLast(_req: IncomingMessage, res: ServerResponse) {
  if (!lastVerify) return json(res, 200, { build: false, test: false, registry: false, links: false, allPass: false, tsxAvailable: isGitAllowed() });
  return verifyJson(res, lastVerify);
}

function verifyJson(res: ServerResponse, v: VerifyReport) {
  json(res, 200, {
    build: { pass: v.build.ok, output: v.build.output, durationMs: v.build.durationMs },
    test: { pass: v.test.ok, output: v.test.output, durationMs: v.test.durationMs },
    registry: { pass: v.registry.ok, output: v.registry.output, durationMs: v.registry.durationMs },
    links: { pass: v.links.ok, output: v.links.output, durationMs: v.links.durationMs },
    allPass: v.allPass,
    tsxAvailable: v.tsxAvailable,
  });
}

async function handlePublishPrepare(_req: IncomingMessage, res: ServerResponse) {
  const plan = buildPublishPlan(ROOT);
  const gates = lastVerify ?? runVerify(ROOT);
  lastVerify = gates;
  const publishable = plan.publishable && gates.allPass && !plan.remoteMainChanged;
  json(res, 200, {
    branch: plan.branch,
    head: plan.head,
    changedFiles: plan.changedFiles,
    diffShort: plan.diffShort,
    remoteMainChanged: plan.remoteMainChanged,
    remoteMainSha: plan.remoteMainSha,
    publishable,
    gates: {
      build: gates.build.ok, test: gates.test.ok, registry: gates.registry.ok, links: gates.links.ok,
    },
    reasons: plan.reasons,
  });
}

async function handlePublishExecute(_req: IncomingMessage, res: ServerResponse) {
  const plan = buildPublishPlan(ROOT);
  const result: PublishResult = executePublish(ROOT, plan);
  json(res, result.done ? 200 : 403, result);
}

function toEntryKind(section: Section) {
  return ({ products: 'product', labs: 'lab', skills: 'skill', radar: 'radar' } as const)[section];
}

/* ---------------- shell ---------------- */

const SHELL = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>JU Portal Studio</title>
  <link rel="stylesheet" href="/studio/assets/app.css">
</head>
<body>
  <div id="app">
    <header class="top">
      <a class="brand" href="/studio/">JU PORTAL STUDIO</a>
      <span class="page" id="page-title"></span>
    </header>
    <nav class="nav" id="nav"></nav>
    <main id="content" class="content"></main>
    <footer class="statusbar" id="status"></footer>
  </div>
  <script>window.STUDIO='/studio';</script>
  <script src="/studio/assets/app.js"></script>
</body>
</html>`;

/* ---------------- routing ---------------- */

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://' + HOST);
  const path = url.pathname;

  // Studio shell
  if (req.method === 'GET' && (path === '/studio' || path === '/studio/')) {
    return bytes(res, 200, Buffer.from(SHELL, 'utf8'), 'text/html; charset=utf-8');
  }

  // Studio UI assets (src/studio/ui) — never copied into dist.
  if (req.method === 'GET' && path.startsWith('/studio/assets/')) {
    const name = decodeURIComponent(path.slice('/studio/assets/'.length));
    if (!/^[A-Za-z0-9._-]+$/.test(name)) return bytes(res, 403, Buffer.from('forbidden', 'utf8'), 'text/plain');
    const file = safeJoin(join(ROOT, 'src', 'studio', 'ui'), name);
    if (!file) return bytes(res, 403, Buffer.from('forbidden', 'utf8'), 'text/plain');
    try {
      const b = await readFile(file);
      const t = name.endsWith('.css') ? 'text/css; charset=utf-8'
        : name.endsWith('.js') ? 'application/javascript; charset=utf-8'
        : 'application/octet-stream';
      return bytes(res, 200, b, t);
    } catch { return bytes(res, 404, Buffer.from('not found', 'utf8'), 'text/plain'); }
  }

  // Preview mount: serves the REAL dist/ only on this local server.
  if (path.startsWith('/preview')) {
    let rel = path === '/preview' || path === '/preview/' ? 'index.html' : path.slice('/preview/' .length);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = safeJoin(join(ROOT, 'dist'), rel);
    if (!file) return bytes(res, 403, Buffer.from('forbidden', 'utf8'), 'text/plain');
    try {
      const b = await readFile(file);
      const t = file.endsWith('.css') ? 'text/css; charset=utf-8'
        : file.endsWith('.js') ? 'application/javascript; charset=utf-8'
        : file.endsWith('.html') ? 'text/html; charset=utf-8'
        : 'application/octet-stream';
      return bytes(res, 200, b, t);
    } catch {
      // extensionless path may be a route dir -> try its index.html
      if (!rel.includes('.')) {
        const index = safeJoin(join(ROOT, 'dist'), rel + '/index.html');
        if (index) { try { return bytes(res, 200, await readFile(index), 'text/html; charset=utf-8'); } catch {} }
      }
      return bytes(res, 404, Buffer.from('not found', 'utf8'), 'text/plain');
    }
  }

  // API
  if (path.startsWith('/studio/api/')) {
    const seg = path.slice('/studio/api/'.length).split('/').filter(Boolean);
    const method = req.method;
    try {
      await routeApi(seg, method, req, res);
    } catch (e) {
      json(res, 500, { ok: false, error: (e as Error).message });
    }
    return;
  }

  bytes(res, 404, Buffer.from('not found', 'utf8'), 'text/plain');
}

async function routeApi(seg: string[], method: string, req: IncomingMessage, res: ServerResponse) {
  if (seg[0] === 'state' && method === 'GET') return handleState(req, res);
  if (seg[0] === 'health' && method === 'GET') return json(res, 200, { ok: true });

  if (seg[0] === 'home') {
    if (method === 'GET') { const h = await handleHomeGet(req, res); return h; }
    if (method === 'POST' && seg[1] === 'validate') { json(res, 200, await handleHomeValidate(await readJson(req))); return; }
    if (method === 'POST') { await handleHomeSave(req, res); return; }
    return json(res, 400, { ok: false, error: 'method' });
  }

  if (seg[0] === 'entries') {
    if (method === 'GET' && seg.length === 2) return handleEntriesList(req, res, asSection(seg[1]));
    if (method === 'GET' && seg.length === 3) return handleEntryGet(req, res, asSection(seg[1]), slugOf(seg[2]));
    if (method === 'POST' && seg.length === 3) return handleEntrySave(req, res, asSection(seg[1]), slugOf(seg[2]));
    if (method === 'DELETE' && seg.length === 3) return handleEntryDelete(req, res, asSection(seg[1]), slugOf(seg[2]));
    if (method === 'POST' && seg.length === 4 && seg[3] === 'promote') return handlePromoteLabToProduct(req, res, slugOf(seg[2]));
    if (method === 'POST' && seg.length === 2) return handleEntrySave(req, res, asSection(seg[1]), '');
    return json(res, 400, { ok: false, error: 'entries route' });
  }

  if (seg[0] === 'media') {
    if (method === 'GET' && seg.length === 2) return handleMediaList(req, res, slugOf(seg[1]));
    if (method === 'POST' && seg.length === 3) return handleMediaUpload(req, res, slugOf(seg[1]), seg[2]);
    return json(res, 400, { ok: false, error: 'media route' });
  }

  if (seg[0] === 'preview' && method === 'POST') return handlePreview(req, res);
  if (seg[0] === 'verify') {
    if (method === 'POST' && seg[1] === 'last') return handleVerifyLast(req, res);
    if (method === 'POST') return handleVerify(req, res);
    return json(res, 400, { ok: false, error: 'verify route' });
  }
  if (seg[0] === 'publish') {
    if (seg[1] === 'prepare' && method === 'POST') return handlePublishPrepare(req, res);
    if (method === 'POST') return handlePublishExecute(req, res);
    return json(res, 400, { ok: false, error: 'publish route' });
  }

  json(res, 400, { ok: false, error: 'unknown api: ' + seg.join('/') });
}

function asSection(s: string): Section {
  if (!['products', 'labs', 'skills', 'radar'].includes(s)) throw new Error('invalid section: ' + s);
  return s as Section;
}
function slugOf(s: string): string {
  if (!/^[a-z0-9-]+$/.test(s)) throw new Error('invalid slug: ' + s);
  return s;
}

async function start() {
  await loadEnvFile('.env.default');
  await loadEnvFile('.env');
  await loadEnvFile('.env.local');

  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    Promise.resolve(route(req, res)).catch((e) => {
      if (!res.headersSent) json(res, 500, { ok: false, error: (e as Error).message });
    });
  });
  server.listen(PORT, HOST, () => {
    console.log('[studio] JU Portal Studio -> http://' + HOST + ':' + PORT + '/studio/');
    console.log('[studio] Preview      -> http://' + HOST + ':' + PORT + '/preview/');
  });
}

start();
