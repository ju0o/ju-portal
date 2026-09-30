import { getPrimaryAction } from '../registry/action.ts';
import { esc } from '../lib/dom.js';
import {
  mediaFrame,
  primaryAction,
  commandBlock,
  sourceLink,
  breadcrumb,
  layout,
} from './components.js';

function ticks(items) {
  if (!items.length) return '';
  return `<ul class="ticks">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function platformTags(entry) {
  const platforms = (entry.releases ?? []).flatMap((r) => r.platforms ?? []);
  const map = { web: '웹', windows: 'Windows', node: '터미널', macos: 'macOS', linux: 'Linux' };
  return [...new Set(platforms.map((p) => map[p] ?? p))];
}

/**
 * Product detail — DESIGN CONTRACT v1 §6.
 *
 * Order: identity + one line -> real media -> primary CTA -> what it does ->
 * examples -> simple usage/install -> Source (secondary).
 *
 * Deliberately NOT the old numbered "1. 한눈에 보기" rhythm: that read as
 * documentation. The two-column 1.2fr/0.8fr showroom shell is shared by the
 * desktop overlay and this deep route, so the real URL is never traded away.
 */
export function showroom(entry, { releases = [] } = {}) {
  const action = getPrimaryAction(entry);
  const others = (releases ?? []).filter((r) => r !== action.href);
  const tags = [...platformTags(entry), action.version].filter(Boolean);

  return `<div class="heroProduct">
    <div class="info">
      <div class="detailSection" style="margin-top:0">
        <h2>이걸로 무엇을 할 수 있나요</h2>
        ${ticks(capabilities(entry))}
      </div>
      ${
        tags.length
          ? `<div class="meta" style="margin-top:18px">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>`
          : ''
      }
      ${action.command ? `<div class="detailSection"><h2>설치</h2>${commandBlock(action)}</div>` : ''}
      <div class="actions">
        ${primaryAction(entry)}
        ${sourceLink(entry)}
      </div>
      ${
        others.length
          ? `<div class="detailSection">
        <h2>다른 방법</h2>
        <div class="actions">
          ${others.map((href) => `<a class="btn" href="${esc(href)}" rel="noopener">내려받기 &#8599;</a>`).join('')}
        </div>
      </div>`
          : ''
      }
    </div>

    <div class="demo">
      <div class="detailSection" style="margin-top:0">
        <h2>실제 화면</h2>
      </div>
      ${mediaFrame(entry, { controls: true })}
    </div>
  </div>`;
}

/** Identity block. Shared heading for the route page and the overlay. */
function identity(entry) {
  return `<div>
      <span class="eyebrow">JU PRODUCT</span>
      <h1>${esc(entry.title)}</h1>
      <p class="tagline">${esc(entry.summary)}</p>
    </div>`;
}

export function renderProductDetail(entry, { releases, currentPath }) {
  const action = getPrimaryAction(entry);

  const body = `<section>
  ${breadcrumb('/products/', 'Products')}

  <div class="detailHead">
    ${identity(entry)}
  </div>

  ${showroom(entry, { releases })}

  ${
    entry.unavailableReason
      ? `<div class="note is-warn" style="margin-top:22px">${esc(entry.unavailableReason)}</div>`
      : ''
  }

  <div class="detailSection">
    <h2>이런 때 써요</h2>
    ${ticks(useCases(entry))}
  </div>

  <div class="detailSection">
    <h2>사용법</h2>
    <ol class="steps">${howTo(entry, action)
      .map((s) => `<li>${esc(s)}</li>`)
      .join('')}</ol>
  </div>
</section>`;

  return layout(entry.title, entry.summary, currentPath, body);
}

/**
 * Desktop showroom overlay (P0-6, contract §6).
 *
 * A real accessible dialog, not a visual fake: role=dialog, aria-modal, a
 * labelled title, a >=44px close control, Escape and backdrop dismissal, and
 * focus that moves in on open and returns to the originating control on close.
 * Background interaction is blocked by the backdrop plus a body scroll lock.
 *
 * The content is the SAME showroom() block the deep route renders, so the
 * visual language is identical in both contexts and there is no second design.
 * The deep route is always reachable: a visible "자세히 보기" link sits in the
 * dialog, and a card opened via keyboard or middle-click keeps its real href.
 */
export function renderOverlay(entry, { releases = [] } = {}) {
  const id = `ov-${entry.slug}`;
  return `<div class="overlay" id="${id}" data-overlay="${esc(entry.slug)}" hidden>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
    <div class="modalHead">
      <div>
        <span class="eyebrow">JU PRODUCT</span>
        <h1 id="${id}-title">${esc(entry.title)}</h1>
        <p class="tagline">${esc(entry.summary)}</p>
      </div>
      <button class="close" type="button" data-overlay-close aria-label="${esc(entry.title)} 닫기">&times;</button>
    </div>
    ${showroom(entry, { releases })}
    <div class="detailSection">
      <a class="btn" href="/products/${esc(entry.slug)}/">자세히 보기</a>
    </div>
  </div>
</div>`;
}

/** Capabilities derived from the Registry, so no copy is invented here. */
function capabilities(entry) {
  const out = [];
  for (const r of entry.releases ?? []) {
    if (r.platforms?.includes('web')) out.push('설치 없이 브라우저에서 바로 열어봅니다.');
    if (r.platforms?.includes('node')) out.push('명령 한 줄로 설치해 바로 실행합니다.');
  }
  if ((entry.releases ?? []).some((r) => r.platforms?.includes('windows'))) {
    out.push('Windows에서 설치해 직접 실행합니다.');
  }
  if (out.length === 0) out.push('아직 사용할 수 있는 버전이 준비되지 않았습니다.');
  return [...new Set(out)];
}

/** Situational, so it must not repeat "what it does". */
function useCases(entry) {
  const out = [];
  for (const r of entry.releases ?? []) {
    if (r.platforms?.includes('web')) out.push('설치가 귀찮을 때');
    if (r.platforms?.includes('node')) out.push('터미널에서 한 줄로 시작하고 싶을 때');
    if (r.platforms?.includes('windows')) out.push('Windows 앱이 필요할 때');
  }
  if (out.length === 0) out.push('사용 가능한 버전이 준비되면 알려드릴게요.');
  return [...new Set(out)];
}

function howTo(entry, action) {
  if (!action.resolved) {
    return ['아직 실행해 볼 수 있는 버전이 없습니다.', '준비되면 이 자리에 방법이 나타납니다.'];
  }
  if (action.verb === 'Try') {
    return [
      '아래 버튼을 눌러 브라우저에서 엽니다. 설치가 필요 없습니다.',
      '바로 화면을 눌러보세요.',
    ];
  }
  if (action.command) {
    return ['아래 명령을 복사합니다.', '터미널에 붙여 넣고 실행합니다.'];
  }
  return ['아래 버튼을 눌러 내려받습니다.', '받은 파일을 실행합니다.'];
}

/** Skill detail — same visual system (contract §10). */
export function renderSkillDetail(entry, { currentPath }) {
  const action = getPrimaryAction(entry);

  const body = `<section>
  ${breadcrumb('/skills/', 'Skills')}

  <div class="detailHead">
    <div>
      <span class="eyebrow">JU SKILL</span>
      <h1>${esc(entry.title)}</h1>
      <p class="tagline">${esc(entry.summary)}</p>
    </div>
  </div>

  <div class="detailSection" style="margin-top:22px">
    <h2>이 Skill이 하는 일</h2>
    ${ticks(entry.whatItDoes ?? [])}
  </div>

  <div class="detailSection">
    <h2>어떤 Agent에서 쓰나요</h2>
    <div class="meta">${(entry.compatibleAgents ?? []).map((a) => `<span class="tag">${esc(a)}</span>`).join('')}</div>
  </div>

  <div class="detailSection">
    <h2>설치</h2>
    ${
      action.resolved && action.command
        ? commandBlock(action)
        : '<div class="note">설치 방법을 정리 중입니다.</div>'
    }
  </div>

  <div class="detailSection">
    <h2>Source</h2>
    ${sourceLink(entry) || '<p style="color:var(--muted);margin:0">공개된 소스가 없습니다.</p>'}
  </div>
</section>`;

  return layout(entry.title, entry.summary, currentPath, body);
}
