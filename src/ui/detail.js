import { getPrimaryAction } from '../registry/action.ts';
import { esc } from '../lib/dom.js';
import { mediaFrame, primaryAction, commandBlock, sourceLink, breadcrumb, showroom, ticks, layout } from './components.js';

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
    return ['아래 버튼을 눌러 브라우저에서 엽니다. 설치가 필요 없습니다.', '바로 화면을 눌러보세요.'];
  }
  if (action.command) {
    return ['아래 명령을 복사합니다.', '터미널에 붙여 넣고 실행합니다.'];
  }
  return ['아래 버튼을 눌러 내려받습니다.', '받은 파일을 실행합니다.'];
}

/**
 * Product detail — JU Brand System V1, Registry-driven.
 *
 * The showroom block is imported from components.js and is the SAME markup the
 * desktop overlay embeds, so there is one visual design and the real deep
 * route is never traded for a modal.
 */
export function renderProductDetail(entry, { releases, currentPath }) {
  const action = getPrimaryAction(entry);

  const body = `<section class="band" data-section="products">
  ${breadcrumb('/products/', 'Products')}

  <div class="detail-head">
    <div>
      <span class="label">JU PRODUCT</span>
      <h1 class="detail-title">${esc(entry.title)}</h1>
      <p class="detail-tagline">${esc(entry.summary)}</p>
    </div>
  </div>

  ${showroom(entry, { releases: releases ?? [] })}

  ${
    entry.unavailableReason
      ? `<div class="note is-warn" style="margin-top:22px">${esc(entry.unavailableReason)}</div>`
      : ''
  }

  <div class="detail-section">
    <h2>이런 때 써요</h2>
    ${ticks(useCases(entry))}
  </div>

  <div class="detail-section">
    <h2>사용법</h2>
    <ol class="steps">${howTo(entry, action)
      .map((s) => `<li>${esc(s)}</li>`)
      .join('')}</ol>
  </div>
</section>`;

  return layout(entry.title, entry.summary, currentPath, body);
}

/** Skill detail — same visual system, honest when empty. */
export function renderSkillDetail(entry, { currentPath }) {
  const action = getPrimaryAction(entry);

  const body = `<section class="band" data-section="skills">
  ${breadcrumb('/skills/', 'Skills')}

  <div class="detail-head">
    <div>
      <span class="label">JU SKILL</span>
      <h1 class="detail-title">${esc(entry.title)}</h1>
      <p class="detail-tagline">${esc(entry.summary)}</p>
    </div>
  </div>

  <div class="detail-section" style="margin-top:26px">
    <h2>이 Skill이 하는 일</h2>
    ${ticks(entry.whatItDoes ?? [])}
  </div>

  <div class="detail-section">
    <h2>어떤 Agent에서 쓰나요</h2>
    <div class="actions" style="gap:6px">${(entry.compatibleAgents ?? []).map((a) => `<span class="chip">${esc(a)}</span>`).join('')}</div>
  </div>

  <div class="detail-section">
    <h2>설치</h2>
    ${
      action.resolved && action.command
        ? commandBlock(action)
        : '<div class="note">설치 방법을 정리 중입니다.</div>'
    }
  </div>

  <div class="detail-section">
    <h2>Source</h2>
    ${sourceLink(entry) || '<p class="muted" style="margin:0">공개된 소스가 없습니다.</p>'}
  </div>
</section>`;

  return layout(entry.title, entry.summary, currentPath, body);
}

export { mediaFrame, primaryAction };
