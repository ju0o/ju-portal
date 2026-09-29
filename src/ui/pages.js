import { getPrimaryAction } from '../registry/action.ts';
import { esc } from '../lib/dom.js';
import { mediaFrame, primaryAction, layout } from './components.js';

/** Home leads with intent, not a wall of product names. */
export function renderHome({ products, skills, labs, currentPath }) {
  const intents = products
    .map(
      (p) => `<a class="card" href="/products/${esc(p.slug)}/">
  ${mediaFrame(p, { flat: true })}
  <div class="card-body">
    <p style="margin:0;font-size:1.0625rem;font-weight:700;line-height:1.4">${esc(p.summary)}</p>
    <p style="margin:0;font-size:.875rem;color:var(--accent);font-weight:600">&rarr; ${esc(p.title)}</p>
  </div>
</a>`,
    )
    .join('');

  const skillCards = skills.length
    ? skills
        .map(
          (s) => `<a class="card" href="/skills/${esc(s.slug)}/">
  <div class="card-body">
    <h3>${esc(s.title)}</h3>
    <p>${esc(s.summary)}</p>
  </div>
</a>`,
        )
        .join('')
    : '';

  const body = `<div class="wrap stack-xl" style="padding-block:3rem 4rem">
  <section class="stack" style="gap:1.5rem">
    <p class="eyebrow" style="margin:0">JU</p>
    <h1 class="display">하고 싶은 일이 먼저입니다. 그걸 도와줄 도구를 고르세요.</h1>
    <p class="measure muted" style="margin:0;font-size:1.125rem">GitHub나 터미널 이름을 몰라도 됩니다. 지금 하고 싶은 말을 그대로 골라보세요. 영상으로 먼저 보고, 실제로 눌러본 다음, 설치하면 됩니다.</p>
  </section>

  <section class="section" aria-labelledby="intent">
    <h2 class="title" id="intent">지금 이런 상황이라면</h2>
    <div class="grid grid-3">
      ${intents}
      <a class="card" href="/skills/" style="justify-content:center">
        <div class="card-body">
          <p style="margin:0;font-size:1.0625rem;font-weight:700;line-height:1.4">Agent에게 새로운 능력을 넣고 싶어요</p>
          <p style="margin:0">파일 하나로 붙입니다.</p>
          <p style="margin:0;font-size:.875rem;color:var(--accent);font-weight:600">&rarr; Skills</p>
        </div>
      </a>
      <a class="card" href="/radar/" style="justify-content:center">
        <div class="card-body">
          <p style="margin:0;font-size:1.0625rem;font-weight:700;line-height:1.4">새 AI 도구를 찾고 싶어요</p>
          <p style="margin:0">JU가 보고 있는 것을 봅니다.</p>
          <p style="margin:0;font-size:.875rem;color:var(--accent);font-weight:600">&rarr; Radar</p>
        </div>
      </a>
    </div>
  </section>

  <section class="section" aria-labelledby="products">
    <h2 class="title" id="products">Products</h2>
    <p class="measure muted" style="margin:0">지금 실제로 써 볼 수 있는 제품만 둡니다.</p>
    <div class="grid grid-3">
      ${products
        .map(
          (p) => `<a class="card" href="/products/${esc(p.slug)}/">
  ${mediaFrame(p, { flat: true })}
  <div class="card-body">
    <h3>${esc(p.title)}</h3>
    <p>${esc(p.summary)}</p>
  </div>
</a>`,
        )
        .join('')}
    </div>
  </section>

  ${
    skills.length
      ? `<section class="section" aria-labelledby="skills">
  <h2 class="title" id="skills">Skills</h2>
  <div class="grid grid-3">${skillCards}</div>
</section>`
      : ''
  }

  ${
    labs.length
      ? `<section class="section" aria-labelledby="labs">
  <h2 class="title" id="labs">만드는 중</h2>
  <p class="measure muted" style="margin:0">아직 실행해 볼 수 없는 제품입니다. 그래서 Products에 넣지 않았습니다.</p>
  <div class="actions">
    ${labs
      .map(
        (l) =>
          `<a class="btn btn-ghost btn-sm" href="/labs/#${esc(l.slug)}">${esc(l.title)}</a>`,
      )
      .join('')}
  </div>
</section>`
      : ''
  }
</div>`;

  return layout(
    'JU — AI 도구를 처음 보는 사람에게',
    '바이브코딩 입문자와 비개발자를 위한 JU 제품 showcase.',
    currentPath,
    body,
  );
}

/** Products catalog: only entries whose primary action resolves. */
export function renderProducts({ products, currentPath }) {
  const cards = products
    .map((p) => {
      const action = getPrimaryAction(p);
      const cta = primaryAction(p, { size: 'sm' });
      return `<article class="card">
  <a class="card-media" href="/products/${esc(p.slug)}/" aria-label="${esc(p.title)} 자세히 보기">${mediaFrame(p, { flat: true })}</a>
  <div class="card-body">
    <span class="chip ${action.resolved ? 'chip-accent' : 'chip-warn'}">${action.resolved ? '사용 가능' : 'Beta'}</span>
    <h3><a class="card-title-link" href="/products/${esc(p.slug)}/">${esc(p.title)}</a></h3>
    <p>${esc(p.summary)}</p>
    <div class="actions" style="margin-top:auto">${cta}<a class="btn btn-ghost btn-sm" href="/products/${esc(p.slug)}/">자세히</a></div>
  </div>
</article>`;
    })
    .join('');

  const body = `<div class="wrap stack-xl" style="padding-block:3rem 4rem">
  <header class="stack" style="gap:1rem">
    <h1 class="display">Products</h1>
    <p class="measure muted" style="margin:0;font-size:1.125rem">지금 바로 써 볼 수 있는 제품만 여기에 둡니다.</p>
  </header>
  <section class="section" aria-labelledby="ready">
    <h2 class="subtitle" id="ready">지금 써 볼 수 있어요</h2>
    <div class="grid grid-3">${cards}</div>
  </section>
</div>`;

  return layout('Products', '지금 실제로 써 볼 수 있는 JU 제품.', currentPath, body);
}

/** Labs: real work, deliberately no CTA. */
export function renderLabs({ labs, currentPath }) {
  const cards = labs
    .map(
      (l) => `<article class="card" id="${esc(l.slug)}">
  <div class="card-body">
    <span class="chip chip-warn">${l.status === 'beta' ? 'Beta' : '예정'}</span>
    <h3>${esc(l.title)}</h3>
    <p>${esc(l.summary)}</p>
    ${
      l.unavailableReason
        ? `<p class="tiny" style="margin:0">${esc(l.unavailableReason)}</p>`
        : ''
    }
    ${
      l.source?.url
        ? `<div class="actions"><a class="btn btn-ghost btn-sm" href="${esc(l.source.url)}" rel="noopener">Source &#8599;</a></div>`
        : ''
    }
  </div>
</article>`,
    )
    .join('');

  const body = `<div class="wrap stack-xl" style="padding-block:3rem 4rem">
  <header class="stack" style="gap:1rem">
    <span class="chip chip-warn" style="width:fit-content">Beta &middot; Coming soon</span>
    <h1 class="display">Labs</h1>
    <p class="measure muted" style="margin:0;font-size:1.125rem">만들고 있지만 아직 실행해 볼 수 없는 제품입니다. 실제로 써 볼 수 있게 되면 Products로 옮겨갑니다.</p>
  </header>
  <section class="section"><div class="grid grid-3">${cards}</div></section>
</div>`;

  return layout('Labs', '만들고 있지만 아직 실행해 볼 수 없는 제품들.', currentPath, body);
}

/** Skills: curated library. Empty at V0 by design, and it says so. */
export function renderSkills({ skills, currentPath }) {
  const cards = skills.length
    ? skills
        .map(
          (s) => `<a class="card" href="/skills/${esc(s.slug)}/">
  <div class="card-body">
    <h3>${esc(s.title)}</h3>
    <p>${esc(s.summary)}</p>
    <div class="actions"><span class="chip">v${esc(s.version)}</span></div>
  </div>
</a>`,
        )
        .join('')
    : '';

  const body = `<div class="wrap stack-xl" style="padding-block:3rem 4rem">
  <header class="stack" style="gap:1rem">
    <h1 class="display">Skills</h1>
    <p class="measure muted" style="margin:0;font-size:1.125rem">Agent에게 능력을 하나씩 붙이는 방법입니다.</p>
  </header>
  ${
    skills.length
      ? `<section class="section"><div class="grid grid-3">${cards}</div></section>`
      : `<div class="note measure-wide">아직 등록된 스킬이 없습니다. 첫 스킬이 준비되면 여기에 표시됩니다.</div>`
  }
</div>`;

  return layout('Skills', 'Agent에게 능력을 하나씩 붙이는 방법.', currentPath, body);
}

/**
 * 404. Non-indexable by design: it declares no canonical and no og:url, and
 * carries robots noindex so an error page is never presented as canonical.
 */
export function renderNotFound({ currentPath }) {
  const body = `<div class="wrap stack" style="padding-block:5rem;max-width:36rem">
  <h1 class="title">찾을 수 없는 페이지입니다</h1>
  <p class="muted" style="margin:0">주소가 바뀌었거나 아직 공개되지 않은 페이지일 수 있습니다.</p>
  <div><a class="btn" href="/">홈으로 가기</a></div>
</div>`;
  return layout('페이지를 찾을 수 없습니다', '', currentPath, body, { indexable: false });
}

/** Radar: thin link-out surface. Origin comes from RADAR_ORIGIN via the resolver. */
export function renderRadar({ radar, currentPath }) {
  const cards = radar
    .map((r) => {
      const action = getPrimaryAction(r);
      return `<article class="card">
  <div class="card-body">
    <h3>${esc(r.title)}</h3>
    <p>${esc(r.summary)}</p>
    ${
      action.resolved
        ? `<div class="actions"><a class="btn btn-sm" href="${esc(action.href)}" rel="noopener" data-cta data-slug="${esc(r.slug)}" data-verb="${esc(action.verb)}" data-provider="${esc(action.provider ?? '')}">JU Radar 열기</a></div>`
        : `<span class="btn btn-disabled btn-sm" aria-disabled="true">Coming soon</span><p class="tiny" style="margin:0">${esc(action.reason ?? '')}</p>`
    }
  </div>
</article>`;
    })
    .join('');

  const body = `<div class="wrap stack-xl" style="padding-block:3rem 4rem">
  <header class="stack" style="gap:1rem">
    <h1 class="display">Radar</h1>
    <p class="measure muted" style="margin:0;font-size:1.125rem">JU가 보고 있는 것을 미리 보여주는 공간입니다.</p>
  </header>
  <section class="section"><div class="grid grid-2">${cards}</div></section>
</div>`;

  return layout('Radar', 'JU Radar.', currentPath, body);
}
