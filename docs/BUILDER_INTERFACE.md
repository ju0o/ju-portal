# JU Portal — Builder Agent Interface Contract (NORMATIVE)

You are the **Builder Agent**. You own the product UI and all application code.
Infra (hosting, domain, TLS, deploy, CI, media policy, release resolution, analytics,
rollback) is owned by Web Operations and is already built. This document is the
entire interface between us.

If something you need is not in this document, **ask Infra** before inventing it.

**Read `docs/SSOT.md` first** — it maps every concern to its one authoritative file,
including the ones Infra owns (`JU_PORTAL_INFRA_CONTRACT.md`, `src/registry/action.ts`,
`.env.example`). The Infra contract lives **in this repository**, not in a chat log.

---

## 0. What already exists in this repo

```
content/{products,skills,labs,radar}/*.ts   Registry - the single source of truth
src/registry/types.ts                       NORMATIVE types
src/registry/action.ts                      getPrimaryAction() - implemented, use it
scripts/verify-registry.mjs                 offline validator - IS the Vercel build
scripts/build-static.mjs                    assembles dist/ - the only published surface
scripts/verify-links.mjs                    network CTA reachability - CI only
public/media/                               versioned local media assets
vercel.json                                 hosting config
JU_PORTAL_INFRA_CONTRACT.md                 authoritative Infra contract
docs/SSOT.md                                index of every canonical file
docs/BUILDER_INTERFACE.md                   this file
infra/RUNBOOK.md                            how Infra operates the pipeline
index.html                                  infra smoke test - REPLACE THIS
```

There is no database, no CMS, no auth, no API. **Do not add any of them.**

## 1. Information architecture (fixed)

```
/            overview
/products    only entries with a verified live CTA
/skills      curated library
/labs        real work, not yet installable - no CTA
/radar       thin entry surface over the existing JU Radar service
```

All four sections are first-class. Radar ships thin, not absent.

## 2. The Registry is the only source of content

One typed file per entry. No hardcoded product data in components, no JSON blobs
scattered in the app, no fetch at runtime.

```ts
// content/products/{slug}.ts
import type { ProductEntry } from '../../src/registry/types';

export default { slug, title, summary, status, media, releases, source, updatedAt } satisfies ProductEntry;
```

Rules:
- `slug` and `title` are mandatory — missing either **fails the build**.
- Missing `media` / `releases` / `source` is a **warning only**.
- `updatedAt` must not be later than the real release `published_at`. Entries stale
  by more than 30 days are rejected by Infra.
- **Source is secondary.** It renders beneath the primary action, labelled `Source`
  or `Contribute`. It is never the hero action.

## 3. Media — the versioned-path rule

**The Registry owns the exact path. The UI never constructs one.** There must be no
`slug + '.mp4'` template anywhere in your code.

```
/media/{slug}/{asset}.{version}.{ext}     e.g. /media/juqode/overview.v1.mp4
```

- A `version` segment (`v1`, `v2`) or content hash (`a1b2c3d4`) is **mandatory**.
- `overview.mp4` without a version **fails the build**. That is deliberate: media
  is served `immutable, max-age=31536000`, so a replaced file at a stable path would
  be served stale forever.
- Referencing a path that does not exist **fails the build**. Do not create
  placeholder files to satisfy the schema.

### Local vs external

| Slot | Local (`path`) | External (`*External`) |
|---|---|---|
| `poster` | `LocalMediaRef` | `ExternalMediaRef` |
| `overviewVideo` | `LocalMediaRef` | `ExternalMediaRef` |
| `actualDemo` | `LocalMediaRef` | `ExternalMediaRef` |

`ExternalMediaRef` uses a **pinned versioned URL** (typically a GitHub Release
asset). That is what provides immutability for external media. The JuQode entry
already does this — follow it as the model.

### Video-optional, video-first

V1 has almost no videos. That must not shape your components.

- The three slots are first-class and typed. Build the full video-first layout.
- Absence is expressed as `media.pending: ['poster', 'overviewVideo']` — intent
  with no path — or simply by omitting the slot.
- **Rendering rules:**
  - video present → `Video → Demo → Usage → CTA`
  - video absent → `Poster / actual UI → Demo → Usage → CTA`
- A missing video must degrade to poster or an explicit "video coming soon" state.
  **Never a broken `<video>` element.**
- Every `<video>` needs `poster`, `preload="none"`, `playsInline`.

Adding a video later is a Registry edit plus one file. **No component change.**

## 4. Actions — the resolver

You call one function. You never branch on provider.

```ts
import { getPrimaryAction } from '../../src/registry/action';
const action = getPrimaryAction(entry);
```

**The resolver is already implemented at `src/registry/action.ts`. Use it — do not
reimplement it and do not branch on `provider` inside a component.** That module is
Infra-owned and is the single place these rules are enforced.

- `verb` is one of exactly four: **`Download` | `Install` | `Open` | `Try`**.
- **A provider name must never appear in user-facing text.** No "Download from
  GitHub Releases". No "npm". The user sees the verb and the outcome.
- `action.resolved === false` → render the button **disabled** with the label
  `Coming soon`. **Never render a link that 404s.**
- `npm` / `pypi` entries expose `action.command`, a copyable string.
- `action.provider` exists for analytics only. **Never render it.**

Supported providers: `github_release`, `npm`, `pypi`, `web`, `direct`,
`microsoft_store`, `app_store`, `google_play`. Users of providers outside this set
are a CLI — surface the install command, not a download button.

## 5. Radar (V0)

Thin entry surface only. No backend, no crawl pipeline, no content system, no
scheduler.

- Entries resolve through `external: { originEnv, path, embed }`.
- The origin comes from the **`RADAR_ORIGIN` env var**, never a hardcoded host, so
  JU Radar can move without a code change.
- **Link-out is the default. `embed: false` unless the surface is genuinely public
  and read-only.**
- If the external URL is unreachable, render a disabled state with the
  last-checked timestamp. **Never a broken iframe.**
- **The JU Radar admin route is permanently out of scope. Never link or embed it.**

## 6. Skills (V0)

Curated, static registry. No marketplace, no user uploads, no payment, no
community, no CMS.

Each skill may carry: `title`, `summary`, `compatibleAgents`, `version`,
`installMethod` (`npm` | `pypi` | `copy` | `link`), `installTarget`, `demoVideo`,
`source`. The registry starts **empty** — that is expected, not a bug.

## 7. Environment variables

Read only these. No hardcoded origins anywhere in the app.

```bash
NEXT_PUBLIC_SITE_URL=https://ju-portal-one.vercel.app
NEXT_PUBLIC_GITHUB_ORG=ju0o
NEXT_PUBLIC_ANALYTICS_ENABLED=true
PUBLIC_MEDIA_BASE_URL=https://ju-portal-one.vercel.app   # MEDIA ORIGIN, no /media
RELEASE_PROVIDER_DEFAULT=github_release
RELEASE_RESOLVER_MODE=build
RELEASE_CACHE_TTL_SECONDS=900
RADAR_ORIGIN=https://juradar-907c6.web.app
NEXT_PUBLIC_CONTACT_URL=          # optional
RELEASE_GITHUB_TOKEN=             # optional, public repos need none
```

`PUBLIC_MEDIA_BASE_URL` is the **bare origin**, not the media directory. The
Registry path already begins with `/media/`, so the two are joined once. Setting
this to `.../media` produces `/media/media/...` and a 404 video — that exact
mistake shipped once. Build media URLs with `mediaUrl()` from
`src/registry/action.ts`; never concatenate by hand.

The production origin is `https://ju-portal-one.vercel.app` — read it from
`NEXT_PUBLIC_SITE_URL` and never hardcode an assumed slug.

- `NEXT_PUBLIC_*` is **inlined into the client bundle at build time.** Nothing
  secret may ever carry that prefix. There are no server secrets at V0.
- `NEXT_PUBLIC_ANALYTICS_ENABLED=false` must actually remove the beacon.
- Changing an env var requires a **rebuild**; it does not hot-patch a live build.

## 8. Analytics

**Vercel Web Analytics. Exactly four events, closed list:**

| Event | Trigger | Params |
|---|---|---|
| `product_cta_click` | any Download / Install / Open / Try | `slug`, `provider`, `verb`, `version` |
| `skill_install_click` | skill install / copy action | `slug`, `method` |
| `media_play` | first play of an overview video | `slug`, `mediaVersion` |
| `route_view` | automatic | path only |

**Forbidden:** user IDs, emails, session fingerprints, IP capture, cross-product
tracking, A/B frameworks, heatmaps, session recording. No consent banner is needed
because no PII is collected — do not add tracking that would create one.

## 9. Hard constraints at V0

- **No Serverless Functions. No middleware. No mutating API routes.** Static output
  and build-time resolution only. This is what keeps rollback a one-click operation
  and keeps us inside the free-tier meters.
- No ISR, no database, no auth, no payments, no CMS, no community, no marketplace.
- No `import` of runtime data fetching for Registry content.

## 10. Quality gates Infra enforces after every deploy

- `npm run verify` exit 0 (this is the build; a failure means no deployment exists)
- `npm run verify:links` green on `main`
- `/`, `/products`, `/skills`, `/labs`, `/radar` and every detail route → 200
- every Registry media path → 200, `accept-ranges: bytes` for video
- every Download/Install/Open target → final URL 200
- first-load JS < 200 KB gzipped (300 KB warns)
- no `localhost`, preview hash, or dev string in built output
- Lighthouse: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95, Best Practices ≥ 90

## 11. Workflow

```bash
git checkout -b feature/...
# ... build ...
npm run verify        # must pass - this is the Vercel build gate
npm run verify:links  # checks your real CTA URLs resolve
git push -u origin feature/...
# open a PR
```

If you adopt a framework preset, update `vercel.json` `outputDirectory` and remove
the `build-static` step from the build script. If you stay on the plain static
preset, keep both - `build-static.mjs` is what keeps the repo out of the public URL
space.

I verify the Preview URL, then merge. Merge to `main` = production deploy. I run
the post-deploy checks and report the verified state to the Founder.

Open a PR with **1 approval required** and the **Vercel** check passing. You may
merge your own PR once both are green.

## 12. Division of ownership

**Infra owns and will not encroach on:** media policy, hosting, deploy, rollback,
release resolution, analytics events, the Registry type contract, env var names.

**You own:** all UI, all components, all routes, the IA presentation, the resolver
implementation, product copy, Lighthouse scores, accessibility.

**Neither of us does:** add auth, payments, a database, a CMS, a marketplace, or
community features without a new Founder-approved contract.
