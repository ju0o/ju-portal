import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync, cpSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadHome, loadEntry, listSection, saveHome, saveEntry, serializeHomeSource, validateHome, validateEntry, atomicWrite } from '../src/studio/content.ts';
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
    assert.equal(s.branch, 'feat/portal-studio-v0');
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

  test('REMOTE_MAIN_CHANGED refuses even when git is allowed (no write issued)', () => {
    const saved = process.env.STUDIO_ALLOW_GIT;
    process.env.STUDIO_ALLOW_GIT = '1';
    try {
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
      assert.equal(r.reason, 'REMOTE_MAIN_CHANGED', 'must STOP when origin/main moved');
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
