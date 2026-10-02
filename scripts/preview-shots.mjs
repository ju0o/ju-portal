#!/usr/bin/env node
/**
 * Founder visual review shots.
 *
 * Chromium cannot launch inside this container (libnspr4/libnss3/libasound2 are
 * absent and sudo is unavailable), and WSL cannot route to a Windows loopback
 * CDP port. So the browser is driven from the Windows side: Windows Chrome runs
 * with --remote-debugging-port and this script talks to it through the Windows
 * host's own networking, capturing the built dist/ served from a Windows-visible
 * path.
 *
 * Usage:
 *   JU_CDP=127.0.0.1:9333 node scripts/preview-shots.mjs [outDir]
 */
import { mkdir, readdir, stat, readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
const DIST = join(ROOT, 'dist');
const OUT = resolve(process.argv[2] ?? join(ROOT, 'evidence', 'founder-review'));
const [CDP_HOST, CDP_PORT] = (process.env.JU_CDP ?? '127.0.0.1:9333').split(':');
const { chromium } = await import('@playwright/test');

/** Frames the Founder asked to judge, at the two widths named in the brief. */
const SHOTS = [
  { name: 'hero-1440', width: 1440, height: 900, y: 0 },
  { name: 'hero-390', width: 390, height: 844, y: 0 },
  { name: 'brand-value', width: 1440, height: 900, anchor: '#brand' },
  { name: 'you-instruct', width: 1440, height: 900, anchor: '#instruct' },
  { name: 'ai-works', width: 1440, height: 900, anchor: '#works' },
  { name: 'real-tool', width: 1440, height: 900, anchor: '#products', wait: 4200 },
  { name: 'home-full', width: 1440, height: 900, full: true, wait: 5200 },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};

/** Serve dist/ over the Windows loopback so the Windows browser can load it. */
const server = (await import('node:http')).createServer(async (req, res) => {
  const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const path = join(DIST, rel.endsWith('/') ? join(rel, 'index.html') : rel);
  try {
    const st = await stat(path);
    const ext = path.slice(path.lastIndexOf('.'));
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)?/.exec(range);
      const start = Number(m[1] ?? 0);
      const end = m[2] ? Number(m[2]) : st.size - 1;
      res.writeHead(206, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Content-Length': end - start + 1,
      });
      const { createReadStream } = await import('node:fs');
      return createReadStream(path, { start, end }).pipe(res);
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Content-Length': st.size,
    });
    const { createReadStream } = await import('node:fs');
    return createReadStream(path).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('not found');
  }
});
const PORT = Number(process.env.JU_SHOT_PORT ?? 4477);
await new Promise((r) => server.listen(PORT, '0.0.0.0', r));
const ORIGIN = `http://127.0.0.1:${PORT}`;

await mkdir(OUT, { recursive: true });

const browser = await chromium.connectOverCDP(`http://${CDP_HOST}:${CDP_PORT}`, { timeout: 60_000 });
const context = browser.contexts()[0] ?? (await browser.newContext());

for (const shot of SHOTS) {
  const page = await context.newPage();
  await page.setViewportSize({ width: shot.width, height: shot.height });
  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });
  // The hero resolves over ~2.9s; screenshots must show the finished state.
  await page.waitForTimeout(3400);
  if (shot.full) {
    // Walk the whole page so every reveal has played, then capture the rhythm.
    await page.evaluate(async () => {
      const step = window.innerHeight * 0.8;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 260));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(shot.wait ?? 1200);
  } else if (shot.anchor) {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
    }, shot.anchor);
    await page.waitForTimeout(shot.wait ?? 2600);
  } else if (shot.y) {
    await page.evaluate((y) => window.scrollTo(0, y), shot.y);
    await page.waitForTimeout(700);
  }
  const file = join(OUT, shot.name + '.png');
  await page.screenshot({ path: file, fullPage: Boolean(shot.full) });
  console.log('[shot] ' + file);
  await page.close();
}

await browser.close();
server.close();
console.log('[shots] done -> ' + OUT);
process.exit(0);
