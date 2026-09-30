/**
 * Browser verification against a built dist/ or a live origin.
 *
 * Chromium cannot launch in this container (libnspr4/libnss3/libasound2 absent,
 * no sudo), so a Windows-side Chrome is driven over CDP. The site is served
 * from WSL and addressed by the WSL IP, because Windows cannot reach WSL
 * loopback.
 *
 * Usage:
 *   node scripts/verify-ui.mjs                     # local dist
 *   ORIGIN=https://<preview-host> node scripts/... # a deployed origin
 */
import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/mnt/f/JuPortal/node_modules/@playwright/test/index.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.JU_SERVE_PORT ?? 4455);
const HOST_IP = process.env.JU_WSL_IP ?? '127.0.0.1';
const DEPLOYED = process.env.ORIGIN;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

let server = null;
let ORIGIN = DEPLOYED;

if (!DEPLOYED) {
  server = createServer(async (req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const candidates = [join(DIST, rel), join(DIST, rel, 'index.html')];
    for (const file of candidates) {
      try {
        const st = await stat(file);
        if (st.isDirectory()) continue;
        const type = MIME[extname(file)] ?? 'application/octet-stream';
        const range = req.headers.range;
        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          const start = m[1] ? Number(m[1]) : 0;
          const end = m[2] ? Number(m[2]) : st.size - 1;
          res.writeHead(206, {
            'Content-Type': type,
            'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${start}-${end}/${st.size}`,
            'Content-Length': end - start + 1,
          });
          return createReadStream(file, { start, end }).pipe(res);
        }
        res.writeHead(200, {
          'Content-Type': type,
          'Accept-Ranges': 'bytes',
          'Content-Length': st.size,
        });
        return createReadStream(file).pipe(res);
      } catch {
        /* next */
      }
    }
    const notFound = join(DIST, '404.html');
    try {
      res.writeHead(404, { 'Content-Type': MIME['.html'] });
      return createReadStream(notFound).pipe(res);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(PORT, '0.0.0.0', r));
  ORIGIN = `http://${HOST_IP}:${PORT}`;
}

const ROUTES = ['/', '/products/', '/products/juqode/', '/products/jutell/', '/skills/', '/labs/', '/radar/'];
const VIEWPORTS = [
  { name: '360', width: 360, height: 800 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
];

const endpoint = process.env.JU_CDP_ENDPOINT;
const browser = endpoint ? await chromium.connectOverCDP(endpoint, { timeout: 60_000 }) : await chromium.launch({ args: ['--no-sandbox'] });
const context = browser.contexts()[0] ?? (await browser.newContext());

const consoleErrors = [];
const pageErrors = [];

async function audit(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const overflow = de.scrollWidth - de.clientWidth;

    // Overlap between sibling boxes sharing a flow container.
    let overlaps = 0;
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
          if (ox > 1 && oy > 1) overlaps++;
        }
      }
    }

    let smallTargets = 0;
    for (const el of document.querySelectorAll('a[href], button:not([disabled])')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (el.closest('.sr-only') || el.classList.contains('skip')) continue;
      if (r.height < 44) smallTargets++;
    }

    let mediaOverflow = 0;
    for (const m of document.querySelectorAll('video, img')) {
      const r = m.getBoundingClientRect();
      if (r.right > de.clientWidth + 1 || r.left < -1) mediaOverflow++;
    }

    // Readability floor. The JU Brand System sets its uppercase mono labels
    // (.chip, .label, .rail-*, .foot, .band-num and the .detail-section h2
    // headings) to 11px, matching the approved artifact, so those are excluded
    // here. The check applies to Builder-authored reading copy: at 11px Korean
    // body text is genuinely hard to read.
    let tinyText = 0;
    for (const p of document.querySelectorAll('p, li, span, a, h1, h2, h3, td, small')) {
      if ((p.textContent ?? '').trim().length < 4) continue;
      if (p.closest('.status, .tag, .kbd, .brand, .appicon')) continue;
      if (p.closest('.chip, .label, .rail-item, .rail-foot, .foot, .band-num')) continue;
      if (p.closest('.detail-section h2')) continue;
      const size = parseFloat(getComputedStyle(p).fontSize);
      if (size > 0 && size < 12) tinyText++;
    }

    // Any anchor or button that goes nowhere.
    const deadLinks = Array.from(document.querySelectorAll('a[href]')).filter((a) => {
      const h = a.getAttribute('href');
      return !h || h === '#' || h === 'undefined' || h === 'null';
    }).length;

    return { overflow, overlaps, smallTargets, mediaOverflow, tinyText, deadLinks, title: document.title };
  });
}

const results = [];
for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    const page = await context.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${vp.name}][${route}] ${m.text()}`); });
    page.on('pageerror', (e) => pageErrors.push(`[${vp.name}][${route}] ${e.message}`));
    const res = await page.goto(ORIGIN + route, { waitUntil: 'load' });
    results.push({ vp: vp.name, route, status: res?.status(), ...(await audit(page)) });
    if (vp.name === '1440') {
      const name = route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_|_$/g, '');
      await page.screenshot({ path: join(ROOT, 'evidence', `${name}-1440.png`), fullPage: true });
    }
    if (vp.name === '360') {
      const name = route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_|_$/g, '');
      await page.screenshot({ path: join(ROOT, 'evidence', `${name}-360.png`), fullPage: true });
    }
    await page.close();
  }
}

// ---- video decode check (JuQode) ----
// The contract requires preload="none", so readyState is legitimately 0 before
// interaction. Force a real load/play to prove the bytes decode, rather than
// trusting a readyState that is 0 by design.
const vpage = await context.newPage();
await vpage.setViewportSize({ width: 1440, height: 900 });
await vpage.goto(`${ORIGIN}/products/juqode/`, { waitUntil: 'load' });
const video = await vpage.evaluate(async () => {
  const v = document.querySelector('video');
  if (!v) return { found: false };
  v.muted = true;
  try {
    await v.play();
  } catch {
    /* autoplay may be refused; load() below still proves decodability */
  }
  if (v.readyState < 1) {
    v.load();
    await new Promise((r) => {
      v.addEventListener('loadedmetadata', r, { once: true });
      setTimeout(r, 10000);
    });
  }
  // Let it decode at least one frame.
  await new Promise((r) => {
    if (v.readyState >= 2) return r();
    v.addEventListener('loadeddata', r, { once: true });
    setTimeout(r, 10000);
  });
  return {
    found: true,
    file: v.currentSrc.split('/').pop(),
    readyState: v.readyState,
    duration: Math.round(v.duration * 10) / 10,
    width: v.videoWidth,
    height: v.videoHeight,
    error: v.error ? v.error.code : null,
  };
});
await vpage.screenshot({ path: join(ROOT, 'evidence', 'juqode-video.png') });
await vpage.close();

// ---- CTA + action checks ----
// Labels are the beginner register from the Design Contract (바로 써보기 /
// 설치하기), so select on the verb data attribute rather than English text.
const ctaPage = await context.newPage();
await ctaPage.goto(`${ORIGIN}/products/juqode/`, { waitUntil: 'load' });
const juqodeCta = await ctaPage.evaluate(() => {
  const a = document.querySelector('a.btn.cta[data-verb]');
  return a ? { text: a.textContent.trim(), href: a.href, verb: a.getAttribute('data-verb') } : null;
});
await ctaPage.close();

const tellPage = await context.newPage();
await tellPage.goto(`${ORIGIN}/products/jutell/`, { waitUntil: 'load' });
const jutellCta = await tellPage.evaluate(() => {
  const cta = document.querySelector('.btn.cta[data-copy]');
  const box = document.querySelector('.installBox code');
  return {
    label: cta?.textContent?.trim() ?? null,
    command: cta?.getAttribute('data-copy') ?? null,
    commandBlock: box?.textContent?.trim() ?? null,
  };
});
await tellPage.close();

const radarPage = await context.newPage();
await radarPage.goto(`${ORIGIN}/radar/`, { waitUntil: 'load' });
const radarLink = await radarPage.evaluate(() => {
  const a = document.querySelector('a.btn.cta[href]');
  return a ? { text: a.textContent.trim(), href: a.href } : null;
});
await radarPage.close();

// ---- discovery (P0-3): input, chips, and a real recommendation ----
const discPage = await context.newPage();
await discPage.setViewportSize({ width: 1440, height: 900 });
await discPage.goto(`${ORIGIN}/`, { waitUntil: 'load' });
const discovery = await discPage.evaluate(async () => {
  const form = document.querySelector('[data-discovery]');
  const input = form?.querySelector('input');
  const banner = document.querySelector('[data-banner]');
  const chips = Array.from(document.querySelectorAll('[data-hint]'));
  if (!form || !input || !banner) return { found: false };
  input.value = '말로 앱 만들고 싶어';
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 120));
  return {
    found: true,
    hasInput: true,
    chipCount: chips.length,
    bannerVisible: !banner.hidden,
    bannerText: banner.textContent.trim().slice(0, 80),
    bannerLink: banner.querySelector('a')?.getAttribute('href') ?? null,
  };
});
await discPage.screenshot({ path: join(ROOT, 'evidence', 'discovery.png') });
await discPage.close();

// ---- hero token checks (P0-1..5) ----
const heroPage = await context.newPage();
await heroPage.setViewportSize({ width: 1440, height: 900 });
await heroPage.goto(`${ORIGIN}/`, { waitUntil: 'load' });
const heroState = await heroPage.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const em = document.querySelector('.hero h1 em');
  const brandU = document.querySelector('.brand em');
  const eyebrow = document.querySelector('.hero .eyebrow');
  const h1 = document.querySelector('.hero h1');
  const toggle = document.querySelector('.nav-toggle');
  return {
    accent: root.getPropertyValue('--accent').trim(),
    accent2: root.getPropertyValue('--accent2').trim(),
    emColor: em ? getComputedStyle(em).color : null,
    brandUColor: brandU ? getComputedStyle(brandU).color : null,
    eyebrowText: eyebrow?.textContent?.trim() ?? null,
    eyebrowBorder: eyebrow ? getComputedStyle(eyebrow).borderTopWidth : null,
    h1Size: h1 ? getComputedStyle(h1).fontSize : null,
    h1Leading: h1 ? getComputedStyle(h1).lineHeight : null,
    h1Tracking: h1 ? getComputedStyle(h1).letterSpacing : null,
    hasHamburger: Boolean(toggle),
  };
});
await heroPage.close();

console.log(JSON.stringify({
  origin: ORIGIN,
  results,
  video,
  juqodeCta,
  jutellCta,
  radarLink,
  discovery,
  heroState,
  consoleErrors,
  pageErrors,
}, null, 2));

await context.close();
await browser.close();
server?.close();
