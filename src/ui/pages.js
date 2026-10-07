import { getPrimaryAction } from '../registry/action.ts';
import { esc } from '../lib/dom.js';
import homeCopy from '../../content/home.ts';
import {
  mediaFrame,
  primaryAction,
  layout,
  signalIcon,
  platformTags,
  capabilities,
} from './components.js';

/** One short line for a tile. Never three. */
function oneLine(text) {
  const first = String(text ?? '').split(/[.!?。\n]/)[0].trim();
  return first.length > 58 ? first.slice(0, 56) + '…' : first;
}

const STATUS = { available: '바로 써보기', beta: 'Beta', planned: '예정' };

/**
 * Render authored lines as <br>-separated text, escaping each line.
 * Home copy comes from content/home.ts (Studio-editable); this is the single
 * place the line array becomes markup.
 */
function lines(arr) {
  return arr.map((l) => esc(l)).join('<br>');
}

/**
 * Discovery index — Registry-driven, client-side only.
 *
 * No backend, no LLM, no new infrastructure. Each entry carries the words the
 * real product answers to, so a submitted intent resolves to a real Portal
 * route. Restored after the brand rewrite; the original behaviour is preserved
 * and only its visual treatment is now JU Signal.
 */
export function discoveryIndex(products, radar) {
  const intentKeywords = {
    juqode: '말로 앱 만들고 싶어 앱 만들기 만들기 화면 에이전트 실행 브라우저',
    jutell: '코드를 쉽게 이해하고 싶어 ai가 뭘 했는지 확인 리포트 정리 요약 기록',
  };

  return [
    ...products.map((p) => ({
      href: `/products/${p.slug}/`,
      name: p.title,
      tagline: oneLine(p.summary),
      haystack: [p.title, p.summary, intentKeywords[p.slug] ?? ''].join(' ').toLowerCase(),
    })),
    {
      href: '/skills/',
      name: 'Skills',
      tagline: 'Agent에게 새로운 능력을 붙여요.',
      haystack: 'skills agent에게 능력 추가 스킬 기능 확장 커스텀 붙이기',
    },
    ...radar.map((r) => ({
      href: '/radar/',
      name: r.title,
      tagline: '새로운 AI 도구를 찾는 곳.',
      haystack: 'radar 새로운 ai 도구 찾기 새 도구 발견 탐색',
    })),
  ];
}

/**
 * Product tile. Media leads, then the product's own Signal icon, its real
 * status from the resolver, a one-line outcome, real meta tags, and the real
 * primary CTA plus a real deep route.
 */
function productTile(p) {
  const action = getPrimaryAction(p);
  const href = `/products/${p.slug}/`;
  const tags = [...platformTags(p), action.version].filter(Boolean);

  return `<article class="tile">
  <span class="tile-sweep" aria-hidden="true"></span>
  <a href="${href}" data-showroom="${esc(p.slug)}" aria-label="${esc(p.title)} 자세히 보기">
    <div class="tile-media">${mediaFrame(p)}</div>
  </a>
  ${signalIcon(p.slug)}
  <span class="chip ${action.resolved ? 'is-ready' : 'is-beta'}">${esc(STATUS[action.resolved ? 'available' : p.status] ?? p.status)}</span>
  <h3 class="tile-name"><a href="${href}" data-showroom="${esc(p.slug)}">${esc(p.title)}</a></h3>
  <p class="tile-purpose">${esc(oneLine(p.summary))}</p>
  ${tags.length ? `<div class="actions" style="gap:6px">${tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
  <div class="tile-actions">
    ${primaryAction(p)}
    <a class="btn btn-sm" href="${href}">자세히</a>
  </div>
</article>`;
}

/** Labs read as light rows, never as Product tiles. No fake install. */
function labRow(l) {
  const state = l.status === 'beta' ? '베타' : '실험 중';
  return `<div class="labrow" id="${esc(l.slug)}">
  <div>
    <b>${esc(l.title)}</b><br>
    <small>${esc(state)} · 아직 제품으로 출시하지 않은 실험</small>
  </div>
  ${l.source?.url ? `<a class="btn btn-sm" href="${esc(l.source.url)}" rel="noopener">Source &#8599;</a>` : '<span class="chip is-lab">LAB</span>'}
</div>`;
}

function skillTile(s) {
  return `<article class="tile">
  <span class="chip">v${esc(s.version)}</span>
  <h3 class="tile-name"><a href="/skills/${esc(s.slug)}/">${esc(s.title)}</a></h3>
  <p class="tile-purpose">${esc(oneLine(s.summary))}</p>
  ${(s.compatibleAgents ?? []).length ? `<div class="actions" style="gap:6px">${(s.compatibleAgents ?? []).map((a) => `<span class="chip">${esc(a)}</span>`).join('')}</div>` : ''}
  <div class="tile-actions"><a class="btn cta btn-sm" href="/skills/${esc(s.slug)}/">자세히</a></div>
</article>`;
}

/**
 * Hero: two aligned columns — the text column (headline → supporting line →
 * Discovery → CTAs) and ONE large animated JU Signal Object: a volumetric
 * ASCII / dot sculpture on <canvas> (see `initHeroSculpture` in portal.js).
 * The object is the only thing in the visual area; nothing overlaps the type.
 *
 * Motion contract (portal.js / portal.css):
 *   [data-hero]            portal.js adds `.is-sequenced` (motion enabled) and
 *                          drives the sculpture.
 *   [data-hero-stage]      the sculpture's fluid stage box.
 *   [data-hero-sculpture]  the <canvas>. It morphs between JU signal forms on a
 *                          seamless loop (reduced motion: one static frame).
 *   [data-section-sculpture] each lower section's volumetric form (V3.2).
 */
function hero() {
  const H = homeCopy.hero;
  return `<section class="hero" data-section="top" data-hero>
  <div class="hero-copy">
    <p class="label">${esc(H.label)}</p>
    <h1 class="hero-title" lang="ko">
      ${H.titleLines.map((l) => `<span>${esc(l)}</span>`).join('\n      ')}
      <span><em>${esc(H.titleAccent)}</em></span>
    </h1>
    <p class="hero-sub">${lines(H.subtitleLines)}</p>
    <div class="hero-discover">
      <form class="command" role="search" data-discovery>
        <input type="search" name="q" placeholder="${esc(H.discoverPlaceholder)}" aria-label="${esc(H.discoverPlaceholder)}" autocomplete="off">
        <button type="submit" class="cta" aria-label="${esc(H.discoverLabel)}"><span aria-hidden="true">→</span></button>
      </form>
      <div class="hints">
        ${H.hints.map((h) => `<button class="hint" type="button" data-hint="${esc(h)}">${esc(h)}</button>`).join('')}
      </div>
      <div class="banner" data-banner role="status" hidden></div>
    </div>
    <div class="hero-actions">
      <a class="btn cta" href="/products/">${esc(H.primaryCta)} <span aria-hidden="true">→</span></a>
      <a class="btn" href="/skills/">${esc(H.secondaryCta)}</a>
    </div>
  </div>
  <div class="hero-stage" aria-hidden="true" data-hero-stage>
    <canvas class="hero-sculpture" data-hero-sculpture></canvas>
  </div>
</section>`;
}

/**
 * Brand narrative — the approved JU story, told on Home before the products.
 * Sections 01–03 are pure brand copy with signal visuals; 04 resolves the
 * story into the real Registry products. No product truth is invented here.
 *
 * Motion contract (V3.2): every `[data-story]` section gets `.is-in` once from
 * a single IntersectionObserver in portal.js, and carries its own volumetric
 * sculpture (`[data-section-sculpture]`, same shared engine as the Hero).
 * Reduced motion: each canvas shows ONE static resolved sculpture.
 */
function brandValueBand() {
  const B = homeCopy.brand;
  return `<section class="band band-story" id="brand" data-section="top" data-story>
  <div class="band-index"><span class="band-num">${esc(B.index)}</span><span class="band-kind">SIGNAL</span></div>
  <div class="story-body">
    <h2 class="story-title" lang="ko">${lines(B.titleLines)}</h2>
    <div class="story-rule" aria-hidden="true"></div>
    <div class="story-cols">
      <p class="story-text" lang="ko">${lines(B.bodyLines)}</p>
      <ol class="story-list" aria-label="${esc(B.listLabel)}">
        ${B.chain.map((c) => `<li>${esc(c)}</li>`).join('\n        ')}
      </ol>
    </div>
  </div>
  <div class="story-figure" aria-hidden="true" data-section-stage><canvas class="section-sculpture" data-section-sculpture="brand-value"></canvas></div>
</section>`;
}

/**
 * 02 YOU INSTRUCT — the prompt is its own readable composer; the sculpture
 * receives that instruction and sends one signal through a narrowing channel.
 */
function youInstructBand() {
  const B = homeCopy.instruct;
  return `<section class="band band-story" id="instruct" data-section="top" data-story>
  <div class="band-index"><span class="band-num">${esc(B.index)}</span><span class="band-kind">INPUT</span></div>
  <div class="beat">
    <div>
      <h2 class="story-title beat-title" lang="ko">${lines(B.titleLines)}</h2>
      <p class="story-text" lang="ko">${lines(B.bodyLines)}</p>
    </div>
    <div class="beat-visual instruction-visual">
      <div class="instruction-composer" aria-label="${esc(B.exampleAria)}">
        <span class="label prompt-example">${esc(B.exampleLabel)}</span>
        <span class="prompt-cursor" aria-hidden="true">›</span>
        <span class="prompt-text">${esc(B.exampleText)}</span>
      </div>
      <div class="receiver-stage" aria-hidden="true" data-section-stage><canvas class="section-sculpture" data-section-sculpture="you-instruct"></canvas></div>
    </div>
  </div>
</section>`;
}

/**
 * 03 AI WORKS — a modular machine core assembles and tests through four stages.
 * The stage labels remain supporting metadata below the object.
 */
function aiWorksBand() {
  const B = homeCopy.works;
  return `<section class="band band-story process-band" id="works" data-section="top" data-story>
  <div class="band-index"><span class="band-num">${esc(B.index)}</span><span class="band-kind">PROCESS</span></div>
  <div class="beat">
    <div>
      <h2 class="story-title beat-title" lang="ko">${lines(B.titleLines)}</h2>
      <p class="story-text" lang="ko">${lines(B.bodyLines)}</p>
    </div>
    <div class="beat-visual process-visual" data-works-visual>
      <div class="engine-stage" aria-hidden="true" data-section-stage><canvas class="section-sculpture" data-section-sculpture="ai-works"></canvas></div>
      <ol class="states" aria-label="${esc(B.statesLabel)}">
        ${B.states.map((s, i) => `<li class="chip state" style="--i:${i}"><i class="state-dot" aria-hidden="true"></i>${esc(s)}</li>`).join('')}
      </ol>
    </div>
  </div>
</section>`;
}

/**
 * Notification CTA. There is NO subscription backend at V0, so nothing is
 * collected and nothing is discarded. The field composition is kept only as a
 * disabled preview that says so; it cannot submit anything.
 */
function notifyBand() {
  const N = homeCopy.notify;
  return `<section class="band" data-section="notify">
  <div class="band-head"><h2 class="title" lang="ko">${lines(N.titleLines)}</h2></div>
  <p class="muted" style="margin:0;max-width:46rem">${esc(N.body)}</p>
  <div class="notify-preview" aria-labelledby="notify-state">
    <span class="notify-field" aria-hidden="true">you@example.com</span>
    <button class="btn" type="button" disabled aria-disabled="true">${esc(N.button)}</button>
    <p class="label" id="notify-state">${esc(N.state)}</p>
  </div>
  <p class="muted" style="margin:0;max-width:46rem;font-size:14px">${esc(N.footnote)}</p>
</section>`;
}

/** Radar on Home: a thin pointer to the real service, resolved by Infra. */
function radarBand(radar, num) {
  const S = homeCopy.sections;
  const r = radar[0];
  const action = r ? getPrimaryAction(r) : null;
  return `<section class="band" id="radar" data-section="radar">
  <div class="band-head">
    <div class="band-index"><span class="band-num">${num}</span></div>
    <div>
      <h2 class="title">${esc(S.radarTitle)}</h2>
      <p>${esc(S.radarBody)}</p>
    </div>
  </div>
  <div class="tile-actions" style="margin:0">
    ${
      action?.resolved
        ? `<a class="btn cta btn-sm" href="${esc(action.href)}" rel="noopener" data-cta data-slug="${esc(r.slug)}" data-verb="${esc(action.verb)}">${esc(S.radarCta)}</a>`
        : `<span class="btn is-disabled btn-sm" aria-disabled="true">${esc(S.radarPending)}</span>`
    }
    <a class="btn btn-sm" href="/radar/">${esc(S.radarDetails)}</a>
  </div>
</section>`;
}

export function renderHome({ products, skills, labs, radar = [], currentPath, overlays = '' }) {
  let n = 4;
  const next = () => String(++n).padStart(2, '0');
  const S = homeCopy.sections;
  const R = homeCopy.resolve;
  const body = `${hero()}

${brandValueBand()}

${youInstructBand()}

${aiWorksBand()}

<section class="band band-story band-resolve" id="products" data-section="products" data-story>
  <div class="band-index"><span class="band-num">${esc(R.index)}</span><span class="band-kind">RESULT</span></div>
  <div class="story-body">
    <h2 class="story-title" lang="ko">${lines(R.titleLines)}</h2>
    <p class="story-text" lang="ko">${lines(R.bodyLines)}</p>
    <div class="story-rule" aria-hidden="true"></div>
    <p class="band-status" data-resolve-status>RESULT READY · REAL TOOL</p>
  </div>
  <div class="resolve-stage" aria-hidden="true" data-section-stage><canvas class="section-sculpture" data-section-sculpture="real-tool"></canvas></div>
  <div class="grid grid-3">${products.map(productTile).join('')}</div>
</section>

<section class="band" id="skills" data-section="skills">
  <div class="band-head">
    <div class="band-index"><span class="band-num">${next()}</span></div>
    <div>
      <h2 class="title">${esc(S.skillsTitle)}</h2>
      <p>${esc(S.skillsBody)}</p>
    </div>
  </div>
  ${
    skills.length
      ? `<div class="grid grid-3">${skills.map(skillTile).join('')}</div>`
      : `<div class="empty"><div class="mark">S</div><p>첫 스킬이 준비되면 여기에 표시됩니다.</p><p style="margin-top:12px"><a class="btn btn-sm" href="/skills/">Skills 보기</a></p></div>`
  }
</section>

${
  labs.length
    ? `<section class="band" id="labs" data-section="labs">
  <div class="band-head">
    <div class="band-index"><span class="band-num">${next()}</span></div>
    <div>
      <h2 class="title">${esc(S.labsTitle)}</h2>
      <p>${esc(S.labsBody)}</p>
    </div>
  </div>
  ${labs.map(labRow).join('')}
</section>`
    : ''
}

${radarBand(radar, next())}

${notifyBand()}`;

  return layout(
    homeCopy.meta.title,
    homeCopy.meta.description,
    currentPath,
    body,
    { overlays },
  );
}

export function renderProducts({ products, currentPath, overlays = '' }) {
  const body = `<section class="band" data-section="products">
  <div class="band-head">
    <div class="band-index"><span class="band-num">01</span></div>
    <div>
      <h1 class="title">Products</h1>
      <p>지금 바로 써 볼 수 있는 제품만 여기에 둡니다.</p>
    </div>
  </div>
  <div class="grid grid-3">${products.map(productTile).join('')}</div>
</section>`;
  return layout('Products', '지금 실제로 써 볼 수 있는 JU 제품.', currentPath, body, { overlays });
}

export function renderLabs({ labs, currentPath }) {
  const body = `<section class="band" data-section="labs">
  <div class="band-head">
    <div class="band-index"><span class="band-num">01</span></div>
    <div>
      <h1 class="title">Labs</h1>
      <p>완제품으로 가장하지 않는 연구·실험 공간. 아직 제품으로 출시하지 않았습니다.</p>
    </div>
  </div>
  ${
    labs.length
      ? labs.map(labRow).join('')
      : '<div class="empty"><div class="mark">LAB</div><p>아직 등록된 항목이 없습니다.</p></div>'
  }
</section>`;
  return layout('Labs', '만들고 있지만 아직 실행해 볼 수 없는 것들.', currentPath, body);
}

export function renderSkills({ skills, currentPath }) {
  const body = `<section class="band" data-section="skills">
  <div class="band-head">
    <div class="band-index"><span class="band-num">01</span></div>
    <div>
      <h1 class="title">Skills</h1>
      <p>Agent에게 새로운 능력을 붙여요.</p>
    </div>
  </div>
  ${
    skills.length
      ? `<div class="grid grid-3">${skills.map(skillTile).join('')}</div>`
      : `<div class="empty">
    <div class="mark">S</div>
    <p>첫 스킬이 준비되면 여기에 표시됩니다.</p>
  </div>`
  }
</section>`;
  return layout('Skills', 'Agent에게 새로운 능력을 붙여요.', currentPath, body);
}

/** Radar: one discovery card, one CTA, origin resolved by the Infra resolver. */
export function renderRadar({ radar, currentPath }) {
  const r = radar[0];
  const action = r ? getPrimaryAction(r) : null;

  const body = `<section class="band" data-section="radar">
  <div class="band-head">
    <div class="band-index"><span class="band-num">01</span></div>
    <div>
      <h1 class="title">Radar</h1>
      <p>JU가 발견하고 검증하는 새로운 AI / Agent / 개발도구</p>
    </div>
  </div>
  ${
    r
      ? `<article class="tile" style="max-width:30rem">
    <span class="appicon" aria-hidden="true">R</span>
    <span class="chip">MEDIA</span>
    <h3 class="tile-name">JU Radar</h3>
    <p class="tile-purpose">새로운 AI 도구를 찾는 곳.</p>
    <div class="tile-actions">
      ${
        action?.resolved
          ? `<a class="btn cta btn-sm" href="${esc(action.href)}" rel="noopener" data-cta data-slug="${esc(r.slug)}" data-verb="${esc(action.verb)}">Open Radar</a>`
          : '<span class="btn is-disabled btn-sm" aria-disabled="true">Open Radar</span>'
      }
    </div>
  </article>`
      : `<div class="empty"><div class="mark">R</div><p>아직 연결된 항목이 없습니다.</p></div>`
  }
</section>`;
  return layout('Radar', '새로운 AI 도구 찾기.', currentPath, body);
}

export function renderNotFound({ currentPath }) {
  const body = `<section class="band">
  <div class="band-head"><h1 class="title">찾을 수 없는 페이지입니다</h1></div>
  <p class="muted" style="margin:0 0 20px">주소가 바뀌었거나 아직 공개되지 않은 페이지일 수 있습니다.</p>
  <a class="btn cta" href="/">홈으로 가기</a>
</section>`;
  return layout('페이지를 찾을 수 없습니다', '', currentPath, body, { indexable: false });
}
