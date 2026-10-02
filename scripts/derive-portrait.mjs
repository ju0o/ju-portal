/**
 * Derive the Founder pixel/dot treatment from the PRIVATE source photo.
 *
 * The raw source is NEVER copied into the repository. It is sampled in a real
 * browser (the only image decoder available in this environment) and only
 * derived dot data is written to the prototype.
 *
 * The treatment keeps signal-dot language. Density comes from luminance and
 * local contrast, not a uniform mask falloff: eyes, nostrils, mouth, jaw and
 * hair stay dense and larger, flat skin is thinned, and the dark background
 * is dropped. Dark features are kept — dropping them is what turned the face
 * into a cloud. The original pixels are not carried over.
 *
 * PRIVACY: the source is copied to an ephemeral OS temp directory so the
 * browser can read it over file://, sampled, then the whole directory is
 * deleted. The path never appears in the output and the file is never staged
 * for git.
 *
 * Usage: node scripts/derive-portrait.mjs <private-source-path>
 */
import { copyFile, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './cdp.mjs';

const SOURCE = process.argv[2];
if (!SOURCE) {
  console.error(
    'Usage: node scripts/derive-portrait.mjs <private-source-path>\n' +
      'The private founder photo path is required; this repository ships no default.',
  );
  process.exit(1);
}

// Ephemeral OS temp dir. os.tmpdir() resolves per-platform (TMPDIR, %TEMP%, ...)
// so this works on WSL, native Linux, macOS and Windows without a hardcoded
// drive path. The private copy is deleted again below regardless of outcome.
const TMP_DIR = await mkdtemp(join(tmpdir(), 'ju-brand-derive-'));
const TMP_PNG = join(TMP_DIR, 'source.png');
const TMP_HTML = join(TMP_DIR, 'harness.html');

const OUTS = [
  join(process.cwd(), 'public/brand/founder-signal.json'),
  join(process.cwd(), 'prototype/assets/founder-signal.json'),
];

// Grid density: reads as a face at hero scale while staying clearly a dot
// field rather than a photograph.
const COLS = 56;
const ROWS = 56;

await copyFile(SOURCE, TMP_PNG);
// Chrome refuses file:// subresources unless the document itself is file://,
// so the sampler is loaded from a harness in the same directory.
await writeFile(TMP_HTML, '<!doctype html><meta charset="utf-8"><title>sampler</title>', 'utf8');

let payload;
try {
  const { browser, context } = await launchBrowser();
  const page = await context.newPage();
  await page.goto(pathToFileURL(TMP_HTML).href);

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
      const L = [];
      for (let y = 0; y < rows; y++) {
        const row = [];
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          row.push(luma(data[i], data[i + 1], data[i + 2]));
        }
        L.push(row);
      }
      const at = (y, x) => L[Math.max(0, Math.min(rows - 1, y))][Math.max(0, Math.min(cols - 1, x))];
      const mean = (y, x, rad) => {
        let acc = 0;
        let c = 0;
        for (let yy = y - rad; yy <= y + rad; yy++) {
          for (let xx = x - rad; xx <= x + rad; xx++) {
            if (yy >= 0 && yy < rows && xx >= 0 && xx < cols) { acc += L[yy][xx]; c++; }
          }
        }
        return acc / c;
      };
      const edgeAt = (y, x) => {
        const gx = -at(y - 1, x - 1) - 2 * at(y, x - 1) - at(y + 1, x - 1) + at(y - 1, x + 1) + 2 * at(y, x + 1) + at(y + 1, x + 1);
        const gy = -at(y - 1, x - 1) - 2 * at(y - 1, x) - at(y - 1, x + 1) + at(y + 1, x - 1) + 2 * at(y + 1, x) + at(y + 1, x + 1);
        return Math.hypot(gx, gy) / 4;
      };
      let emax = 0;
      const E = [];
      for (let y = 0; y < rows; y++) {
        const row = [];
        for (let x = 0; x < cols; x++) {
          const e = edgeAt(y, x);
          if (e > emax) emax = e;
          row.push(e);
        }
        E.push(row);
      }
      const subject = [];
      for (let y = 0; y < rows; y++) {
        const row = [];
        for (let x = 0; x < cols; x++) row.push(L[y][x] > 0.11 || E[y][x] / (emax || 1) > 0.18);
        subject.push(row);
      }
      const neighbors = (y, x) => {
        let n = 0;
        for (let yy = y - 1; yy <= y + 1; yy++) {
          for (let xx = x - 1; xx <= x + 1; xx++) {
            if ((yy !== y || xx !== x) && yy >= 0 && yy < rows && xx >= 0 && xx < cols && subject[yy][xx]) n++;
          }
        }
        return n;
      };
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (subject[y][x] && neighbors(y, x) < 2 && E[y][x] / (emax || 1) < 0.25 && L[y][x] < 0.16) subject[y][x] = false;
        }
      }
      const dots = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (!subject[y][x]) continue;
          const tone = L[y][x];
          const local = mean(y, x, 3);
          const contrast = Math.abs(tone - mean(y, x, 1));
          const edgeN = E[y][x] / (emax || 1);
          const dark = tone < local - 0.07 && tone < 0.48;
          let sil = false;
          if (y === 0 || y === rows - 1 || x === 0 || x === cols - 1 || !subject[y - 1]?.[x] || !subject[y + 1]?.[x] || !subject[y][x - 1] || !subject[y][x + 1]) sil = true;
          const flat = !dark && !sil && contrast < 0.03 && edgeN < 0.22 && tone > 0.35;
          if (flat) {
            if ((x * 3 + y * 5) % 3 !== 0) continue;
            dots.push({ x, y, r: 0.82, a: 0.26, t: 'lo' });
            continue;
          }
          const shadow = !dark && !sil && tone < 0.28 && edgeN < 0.2;
          if (shadow) {
            if ((x + y * 2) % 3 !== 0) continue;
            dots.push({ x, y, r: 0.9, a: 0.3, t: 'lo' });
            continue;
          }
          const importance = Math.min(1, edgeN * 0.9 + contrast * 3.2 + (dark ? 0.85 : 0) + (sil ? 0.45 : 0));
          let tier = 'mid';
          let scale = 0.32;
          if (dark || importance > 0.55) { tier = 'hi'; scale = Math.min(1, 0.62 + importance * 0.4); }
          else if (importance > 0.28 || sil) { tier = 'mid'; scale = 0.45 + importance * 0.3; }
          dots.push({
            x, y,
            r: Number((0.9 + scale * 1.7).toFixed(2)),
            a: Number((0.38 + scale * 0.55).toFixed(3)),
            t: tier,
          });
        }
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
  await rm(TMP_DIR, { recursive: true, force: true });
}

const body = JSON.stringify({
  source: 'founder source photo (private, not committed)',
  method: 'luminance plus local-contrast dot field; eyes, nostrils, mouth, jaw and hair stay dense, flat skin and background are thinned',
  cols: payload.cols,
  rows: payload.rows,
  count: payload.count,
  dots: payload.dots,
});
for (const out of OUTS) {
  await writeFile(out, body, 'utf8');
  console.log(
    `wrote ${out}: ${payload.count} dots of ${COLS * ROWS} (${((payload.count / (COLS * ROWS)) * 100).toFixed(1)}% kept)`,
  );
}
console.log('private temp copy removed; raw source never copied into the repo');

// Prove the raw bytes are not present in the written output.
const written = await readFile(OUTS[0], 'utf8');
const rawBytes = await readFile(SOURCE);
const probe = rawBytes.subarray(0, 64).toString('base64').slice(0, 40);
console.log(
  written.includes(probe) ? 'WARNING: raw bytes detected in output' : 'output carries no raw image data',
);
