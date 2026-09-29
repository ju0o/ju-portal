# JU PORTAL — INFRA CONTRACT (authoritative SSOT)

> **This file is the authoritative infrastructure contract for JU Portal.**
> It is versioned in the same repository as the code it governs, so Infra and the
> Builder Agent read the same bytes. If this file and any other document disagree,
> **this file wins.**
>
> Owner: Infrastructure / Web Operations.
> Builder owns: product UI and application code. Infra does not touch it.
>
> Where to look:
> - `docs/BUILDER_INTERFACE.md` — the contract *you* build against
> - `infra/RUNBOOK.md` — deploy, rollback, verification
> - `src/registry/action.ts` — the resolver implementation (do not reimplement)
> - `.env.example` — the full environment contract
> - `public/media/README.md` — media naming and encoding
> - `docs/SSOT.md` — index of every canonical file

---

## 0. Measured facts (read live from the providers, not assumed)

| Fact | Value | Verified |
|---|---|---|
| Repo | `ju0o/ju-portal`, public | 2026-09-29 |
| Production branch | `main` | — |
| **Production URL** | **`https://ju-portal-one.vercel.app`** | live HTTP 200 |
| Vercel project | Hobby, team `ju0o___` | dashboard |
| Vercel payment method | **none** | billing page |
| Custom domain | none at V0 | Founder decision C |
| Serverless functions | **none, by contract** | build config |
| Monthly cost | **₩0** | no payment method exists |

**The production origin is `ju-portal-one.vercel.app`, NOT `ju-portal.vercel.app`.**
Vercel assigned the suffixed slug at project creation; the bare name 404s. Read the
origin from `NEXT_PUBLIC_SITE_URL`. Never hardcode an assumed Vercel slug.

### Why the cost is structurally zero
There is no payment method on the Vercel account, so Vercel **cannot** charge.
Exceeding a Hobby limit produces a **failed deploy**, not an invoice. Spend requires
deliberately adding a card, which is a Founder-GO item.

### Hobby is non-commercial
Selling on a Hobby deployment violates its ToS. JU Portal as a public showcase is
fine. The first paid feature requires migrating to **Pro ($20/mo) first**.

---

## 1. Hosting and build

Static output. No server, no container, no migration, no runtime restart.

```
build = npm run build
      = node scripts/verify-registry.mjs     <- offline gate, must pass
      = node scripts/build-static.mjs        <- assembles dist/
output = dist/  (outputDirectory in vercel.json)
```

### Why an explicit `dist/`
With no framework preset, Vercel publishes the **repository root** as static output.
That was tried and failed twice:

- media was served at `/public/media/...`, breaking the `/media/...` path contract
- `content/`, `scripts/`, `vercel.json` and the docs were publicly downloadable

`scripts/build-static.mjs` assembles `dist/` containing exactly the public URL space:
`public/**` flattened to the root, plus the entry document, with documentation
stripped recursively. Verified on production: every internal path returns 404.

**Handoff to the Builder.** If you adopt a framework preset, you own this step:
- Next.js static export → `outputDirectory: "out"`, delete the `build-static` step
- keep `framework: null` → keep `build-static.mjs` as is

Either way the media path contract in §4 is unaffected.

---

## 2. Deployment

```
feature branch push  -> automatic Preview URL (per branch / PR)
PR merge to main     -> automatic Production deploy
```

No manual deploy step and no build token. The pipeline was designed to require
none, because the infra environment has no Vercel or GitHub token.

- `main` is the production branch. PR + 1 approval + green build is the merge gate.
- Deployment is atomic over an immutable build. A failed build leaves the previous
  deployment serving — there is no partial state.
- **Previews are public and unlisted** (the URL contains the commit hash). Hobby has
  no preview protection, so this is a constraint, not a choice. It is acceptable
  here because the repo and its content are both public.
- **Never link to a preview URL** from anything user-facing.

---

## 3. Rollback

**L1 — primary, < 60s, no rebuild.** Vercel → Deployments → last known-good
production → `⋯` → **Promote to Production**.

**L2 —** redeploy a known-good SHA (`vercel --prod`).

**L3 — last resort, Founder approval.** `git revert <sha>` on `main`.

Infra rolls back **first and reports after**, without asking, when: the root or any
IA route 5xx/404, two consecutive build failures, a verified CTA link breaks, the
analytics beacon disappears, or there is a site-wide security regression.

**Founder approval is required for** (never done unilaterally): adding a payment
method, buying a domain, deleting a Vercel project, changing DNS, creating a cloud
account.

After a rollback, add a line to `infra/INCIDENTS.md`.

---

## 4. Media — the versioned path contract

**The Registry owns the exact path. The UI never constructs one.** There must be no
`slug + '.mp4'` template anywhere in the app.

```
/media/{slug}/{asset}.{version}.{ext}      e.g. /media/juqode/overview.v1.mp4
```

- `version` is **mandatory**: an increment (`v1`, `v2`) or a content hash
  (`a1b2c3d4`). `overview.mp4` **fails the build**.
- Media is served `public, max-age=31536000, immutable`. That header is only safe
  *because* every path carries a version. **These two rules are a matched pair —
  removing either one breaks the other.** This is the reason versioning is
  mandatory, not a style preference.
- Referencing a path that does not exist **fails the build**. Do not create
  placeholder files to satisfy the schema.

### Local vs external

`LocalMediaRef` uses a versioned path and resolves under `public/`.
`ExternalMediaRef` uses a pinned versioned URL (a GitHub Release asset). External
immutability comes from the pinned tag.

**How a local path becomes a URL.** `PUBLIC_MEDIA_BASE_URL` is the **bare origin**
and the Registry path already carries the `/media/` prefix. They are joined once:

```
PUBLIC_MEDIA_BASE_URL  = https://ju-portal-one.vercel.app        (origin)
registry path          = /media/juqode/overview.v1.mp4           (already prefixed)
result                 = https://ju-portal-one.vercel.app/media/juqode/overview.v1.mp4
```

`PUBLIC_MEDIA_BASE_URL` is **not** the media directory. Setting it to
`https://.../media` is a double-join and yields `/media/media/...`, which 404s.
This exact error shipped once and is why the value is called out here.

`mediaUrl()` in `src/registry/action.ts` is the single implementation and it
normalises a redundant trailing `/media` defensively, so either convention is safe.
Do not hand-roll a second join.

**Prefer local.** GitHub Release assets serve `application/octet-stream` with no
`accept-ranges`, so they are unreliable as a `<video>` source. The 878 KB JuQode
overview video was moved from its Release asset to a local
`/media/juqode/overview.v1.mp4` for exactly this reason, and now serves
`video/mp4` with working range requests.

### Storage tiers

| Size | Location |
|---|---|
| **< 25 MB** | `public/media/{slug}/….{version}.ext` — served from the Portal CDN |
| 25–200 MB | GitHub Release asset on the product's own repo (download, not inline) |
| > 200 MB | Cloudflare R2 — **new account, Founder GO required** |

### Encoding policy
H.264 (yuv420p) + AAC, MP4, max 1920×1080, 30 fps, `-movflags +faststart`,
30–60 s, **< 20 MB** for the inline tier, poster JPG 1280×720 under 150 KB.
`faststart` is not optional: without it the video will not stream.

### Replacing an asset
1. Bump the version (`v1` → `v2`). 2. Add the new file. 3. Update the Registry.
4. Keep the old file 90 days.

Removing an old file and updating the Registry must land in the **same commit** —
otherwise the build fails, which is the intended safety net.

---

## 5. Release provider registry

The Registry is the only source of content. `content/{section}/{slug}.ts`, typed
against `src/registry/types.ts`. **No CMS, no database, no runtime fetching.**

Supported providers and the verb each maps to:

| provider | Verb | coordinates |
|---|---|---|
| `github_release` | Download | `repo`, `tag`, `asset` |
| `npm` | Install | `package` |
| `pypi` | Install | `package` |
| `web` | Open / Try | `url` |
| `direct` | Download | `url` |
| `microsoft_store` | Open | `productId` |
| `app_store` | Open | `appId` |
| `google_play` | Open | `packageName` |

**The verb is the only thing the user sees. A provider name must never appear in
user-facing text.** No "Download from GitHub Releases", no "npm".

Use `getPrimaryAction()` from `src/registry/action.ts`. Do not branch on provider
in a component.

### No broken CTA
An entry may claim `status: 'available'` **only** if its primary action resolves to
a verified live target. Otherwise it is `coming_soon` / Labs with no CTA.

`npm run verify:links` probes the **real user-facing URL** in CI and is blocking on
`main`. Verified 2026-09-29:

| Target | Result |
|---|---|
| JuQode `.exe` download | 206 |
| JuQode `.zip` download | 206 |
| npm `jutell` | 200 |
| JuQode / JuTell / JuDoctor / JuControler source pages | 200 |
| `juradar-907c6.web.app` | 200 |

**Verify the asset, not the release.** JuTell has 4 GitHub releases and 0 assets,
so `github_release` is invalid for it and npm is the real path.

---

## 6. Environment variables

Authoritative copy: `.env.example`. Also set in Vercel (Production + Preview).

```bash
NEXT_PUBLIC_SITE_URL=https://ju-portal-one.vercel.app
NEXT_PUBLIC_GITHUB_ORG=ju0o
NEXT_PUBLIC_ANALYTICS_ENABLED=true

# MEDIA ORIGIN — the bare origin. NOT the media directory.
# Correct:   https://ju-portal-one.vercel.app
# WRONG:     https://ju-portal-one.vercel.app/media   <- produces /media/media/...
# The Registry already owns the /media/... prefix (see §4), so this value must not
# repeat it. A trailing /media here is the single defect that broke the video CTA.
PUBLIC_MEDIA_BASE_URL=https://ju-portal-one.vercel.app

RELEASE_PROVIDER_DEFAULT=github_release
RELEASE_RESOLVER_MODE=build
RELEASE_CACHE_TTL_SECONDS=900
RADAR_ORIGIN=https://juradar-907c6.web.app
NEXT_PUBLIC_CONTACT_URL=          # optional
RELEASE_GITHUB_TOKEN=             # optional; public repos need none
```

Hard rules:
- `NEXT_PUBLIC_*` is **inlined into the client bundle at build time.** Nothing secret
  may ever carry that prefix. There are no server secrets at V0.
- No hardcoded origins anywhere in the app.
- `NEXT_PUBLIC_ANALYTICS_ENABLED=false` must actually remove the beacon.
- **Changing an env var requires a rebuild.** It does not hot-patch a live build, and
  a rollback does **not** revert env vars. Record env and deploy changes together.
- No `.env` is ever committed.
- **Vercel marks these values as sensitive, so the edit form always shows them empty.**
  An empty field in the Vercel UI is NOT evidence that the value is unset, and a
  click on "Save" is NOT evidence that it persisted. The only reliable verification
  is a redeploy followed by inspection of the rendered artifact.

---

## 7. Analytics

**Vercel Web Analytics** — free, cookie-less, no PII, no consent banner. Closed list
of exactly four events:

| Event | Trigger | Params |
|---|---|---|
| `product_cta_click` | any Download / Install / Open / Try | `slug`, `provider`, `verb`, `version` |
| `skill_install_click` | skill install / copy | `slug`, `method` |
| `media_play` | first play of an overview video | `slug`, `mediaVersion` |
| `route_view` | automatic | path only |

Forbidden: user IDs, emails, fingerprints, IP capture, cross-product tracking, A/B
frameworks, heatmaps, session recording. No consent banner is needed because no PII
is collected — do not add tracking that would create one.

---

## 8. Free-tier headroom (measured, not assumed)

Read live from the Vercel dashboard 2026-09-29.

| Meter | Hobby limit | Then |
|---|---|---|
| **Edge Requests** | **1M / month** | **tightest limit** — page weight, media autoplay |
| Fast Data Transfer | 100 GB / month | 20 MB video × 5000 plays ≈ 100 GB |
| Fast Origin Transfer | 10 GB | negligible for static |
| Deployment Storage | 10 GB | shared with 4 other Vercel projects |

V0 traffic is far below these. Recorded so the threshold is known rather than
assumed.

---

## 9. Verification traps (learned the hard way)

These are live, current, and will cost you an hour if you rediscover them.

1. **A unique per-deployment URL answers anonymous requests with a Vercel LOGIN PAGE**
   (HTTP 200, `x-matched-path: /login`) because Deployment Protection is active. A
   200 from `ju-portal-<hash>-ju0o.vercel.app` proves **nothing**. Always verify the
   production alias `ju-portal-one.vercel.app`.
2. **`HEAD` is not a reachability probe for a GitHub release asset.** It returns 401;
   the same URL returns 206 on GET. Use a ranged `GET`.
3. **Never trust a UI success signal.** Verify against an independent source: the
   commit log, a live HTTP request, or the API. Defects 4–8 in §11 all reported
   success from the very interface that caused them.
4. **The GitHub web-UI file upload flattens directories.** Upload one directory at a
   time via `/upload/main/<dir>`, or everything lands at the repo root and colliding
   filenames overwrite each other.
5. **GitHub's delete flow is two clicks deep.** "Commit changes…" opens a *dialog*;
   the confirm button inside it is the one that commits.
6. **`raw.githubusercontent.com` lags `github.com`.** After a commit, confirm on the
   GitHub web UI before concluding a file did or did not land.

---

## 10. Post-deploy verification (run after every `main` deploy)

1. `GET /` → 200
2. `/products`, `/skills`, `/labs`, `/radar` → 200 each
3. every detail route → 200
4. every Registry media path → 200, `accept-ranges: bytes` for video
5. every Download/Install target → final URL 200
6. every Open/Try external URL → 200
7. analytics beacon present
8. `NEXT_PUBLIC_SITE_URL` renders as the production origin
9. no `localhost` / preview hash / dev string in built output
10. first-load JS < 200 KB gzipped (300 KB warns)
11. `npm run verify` exit 0

---

## 11. Execution record (2026-09-29) — defects found and fixed

Every one of these was caught by verification, not by inspection. They are listed
because each one is a live trap for the next person.

1. **Media version regex rejected valid names.** It required two name segments
   before the version, so `overview.v1.mp4` failed. Found with negative-control
   tests, not by reading the code.
2. **Public URL paths resolved against the wrong directory** — looked for
   `<root>/media/...` instead of `<root>/public/media/...`, which would have made the
   media existence check meaningless. Found by an end-to-end test with a real file.
3. **The `public/` fix broke the IA-section check** (shared helper), failing the
   build on all four sections. Found by the Vercel build — which is why the infra
   smoke test exists.
4. **Web-UI upload flattened directories** — all 20 files landed at the repo root,
   including `verify.yml` (CI would never have run) and three colliding `index.ts`.
5. **Delete reported success while committing nothing** — 10 stray files survived
   while reporting `DELETED`. Found by checking the commit log instead of the title.
6. **`package.json` was uploaded to `scripts/`** instead of the repo root, so the
   build never ran the `dist/` step and `/` 404'd while `/media/` worked.
7. **CI probed with `HEAD`** and produced false CTA failures; `source.url` was also
   double-prefixed and the npm path had a bogus `/json`. Found by reading the log.
8. **Root `package.json` was deleted outright**, breaking both the build and GitHub
   Actions (`npm ENOENT`). Found by reading the CI log; restored.

Standing rules produced by this: put a smoke test in the deployment, verify
independently, probe with ranged GET, and treat any framework-preset change as a
contract change.

---

## 12. What is deliberately absent at V0

Auth · payments · database · CMS · marketplace backend · user uploads · community ·
serverless functions · ISR · custom domain · Supabase · JU Cloud.

Do not add any of them without a new Founder-approved contract.
