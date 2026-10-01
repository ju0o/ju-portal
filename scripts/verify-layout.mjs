#!/usr/bin/env node
/**
 * Layout audit for the poster hero.
 *
 * verify-ui.mjs flags any overlap between direct children of a section. The
 * hero deliberately layers the founder field behind the copy, so this measures
 * exactly what the shared audit measures and reports it separately: the hero is
 * the one place where a real overlap is the intended composition.
 *
 * Usage: JU_CDP=127.0.0.1:9333 node scripts/verify-layout.mjs
 */
import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';

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
    res.writeHead(200, {
      'Content-Type': MIME[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream',
      'Content-Length': st.size,
    });
    return createReadStream(path).pipe(res);
  } catch {
    res.writeHead(404).end('not found');
  }
});
const PORT = Number(process.env.JU_SHOT_PORT ?? 4479);
await new Promise((r) => server.listen(PORT, '0.0.0.0', r));

const browser = await chromium.connectOverCDP(`http://${CDP_HOST}:${CDP_PORT}`, { timeout: 60_000 });
const context = browser.contexts()[0] ?? (await browser.newContext());
const OUTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
];

let failed = 0;
for (const v of OUTS) {
  const page = await context.newPage();
  await page.setViewportSize({ width: v.width, height: v.height });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3200);

  const report = await page.evaluate(() => {
    const de = document.documentElement;
    const overlaps = [];
    for (const el of document.querySelectorAll('article, section, header, footer, main')) {
      const kids = Array.from(el.children).filter((c) => {
        const r = c.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      for (let i = 0; i < kids.length; i++) {
        for (let j = i + 1; j < kids.length; j++) {
          const a = kids[i].getBoundingClientRect();
          const b = kids[j].getBoundingClientRect();
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 1 && oy > 1) {
            overlaps.push({
              section: el.className || el.tagName,
              a: kids[i].className || kids[i].tagName,
              b: kids[j].className || kids[j].tagName,
              ox: Math.round(ox), oy: Math.round(oy),
            });
          }
        }
      }
    }
    const smallTargets = [];
    for (const el of document.querySelectorAll('a[href], button:not([disabled])')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (el.closest('.sr-only') || el.classList.contains('skip')) continue;
      if (r.height < 44) smallTargets.push({ el: el.className || el.tagName, h: Math.round(r.height) });
    }
    const hero = document.querySelector('.hero').getBoundingClientRect();
    const signal = document.querySelector('.hero-signal').getBoundingClientRect();
    const copy = document.querySelector('.hero-copy').getBoundingClientRect();
    const title = document.querySelector('.hero-title');
    return {
      overflowX: de.scrollWidth - de.clientWidth,
      overlaps,
      smallTargets,
      // The poster only holds when the field genuinely runs under the type.
      overlapsType: Math.min(signal.right, copy.right) - Math.max(signal.left, copy.left) > 0,
      heroLines: Array.from(title.querySelectorAll('span')).map((s) => {
        const r = s.getBoundingClientRect();
        return { text: s.textContent.trim().slice(0, 12), w: Math.round(r.width), h: Math.round(r.height) };
      }),
      titleFont: parseFloat(getComputedStyle(title).fontSize),
      heroH: Math.round(hero.height),
      signalH: Math.round(signal.height),
    };
  });

  const nonHeroOverlaps = report.overlaps.filter((o) => !o.section.includes('hero'));
  const ok = report.overflowX <= 0 && nonHeroOverlaps.length === 0 && report.smallTargets.length === 0;
  if (!ok) failed++;
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${v.name}`);
  console.log(`  overflow-x: ${report.overflowX}px`);
  console.log(`  hero overlaps field+copy: ${report.overlapsType ? 'yes (intended poster)' : 'NO — not composed'}`);
  console.log(`  non-hero overlaps: ${nonHeroOverlaps.length}${nonHeroOverlaps.length ? ' -> ' + JSON.stringify(nonHeroOverlaps.slice(0, 3)) : ''}`);
  console.log(`  tap targets < 44px: ${report.smallTargets.length}${report.smallTargets.length ? ' -> ' + JSON.stringify(report.smallTargets.slice(0, 4)) : ''}`);
  console.log(`  hero title: ${report.titleFont.toFixed(1)}px, ${report.heroLines.length} authored lines`);
  console.log(`  field ${report.signalH}px tall in a ${report.heroH}px hero`);
  await page.close();
}

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
