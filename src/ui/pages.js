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

/** Hero: founder dot texture on the right, intent and actions on the left. */
function hero() {
  return `<section class="hero" data-section="top">
  <div class="hero-copy">
    <p class="label">JU · HUMAN × AI × TOOLS</p>
    <h1 class="display hero-title">
      <span>비개발자의 생각이 말이 되고,</span>
      <span>말이 AI의 작업이 되고,</span>
      <span>그 결과가 다시 사람이 이해할 수 있는</span>
      <span><em>도구가 됩니다.</em></span>
    </h1>
    <p class="hero-sub">생각이 흐르면, AI가 움직입니다.<br>하나씩 나타나고, 점점 형태가 됩니다.</p>
    <div class="hero-actions">
      <a class="btn cta" href="/products/">JU 제품 시작하기 <span aria-hidden="true">→</span></a>
      <a class="btn" href="/skills/">Skills 보기</a>
    </div>
  </div>
  <div class="hero-signal" aria-hidden="true">
    <div class="signal-field"><div class="portrait-dots" data-founder-dots></div></div>
    <div class="signal-word">JU</div>
    <span class="signal-node signal-node-a"></span>
    <span class="signal-node signal-node-b"></span>
    <span class="signal-node signal-node-c"></span>
  </div>
</section>`;
}

/**
 * Notification CTA. There is NO subscription backend at V0, so nothing is
 * collected and nothing is discarded: the state is stated honestly instead of
 * shipping an input that silently throws an address away.
 */
function notifyBand() {
  return `<section class="band" data-section="notify">
  <div class="band-head"><h2 class="title">지금, JU의 다음 소식을<br>가장 먼저 받아보세요.</h2></div>
  <p class="muted" style="margin:0;max-width:46rem">새로운 기능, 제품 업데이트, 그리고 더 큰 가능성에 대한 소식을 전해드립니다.</p>
  <p class="label" style="margin-top:8px">알림 기능 준비 중</p>
  <p class="muted" style="margin:0;max-width:46rem;font-size:14px">구독을 받는 서버가 아직 없습니다. 준비되면 이곳에서 이메일을 받고 소식을 전해드리겠습니다.</p>
</section>`;
}

export function renderHome({ products, skills, labs, currentPath, overlays = '' }) {
  const body = `${hero()}

<section class="band" id="products" data-section="products">
  <div class="band-head">
    <div class="band-index"><span class="band-num">01</span></div>
    <div>
      <h2 class="title">지금 실제로 써 볼 수 있는 제품</h2>
      <p>설치하지 않고 바로 열어보거나, 명령 한 줄로 시작하는 도구.</p>
    </div>
  </div>
  <div class="grid grid-3">${products.map(productTile).join('')}</div>
</section>

${
  skills.length
    ? `<section class="band" id="skills" data-section="skills">
  <div class="band-head">
    <div class="band-index"><span class="band-num">02</span></div>
    <div>
      <h2 class="title">Skills</h2>
      <p>Agent에게 새로운 능력을 붙여요.</p>
    </div>
  </div>
  <div class="grid grid-3">${skills.map(skillTile).join('')}</div>
</section>`
    : ''
}

${
  labs.length
    ? `<section class="band" id="labs" data-section="labs">
  <div class="band-head">
    <div class="band-index"><span class="band-num">${skills.length ? '03' : '02'}</span></div>
    <div>
      <h2 class="title">Labs</h2>
      <p>완제품으로 가장하지 않는 연구·실험 공간.</p>
    </div>
  </div>
  ${labs.map(labRow).join('')}
</section>`
    : ''
}

${notifyBand()}`;

  return layout(
    'JU — 필요한 도구를 찾고, 바로 써보세요',
    '바이브코딩 입문자와 비개발자를 위한 JU 공식 제품 포털.',
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
