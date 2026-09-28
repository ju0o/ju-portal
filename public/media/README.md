# media

Local media assets live here. The Registry owns the exact path; the UI never
constructs one.

## Naming contract (normative)

```
/media/{slug}/{asset}.{version}.{ext}
```

- `version` is **mandatory**: an increment (`v1`, `v2`) or a content hash (`a1b2c3d4`).
- Canonical unversioned names are **forbidden**. `overview.mp4` and `poster.jpg`
  fail `npm run verify`.
- Media is served with `Cache-Control: public, max-age=31536000, immutable`.
  That header is only safe *because* the path carries a version. The two rules are
  a matched pair — removing either one breaks the other.

## Storage tiers

| Size | Location |
|---|---|
| < 25 MB | this directory, versioned |
| 25–200 MB | GitHub Release asset on the product's own repo |
| > 200 MB | Cloudflare R2 (requires Founder GO) |

## Encoding policy

H.264 (yuv420p) + AAC, MP4, max 1920x1080, 30 fps, `-movflags +faststart`,
30–60 s, under 20 MB for the inline tier. Poster JPG 1280x720 under 150 KB.

## Replacing an asset

1. Bump the version (`v1` → `v2`).
2. Add the new file.
3. Update the Registry.
4. Keep the old file for 90 days.

Removing an old file and updating the Registry must land in the **same commit**,
otherwise the build fails. That failure is the intended safety net.

## Not made yet

These are declared in the Registry as `media.pending`, not as paths. Do not create
placeholder files to satisfy the schema.
