#!/usr/bin/env node
/**
 * Founder particle-field verification.
 *
 * The Founder correction is behavioural, so it is checked against the built
 * portal in a real browser rather than asserted from source text: dots must
 * move individually, must not move as one layer, and must return home.
 *
 * Requires Windows Chrome with --remote-debugging-port (see preview-shots.mjs).
 * Usage:
 *   JU_CDP=127.0.0.1:9333 node scripts/verify-particles.mjs
 */
import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
const DIST = join(ROOT, 'dist');
const [CDP_HOST, CDP_PORT] = (process.env.JU_CDP ?? '127.0.0.1:9333').split(':');
const PW = process.env.JU_PLAYWRIGHT
  ?? (process.platform === 'win32'
    ? 'file:///F:/JuPortal/node_modules/@playwright/test/index.mjs'
    : '/mnt/f/JuPortal/node_modules/@playwright/test/index.mjs');
const { chromium } = await import(PW);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};

const server = createServer(async (req, res) => {
  const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const path = join(DIST, rel.endsWith('/') ? join(rel, 'index.html') : rel);
  try {
    const st = await stat(path);
    const type = MIME[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size });
    return createReadStream(path).pipe(res);
  } catch {
    res.writeHead(404).end('not found');
  }
});
const PORT = Number(process.env.JU_SHOT_PORT ?? 4478);
await new Promise((r) => server.listen(PORT, '0.0.0.0', r));

const browser = await chromium.connectOverCDP(`http://${CDP_HOST}:${CDP_PORT}`, { timeout: 60_000 });
const context = browser.contexts()[0] ?? (await browser.newContext());
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

/** Run a pointer path against a fresh page and sample the dot transforms. */
async function withPage(fn, { reduced = false } = {}) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3600); // hero fully resolved
  try { await fn(page); } finally { await page.close(); }
}

/**
 * Read every portrait dot's rendered translate offset.
 *
 * Each dot is permanently centred with translate(-50%,-50%), so the raw
 * computed transform is never zero. Offsets are therefore measured as a delta
 * from a per-dot baseline captured at rest: that is the actual pointer
 * displacement, and it also proves the CSS wiring (base rule + animation
 * release) is really reaching the rendered transform.
 */
const readTransforms = (page) => page.evaluate(() => {
  const read = (sel) => Array.from(document.querySelectorAll(sel)).map((el) => {
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return { x: 0, y: 0 };
    const m = new DOMMatrixReadOnly(t);
    return { x: m.m41, y: m.m42 };
  });
  return { dots: read('.portrait-dot'), mark: read('.signal-resolve .tile-signal circle') };
});

/** Pointwise delta between a baseline and a current reading. */
const delta = (baseline, current) =>
  current.map((c, i) => ({ x: c.x - baseline[i].x, y: c.y - baseline[i].y }));

const displaced = (offsets, eps = 0.05) => offsets.filter((o) => Math.hypot(o.x, o.y) > eps);

const hasWholeFieldParallax = async (page) => page.evaluate(() => {
  const f = document.querySelector('.portrait-dots');
  if (!f) return 'missing field';
  const t = getComputedStyle(f).transform;
  return t !== 'none' ? t : null;
});

await withPage(async (page) => {
  const field = await hasWholeFieldParallax(page);
  check('whole-field parallax removed', field === null, field ?? 'transform: none on .portrait-dots');

  const cssVars = await page.evaluate(() => {
    const f = document.querySelector('[data-signal-field]');
    return [f?.style.getPropertyValue('--px'), f?.style.getPropertyValue('--py')];
  });
  check('--px/--py no longer written', cssVars.every((v) => !v), JSON.stringify(cssVars));

  const rest = await readTransforms(page);
  check('at rest the portrait is fully resolved', rest.dots.length > 1500, `${rest.dots.length} dots rendered`);

  // Move the pointer to the centre of the portrait field.
  const box = await page.evaluate(() => {
    const r = document.querySelector('[data-signal-field]').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h * 0.46;
  await page.mouse.move(cx, cy, { steps: 12 });
  await page.waitForTimeout(420);
  const near = await readTransforms(page);

  const nearDelta = delta(rest.dots, near.dots);
  const active = displaced(nearDelta);
  check('pointer activates a subset of dots', active.length > 0 && active.length < nearDelta.length * 0.35,
    `${active.length}/${nearDelta.length} dots active`);

  const maxDisplacement = active.reduce((m, o) => Math.max(m, Math.hypot(o.x, o.y)), 0);
  check('max displacement stays restrained (8-14px)', maxDisplacement > 0.5 && maxDisplacement <= 14,
    `${maxDisplacement.toFixed(2)}px`);

  // Individual response: distinct dots must have distinct offsets.
  const unique = new Set(active.map((o) => `${o.x.toFixed(2)},${o.y.toFixed(2)}`));
  check('each dot moves individually (not one shared offset)', unique.size > active.length * 0.6,
    `${unique.size} distinct offsets across ${active.length} dots`);

  // Locality: displacement must fall off with distance from the pointer, and the
  // far side of the field must be untouched. Dot source positions come from the
  // same derived geometry the runtime uses.
  const geometry = JSON.parse(
    await page.evaluate(async () => (await fetch('/brand/founder-signal.json')).text()),
  );
  const size = { w: box.w, h: box.h };
  const scored = geometry.dots.map((d, i) => {
    const sx = box.x + ((d.x + 0.5) / geometry.cols) * size.w;
    const sy = box.y + ((d.y + 0.5) / geometry.rows) * size.h;
    return { dist: Math.hypot(sx - cx, sy - cy), off: Math.hypot(nearDelta[i].x, nearDelta[i].y) };
  });
  const movedS = scored.filter((s) => s.off > 0.05);
  const stillS = scored.filter((s) => s.off <= 0.05);
  const avgMoved = movedS.reduce((a, s) => a + s.dist, 0) / (movedS.length || 1);
  const avgStill = stillS.reduce((a, s) => a + s.dist, 0) / (stillS.length || 1);
  check('response is local: active dots are nearer than inactive ones',
    avgStill > avgMoved * 2, `active avg ${avgMoved.toFixed(0)}px vs inactive avg ${avgStill.toFixed(0)}px`);

  check('far edge of the field never moves',
    scored.filter((s) => s.dist > 260).every((s) => s.off <= 0.05),
    'dots >260px from pointer untouched');

  // Return behaviour: every dot goes back to its own origin.
  await page.mouse.move(10, 10, { steps: 6 });
  await page.evaluate(() => document.querySelector('[data-signal-field]')
    .dispatchEvent(new PointerEvent('pointerleave', { bubbles: true })));
  await page.waitForTimeout(800);
  const after = await readTransforms(page);
  const notHome = displaced(delta(rest.dots, after.dots));
  check('pointer leave returns every dot to its origin', notHome.length === 0,
    `${notHome.length}/${after.dots.length} still displaced`);

  // JU mark reacts per-dot, not as one block.
  const mark = await page.evaluate(() =>
    document.querySelectorAll('.signal-resolve .tile-signal circle').length);
  check('JU Signal Dot Mark exposes individual circles', mark > 10, `${mark} circles`);
});

await withPage(async (page) => {
  const rest = await readTransforms(page);
  const box = await page.evaluate(() => {
    const r = document.querySelector('[data-signal-field]').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  // Aim at the mark itself, which sits low-right of the field.
  const mark = await page.evaluate(() => {
    const r = document.querySelector('.signal-resolve').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(mark.x, mark.y, { steps: 10 });
  await page.waitForTimeout(420);
  const near = await readTransforms(page);
  const markDelta = delta(rest.mark, near.mark);
  const moved = displaced(markDelta, 0.01);
  const maxMark = moved.reduce((m, o) => Math.max(m, Math.hypot(o.x, o.y)), 0);
  check('JU mark circles respond individually at lower amplitude',
    moved.length > 0 && moved.length < markDelta.length && maxMark < 6,
    `${moved.length}/${markDelta.length} circles, max ${maxMark.toFixed(2)}px`);
});

await withPage(async (page) => {
  const rest = await readTransforms(page);
  const box = await page.evaluate(() => {
    const r = document.querySelector('[data-signal-field]').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height * 0.46 };
  });
  await page.mouse.move(box.x, box.y, { steps: 10 });
  await page.waitForTimeout(420);
  const near = await readTransforms(page);
  const moved = displaced(delta(rest.dots, near.dots));
  check('reduced motion: no pointer deformation', moved.length === 0,
    `${moved.length}/${near.dots.length} moved`);
  const visible = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.portrait-dot'))
      .filter((d) => Number(getComputedStyle(d).opacity) > 0.05).length);
  check('reduced motion: portrait is still fully resolved', visible > 1000, `${visible} dots visible`);
}, { reduced: true });

await browser.close();
server.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
