# JU Portal — DESIGN CONTRACT

> # ⚠ PROVISIONAL — DO NOT BUILD AGAINST THIS YET
>
> **Status: `DESIGN_REFERENCE_MISSING`.** The approved JU Portal prototype is not
> available in the Infra environment, and a visual audit was requested that must not
> invent a replacement visual system.
>
> **What this document actually is.** It was reconstructed from a *textual
> description* of the prototype (a Founder chat message), not from the prototype
> itself. Everything below that is a specific visual rule — card anatomy and its
> ordering, section-by-section visual weighting, the media-first ordering, the
> copy tables, the exact treatment of empty states — is **my inference, not approved
> design.** It is recorded here so the thinking is not lost, and so it can be
> corrected once the real reference arrives.
>
> **What is genuinely grounded and safe to act on** (from the Founder's written
> visual direction, which is verbatim and does not depend on the prototype):
> the lime accent `#d8ff4f`, the mint `#8df6dc`, the hero hierarchy
> `headline → interactive entry → products`, the `지금 뭘 하고 싶나요?` entry with
> suggestion chips, the copy register, and the section intents for Skills / Labs /
> Radar. Those are marked **[GROUNDED]** below.
>
> **Action required:** the Founder must supply the approved prototype (image, URL,
> or file). Infra will then re-issue this document as v1, marking each rule as
> either *matches prototype* or *adjusted from prototype*. Until then the Builder
> should treat only the **[GROUNDED]** items as a work order.
>
> Original commit: `bbad3dd`. Superseding commit: see git log for this file.

---

<details>
<summary><b>PROVISIONAL DRAFT — reconstructed from prose, not from the prototype</b></summary>

## 0. Functional baseline that must survive the redesign

Already accepted at 14/14 technical review. The redesign must not break any of it.

- Products = JuQode + JuTell **only**. JuDoctor / JuControler / JuCeipt / JuMiner = Labs.
- JuQode primary = Try Web. JuTell primary = Install.
- Skills is first-class IA. Radar is a thin surface.
- Registry-driven content, one `getPrimaryAction()` implementation, versioned media.
- Local media path stays **relative**. Canonical from `VERCEL_PROJECT_PRODUCTION_URL`.
- Responsive at 390 / 768 / 1440. No broken CTA. Security, leakage and bundle gates hold.

---

## 1. Brand tokens (exact values)

| Token | Required | Value |
|---|---|---|
| Page background | dark near-black | `#0a0d12` |
| Panel background | rounded dark panel | `#10141c` / `#171d27` |
| Border | subtle | `#212936` / `#2e3746` |
| Text primary | high-contrast white | `#e9edf3` |
| Text secondary | muted | `#a4adbd` / `#7c8698` |
| **Accent primary** | **bright lime** | **`#d8ff4f`** |
| **Accent secondary** | **mint** | **`#8df6dc`** |
| Accent pressed/dim | lime shade | derive from `#d8ff4f`, not a separate hue |

**The accent is the identity.** If the page reads as a generic dark SaaS dashboard
rather than a JU product portal, the accent is wrong.

Accent is used for: primary CTA fill, active nav pill, section eyebrows, link text,
focus ring, and small status accents. It is **not** used for body copy or large
backgrounds.

### Current drift

The shipped implementation uses `--accent: #35d0a5` (teal) with
`--accent-dim: #1fae88`. That is a different brand identity, not a shade
difference. Secondary mint `#8df6dc` does not exist; the nearest token is `#6ee7c0`.

---

## 2. Information architecture

```
/            hero + interactive entry + visual products
/products    JuQode, JuTell
/skills      curated library (may be empty)
/labs        experimental, no CTAs
/radar       one thin discovery card
```

Nav: `JU` wordmark · Products · Skills · Labs · Radar. Optionally a command
affordance. **Source is always secondary** and never in primary nav.

---

## 3. Hero — required hierarchy

Strictly three beats, in this order and nothing between them:

```
HEADLINE  ->  INTERACTIVE ENTRY  ->  VISUAL PRODUCTS
```

1. **Eyebrow** — `JU PRODUCT PORTAL`
2. **Headline** — oversized, max 2 lines. Concept: `필요한 도구를 찾고, 바로 써보세요.`
3. **Interactive entry** — see §4
4. **Visual products** — the cards

No long explanatory paragraph between the headline and the interactive entry. If
the user must read prose to understand the hero, the design fails.

---

## 4. Interactive entry (currently missing entirely)

A **large command/search-style field** is the centrepiece of the hero.

- Placeholder concept: `지금 뭘 하고 싶나요?`
- Must be a real, focusable input. It is a **discovery surface**, not decoration.
- Matching example prompts:
  - `AI Agent 여러 명 관리하고 싶어요`
  - `AI가 실제로 뭘 했는지 보고 싶어요`
  - `코드를 쉽게 이해하고 싶어요`
  - `Agent에게 새로운 능력을 추가하고 싶어요`
  - `새로운 AI 도구를 찾고 싶어요`
- Below the field: **small clickable hint chips** using those same strings.
  Tapping a chip routes to the matching Registry surface.

**Constraints — no backend.** V1 matching is plain client-side keyword matching
over the Registry. No LLM API, no new infrastructure, no server route.

Measured on the current Preview: `input: 0, form: 0, role=search/combobox: 0,
contenteditable: 0, kbd: 0`. This entire section is absent.

---

## 5. Command palette (V1.1 — explicitly not blocking)

`Cmd/Ctrl+K` discovery is desirable. If it delays V1, ship it as **V1.1**.
Client-side and Registry-driven only. Same no-backend rule as §4.

Not required for V1 acceptance.

---

## 6. Product card anatomy

A card is a **visual product presentation**, not a text row.

Required, in order:

1. Strong visual / media area (see §7)
2. Product icon or identity mark
3. Status chip
4. Product name
5. **One short outcome sentence** — one line, not three
6. Small metadata tags (platform, version)
7. Clear primary CTA
8. `Details` / `자세히` secondary

Current drift: no icon, no metadata tags, no status chip on the card, no in-card
CTA on the home cards (only a text link), and the summary runs to 3 lines.

---

## 7. Media-first

Order of preference, and it is an order, not a preference list:

1. real screenshot / actual UI
2. real product or Remotion video
3. actual interactive implementation
4. explicitly labelled fixture/demo **only if** real media is impossible

For JuQode the real overview video is visually dominant.

**A media area must never render as an empty void.** Either show real content or
show a deliberate placeholder. A black box reads as broken, and the spec forbids
"broken Products" reading. `preload="none"` with no poster produces exactly that
void.

Media must not feel like an attachment inside a documentation page.

---

## 8. Product detail

The prototype's large modal **feel** is preserved.

- Desktop: card → large overlay/modal Product Detail.
- Mobile: full-screen or route-style detail is fine.
- Real deep links `/products/juqode`, `/products/jutell` must keep working and be
  shareable. **Never trade real routes for the modal.** One component may serve both.

Detail order:

```
A. product identity + one-line value
B. large real media / video
C. primary CTA
D. 이걸로 무엇을 할 수 있나요?
E. 2-3 real use examples
F. simple usage / install
G. Source (secondary)
```

Do not open with a technical explanation.

Current drift: route-only, no modal feel; detail opens with identity and a large
media area but carries numbered sections (`1. 한눈에 보기`) which foreground a
documentation rhythm rather than a product-showcase rhythm.

---

## 9. Section-specific rules

**Skills.** Must read as the same JU system. Meaning must be obvious to a
beginner: `Agent에게 새로운 능력을 붙여요.` Skill card: visual/icon, name, one short
outcome, compatible Agents, version, install/copy when actually available. V0 may
be empty — if empty, use a **visually intentional empty state**, never an
empty developer table.

Current state: **this section already matches.** Oversized heading, the correct
plain-language line, and a rounded dark empty-state panel. Preserve it.

**Labs.** Must look deliberately experimental, never like broken Products.
Lighter visual weight. Alpha / Beta / Lab states. State plainly:
`아직 제품으로 출시하지 않은 실험`. **No fake Download / Install.** Source may exist
as secondary.

Current state: **matches.** Amber `예정` chips, `Beta · Coming soon` eyebrow, no
fake CTAs, Source secondary. Preserve it.

**Radar.** Thin. A discovery card, not a second app embedded in the Portal. One
clear `Open Radar` CTA. No crawler or backend expansion.

Current state: **matches.** One card, one CTA, short explanation. Preserve it.

---

## 10. Copy rules

Audience: vibe-coding beginner, non-developer. If the user must read a wall of
text before understanding the product, the design fails.

Forbidden register — none of this may appear in public UI:
`Registry`, `resolver`, `provider`, `distribution surface`, or any phrasing that
describes plumbing instead of outcome.

Preferred register:

| Instead of | Write |
|---|---|
| "Distribution surface" | `바로 써보기` |
| "Install via npm" | `설치하기` |
| "Add capability" | `Agent에게 능력 추가` |
| "Verify agent output" | `AI가 뭘 했는지 확인` |
| "Discover tools" | `새로운 AI 도구 찾기` |

Limits: heading short · card copy 1 sentence · paragraph ideally 2–3 lines.

**Current drift:** JuTell's summary and Labs' `No downloadable build published
yet.` are in English on a Korean beginner-facing site. Public copy must be
consistently Korean.

---

## 11. Visual acceptance

Capture and compare at **390 / 768 / 1440**, for each of:

| View | Route |
|---|---|
| A. first viewport | `/` |
| B. Products | `/products` |
| C. JuQode detail | `/products/juqode` |
| D. JuTell detail | `/products/jutell` |
| E. Skills | `/skills` |
| F. Labs | `/labs` |
| G. Radar | `/radar` |

Every delta is classified **P0** (fundamental visual/IA), **P1** (noticeable UX),
or **P2** (polish).

Two things that must NOT be true of the result: it reads as documentation, or it
reads as a GitHub repository catalogue. The current implementation is closer to
the second than the first on the Products surface, and closer to the first on the
product detail surface.

### Mobile requirement (defect class)

At 390×844 the first viewport must show the headline and the interactive entry.
Navigation must not consume it. A closed menu must actually be closed —
`aria-expanded="false"` with a visible 213px panel is a defect, not a style choice.

---

## 12. Definition of done for the visual round

- [ ] Accent is `#d8ff4f`; secondary `#8df6dc` present.
- [ ] Hero eyebrow reads `JU PRODUCT PORTAL`; headline matches §3.
- [ ] Interactive entry exists: real focusable input + clickable hint chips.
- [ ] Cards match §6 anatomy, one-line outcome, real media or deliberate placeholder.
- [ ] Product detail has the modal feel on desktop; deep routes still work.
- [ ] Labs / Radar / Skills preserve their current (already correct) treatment.
- [ ] Public copy is Korean, beginner register, no plumbing vocabulary.
- [ ] At 390px the first viewport shows headline + interactive entry.
- [ ] Functional baseline §0 still passes 14/14.

---

</details>
