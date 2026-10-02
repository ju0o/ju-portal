/**
 * Generate a real poster frame from the JuQode overview video.
 *
 * Contract §7 (P1-6): a media area must never render as an empty void. The
 * Registry declares the poster as `pending` because none existed; this extracts
 * a genuine frame from the real video so the card is never a black box.
 *
 * The frame is real footage — not a fabricated screenshot. Chromium plays the
 * video and screenshots the decoded frame, because the container's bundled
 * ffmpeg is a stripped build that cannot demux MP4.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './cdp.mjs';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const PORT = 4399;
const HOST_IP = process.env.JU_WSL_IP ?? '127.0.0.1';

const MIME = { '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const file = join(PUBLIC_DIR, rel);
  try {
    await stat(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(PORT, '0.0.0.0', r));

const { browser, context } = await launchBrowser();
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 720 });
await page.goto(`http://${HOST_IP}:${PORT}/media/juqode/overview.v1.mp4`, { waitUntil: 'load' });

await page.evaluate(
  (t) =>
    new Promise((resolve) => {
      const v = document.querySelector('video');
      if (!v) return resolve();
      v.muted = true;
      const done = () => resolve();
      v.addEventListener('seeked', done, { once: true });
      v.addEventListener('loadeddata', () => {
        v.currentTime = t;
      }, { once: true });
      setTimeout(done, 10000);
    }),
  1.0,
);

const video = await page.$('video');
const buf = await video.screenshot({ type: 'png' });
const out = join(PUBLIC_DIR, 'media', 'juqode', 'poster.v1.png');
await writeFile(out, buf);
console.log(`wrote ${out} (${(buf.length / 1024).toFixed(0)} KB)`);

await page.close();
await context.close();
await browser.close();
server.close();
