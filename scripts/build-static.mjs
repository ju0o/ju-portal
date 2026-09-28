#!/usr/bin/env node
/**
 * JU Portal static build step - copies the deployable surface into dist/.
 *
 * Why this exists: with no framework preset, Vercel publishes the repository ROOT
 * as static output. That made /public/media/... the served path (so the Registry's
 * /media/... contract 404'd) and it also exposed content/, scripts/ and vercel.json
 * on production. Producing an explicit dist/ fixes both and keeps the media path
 * contract independent of which framework the Builder picks.
 *
 * Contract: dist/ mirrors the public URL space exactly.
 *   public/media/x.v1.mp4  ->  /media/x.v1.mp4
 *   index.html             ->  /index.html
 *
 * Runs AFTER verify-registry.mjs, which is the gate.
 */
import { cp, mkdir, rm, readdir, readdir as _rd, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'dist');

/** Copy a repo path into the output dir. Returns false if it does not exist. */
async function copyIfPresent(rel) {
  try {
    await stat(join(ROOT, rel));
  } catch {
    return false;
  }
  await cp(join(ROOT, rel), join(OUT, rel), { recursive: true });
  return true;
}

/**
 * Copy the CONTENTS of public/ to the output root.
 *
 * The contents, not the directory: public/media/x.v1.mp4 must be served at
 * /media/x.v1.mp4 to satisfy the Registry media-path contract. Copying the
 * directory itself would serve it at /public/media/x.v1.mp4 instead, which is
 * exactly the bug this step exists to prevent.
 */
async function flattenPublic() {
  let entries;
  try {
    entries = await readdir(join(ROOT, 'public'), { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    // Documentation lives in the repo, not in the public URL space. A README under
    // public/ is Builder guidance, and shipping it would make it a public page.
    if (e.isFile() && e.name.toLowerCase().endsWith('.md')) continue;
    await cp(join(ROOT, 'public', e.name), join(OUT, e.name), { recursive: true });
  }
  return true;
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// 1. media and any other public asset, flattened to the URL root
const hadPublic = await flattenPublic();

// 2. the entry document. The infra smoke test ships now; the Builder replaces
//    index.html (or switches to a framework preset and changes outputDirectory).
const hadIndex = await copyIfPresent('index.html');

if (!hadIndex && !hadPublic) {
  console.error('[build-static] nothing to publish: neither public/ nor index.html exists');
  process.exit(1);
}

const published = await readdir(OUT);
console.log(
  '[build-static] published ' +
    published.length +
    ' top-level entr' +
    (published.length === 1 ? 'y' : 'ies') +
    ' to dist/: ' +
    published.join(', '),
);
