import { getPrimaryAction } from '../registry/action.ts';
import { esc } from '../lib/dom.js';
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

/** Hint chips — the Discovery entry points (DESIGN_CONTRACT §4). */
const HINTS = [
  'AI가 뭘 수정했는지 보고 싶어',
  '말로 앱 만들고 싶어',
  '코드를 쉽게 이해하고 싶어',
  'Agent에게 능력 추가',
  '새로운 AI 도구 찾기',
];

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

  return `<article class="tile" data-tile>
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
 * Hero: founder dot texture on the right, intent and actions on the left.
 * Discovery (DESIGN_CONTRACT §4) sits between the headline and the actions, so
 * the hierarchy stays headline -> interaction -> products.
 */
function hero() {
  return `<section class="hero" data-section="top" data-hero>
  <div class="hero-copy">
    <p class="label">JU · FROM SIGNAL TO TOOL</p>
    <h1 class="hero-title" lang="ko">
      <span class="hero-line">비개발자의 생각이 말이 되고,</span>
      <span class="hero-line">말이 AI의 작업이 되고,</span>
      <span class="hero-line">그 결과가 다시 사람이 이해할 수 있는</span>
      <span class="hero-line"><em>도구가 됩니다.</em></span>
    </h1>
    <p class="hero-sub">사람의 생각이 신호가 되고, AI의 작업을 거쳐<br>누구나 이해할 수 있는 도구로 이어집니다.</p>
    <form class="command" role="search" data-discovery>
      <input type="search" name="q" placeholder="지금 뭘 하고 싶나요?" aria-label="지금 뭘 하고 싶나요?" autocomplete="off">
      <button type="submit" class="cta">찾아보기</button>
    </form>
    <div class="hints">
      ${HINTS.map((h) => `<button class="hint" type="button" data-hint="${esc(h)}">${esc(h)}</button>`).join('')}
    </div>
    <div class="banner" data-banner role="status" hidden></div>
    <div class="hero-actions">
      <a class="btn cta" href="/products/">JU 제품 시작하기 <span aria-hidden="true">→</span></a>
      <a class="btn" href="/skills/">Skills 보기</a>
    </div>
  </div>
  <div class="hero-signal" aria-hidden="true" data-signal-field>
    <div class="signal-field">
      <svg class="signal-paths" viewBox="0 0 480 480" focusable="false">
        <path d="M52 124 C154 124 136 235 231 235 S329 111 430 111" />
        <path d="M48 330 C154 330 160 236 231 236 S331 355 430 355" />
      </svg>
      <div class="portrait-dots" data-founder-dots></div>
    </div>
    <span class="signal-node signal-node-a"></span>
    <span class="signal-node signal-node-b"></span>
    <span class="signal-node signal-node-c"></span>
    <span class="signal-resolve">${signalIcon('')}</span>
  </div>
</section>`;
}

/**
 * Brand narrative — the approved JU story, told on Home before the products.
 * Sections 01–03 are pure brand copy with signal visuals; 04 resolves the
 * story into the real Registry products. No product truth is invented here.
 */
function brandValueBand() {
  return `<section class="band band-story" id="brand" data-section="top" data-story>
  <div class="band-index"><span class="band-num">01 · BRAND VALUE</span></div>
  <div class="story-body">
    <h2 class="story-title" lang="ko">누구나,<br>자신의 아이디어를<br>현실로 만들 수 있는 시대.</h2>
    <div class="story-rule" aria-hidden="true"></div>
    <div class="story-cols">
      <p class="story-text" lang="ko">비개발자도 할 수 있습니다.<br>JU는 생각하는 모든 사람을 위해<br>새로운 창작의 방식을 만듭니다.</p>
      <ol class="story-list" aria-label="JU가 잇는 것">
        <li>아이디어</li>
        <li>콘텐츠</li>
        <li>도구</li>
        <li>다시 사람</li>
      </ol>
    </div>
  </div>
  <div class="story-figure" aria-hidden="true" data-dots="human"></div>
</section>`;
}

function youInstructBand() {
  return `<section class="band band-story" id="instruct" data-section="top" data-story>
  <div class="band-index"><span class="band-num">02 · YOU INSTRUCT</span></div>
  <div class="beat">
    <div>
      <h2 class="story-title beat-title" lang="ko">당신의 생각을,<br>그냥 말해주세요.</h2>
      <p class="story-text" lang="ko">코드가 아니라 평소 쓰는 말이면 충분합니다.<br>사람의 신호가 여기서 시작됩니다.</p>
    </div>
    <div class="beat-visual beat-visual-human" data-beat>
      <div class="beat-dots" data-dots="human"></div>
      <div class="prompt" aria-label="예시 요청">
        <span class="prompt-example">EXAMPLE · 예시 요청</span>
        <span class="prompt-cursor" aria-hidden="true">›</span>
        <span class="prompt-text" data-prompt>내 아이디어를 작은 웹 도구로 만들어줘</span>
      </div>
      <span class="signal-track" aria-hidden="true"><i class="signal-runner"></i></span>
    </div>
  </div>
</section>`;
}

const AI_STATES = ['Planning', 'Generating', 'Building', 'Testing'];

function aiWorksBand() {
  return `<section class="band band-story" id="works" data-section="top" data-story>
  <div class="band-index"><span class="band-num">03 · AI WORKS</span></div>
  <div class="beat">
    <div>
      <h2 class="story-title beat-title" lang="ko">AI가 당신의 생각을<br>작업으로 바꿉니다.</h2>
      <p class="story-text" lang="ko">계획하고, 만들고, 조립하고, 확인합니다.<br>신호가 작업이 되는 과정이 그대로 보입니다.</p>
    </div>
    <div class="beat-visual beat-visual-ai" data-beat>
      <ol class="states" aria-label="AI 작업 단계">
        ${AI_STATES.map((s, i) => `<li class="chip state" style="--i:${i}"><i class="state-dot" aria-hidden="true"></i>${s}</li>`).join('')}
      </ol>
      <span class="work-line" aria-hidden="true"></span>
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
  return `<section class="band" data-section="notify">
  <div class="band-head"><h2 class="title" lang="ko">지금, JU의 다음 소식을<br>가장 먼저 받아보세요.</h2></div>
  <p class="muted" style="margin:0;max-width:46rem">새로운 기능, 제품 업데이트, 그리고 더 큰 가능성에 대한 소식을 전해드립니다.</p>
  <div class="notify-preview" aria-labelledby="notify-state">
    <span class="notify-field" aria-hidden="true">you@example.com</span>
    <button class="btn" type="button" disabled aria-disabled="true">알림 받기</button>
    <p class="label" id="notify-state">알림 기능 준비 중 · 지금은 입력을 받지 않습니다</p>
  </div>
  <p class="muted" style="margin:0;max-width:46rem;font-size:14px">구독을 받는 서버가 아직 없습니다. 준비되면 이곳에서 이메일을 받고 소식을 전해드리겠습니다.</p>
</section>`;
}

/** Radar on Home: a thin pointer to the real service, resolved by Infra. */
function radarBand(radar, num) {
  const r = radar[0];
  const action = r ? getPrimaryAction(r) : null;
  return `<section class="band" id="radar" data-section="radar">
  <div class="band-head">
    <div class="band-index"><span class="band-num">${num}</span></div>
    <div>
      <h2 class="title">새로운 도구를 발견합니다.</h2>
      <p>JU가 발견하고 검증하는 새로운 AI / Agent / 개발도구</p>
    </div>
  </div>
  <div class="tile-actions" style="margin:0">
    ${
      action?.resolved
        ? `<a class="btn cta btn-sm" href="${esc(action.href)}" rel="noopener" data-cta data-slug="${esc(r.slug)}" data-verb="${esc(action.verb)}">JU Radar 열어보기</a>`
        : '<span class="btn is-disabled btn-sm" aria-disabled="true">연결 준비 중</span>'
    }
    <a class="btn btn-sm" href="/radar/">자세히</a>
  </div>
</section>`;
}

export function renderHome({ products, skills, labs, radar = [], currentPath, overlays = '' }) {
  let n = 4;
  const next = () => String(++n).padStart(2, '0');
  const body = `${hero()}

${brandValueBand()}

${youInstructBand()}

${aiWorksBand()}

<section class="band band-story band-resolve" id="products" data-section="products" data-story>
  <div class="band-index"><span class="band-num">04 · REAL TOOL</span></div>
  <div class="story-body">
    <h2 class="story-title" lang="ko">그리고,<br>당신이 이해할 수 있는<br>도구가 완성됩니다.</h2>
    <p class="story-text" lang="ko">여기까지가 이야기이고, 아래는 지금 실제로 써 볼 수 있는 제품입니다.<br>설치하지 않고 바로 열어보거나, 명령 한 줄로 시작합니다.</p>
  </div>
  <div class="grid grid-3">${products.map(productTile).join('')}</div>
</section>

<section class="band" id="skills" data-section="skills">
  <div class="band-head">
    <div class="band-index"><span class="band-num">${next()}</span></div>
    <div>
      <h2 class="title">Skills</h2>
      <p>Agent에게 새로운 능력을 붙여요.</p>
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
      <h2 class="title">Labs</h2>
      <p>완제품으로 가장하지 않는 연구·실험 공간.</p>
    </div>
  </div>
  ${labs.map(labRow).join('')}
</section>`
    : ''
}

${radarBand(radar, next())}

${notifyBand()}`;

  return layout(
    'JU — 생각이 도구가 되는 곳',
    '누구나 자신의 아이디어를 현실로 만들 수 있는 시대. JU는 사람의 생각을 AI 작업과 이해하기 쉬운 도구로 이어줍니다.',
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
