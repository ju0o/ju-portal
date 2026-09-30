/**
 * Derive the Founder pixel/dot treatment from the PRIVATE source photo.
 *
 * The raw source is NEVER copied into the repository. It is sampled in a real
 * browser (the only image decoder available in this environment) and only
 * derived dot data is written to the prototype.
 *
 * The treatment is luminance-driven: it preserves the real tonal structure of
 * the face - light, shadow, eye catchlights - without embedding the photograph.
 * Dot size and opacity encode tone; the original pixels are not carried over.
 *
 * PRIVACY: the source is copied to an ephemeral Windows temp path so the
 * browser can read it over file://, sampled, then deleted. The path never
 * appears in the output and the file is never staged for git.
 *
 * Usage: node scripts/derive-portrait.mjs <private-source-path>
 */
import { copyFile, unlink, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launchBrowser } from '/mnt/f/JuPortal/scripts/cdp.mjs';

const SOURCE = process.argv[2] ?? '/mnt/e/JU_Brand_System/private/founder-source.png';

// Windows-side temp dir: the browser runs on Windows and cannot read a WSL
// path. Removed at the end regardless of outcome.
const WIN_TMP_DIR_WSL = '/mnt/c/Windows/Temp/ju-brand-derive';
const WIN_TMP_PNG_WSL = '/mnt/c/Windows/Temp/ju-brand-derive/source.png';
const WIN_TMP_HTML_WSL = '/mnt/c/Windows/Temp/ju-brand-derive/harness.html';

const OUT = join(process.cwd(), 'prototype/assets/founder-signal.json');

// Grid density: reads as a face at hero scale while staying clearly a dot
// field rather than a photograph.
const COLS = 56;
const ROWS = 56;

await mkdir(WIN_TMP_DIR_WSL, { recursive: true });
await copyFile(SOURCE, WIN_TMP_PNG_WSL);
// Chrome refuses file:// subresources unless the document itself is file://,
// so the sampler is loaded from a harness in the same directory.
await writeFile(WIN_TMP_HTML_WSL, '<!doctype html><meta charset="utf-8"><title>sampler</title>', 'utf8');

let payload;
try {
  const { browser, context } = await launchBrowser();
  const page = await context.newPage();
  await page.goto('file:///C:/Windows/Temp/ju-brand-derive/harness.html');

  payload = await page.evaluate(
    async ({ name, cols, rows }) => {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('decode failed: ' + name));
        img.src = name;
      });

      const c = document.createElement('canvas');
      c.width = cols;
      c.height = rows;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, cols, rows);
      const { data } = ctx.getImageData(0, 0, cols, rows);

      const luma = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

      let min = 1;
      let max = 0;
      const raw = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          const l = luma(data[i], data[i + 1], data[i + 2]);
          raw.push({ x, y, l });
          if (l < min) min = l;
          if (l > max) max = l;
        }
      }

      const dots = [];
      for (let k = 0; k < raw.length; k++) {
        const { x, y, l } = raw[k];
        const t = (l - min) / Math.max(0.0001, max - min);
        // Gentle curve keeps facial structure readable while pushing
        // mid-tones down so the field stays sparse and signal-like.
        const s = Math.pow(t, 1.35);
        // Drop the darkest region so the portrait dissolves into the
        // background instead of sitting on a visible dark block.
        if (s < 0.16) continue;
        dots.push({
          x: x,
          y: y,
          r: Number((0.7 + s * 1.6).toFixed(2)),
          a: Number((0.16 + s * 0.62).toFixed(3)),
          t: s > 0.68 ? 'hi' : s > 0.34 ? 'mid' : 'lo',
        });
      }

      return { cols, rows, count: dots.length, dots };
    },
    { name: 'source.png', cols: COLS, rows: ROWS },
  );

  await page.close();
  await context.close();
  await browser.close();
} finally {
  // The private copy never outlives the sampling step.
  await unlink(WIN_TMP_PNG_WSL).catch(() => {});
  await unlink(WIN_TMP_HTML_WSL).catch(() => {});
}

await writeFile(
  OUT,
  JSON.stringify({
    source: 'founder source photo (private, not committed)',
    method: 'luminance-sampled dot field',
    cols: payload.cols,
    rows: payload.rows,
    count: payload.count,
    dots: payload.dots,
  }),
  'utf8',
);

console.log(
  `wrote ${OUT}: ${payload.count} dots of ${COLS * ROWS} (${((payload.count / (COLS * ROWS)) * 100).toFixed(1)}% kept)`,
);
console.log('private temp copy removed; raw source never copied into the repo');

// Prove the raw bytes are not present in the written output.
const written = await readFile(OUT, 'utf8');
const rawBytes = await readFile(SOURCE);
const probe = rawBytes.subarray(0, 64).toString('base64').slice(0, 40);
console.log(
  written.includes(probe) ? 'WARNING: raw bytes detected in output' : 'output carries no raw image data',
);
