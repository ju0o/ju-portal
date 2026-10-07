import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync, cpSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadHome, loadEntry, listSection, saveHome, saveEntry, serializeHomeSource, serializeEntryBody, validateHome, validateEntry, userFacingValidationMessage, atomicWrite } from '../src/studio/content.ts';
import { getState, proposedBranchName, getChangedFiles } from '../src/studio/git.ts';
import { acceptUpload, listMedia, MEDIA_SLOTS } from '../src/studio/media.ts';
import { runPortalBuild } from '../src/studio/preview.ts';
import { runVerify } from '../src/studio/verify.ts';
import { executePublish, isGitAllowed } from '../src/studio/publish.ts';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

// scratch root: a writable copy for save/media tests (never mutates the real tree)
const TMP = mkdtempSync(join(tmpdir(), 'studio-tmp-'));
cpSync(join(ROOT, 'content'), join(TMP, 'content'), { recursive: true });
cpSync(join(ROOT, 'public'), join(TMP, 'public'), { recursive: true });
cpSync(join(ROOT, 'src'), join(TMP, 'src'), { recursive: true });

let cleaned = false;
after(() => { if (!cleaned) { cleaned = true; rmSync(TMP, { recursive: true, force: true }); } });

function execReadGit(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return r.stdout.trim();
}
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
function freshStudioRoot() {
  const root = mkdtempSync(join(tmpdir(), 'studio-source-roundtrip-'));
  cpSync(join(ROOT, 'content'), join(root, 'content'), { recursive: true });
  cpSync(join(ROOT, 'src'), join(root, 'src'), { recursive: true });
  return root;
}
async function freePort() {
  const server = createTcpServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}
function fakeRunner(results) {
  return (cmd, args) => {
    if (cmd === 'npm' && args[1] === 'build') return results.build;
    if (cmd === 'npx') return results.test;
    if (cmd === 'node' && args.includes('verify-registry.mjs')) return results.registry;
    if (cmd === 'node' && args.includes('verify-links.mjs')) return results.links;
    return { ok: true, code: 0, output: 'fake', durationMs: 1 };
  };
}
const ok = { ok: true, code: 0, output: 'fake pass', durationMs: 1 };
const fail = { ok: false, code: 1, output: 'fake fail', durationMs: 1 };

// ============================================================
describe('Studio: local-only server', () => {
  test('binds 127.0.0.1 only, never 0.0.0.0 or localhost', () => {
    const src = readFileSync(join(SRC, 'studio/server.ts'), 'utf8');
    assert.ok(src.includes("HOST = '127.0.0.1'"), 'must bind to 127.0.0.1');
    assert.ok(!/0\.0\.0\.0/.test(src), 'must not bind 0.0.0.0');
    assert.ok(!src.includes('localhost'), 'must not reference localhost');
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    assert.ok(/tsx src\/studio\/server\.ts/.test(pkg.scripts.studio), 'npm run studio must launch the local server');
    assert.ok(pkg.devDependencies.tsx, 'tsx must be a dev dependency (Node cannot run .ts directly)');
  });

  test('public build excludes the Studio (no /studio in dist)', () => {
    assert.ok(!existsSync(join(DIST, 'studio')), 'dist must not contain a studio directory');
    const found = walk(DIST).filter((f) => f.includes('studio'));
    assert.deepEqual(found, [], 'no dist asset path may reference the studio');
  });

  test('build discovers exactly the registry products (no phantom index route)', () => {
    const dirs = readdirSync(join(DIST, 'products')).filter((n) => statSync(join(DIST, 'products', n)).isDirectory());
    assert.deepEqual(dirs.sort(), ['juqode', 'jutell'], 'render-pages must exclude index.ts from product routes');
  });

  test('Studio client api() never double-prefixes absolute API paths', () => {
    const src = readFileSync(join(SRC, 'studio/ui/app.js'), 'utf8');
    const ro = src.match(/const ROOT = [^\n]+/);
    const ap = src.match(/const api = [^\n]+/);
    assert.ok(ro && ap, 'app.js must define ROOT and api');
    const api = new Function('window', ro[0] + '\n' + ap[0] + '; return api;')({ STUDIO: '/studio' });
    assert.equal(api('/studio/api/state'), '/studio/api/state', 'absolute path must be left untouched');
    assert.equal(api('/studio/api/home'), '/studio/api/home');
    assert.equal(api('api/state'), '/studio/api/state', 'a bare relative path joins the Studio base');
  });

  test('invalid paths and invalid saves are client errors; Git Freeze stays active', async () => {
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [join(ROOT, 'node_modules/tsx/dist/cli.mjs'), join(ROOT, 'src/studio/server.ts')], {
      cwd: ROOT,
      env: { ...process.env, JU_STUDIO_PORT: String(port), STUDIO_ALLOW_GIT: '1' },
      stdio: 'ignore',
    });
    try {
      let ready = false;
      for (let i = 0; i < 60 && !ready; i++) {
        if (child.exitCode !== null) throw new Error(`Studio server exited with ${child.exitCode}`);
        try { ready = (await fetch(base + '/studio/api/health')).ok; } catch {}
        if (!ready) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(ready, true, 'Studio server should start for the HTTP regression check');

      const state = await (await fetch(base + '/studio/api/state')).json();
      assert.equal(state.gitAllowed, false, 'an environment override cannot bypass the active freeze');
      const badSection = await fetch(base + '/studio/api/entries/not-a-section');
      assert.ok(badSection.status >= 400 && badSection.status < 500, `invalid section returned ${badSection.status}`);
      const badPath = await fetch(base + '/studio/api/entries/products/%2e%2e%2fhome');
      assert.ok(badPath.status >= 400 && badPath.status < 500, `invalid path returned ${badPath.status}`);

      const homeFile = join(ROOT, 'content/home.ts');
      const before = readFileSync(homeFile);
      const invalid = await loadHome(ROOT);
      invalid.hero.label = '';
      const save = await fetch(base + '/studio/api/home', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home: invalid }),
      });
      assert.equal(save.status, 400, 'invalid Home SAVE should be rejected as input');
      const result = await save.json();
      assert.match(result.errors[0], /필수 항목/);
      assert.equal(Buffer.compare(readFileSync(homeFile), before), 0, 'invalid SAVE must leave source bytes untouched');
    } finally {
      const exited = once(child, 'exit').catch(() => []);
      child.kill('SIGTERM');
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2500))]);
    }
  });
});

test('Studio reports restored GitHub access while Git Freeze keeps Publish disabled', () => {
  const ui = readFileSync(join(SRC, 'studio/ui/app.js'), 'utf8');
  const publish = readFileSync(join(SRC, 'studio/publish.ts'), 'utf8');
  assert.match(ui, /GitHub <b>접근 복구됨<\/b>/);
  assert.match(ui, /Git Freeze <b>유지 중 · 게시 잠김<\/b>/);
  assert.doesNotMatch(ui, /복구 대기 중/);
  assert.match(ui, /button class="btn" type="button" disabled><span>게시 잠김<\/span>/);
  assert.match(ui, /Freeze가 명시적으로 해제되기 전에는 브랜치·커밋·PR을 만들지 않습니다/);
  assert.match(publish, /const GIT_FREEZE_ACTIVE = true/);
  assert.match(ui, /role="dialog" aria-modal="true" aria-labelledby="help-title"/);
  assert.match(ui, /modal\.querySelector\('button'\)\?\.focus\(\)/);
  assert.match(ui, /target\?\.focus\?\.\(\)/);
});

// ============================================================
describe('Studio: content SSOT', () => {
  test('reads the registry SSOT', async () => {
    const prods = await listSection('products', ROOT);
    assert.ok(prods.some((e) => e.slug === 'juqode'));
    assert.ok(prods.some((e) => e.slug === 'jutell'));
    assert.ok((await listSection('labs', ROOT)).length >= 1);
    assert.ok((await listSection('radar', ROOT)).length >= 1);
  });

  test('product listing excludes index.ts (no phantom product)', async () => {
    const prods = await listSection('products', ROOT);
    assert.ok(!prods.some((e) => e.slug === 'index'), 'content/products/index.ts must not be a product');
    assert.deepEqual(prods.map((e) => e.slug).sort(), ['juqode', 'jutell']);
  });

  test('Home copy is recovered and matches V1 (발견, not the typo)', async () => {
    const home = await loadHome(ROOT);
    assert.equal(home.sections.radarBody, 'JU가 발견하고 검증하는 새로운 AI / Agent / 개발도구');
    assert.equal(home.instruct.exampleAria, '예시 요청');
    assert.equal(home.instruct.exampleLabel, 'Example');
    assert.deepEqual(validateHome(home), [], 'recovered home must be schema-valid');
  });

  test('Home serializer preserves the interface header and default export', async () => {
    const home = await loadHome(TMP);
    const src = await serializeHomeSource(home, TMP);
    assert.ok(src.includes('export interface HomeCopy'), 'HomeCopy interface header must be preserved');
    assert.ok(src.includes('export default home'), 'default export must be present');
    assert.ok(src.includes('radarBody'), 'value must be present');
  });

  test('editing JuTell summary and saving writes valid TS', async () => {
    const before = await loadEntry('products', 'jutell', TMP);
    const entry = { ...before, summary: 'STUDIO EDITED SUMMARY' };
    const r = await saveEntry('products', 'jutell', entry, TMP);
    assert.equal(r.ok, true, r.error);
    const after = await loadEntry('products', 'jutell', TMP);
    assert.equal(after.summary, 'STUDIO EDITED SUMMARY', 'edit must persist');
    assert.equal(validateEntry(after, 'product').length, 0, 'saved entry must still be valid');
  });

  test('Home copy edit round-trips through save and reload', async () => {
    const before = await loadHome(TMP);
    const edited = structuredClone(before);
    edited.hero.label = 'STUDIO HOME EDIT';
    edited.notify.button = '알림 신청';
    const r = await saveHome(edited, TMP);
    assert.equal(r.ok, true, r.error);
    const after = await loadHome(TMP);
    assert.equal(after.hero.label, 'STUDIO HOME EDIT', 'home edit must persist');
    assert.equal(after.notify.button, '알림 신청');
    assert.deepEqual(validateHome(after), [], 'saved home must still be valid');
    // the HomeCopy interface header is preserved by the serializer
    const src = readFileSync(join(TMP, 'content', 'home.ts'), 'utf8');
    assert.ok(src.includes('export interface HomeCopy'), 'interface header preserved on save');
  });

  test('Home save and exact value restore return to byte-identical source', async () => {
    const root = freshStudioRoot();
    try {
      const file = join(root, 'content/home.ts');
      const originalBytes = readFileSync(file);
      const original = await loadHome(root);
      const temporary = structuredClone(original);
      temporary.hero.label = 'Temporary Studio round-trip value';
      const first = await saveHome(temporary, root);
      assert.equal(first.ok, true, first.error);
      assert.equal((await loadHome(root)).hero.label, temporary.hero.label);
      const restored = await loadHome(root);
      restored.hero.label = original.hero.label;
      const second = await saveHome(restored, root);
      assert.equal(second.ok, true, second.error);
      assert.deepEqual(readFileSync(file), originalBytes, 'Home source bytes must exactly return to the starting state');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('product save and exact value restore return to byte-identical source', async () => {
    const root = freshStudioRoot();
    try {
      const file = join(root, 'content/products/jutell.ts');
      const originalBytes = readFileSync(file);
      const original = await loadEntry('products', 'jutell', root);
      const temporary = { ...original, summary: 'Temporary Studio round-trip value.' };
      const first = await saveEntry('products', 'jutell', temporary, root);
      assert.equal(first.ok, true, first.error);
      assert.equal((await loadEntry('products', 'jutell', root)).summary, temporary.summary);
      const restored = { ...(await loadEntry('products', 'jutell', root)), summary: original.summary };
      const second = await saveEntry('products', 'jutell', restored, root);
      assert.equal(second.ok, true, second.error);
      assert.deepEqual(readFileSync(file), originalBytes, 'product source bytes must exactly return to the starting state');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('new product source has no generated Studio ownership comment', () => {
    const generated = serializeEntryBody({ slug: 'new-product', title: 'New', summary: 'Draft', status: 'coming_soon' }, 'product');
    assert.doesNotMatch(generated, /\/\/ Studio:/);
  });

  test('surgical edits preserve comments and property order without Studio comments', async () => {
    const root = freshStudioRoot();
    try {
      const homeFile = join(root, 'content/home.ts');
      const homeBefore = readFileSync(homeFile, 'utf8');
      const home = await loadHome(root);
      home.meta.title = 'Temporary title';
      assert.equal((await saveHome(home, root)).ok, true);
      const homeAfter = readFileSync(homeFile, 'utf8');
      assert.ok(homeAfter.includes('/** Accessible label for the same prompt'), 'Home comments remain intact');
      assert.ok(homeAfter.includes('/** Home Radar BAND copy.'), 'inline copy comments remain intact');
      const homeOrder = (source) => ['hero:', 'brand:', 'instruct:', 'works:', 'resolve:', 'sections:', 'notify:', 'meta:']
        .map((key) => [key, source.indexOf(key, source.indexOf('export const home'))])
        .sort((a, b) => a[1] - b[1]).map(([key]) => key);
      assert.deepEqual(homeOrder(homeAfter), homeOrder(homeBefore));
      assert.doesNotMatch(homeAfter, /\/\/ Studio:/);

      const productFile = join(root, 'content/products/jutell.ts');
      const productBefore = readFileSync(productFile, 'utf8');
      const product = await loadEntry('products', 'jutell', root);
      product.summary = 'Temporary summary';
      assert.equal((await saveEntry('products', 'jutell', product, root)).ok, true);
      const productAfter = readFileSync(productFile, 'utf8');
      assert.ok(productAfter.includes('// Beginner-facing Korean.'), 'product rationale comment remains intact');
      assert.ok(productAfter.includes('// NOTE: this repository has 4 GitHub releases'), 'release comment remains intact');
      const productOrder = (source) => ['slug:', 'title:', 'summary:', 'status:', 'media:', 'releases:', 'source:', 'updatedAt:']
        .map((key) => [key, source.indexOf(key, source.indexOf('export default'))])
        .sort((a, b) => a[1] - b[1]).map(([key]) => key);
      assert.deepEqual(productOrder(productAfter), productOrder(productBefore));
      assert.doesNotMatch(productAfter, /\/\/ Studio:/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('an invalid Home edit does not reach disk (validation gate)', async () => {
    const before = readFileSync(join(TMP, 'content', 'home.ts'), 'utf8');
    const bad = await loadHome(TMP);
    bad.hero = { ...bad.hero, label: '' }; // empty required string
    const errors = validateHome(bad);
    assert.ok(errors.some((e) => /hero\.label/.test(e)), 'empty hero.label must be rejected');
    // Mirrors the server handler: validate first, save only when valid.
    if (errors.length === 0) await saveHome(bad, TMP);
    assert.equal(readFileSync(join(TMP, 'content', 'home.ts'), 'utf8'), before, 'invalid edit must not be written');
  });
});

// ============================================================
describe('Studio: save validation & rejection', () => {
  test('npm and PyPI package validation has natural Korean user-facing text', () => {
    assert.equal(
      userFacingValidationMessage('npm/pypi release needs package'),
      'npm 또는 PyPI 릴리스를 사용하려면 패키지 이름이 필요합니다.',
    );
  });

  test('valid product passes schema', () => {
    const entry = { slug: 'x', title: 'T', summary: 's', status: 'beta', releases: [], source: { url: 'https://x.example/' }, updatedAt: '2026-01-01' };
    assert.equal(validateEntry(entry, 'product').length, 0);
  });

  test('invalid status is rejected', () => {
    const entry = { slug: 'x', title: 'T', summary: 's', status: 'bogus', releases: [], source: { url: 'https://x.example/' }, updatedAt: '2026-01-01' };
    assert.ok(validateEntry(entry, 'product').length > 0, 'bogus status must fail validation');
  });

  test('product without a release is rejected', () => {
    const entry = { slug: 'x', title: 'T', summary: 's', status: 'available', source: { url: 'https://x.example/' }, updatedAt: '2026-01-01' };
    assert.ok(validateEntry(entry, 'product').length > 0, 'missing releases must fail');
  });

  test('unversioned media path is rejected', () => {
    const entry = { slug: 'x', title: 'T', summary: 's', status: 'coming_soon', media: { pending: [] }, source: { url: 'https://x.example/' }, updatedAt: '2026-01-01' };
    assert.equal(validateEntry(entry, 'product').length, 0, 'no media declaration is fine');
    const bad = { ...entry, media: { poster: { path: '/media/x/poster.mp4' }, pending: [] } };
    assert.ok(validateEntry(bad, 'product').some((e) => /unversioned/.test(e)), 'unversioned poster path must be rejected');
  });

  test('a promoted lab yields a valid draft product (no invented release)', async () => {
    const lab = await loadEntry('labs', 'judoctor', ROOT);
    const draft = {
      slug: lab.slug, title: lab.title, summary: lab.summary, status: 'coming_soon',
      media: { pending: ['poster', 'overviewVideo', 'actualDemo'] }, releases: [],
      source: lab.source, updatedAt: '2026-01-01',
    };
    assert.deepEqual(validateEntry(draft, 'product'), [], 'draft product must be schema-valid');
    assert.ok(
      validateEntry({ ...draft, status: 'available' }, 'product').length > 0,
      'promoting to available without a real release must be rejected',
    );
  });
});

// ============================================================
describe('Studio: atomic save', () => {
  test('writes a valid TS file and leaves no temp behind', async () => {
    const target = join(TMP, '_atomic_ok.ts');
    const r = await atomicWrite(target, "export default { slug: 'ok' };");
    assert.equal(r.ok, true, r.error);
    assert.ok(existsSync(target), 'target file must exist');
    assert.ok(!existsSync(target + '.__studio_tmp__' + process.pid), 'no leftover temp');
  });

  test('rejects a syntactically invalid file and leaves target untouched', async () => {
    const target = join(TMP, '_atomic_bad.ts');
    const r = await atomicWrite(target, "export default { broken");
    assert.equal(r.ok, false, 'bad TS must be rejected');
    assert.ok(r.error, 'must report an error');
    assert.ok(!existsSync(target), 'invalid file must not be written');
  });

  test('original bytes are preserved when import-check fails', async () => {
    const target = join(TMP, '_atomic_preserve.ts');
    await atomicWrite(target, "export default { slug: 'orig' };");
    const original = readFileSync(target, 'utf8');
    const r = await atomicWrite(target, "export default { broken");
    assert.equal(r.ok, false);
    assert.equal(readFileSync(target, 'utf8'), original, 'original bytes must be intact');
  });
});

// ============================================================
describe('Studio: media versioning', () => {
  test('a replacement asset gets a NEW versioned name; old files never overwritten', async () => {
    const slug = 'jutell';
    const dir = join(TMP, 'public/media', slug);
    const r1 = await acceptUpload(slug, 'poster', Buffer.from('POSTER_ONE'), 'poster.jpg', TMP);
    assert.equal(r1.ok, true);
    assert.ok(r1.path && r1.path.endsWith('poster.v1.jpg'), 'first upload is v1');
    const r2 = await acceptUpload(slug, 'poster', Buffer.from('POSTER_TWO'), 'poster.jpg', TMP);
    assert.equal(r2.ok, true);
    assert.ok(r2.path && r2.path.endsWith('poster.v2.jpg'), 'second upload must be v2, never overwrite v1');
    assert.equal(readFileSync(join(dir, 'poster.v1.jpg'), 'utf8'), 'POSTER_ONE', 'v1 content preserved');
    assert.equal(readFileSync(join(dir, 'poster.v2.jpg'), 'utf8'), 'POSTER_TWO');
  });

  test('rejects unknown slots and non-product slugs', async () => {
    assert.equal((await acceptUpload('jutell', 'bogus', Buffer.from('x'), 'x.jpg', TMP)).ok, false);
    assert.equal((await acceptUpload('nope', 'poster', Buffer.from('x'), 'poster.jpg', TMP)).ok, false);
  });

  test('media listing reflects uploads', async () => {
    await acceptUpload('jutell', 'poster', Buffer.from('P1'), 'poster.jpg', TMP);
    const list = await listMedia('jutell', TMP);
    assert.ok(list.files.some((f) => f.name.startsWith('poster.v')), 'listing must include the versioned poster');
  });

  test('MEDIA_SLOTS is the documented set', () => {
    assert.deepEqual([...MEDIA_SLOTS], ['poster', 'overviewVideo', 'actualDemo']);
  });
});

// ============================================================
describe('Studio: Preview command', () => {
  test('runPortalBuild reflects the real committed build (BUILD gate; no mock)', () => {
    const r = runPortalBuild(ROOT, 240000);
    assert.equal(r.ok, true, 'the real build must pass: ' + r.output.slice(0, 200));
    assert.ok(existsSync(join(DIST, 'index.html')), 'dist must be produced');
  });
});

// ============================================================
describe('Studio: Verify gates', () => {
  test('four gates reported, allPass true only when all pass', () => {
    const report = runVerify(ROOT, fakeRunner({ build: ok, test: ok, registry: ok, links: ok }));
    assert.equal(report.build.ok, true);
    assert.equal(report.test.ok, true);
    assert.equal(report.registry.ok, true);
    assert.equal(report.links.ok, true);
    assert.equal(report.allPass, true);
  });

  test('a failing gate flips allPass false (Publish must be blocked)', () => {
    const report = runVerify(ROOT, fakeRunner({ build: ok, test: fail, registry: ok, links: ok }));
    assert.equal(report.test.ok, false);
    assert.equal(report.allPass, false, 'one failed gate must flip allPass false');
  });

  test('BUILD failure means TEST cannot pass (TEST depends on a fresh dist)', () => {
    const report = runVerify(ROOT, fakeRunner({ build: fail, test: ok, registry: ok, links: ok }));
    assert.equal(report.build.ok, false);
    assert.equal(report.test.ok, false, 'TEST must not pass when BUILD failed');
  });
});

// ============================================================
describe('Studio: Publish (frozen / dry-run)', () => {
  test('git writes are disallowed by default (Git Freeze)', () => {
    delete process.env.STUDIO_ALLOW_GIT;
    assert.equal(isGitAllowed(), false, 'writes must be off by default');
  });

  test('proposed branch name follows the content-YYYYMMDD-HHMM scheme', () => {
    assert.match(proposedBranchName(), /^studio\/content-\d{8}-\d{4}$/);
  });

  test('getState reports the local branch and clean/dirty without network', () => {
    const s = getState(ROOT);
    assert.equal(typeof s.branch, 'string');
    assert.equal(s.branch, execReadGit(['rev-parse', '--abbrev-ref', 'HEAD']));
    assert.equal(typeof s.dirty, 'boolean');
    assert.equal(Array.isArray(s.changedFiles), true);
  });

  test('getChangedFiles includes untracked files (new content is publishable)', () => {
    const probe = join(ROOT, '__studio_probe__.txt');
    writeFileSync(probe, 'probe');
    try {
      const files = getChangedFiles(ROOT);
      assert.ok(files.includes('__studio_probe__.txt'), 'untracked file must be listed so Publish stages it');
    } finally {
      unlinkSync(probe);
    }
  });

  test('executePublish refuses with GIT_FREEZE_ACTIVE and creates no branch', () => {
    delete process.env.STUDIO_ALLOW_GIT;
    const plan = {
      branch: proposedBranchName(),
      head: '0'.repeat(40),
      changedFiles: ['content/products/jutell.ts'],
      diffShort: '',
      remoteMainChanged: false,
      remoteMainSha: '',
      publishable: true,
      reasons: [],
    };
    const before = execReadGit(['branch', '--list', 'studio/content-*']);
    const r = executePublish(ROOT, plan);
    assert.equal(r.refused, true);
    assert.equal(r.reason, 'GIT_FREEZE_ACTIVE', 'must refuse without touching git: ' + r.message);
    const after = execReadGit(['branch', '--list', 'studio/content-*']);
    assert.equal(after, before, 'no branch may be created while frozen');
  });

  test('a green plan is publishable but Publish still refuses under freeze', () => {
    delete process.env.STUDIO_ALLOW_GIT;
    const gates = runVerify(ROOT, fakeRunner({ build: ok, test: ok, registry: ok, links: ok }));
    const plan = {
      branch: proposedBranchName(),
      head: '0'.repeat(40),
      changedFiles: ['content/products/jutell.ts'],
      diffShort: '',
      remoteMainChanged: false,
      remoteMainSha: '',
      publishable: true,
      reasons: [],
    };
    const publishable = plan.publishable && gates.allPass && !plan.remoteMainChanged;
    assert.equal(publishable, true, 'with all gates green the plan is publishable');
    const r = executePublish(ROOT, plan);
    assert.equal(r.refused, true);
    assert.equal(r.reason, 'GIT_FREEZE_ACTIVE', 'freeze refuses even a green plan');
  });

  test('STUDIO_ALLOW_GIT cannot bypass the active project Git Freeze', () => {
    const saved = process.env.STUDIO_ALLOW_GIT;
    process.env.STUDIO_ALLOW_GIT = '1';
    try {
      assert.equal(isGitAllowed(), false);
      const r = executePublish(ROOT, {
        branch: 'studio/content-00000000-0000',
        head: '0'.repeat(40),
        changedFiles: ['content/products/jutell.ts'],
        diffShort: '',
        remoteMainChanged: true,
        remoteMainSha: '0'.repeat(40),
        publishable: true,
        reasons: ['REMOTE_MAIN_CHANGED'],
      });
      assert.equal(r.refused, true);
      assert.equal(r.reason, 'GIT_FREEZE_ACTIVE', 'explicit freeze remains stronger than the environment flag');
    } finally {
      process.env.STUDIO_ALLOW_GIT = saved;
    }
  });
});

// ============================================================
describe('Studio: path-traversal defense', () => {
  test('acceptUpload rejects a traversal-shaped slug before any fs write', async () => {
    const r = await acceptUpload('..%2F..%2Fetc', 'poster', Buffer.from('x'), 'poster.jpg', TMP);
    assert.equal(r.ok, false, 'traversal slug must be rejected before any fs write');
  });
});
