import { readFile, readdir, writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import pathPosix from 'node:path/posix';
import { listSection } from './content';
import type { Section } from './content';

/** Slots a product media block can hold, mapped to allowed file extensions. */
export const MEDIA_SLOTS = ['poster', 'overviewVideo', 'actualDemo'] as const;
const SLOT_EXTS: Record<(typeof MEDIA_SLOTS)[number], string[]> = {
  poster: ['jpg', 'png'],
  overviewVideo: ['mp4'],
  actualDemo: ['mp4'],
};

const MEDIA_ROOT = 'media'; // no leading slash here; joined under public/

export interface MediaListing {
  slug: string;
  files: Array<{ name: string; path: string; byteSize: number; version?: number; slot?: string }>;
}

export interface UploadResult {
  ok: boolean;
  path?: string;
  byteSize?: number;
  version?: number;
  slot?: string;
  filename?: string;
  error?: string;
}

/** Resolve the on-disk public/media/{slug} directory for a product. */
function mediaDir(root: string, slug: string) {
  return join(root, 'public', MEDIA_ROOT, slug);
}

/** Public URL path for a media file, built without ever hardcoding /media/{slug} literals. */
function mediaUrl(slug: string, file: string): string {
  return pathPosix.join('/' + MEDIA_ROOT, slug, file);
}

function fileExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function parseVersion(file: string): number | undefined {
  // {slot}.v3.{ext}
  const i = file.lastIndexOf('.v');
  if (i < 0) return undefined;
  const num = /(\d+)\.\w+$/.exec(file.slice(i));
  return num ? Number(num[1]) : undefined;
}

export async function listMedia(slug: string, root = process.cwd()): Promise<MediaListing> {
  const dir = mediaDir(root, slug);
  const files: MediaListing['files'] = [];
  if (!existsSync(dir)) return { slug, files };
  for (const name of await readdir(dir)) {
    if (!MEDIA_SLOTS.map((s) => s.toLowerCase()).some((s) => name.startsWith(s + '.'))) continue;
    const full = join(dir, name);
    const st = await stat(full);
    let slot: undefined | string;
    for (const s of MEDIA_SLOTS) if (name.startsWith(s + '.')) slot = s;
    files.push({ name, path: mediaUrl(slug, name), byteSize: st.size, version: parseVersion(name), slot });
  }
  return { slug, files };
}

/** Validate that `slug` is a real product in the registry (products only). */
async function isProductSlug(slug: string, root: string): Promise<boolean> {
  if (!/^[a-z0-9-]+$/.test(slug)) return false;
  const products = await listSection('products', root);
  return products.some((e) => e.slug === slug);
}

/**
 * Accept a replacement media upload for `slug` / `slot`. Generates a NEW
 * versioned filename, copies it under public/media/{slug}/, and returns the new
 * registry path. Existing versioned assets are NEVER overwritten and NEVER
 * deleted.
 */
export async function acceptUpload(
  slug: string,
  slot: string,
  buffer: Buffer,
  filename: string,
  root = process.cwd(),
): Promise<UploadResult> {
  if (!MEDIA_SLOTS.includes(slot as (typeof MEDIA_SLOTS)[number])) {
    return { ok: false, error: 'unknown media slot: ' + slot };
  }
  const exts = SLOT_EXTS[slot as (typeof MEDIA_SLOTS)[number]];
  const ext = fileExt(filename);
  if (!ext) return { ok: false, error: 'could not determine file extension' };
  if (!exts.includes(ext)) return { ok: false, error: 'slot ' + slot + ' does not accept .' + ext };
  if (buffer.length === 0) return { ok: false, error: 'uploaded file is empty' };
  if (!await isProductSlug(slug, root)) return { ok: false, error: 'not a known product: ' + slug };

  const dir = mediaDir(root, slug);
  try { await mkdir(dir, { recursive: true }); } catch { /* exists */ }

  // next version number from existing files for this slot+ext
  let next = 1;
  try {
    for (const name of await readdir(dir)) {
      const prefix = slot + '.v';
      if (name.startsWith(prefix) && name.endsWith('.' + ext)) {
        const m = /^v(\d+)\.\w+$/.exec(name.slice(slot.length + 1));
        if (m) next = Math.max(next, Number(m[1]) + 1);
      }
    }
  } catch { /* dir may be empty */ }

  const versioned = slot + '.v' + next + '.' + ext;
  const dest = join(dir, versioned);
  await writeFile(dest, buffer);
  const st = await stat(dest);
  return { ok: true, path: mediaUrl(slug, versioned), byteSize: st.size, version: next, slot, filename: versioned };
}
