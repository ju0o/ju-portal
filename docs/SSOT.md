# JU Portal — SSOT Index

**One page that says where every authoritative file lives.** If you are an agent
working on this repo and you cannot answer "where is X defined", this is the page.

There is exactly one source of truth per concern, and it is all **in this
repository**. Nothing you need lives outside the git tree. If a fact is only in a
chat message, it is not part of the contract.

| Concern | Authoritative file | Notes |
|---|---|---|
| **Infra contract** | `JU_PORTAL_INFRA_CONTRACT.md` (repo root) | Rollout, rollback, hosting, free tier, traps, defect history. **Wins over any other doc on conflict.** |
| **Your build contract** | `docs/BUILDER_INTERFACE.md` | What you own, what you consume, the hard constraints |
| **Action resolver** | `src/registry/action.ts` | `getPrimaryAction()`. Implemented. Do not reimplement, do not branch on `provider` in a component |
| **Registry types** | `src/registry/types.ts` | Normative types. Changing them changes the contract |
| **Products** | `content/products/*.ts` | JuQode, JuTell — the only verified CTAs |
| **Skills** | `content/skills/index.ts` | Curated only. Empty at V0, by design |
| **Labs** | `content/labs/index.ts` | JuDoctor, JuControler — no CTA by design |
| **Radar** | `content/radar/index.ts` | Thin link-out surface over the existing JU Radar |
| **Environment contract** | `.env.example` | The full list. Also set in Vercel |
| **Site URL** | `.env.example` → `NEXT_PUBLIC_SITE_URL` | **`https://ju-portal-one.vercel.app`** — not `ju-portal.vercel.app`, which 404s |
| **Media base URL** | `.env.example` → `PUBLIC_MEDIA_BASE_URL` | `https://ju-portal-one.vercel.app/media` (no trailing slash) |
| **Radar origin** | `.env.example` → `RADAR_ORIGIN` | `https://juradar-907c6.web.app`. The **admin route is permanently out of scope** |
| **Media naming** | `public/media/README.md` | `/media/{slug}/{asset}.{version}.{ext}`. Version is mandatory |
| **Build config** | `vercel.json` + `scripts/build-static.mjs` | Explicit `dist/` output; framework handoff in §1 of the contract |
| **Build gates** | `scripts/verify-registry.mjs` (offline) and `scripts/verify-links.mjs` (network) | `verify-registry` runs as the Vercel build. A failure means no deployment exists |
| **CI** | `.github/workflows/verify.yml` | Blocking on `main` |
| **Ops** | `infra/RUNBOOK.md` | Deploy, rollback, verification checklist |
| **Incidents** | `infra/INCIDENTS.md` | One line per incident |

---

## Read these three before you write code

1. `docs/BUILDER_INTERFACE.md` — the contract you build against
2. `src/registry/action.ts` — the resolver you call
3. `content/products/juqode.ts` — the worked example of a verified entry

---

## The three rules that break the build if you ignore them

1. **A media path must carry a version.** `/media/x/overview.v1.mp4` passes;
   `/media/x/overview.mp4` fails the build. Media is served `immutable`, so a
   stable path would serve stale bytes forever. Versioning is what makes that
   cache header safe.
2. **The Registry owns the path; you never construct one.** No `slug + '.mp4'`
   template anywhere in the app.
3. **Never render a provider name.** The user sees Download / Install / Open / Try.

## The one rule that breaks the promise

**No broken CTA.** An entry claims `status: 'available'` only if
`getPrimaryAction()` returns `resolved: true`. Otherwise it is `coming_soon` / Labs
with a disabled "Coming soon" control. `npm run verify:links` probes the real
download URLs in CI and blocks `main`.

---

## Provenance

The Infra contract was originally authored outside this repository, which made it
invisible to other agents — a cross-agent filesystem separation problem. It now
lives here, in the repository it governs, at the same commit as the code. If you
are Infra and you learn something, **commit it here**; do not only say it in chat.
