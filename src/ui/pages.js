import { getPrimaryAction } from '../registry/action.ts';
import { esc } from '../lib/dom.js';
import { mediaFrame, primaryAction, layout } from './components.js';

/** Hint chips — contract §4 baseline (3) plus the Founder's extended pool. */
const HINTS = [
  'AI가 뭘 수정했는지 보고 싶어',
  '말로 앱 만들고 싶어',
  '코드를 쉽게 이해하고 싶어',
  'Agent에게 능력 추가',
  '새로운 AI 도구 찾기',
];

/** One short line for a card. Never three. */
function oneLine(text) {
  const first = String(text ?? '').split(/[.!?。\n]/)[0].trim();
  return first.length > 60 ? first.slice(0, 58) + '…' : first;
}

function labelPlatform(code) {
  const map = { web: '웹', windows: 'Windows', node: '터미널', macos: 'macOS', linux: 'Linux' };
  return map[code] ?? code;
}

function iconFor(title) {
  return String(title ?? 'JU')
    .replace(/^Ju/, '')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Discovery index — Registry-driven only. No backend, no LLM, no invented
 * product. Each entry carries the words the real product answers to.
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

/** Hero — contract §3: eyebrow pill, huge headline, lime second line. */
function hero() {
  return `<div class="hero">
  <span class="eyebrow">JU PRODUCT PORTAL</span>
  <h1>필요한 도구를 찾고,<br><em>바로 써보세요.</em></h1>
  <p>JU는 GitHub 프로젝트 목록이 아닙니다. 제품을 이해하고, 데모하고, 다운로드하거나 바로 실행하는 공식 제품 포털입니다.</p>
  <form class="command" role="search" data-discovery>
    <input type="search" name="q" placeholder="지금 뭘 하고 싶나요?" aria-label="지금 뭘 하고 싶나요?" autocomplete="off">
    <button type="submit">찾아보기</button>
  </form>
  <div class="hints">
    ${HINTS.map((h) => `<button class="hint" type="button" data-hint="${esc(h)}">${esc(h)}</button>`).join('')}
  </div>
  <div class="banner" data-banner role="status" hidden></div>
</div>`;
}

/** Product card — contract §5: media, icon+status, name, one line, meta, actions. */
function productCard(p) {
  const action = getPrimaryAction(p);
  const href = `/products/${p.slug}/`;
  const platforms = (p.releases ?? []).flatMap((r) => r.platforms ?? []);
  const tags = [...new Set([...platforms.map(labelPlatform), action.version].filter(Boolean))];

  return `<article class="card is-link">
  <a href="${href}" aria-label="${esc(p.title)} 자세히 보기">
    <div class="card-media">${mediaFrame(p)}</div>
  </a>
  <div class="top">
    <div class="appicon" aria-hidden="true">${esc(iconFor(p.title))}</div>
    <span class="status ${action.resolved ? 'is-ready' : 'is-beta'}">${action.resolved ? '바로 써보기' : '베타'}</span>
  </div>
  <h3><a href="${href}">${esc(p.title)}</a></h3>
  <p class="tagline">${esc(oneLine(p.summary))}</p>
  <div class="meta">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
  <div class="actions">
    ${primaryAction(p)}
    <a class="btn" href="${href}">자세히</a>
  </div>
</article>`;
}

/** Labs — contract §8: light rows, never Product-style cards, no install CTA. */
function labRow(l) {
  const state = l.status === 'beta' ? '베타' : '실험 중';
  return `<div class="labrow" id="${esc(l.slug)}">
  <div>
    <b>${esc(l.title)}</b><br>
    <small>${esc(state)} · 아직 제품으로 출시하지 않은 실험</small>
  </div>
  ${
    l.source?.url
      ? `<a class="btn" href="${esc(l.source.url)}" rel="noopener">Source &#8599;</a>`
      : '<span class="tag">LAB</span>'
  }
</div>`;
}

function skillCard(s) {
  return `<article class="card is-link">
  <div class="top">
    <div class="appicon" aria-hidden="true">${esc(iconFor(s.title))}</div>
    <span class="status">v${esc(s.version)}</span>
  </div>
  <h3><a href="/skills/${esc(s.slug)}/">${esc(s.title)}</a></h3>
  <p class="tagline">${esc(oneLine(s.summary))}</p>
  <div class="meta">${(s.compatibleAgents ?? []).map((a) => `<span class="tag">${esc(a)}</span>`).join('')}</div>
  <div class="actions"><a class="btn cta" href="/skills/${esc(s.slug)}/">자세히</a></div>
</article>`;
}

export function renderHome({ products, skills, labs, radar, currentPath }) {
  const body = `${hero()}

<section id="products">
  <div class="sectionHead">
    <h2>Products</h2>
    <p>지금 실제로 써 볼 수 있는 제품.</p>
  </div>
  <div class="grid">${products.map(productCard).join('')}</div>
</section>

${
  skills.length
    ? `<section id="skills">
  <div class="sectionHead">
    <h2>Skills</h2>
    <p>Agent에게 새로운 능력을 붙여요.</p>
  </div>
  <div class="grid">${skills.map(skillCard).join('')}</div>
</section>`
    : ''
}

${
  labs.length
    ? `<section id="labs">
  <div class="sectionHead">
    <h2>Labs</h2>
    <p>완제품으로 가장하지 않는 연구·실험 공간.</p>
  </div>
  ${labs.map(labRow).join('')}
</section>`
    : ''
}`;

  return layout(
    'JU — 필요한 도구를 찾고, 바로 써보세요',
    '바이브코딩 입문자와 비개발자를 위한 JU 공식 제품 포털.',
    currentPath,
    body,
  );
}

export function renderProducts({ products, currentPath }) {
  const body = `<section>
  <div class="sectionHead">
    <h2>Products</h2>
    <p>지금 바로 써 볼 수 있는 제품만 여기에 둡니다.</p>
  </div>
  <div class="grid">${products.map(productCard).join('')}</div>
</section>`;
  return layout('Products', '지금 실제로 써 볼 수 있는 JU 제품.', currentPath, body);
}

export function renderLabs({ labs, currentPath }) {
  const body = `<section>
  <div class="sectionHead">
    <h2>Labs</h2>
    <p>완제품으로 가장하지 않는 연구·실험 공간. 아직 제품으로 출시하지 않았습니다.</p>
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
  const body = `<section>
  <div class="sectionHead">
    <h2>Skills</h2>
    <p>Agent에게 새로운 능력을 붙여요.</p>
  </div>
  ${
    skills.length
      ? `<div class="grid">${skills.map(skillCard).join('')}</div>`
      : `<div class="empty">
  <div class="mark">S</div>
  <p>첫 스킬이 준비되면 여기에 표시됩니다.</p>
</div>`
  }
</section>`;
  return layout('Skills', 'Agent에게 새로운 능력을 붙여요.', currentPath, body);
}

/** Radar — contract §9: exactly one discovery card, one CTA. */
export function renderRadar({ radar, currentPath }) {
  const r = radar[0];
  const action = r ? getPrimaryAction(r) : null;

  const body = `<section>
  <div class="sectionHead">
    <h2>Radar</h2>
    <p>JU가 발견하고 검증하는 새로운 AI / Agent / 개발도구</p>
  </div>
  <article class="card" style="min-height:auto">
    <div class="top">
      <div class="appicon" aria-hidden="true">R</div>
      <span class="status">MEDIA</span>
    </div>
    <h3>JU Radar</h3>
    <p class="tagline">새로운 AI 도구를 찾는 곳.</p>
    <div class="actions">
      ${
        action?.resolved
          ? `<a class="btn cta" href="${esc(action.href)}" rel="noopener" data-cta data-slug="${esc(r.slug)}" data-verb="${esc(action.verb)}">Open Radar</a>`
          : '<span class="btn is-disabled" aria-disabled="true">Open Radar</span>'
      }
    </div>
  </article>
</section>`;
  return layout('Radar', '새로운 AI 도구 찾기.', currentPath, body);
}

/** 404 — non-indexable, no canonical. */
export function renderNotFound({ currentPath }) {
  const body = `<section>
  <div class="sectionHead"><h2>찾을 수 없는 페이지입니다</h2></div>
  <p style="color:var(--muted);margin:0 0 20px">주소가 바뀌었거나 아직 공개되지 않은 페이지일 수 있습니다.</p>
  <a class="btn cta" href="/">홈으로 가기</a>
</section>`;
  return layout('페이지를 찾을 수 없습니다', '', currentPath, body, { indexable: false });
}
