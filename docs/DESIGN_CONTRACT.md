# JU Portal — DESIGN CONTRACT V1 (EVIDENCE BASED)

> **Status: V1 — EVIDENCE BASED.** Supersedes the PROVISIONAL draft (`bbad3dd`,
> `89f937d`). The PROVISIONAL / DESIGN_REFERENCE_MISSING state is cleared because
> the reference artifact has now been inspected directly — CSS, DOM and JS — rather
> than inferred from prose.
>
> **Reference artifact (authoritative for visual language):**
> [`docs/design/reference/JU_PORTAL_V0_PROTOTYPE.html`](design/reference/JU_PORTAL_V0_PROTOTYPE.html)
> SHA-256 `ebc8438ae9ba6771a2069f3ee1ff50edab96fb99b5e8471983625ba29c093c05` · 19,622 bytes
> Title: `JU Portal V0 — Interactive Prototype`
> Every rule below was extracted from that file, or from a later explicit Founder
> decision. Each item is tagged: **PROTOTYPE_MATCH** (directly in the artifact) ·
> **PROTOTYPE_ADAPTED** (prototype concept kept, updated by a later Founder decision) ·
> **CURRENT_ONLY** (newer than the prototype).
>
> **Authority split — mandatory.**
> - **VISUAL SYSTEM** = the reference artifact + this document.
> - **PRODUCT TRUTH** = the Registry / SSOT. The prototype's product list, statuses
>   and CTAs are **stale and are not authoritative**. Do not restore them.

---

## 0. Product truth (Registry wins over the prototype)

| Section | Contents |
|---|---|
| Products | **JuQode** (primary = Try Web), **JuTell** (primary = Install) |
| Labs | JuDoctor, JuControler, JuCeipt, JuMiner — no CTA |
| Skills | first-class IA |
| Radar | thin discovery surface |

The prototype lists 6 products with different statuses. **Ignore all of it.**

---

## 1. Brand tokens — exact values from the artifact

Extracted from `:root` in the reference.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0b0d10` | page |
| `--panel` | `#12151a` | cards, chips, inputs |
| `--panel2` | `#191d24` | secondary surface |
| `--text` | `#f4f6f8` | primary text |
| `--muted` | `#9aa4b2` | secondary text, inactive nav |
| `--line` | `#2a3039` | borders, dividers |
| **`--accent`** | **`#d8ff4f`** | **lime** — primary identity |
| **`--accent2`** | **`#8df6dc`** | **mint** — terminal / demo output |
| `--danger` | `#ff8b7d` | warnings |

**PROTOTYPE_MATCH.** Current Preview uses `--accent: #35d0a5` (teal), has no mint.

### Accent discipline — what makes it read as JU
In the artifact lime appears in exactly three roles:

1. `.brand span` — the **U** in the `JU` wordmark
2. `.hero h1 em` — the second line of the headline
3. `.command button` / `.primary` / `.actions .cta` — primary buttons

Mint appears only in `.demoScreen .green` (terminal lines) and the recommend
banner (`#bdf7e8` on `#10231f`).

**Rule: lime is a scalpel, not a paint.** No large background fills, no body copy,
no decorative accent fields. Overuse is the most likely way to miss the feel even
with the correct hex values.

### Wordmark — PROTOTYPE_MATCH
`.brand{font-weight:900;font-size:28px;letter-spacing:-1px}` with the **U wrapped in
a lime span**. Current Preview renders a plain `JU`.

---

## 2. Nav — PROTOTYPE_ADAPTED (Skills added)

```
height:72px · display:flex · align-items:center · justify-content:space-between
border-bottom:1px solid var(--line)
position:sticky; top:0
background:rgba(11,13,16,.92); backdrop-filter:blur(14px); z-index:10
```

Left: wordmark. Right: `Products`, `Labs`, `Radar`, `Command ⌘K`, `GitHub ↗` (ghost).

**Sticky with backdrop blur is part of the identity.** Current nav is not sticky.

Links are `--muted` at rest → `--white` on `--panel` with a `--line` border on hover.
There is **no filled active pill**.

**PROTOTYPE_ADAPTED:** add `Skills` (first-class IA by later Founder decision).
Order: `Products · Skills · Labs · Radar`.

---

## 3. Hero — PROTOTYPE_MATCH

```
.hero{padding:86px 0 56px}
.eyebrow{ inline-flex; border:1px solid var(--line); background:var(--panel);
          padding:7px 10px; border-radius:999px; color:var(--muted); font-size:13px }
.hero h1{ font-size:clamp(44px,8vw,88px); letter-spacing:-5px; line-height:.95;
          margin:24px 0 18px; max-width:900px }
.hero p{ max-width:720px; color:var(--muted); font-size:19px; line-height:1.6 }
```

Eyebrow: `JU PRODUCT PORTAL · V0 PROTOTYPE` → production drops the suffix,
`JU PRODUCT PORTAL`.

Headline: `필요한 도구를 찾고,` / `<em>바로 써보세요.</em>` — the `<em>` is lime.

**The measured scale is the requirement: 44→88px, leading .95, tracking -5px.**
Current h1 is materially smaller and entirely white.

Hierarchy is strict: **headline → interaction → products.** The supporting `<p>` is
max 720px / 19px and must not push the interaction below the fold.

---

## 4. Discovery entry — PROTOTYPE_MATCH

```
.command{ margin-top:34px; display:flex; gap:10px; max-width:780px;
          background:var(--panel); border:1px solid var(--line); padding:10px;
          border-radius:18px; box-shadow:0 20px 60px rgba(0,0,0,.28) }
.command input{ flex:1; background:transparent; border:0; outline:0;
                color:var(--text); padding:12px; font-size:16px }
.command button{ background:var(--accent); color:#111; padding:12px 16px;
                 border-radius:12px; font-weight:800 }
```

Placeholder `예: AI 에이전트 여러 개 관리하고 싶어`, button label `찾아보기`.

**Hint chips** (3, verbatim):

```
AI가 뭘 수정했는지 보고 싶어
PC가 왜 느린지 알고 싶어
프로젝트 구조를 이해하고 싶어
```

```css
.hint{ font-size:12px; color:var(--muted); background:var(--panel);
       border:1px solid var(--line); border-radius:999px; padding:7px 10px; cursor:pointer }
```

**Recommendation** — keyword scoring over the Registry, then a banner under the input:

```css
.banner{ margin-top:18px; border:1px solid #31554d; background:#10231f;
         border-radius:18px; padding:16px 18px; color:#bdf7e8; display:none }
```

Content: `추천: {name} — {tagline} [열어보기]`.

**No backend, no LLM, no new infrastructure.** Client-side Registry matching only.

**CURRENT_ONLY:** later Founder direction lists 5 example intents where the artifact
has 3. Use the artifact's 3 as the baseline and the 5 as the extended pool.

Current Preview measures `input: 0, form: 0, role=search: 0, contenteditable: 0`.

---

## 5. Product card — PROTOTYPE_ADAPTED (media area added)

```css
.grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:16px }
.card{ background:linear-gradient(180deg,var(--panel),#101318);
       border:1px solid var(--line); border-radius:20px; padding:22px;
       min-height:230px; display:flex; flex-direction:column; cursor:pointer;
       transition:.2s }
.card:hover{ transform:translateY(-4px); border-color:#47515f }
.appicon{ width:42px; height:42px; border-radius:14px; display:grid;
          place-items:center; background:#242a34; font-weight:900 }
.status{ font-size:11px; text-transform:uppercase; letter-spacing:.08em;
         border:1px solid var(--line); border-radius:999px; padding:6px 8px;
         color:var(--muted) }
.tag{ font-size:11px; background:#1a1f27; color:#aeb8c4;
      border:1px solid var(--line); padding:5px 8px; border-radius:8px }
.actions{ display:flex; gap:8px; margin-top:auto; padding-top:20px }
.actions .cta{ background:var(--accent); color:#111; border-color:var(--accent); font-weight:800 }
```

Anatomy in order: `appicon + status` → `h3` (22px) → one-line tagline → `meta` tags
→ `actions` (lime CTA + `Details`, pinned bottom by `margin-top:auto`).

**Hover lift is part of the showroom feel.** Cards open detail.

**PROTOTYPE_ADAPTED — media area.** The artifact has **no media area at all**. Later
Founder direction supersedes it: real screenshot → real video → real implementation
→ labelled fixture only as a last resort, with the JuQode video visually dominant.
A media area is therefore required, but it may **never render as an empty void** —
real content or a deliberate placeholder.

Current Preview renders an empty dark box on the JuQode card and a broken-image
glyph on the JuTell card.

---

## 6. Product overlay — PROTOTYPE_ADAPTED (modal feel, real routes)

```css
.overlay{ position:fixed; inset:0; background:rgba(0,0,0,.72);
          display:none; align-items:center; justify-content:center;
          padding:18px; z-index:30 }
.overlay.open{ display:flex }
.modal{ width:min(960px,100%); max-height:90vh; overflow:auto;
        background:#0f1216; border:1px solid var(--line); border-radius:24px;
        padding:26px; box-shadow:0 30px 100px rgba(0,0,0,.6) }
.heroProduct{ display:grid; grid-template-columns:1.2fr .8fr; gap:18px; margin-top:22px }
```

Two-column **1.2fr info | 0.8fr demo.** Head: `eyebrow JU PRODUCT` + 40px title +
tagline + 38×38 close.

Left: `What it does` → summary → meta tags → install box (mono, with `Copy`) →
actions (primary CTA + `GitHub / Source ↗`).
Right: `Interactive Demo` + `DEMO MODE` chip + `.demoScreen`.

```css
.demoScreen{ background:#090b0e; border:1px solid #28313a; border-radius:14px;
             padding:14px; min-height:220px;
             font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px }
.demoScreen .green{ color:var(--accent2) }  /* mint */
.demoScreen .lime{ color:var(--accent) }   /* lime on the final line */
```

**PROTOTYPE_ADAPTED — demo panel.** The artifact renders a scripted terminal fixture.
Later Founder direction: real implementation or real media beats fake demo. Keep the
two-column shell, replace the fixture with the real thing and label it honestly.
JuQode's right column shows the **real overview video**.

**PROTOTYPE_ADAPTED — routes.** Deep links `/products/juqode`, `/products/jutell`
must work and be shareable; the artifact is modal-only with no router. One component
may serve both. **Never trade real routes for the modal.**

---

## 7. Command palette — PROTOTYPE_ADAPTED (V1.1, may defer)

```css
.commandPalette{ position:fixed; inset:0; background:rgba(0,0,0,.76);
                 display:none; align-items:flex-start; justify-content:center;
                 padding-top:14vh; z-index:40 }
.cpbox{ width:min(680px,calc(100% - 32px)); background:#11151a;
        border:1px solid var(--line); border-radius:18px; overflow:hidden }
.cpbox input{ width:100%; background:#0c0f13; color:#fff; border:0;
              border-bottom:1px solid var(--line); padding:18px; font-size:17px }
.result{ padding:12px; border-radius:12px; cursor:pointer }
.result:hover{ background:#1a1f26 }
```

Shortcuts **`⌘K` / `Ctrl+K`** and **`/`** open it; **`Escape`** closes. Result rows
are name + `<small>` tagline. Empty state: `검색 결과 없음` +
`문제/필요를 다른 표현으로 입력해보세요.`

Client-side, Registry-driven. No backend, no LLM.

**Later Founder direction permits deferring to V1.1.** It exists in the prototype,
so implement it — but this is the one item that may slip without blocking launch.

---

## 8. Labs — PROTOTYPE_ADAPTED (rows, current content)

The artifact uses **rows, not cards**:

```css
.labrow{ display:flex; align-items:center; justify-content:space-between;
         padding:17px 0; border-bottom:1px solid var(--line) }
.labrow small{ color:var(--muted) }
```

Subtitle: `완제품으로 가장하지 않는 연구·실험 공간`. Lighter visual weight than
Products, ghost secondary action, **no install/download**.

Current Preview renders Labs as **cards**, which makes Labs look like Products.

**PROTOTYPE_ADAPTED — content.** The artifact's entries (Project First Contact,
JuESW) are stale. Current truth: JuDoctor, JuControler, JuCeipt, JuMiner.

---

## 9. Radar — PROTOTYPE_MATCH

One card, `min-height:auto`, `cursor:default`: appicon `R` + `MEDIA` status chip +
`JU Radar` + description + a single lime **`Open Radar`** CTA.

Exactly one discovery card, one CTA. Current Preview already matches — **preserve**.

---

## 10. Skills — CURRENT_ONLY

**Skills does not exist in the prototype** (no Skills in its nav). It is first-class
IA by later Founder decision.

It must belong to the same visual system and read in one line for a beginner:
`Agent에게 새로운 능력을 붙여요.` Card: visual/icon, name, one short outcome,
compatible Agents, version, install/copy when actually available.

Empty at V0 is allowed — with a **visually intentional empty state** (rounded dark
panel), never a developer table. Current Preview's empty state already matches:
**preserve**.

---

## 11. Responsive — PROTOTYPE_MATCH

```css
@media (max-width:850px){
  .grid{ grid-template-columns:1fr 1fr }
  .heroProduct{ grid-template-columns:1fr }
  .navlinks button:nth-child(-n+3){ display:none }
}
@media (max-width:560px){
  .shell{ padding:0 16px 60px }
  .grid{ grid-template-columns:1fr }
  .hero{ padding-top:58px }
  .hero h1{ letter-spacing:-3px }
  .command{ flex-direction:column }
  .navlinks .kbd{ display:none }
}
```

**The mobile nav model is the opposite of a hamburger.** At ≤850px the prototype
**hides the first three nav links entirely** and relies on scrolling; at ≤560px it
also hides the `⌘K` kbd hint and stacks the command input above its button. The
artifact has **no hamburger control at all**.

Current Preview invented a `nav-toggle` whose closed state does not actually hide
its panel — `aria-expanded="false"` while `.nav-panel` computes `display:flex` at
213px tall, pushing the first content section to y=472 of an 844px viewport. That
is an accessibility defect independent of the prototype.

---

## 12. Copy

**PROTOTYPE_MATCH** tone, from the artifact hero:

> `JU는 GitHub 프로젝트 목록이 아닙니다. 제품을 이해하고, 데모하고, 다운로드하거나 바로 실행하는 공식 제품 포털입니다.`

This states what the product *is* in beginner terms. Adopt the register, not the words.

**CURRENT_ONLY — register rules.** Audience is vibe-coding beginners, non-developers.
Never surface `Registry`, `resolver`, `provider`, `distribution`, `canonical`,
`SSOT`. Prefer `바로 써보기`, `설치하기`, `AI가 뭘 했는지 확인`, `Agent 능력 추가`,
`새 AI 도구 찾기`. Headings short, cards one sentence, paragraphs ≤ 2–3 lines.

Current Preview ships JuTell's summary and a Labs reason in **English** on a Korean
beginner-facing site.

---

## 13. Definition of done — visual round

- [ ] `--accent: #d8ff4f` and `--accent2: #8df6dc` in use; teal removed
- [ ] Accent as a scalpel: wordmark `U`, headline `<em>`, primary CTAs only
- [ ] Sticky translucent nav with backdrop blur; links include `Skills`
- [ ] Eyebrow is a bordered pill reading `JU PRODUCT PORTAL`
- [ ] `h1` at `clamp(44px,8vw,88px)` / `line-height:.95` / `letter-spacing:-5px`
- [ ] Command entry: real input + lime `찾아보기` + ≥3 hint chips + recommend banner
- [ ] Cards: appicon, status pill, one-line tagline, meta tags, lime CTA + Details, hover lift
- [ ] Card media shows real content, never an empty box
- [ ] Desktop detail is a 960px overlay, two-column `1.2fr / 0.8fr`; deep routes work
- [ ] Labs uses light rows, not cards
- [ ] Radar unchanged (one card, one CTA)
- [ ] Skills keeps its intentional empty state
- [ ] Responsive matches §11; no broken toggle state
- [ ] Public copy is Korean, beginner register
- [ ] Functional baseline §14 still passes 14/14

---

## 14. Functional baseline that must survive

Products = JuQode + JuTell · JuQode primary = Try Web · JuTell primary = Install ·
Labs = JuDoctor, JuControler, JuCeipt, JuMiner · Skills first-class · Radar thin ·
Registry-driven · one authoritative `getPrimaryAction()` · versioned media · local
media path stays **relative** · canonical from `VERCEL_PROJECT_PRODUCTION_URL` ·
all deep routes · responsive · accessibility · no broken CTA · security headers ·
no source/docs leakage.
