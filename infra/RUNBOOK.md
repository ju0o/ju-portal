# JU Portal — Infra Runbook

Owner: Web Operations. Everything the Builder Agent needs to self-serve.

---

## 1. What is deployed where

| Thing | Value |
|---|---|
| Repo | `ju0o/ju-portal` (public) |
| Production branch | `main` |
| Production URL | `https://ju-portal-one.vercel.app` |
| Vercel project | Hobby plan, team `ju0o___` |
| Build command | `npm run build` = `verify-registry` (offline gate) then `build-static` |
| Output | `dist/`, explicit. Only the public URL space is published |
| Serverless functions | **none, by contract** |
| Custom domain | none at V0 (Founder decision C) |
| Monthly cost | **₩0** — no payment method on the Vercel account |

> **The domain is `ju-portal-one.vercel.app`, not `ju-portal.vercel.app`.** Vercel
> assigned the suffixed name on project creation. Always read the URL from the
> Vercel project page or `NEXT_PUBLIC_SITE_URL`; never hardcode an assumed slug.

> **`ju-portal.vercel.app` returns 404** — it was never assigned to this project.

## 1b. Why an explicit dist/

With no framework preset, Vercel publishes the **repository root** as static output.
That produced two real failures, both found and fixed:

- the video was served at `/public/media/...` instead of the Registry path `/media/...`
- `content/`, `scripts/`, `vercel.json` and the docs were publicly downloadable
  from production

`scripts/build-static.mjs` now assembles `dist/` containing exactly the public URL
space (`public/**` flattened to the root, plus the entry document), and strips
documentation recursively. Verified on production: every internal path now 404s.

**When the Builder switches to a framework preset, `outputDirectory` changes with
it.** If you adopt Next.js static export, set `outputDirectory` to `out` and drop
`build-static.mjs`; the media path contract is unaffected because Next.js already
maps `public/**` to `/`.

## 2. Deploy

Push to a non-`main` branch → automatic **Preview** URL.
Merge to `main` → automatic **Production** deploy.

There is no manual deploy step and no build token to manage. That is deliberate:
the sandbox that runs the infra work has no Vercel or GitHub token, so the pipeline
was designed to need none.

**Known trap.** A unique per-deployment URL such as
`ju-portal-<hash>-ju0o.vercel.app` answers anonymous requests with a Vercel
**login page** (HTTP 200, `x-matched-path: /login`) because Deployment Protection
is active. Never treat a 200 from that URL as proof your site is live — always
verify the **production alias** `ju-portal-one.vercel.app`.

**Known trap.** `gh` and `git push` are not usable from the infra sandbox (no token,
config unreadable). Repo changes are made through the authenticated web UI. The
web-UI **file upload flattens directories** — upload directory by directory via
`/upload/main/<dir>`, or the paths will all land at the repo root.

## 3. Rollback (target < 60 s)

**L1 — primary.** Vercel dashboard → Deployments → last known-good production →
`⋯` → **Promote to Production**. No rebuild. Needs nothing from Builder or git.

**L2 —** redeploy a known-good commit: `vercel --prod` from that SHA.

**L3 — last resort, Founder approval.** `git revert <bad-sha>` on `main`.

Roll back **first, report after** — no permission needed — when: the root or any IA
route 5xx/404, two consecutive build failures, a verified Download/Open link breaks,
the analytics beacon disappears, or there is a site-wide security regression.

Founder approval is required for: adding a payment method, buying a domain,
deleting a Vercel project, changing DNS, creating a new cloud account.

After any rollback, add a line to `infra/INCIDENTS.md`.

## 4. Post-deploy verification (run after every `main` deploy)

1. `GET /` → 200
2. `/products`, `/skills`, `/labs`, `/radar` → 200 each
3. every detail route → 200
4. every Registry media path → 200, `accept-ranges: bytes` for video
5. every Download/Install target → final URL 200
6. every Open/Try external URL → 200
7. analytics beacon present
8. `NEXT_PUBLIC_SITE_URL` renders as the production origin
9. no `localhost` / preview hash / dev string in built output
10. first-load JS < 200 KB gzipped
11. `npm run verify` exit 0

## 5. The two hard invariants

**A. Media paths are immutable and Registry-owned.**
`/media/{slug}/{asset}.{version}.{ext}`. The version segment is what makes
`immutable, max-age=31536000` safe. The UI never builds a path; it reads the
Registry literal. `npm run verify` fails the build on an unversioned path or on a
declared path that does not exist.

**B. No broken CTA.**
An entry may only claim `status: 'available'` if its primary action resolves to a
verified live target. Anything else is `coming_soon` / Labs. `npm run verify:links`
checks this in CI and is blocking on `main`.

## 6. Adding or changing a product entry

1. Verify the target **actually resolves** — check the asset, not just the release.
   `JuTell` has 4 releases and 0 assets, so `github_release` is invalid for it.
2. Add or edit `content/products/{slug}.ts`.
3. Run `npm run verify` locally. Then `npm run verify:links`.
4. Open a PR. I verify the Preview, then merge and verify production.

Never set `updatedAt` to a date later than the real release `published_at`. Entries
stale by more than 30 days are rejected.

## 6b. Canonical origin and media paths

**The canonical origin is Vercel's, not a hand-set variable.**
`VERCEL_PROJECT_PRODUCTION_URL` is a Vercel system variable, injected at build
time on every deployment including previews, and it always resolves to the
PRODUCTION domain. It is host-only, so prefix `https://`.

```
canonicalOrigin()  =  VERCEL_PROJECT_PRODUCTION_URL   (Vercel, authoritative)
                       ?? NEXT_PUBLIC_SITE_URL        (local fallback only)
                       ?? ''                          (emit nothing)
```

`NEXT_PUBLIC_SITE_URL` is a **local / manual fallback** used when the Vercel
variable is absent (local dev, non-Vercel CI). On Vercel it is ignored, so a stale
value there cannot break production. `PUBLIC_MEDIA_BASE_URL` is **not required at
V0** and is reserved for a future external CDN / media provider.

**Local media is a relative Registry pathname, unchanged.** There is no origin to
join, so there is no origin to get wrong:

```
registry path = /media/juqode/overview.v1.mp4
rendered src  = /media/juqode/overview.v1.mp4
```

An earlier version of this contract defined `PUBLIC_MEDIA_BASE_URL` as the media
origin. That double-joined into `/media/media/...`, and a separately drifted
hand-set origin shipped a dead host into canonical and og:url — three review rounds
of breakage, all of it Infra-owned. Both classes are now removed by construction
rather than documented.

**Verifying a deploy — the rendered artifact is the ground truth:**

```
curl -s <deployment-domain>/products/juqode | grep -o 'src="[^"]*overview[^"]*"'
curl -sI <deployment-domain>/media/juqode/overview.v1.mp4
curl -s <deployment-domain>/products/juqode | grep -o '<link rel="canonical"[^>]*>'
```

**Vercel marks sensitive env values so the edit form always shows them empty and
never confirms a save.** An empty field is not evidence of an unset value, and
clicking Save is not evidence of persistence. This is the second reason the
canonical origin now comes from a Vercel system variable: a value that cannot drift
and does not need to be read back cannot silently be wrong.

## 7. Free-tier headroom (read live 2026-09-29)

| Meter | Limit | Then |
|---|---|---|
| Edge Requests | 1M / month | **tightest limit** — watch page weight and video autoplay |
| Fast Data Transfer | 100 GB / month | video bytes; 20 MB × 5000 plays ≈ 100 GB |
| Deployment Storage | 10 GB | shared with 4 other Vercel projects |

Scale thresholds and the action for each are in the contract §15. Hobby is
**non-commercial**: the first paid feature requires migrating to Pro ($20/mo) first.

## 8. Things that are deliberately absent at V0

Auth · payments · a database · a CMS · a marketplace backend · user uploads ·
community · serverless functions · ISR · a custom domain · Supabase · JU Cloud.

Do not add any of them without a new Founder-approved contract.
