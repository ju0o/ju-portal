# JU Portal

Public showcase of JU products, skills, labs and radar.

> **The information architecture is Products · Skills · Labs · Radar.**
> Users discover a JU product or skill, understand it through video, see a real
> demo, and then Download / Install / Open / Try it.
> GitHub is a secondary link for source and contribution — never the primary path.

---

## Status

**Infrastructure is live. The application is not built yet.**

This repository currently contains:

- the Registry and its normative types
- the offline verifier that runs as the Vercel build
- the CTA reachability check that runs in CI
- infra configuration and runbook
- an `index.html` **smoke test** proving the deploy pipeline, TLS and cache headers work

The Builder Agent replaces `index.html` with the real application. See
**[`docs/BUILDER_INTERFACE.md`](docs/BUILDER_INTERFACE.md)** — that is the contract.

## Deployments

| | |
|---|---|
| Production | `https://ju-portal-one.vercel.app` |
| Preview | automatic, per branch / PR |
| Plan | Vercel Hobby — **₩0/month** |
| Serverless functions | none, by contract |

> The production origin is `ju-portal-one.vercel.app`. Vercel assigned the suffixed
> slug on project creation; `ju-portal.vercel.app` was never assigned and 404s.

## Commands

Requires Node 20+. There is no build-time secret and no `.env.local` is needed —
the public defaults are committed in [`.env.default`](.env.default).

```bash
npm install              # install devDependencies (Playwright, used by browser checks)

npm run build            # verify registry -> assemble dist/ -> render every route
npm test                 # build contract tests against dist/  (runs build first)
npm run verify           # offline registry validation - the build gate
npm run verify:links     # network: every CTA target must resolve
```

`npm test` builds `dist/` automatically via `pretest`, so it is safe on a clean
checkout.

Optional local overrides go in `.env.local` (gitignored, never required):
`.env.default` < `.env` < `.env.local` < process env. On Vercel,
`VERCEL_PROJECT_PRODUCTION_URL` is injected at build time and always wins; it is
the source of truth for canonical / og:url.

## The two invariants

**1. Media paths are versioned and Registry-owned.**
`/media/{slug}/{asset}.{version}.{ext}`. Media is served
`immutable, max-age=31536000`, which is only safe because every path carries a
version. The UI never constructs a path — it reads the Registry literal. An
unversioned path, or a path that does not exist, fails the build.

**2. No broken CTA.**
An entry may claim `status: 'available'` only if its primary action resolves to a
verified live target. Verified 2026-09-29:

| Candidate | Result | Placement |
|---|---|---|
| JuQode | ✅ Release `demo-v0.1` — exe + zip — and `overview.v1.mp4` hosted here | Products |
| JuTell | ✅ npm `jutell@2.0.1` (4 GitHub releases but **0 assets**, so npm is the real path) | Products |
| JuDoctor | ❌ 0 releases, 0 tags | Labs |
| JuControler | ❌ 0 releases, 0 tags | Labs |
| JuCeipt | ❌ repository not public | not linkable |
| JuMiner | ❌ repository not public | not linkable |

Verify the **asset**, not the release. A release with no assets is not a download.

## Not in V0

Auth · payments · database · CMS · marketplace · user uploads · community ·
serverless functions · ISR · custom domain.

## Docs

- [`docs/BUILDER_INTERFACE.md`](docs/BUILDER_INTERFACE.md) — Builder contract
- [`infra/RUNBOOK.md`](infra/RUNBOOK.md) — deploy, rollback, verification
- [`public/media/README.md`](public/media/README.md) — media naming and encoding
- [`infra/INCIDENTS.md`](infra/INCIDENTS.md) — incident log

## License

Portal content and code: see the Founder. Linked JU products keep their own
licenses and are not relicensed by appearing here.
