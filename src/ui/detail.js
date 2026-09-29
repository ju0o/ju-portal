import { getPrimaryAction } from '../registry/action.ts';
import { esc } from '../lib/dom.js';
import { mediaFrame, primaryAction, commandBlock, sourceLink, breadcrumb, layout } from './components.js';

function section(id, step, title, body) {
  return `<section class="section" id="${id}" aria-labelledby="${id}-h">
  <h2 class="subtitle" id="${id}-h"><span style="color:var(--accent);margin-right:.5rem">${step}.</span>${esc(title)}</h2>
  ${body}
</section>`;
}

function ticks(items) {
  if (!items.length) return '';
  return `<ul class="ticks">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

/**
 * Product detail. Order is fixed by the contract:
 * 1 overview media  2 what you can do  3 actual product  4 use cases
 * 5 usage steps  6 primary CTA  7 Source (secondary)
 */
export function renderProductDetail(entry, { releases, currentPath }) {
  const action = getPrimaryAction(entry);
  const others = (releases ?? []).filter((r) => r !== action.href);

  const body = `<div class="wrap stack-xl" style="padding-block:2.5rem 4rem">
  ${breadcrumb('/products/', 'Products')}

  <header class="stack measure" style="gap:1rem">
    <div class="actions">
      <span class="chip ${action.resolved ? 'chip-accent' : 'chip-warn'}">${action.resolved ? '사용 가능' : 'Beta'}</span>
      ${(action.version ?? entry.releases?.[0]?.version ?? '').length ? `<span class="chip">v${esc(action.version ?? entry.releases?.[0]?.version)}</span>` : ''}
    </div>
    <h1 class="display">${esc(entry.title)}</h1>
    <p class="muted" style="margin:0;font-size:1.125rem">${esc(entry.summary)}</p>
    ${entry.unavailableReason ? `<p class="note note-warn" style="margin:0">${esc(entry.unavailableReason)}</p>` : ''}
  </header>

  ${section('overview', 1, '한눈에 보기', `<div class="measure-wide">${mediaFrame(entry, { controls: true })}</div>`)}

  ${section('what', 2, '이걸로 무엇을 할 수 있나요', `<div class="measure">${ticks(capabilities(entry))}</div>`)}

  ${section(
    'example',
    3,
    '실제로 써보기',
    `<div class="measure stack">
    <p class="muted" style="margin:0">${esc(
      action.resolved && action.verb === 'Try'
        ? '설치 없이 브라우저에서 바로 열어볼 수 있습니다.'
        : '설치하거나 실행해 볼 수 있습니다.',
    )}</p>
    <div class="actions">${primaryAction(entry)}</div>
  </div>`,
  )}

  ${section('use-cases', 4, '이런 때 씁니다', `<div class="measure">${ticks(useCases(entry))}</div>`)}

  ${section(
    'how-to',
    5,
    '사용법',
    `<ol class="steps measure">${howTo(entry, action)
      .map((s) => `<li>${esc(s)}</li>`)
      .join('')}</ol>`,
  )}

  ${section(
    'install',
    6,
    '지금 써보기',
    `<div class="measure stack">
    <div class="actions">${primaryAction(entry)}</div>
    ${commandBlock(action)}
    ${
      others.length
        ? `<div class="stack" style="gap:.5rem">
      <p class="tiny" style="margin:0">다른 방법</p>
      <div class="actions">
        ${others
          .map(
            (href) =>
              `<a class="btn btn-secondary btn-sm" href="${esc(href)}" rel="noopener">다른 다운로드 보기</a>`,
          )
          .join('')}
      </div>
    </div>`
        : ''
    }
  </div>`,
  )}

  ${section('source', 7, '소스', `<div class="measure">${sourceLink(entry) || '<p class="tiny" style="margin:0">공개된 소스가 없습니다.</p>'}</div>`)}
</div>`;

  return layout(entry.title, entry.summary, currentPath, body);
}

/**
 * "What can I do?" - capabilities derived from what the product actually is.
 * Derived from the Registry (summary + declared release platforms) so no copy
 * is invented here.
 */
function capabilities(entry) {
  const out = [entry.summary];
  for (const r of entry.releases ?? []) {
    if (r.platforms?.includes('web')) out.push('설치 없이 브라우저에서 바로 열어봅니다.');
    if (r.platforms?.includes('node')) out.push('명령 한 줄로 설치해 바로 실행합니다.');
  }
  if (r_hasWindows(entry)) out.push('Windows에서 설치해 직접 실행합니다.');
  return [...new Set(out)];
}

function r_hasWindows(entry) {
  return (entry.releases ?? []).some((r) => r.platforms?.includes('windows'));
}

/** "When would I use this?" - situational, so it must not repeat section 2. */
function useCases(entry) {
  const out = [];
  for (const r of entry.releases ?? []) {
    if (r.platforms?.includes('web')) out.push('설치가 귀찮거나 컴퓨터 설정을 만지기 귀찮을 때');
    if (r.platforms?.includes('node')) out.push('터미널에서 한 줄로 설치해 바로 쓰고 싶을 때');
    if (r.platforms?.includes('windows')) out.push('Windows 앱이 필요할 때');
  }
  if (out.length === 0) out.push('사용 가능한 버전이 준비되면 안내합니다.');
  return [...new Set(out)];
}

function howTo(entry, action) {
  if (!action.resolved) {
    return ['아직 실행할 수 있는 버전이 없습니다.', '준비되면 이 자리에 설치 방법이 나타납니다.'];
  }
  if (action.verb === 'Try') {
    return [
      '아래 버튼을 눌러 브라우저에서 엽니다. 설치가 필요 없습니다.',
      '마음에 들면 같은 페이지 아래의 다른 다운로드를 확인하세요.',
    ];
  }
  if (action.command) {
    return [
      '아래 명령을 복사해 터미널에 붙여 넣습니다.',
      '설치가 끝나면 같은 이름으로 실행합니다.',
    ];
  }
  return [
    '아래 버튼을 눌러 파일을 내려받습니다.',
    '받은 파일을 실행합니다.',
  ];
}

/** Skill detail. */
export function renderSkillDetail(entry, { currentPath }) {
  const action = getPrimaryAction(entry);

  const body = `<div class="wrap stack-xl" style="padding-block:2.5rem 4rem">
  ${breadcrumb('/skills/', 'Skills')}

  <header class="stack measure" style="gap:1rem">
    <div class="actions">
      <span class="chip chip-accent">v${esc(entry.version)}</span>
      ${(entry.compatibleAgents ?? []).map((a) => `<span class="chip">${esc(a)}</span>`).join('')}
    </div>
    <h1 class="display">${esc(entry.title)}</h1>
    <p class="muted" style="margin:0;font-size:1.125rem">${esc(entry.summary)}</p>
  </header>

  ${section('overview', 1, '한눈에 보기', `<div class="measure-wide">${mediaFrame(entry, { controls: true })}</div>`)}

  ${section('compatible', 2, '어떤 Agent에서 쓰나요', `<div class="measure actions">${(entry.compatibleAgents ?? []).map((a) => `<span class="chip">${esc(a)}</span>`).join('')}</div>`)}

  ${section(
    'install',
    3,
    '설치 방법',
    `<div class="measure stack">
    ${
      action.resolved
        ? `${commandBlock(action)}<div class="actions"><button class="btn btn-secondary btn-sm" type="button" data-copy="${esc(action.command ?? '')}" data-label="명령 복사">명령 복사</button></div>`
        : '<div class="note">설치 방법을 정리 중입니다. 준비되면 이 자리에 나타납니다.</div>'
    }
  </div>`,
  )}

  ${section('source', 4, '소스', `<div class="measure">${sourceLink(entry) || '<p class="tiny" style="margin:0">공개된 소스가 없습니다.</p>'}</div>`)}
</div>`;

  return layout(entry.title, entry.summary, currentPath, body);
}
