/**
 * Shared render helpers — JU Portal on JU Brand System V1.
 *
 * Action rendering is the ONLY place that consumes getPrimaryAction().
 * Components never branch on `action.provider`, and no provider name is ever
 * rendered — the user sees the verb only.
 *
 * The Infra resolver (src/registry/action.ts) and the Registry
 * (content/*) remain authoritative for product truth. This module only
 * decides presentation.
 */

import { getPrimaryAction } from '../registry/action.ts';
import { resolveMediaUrl, canonicalUrl, esc } from '../lib/dom.js';

/* Production IA. The prototype's JOIN rail was brand exploration only; the
   real Portal keeps every section. */
const NAV = [
  { href: '/', label: 'HOME', section: 'top' },
  { href: '/products/', label: 'PRODUCTS', section: 'products' },
  { href: '/skills/', label: 'SKILLS', section: 'skills' },
  { href: '/labs/', label: 'LABS', section: 'labs' },
  { href: '/radar/', label: 'RADAR', section: 'radar' },
];

/** The canonical JU Signal Dot Mark — the parent grammar for every Ju product. */
const SIGNAL_MARK = `<svg viewBox="0 0 240 160" role="img" aria-label="JU Signal Dot Mark">
      <g fill="currentColor">
        <circle cx="34" cy="34" r="6"/><circle cx="54" cy="34" r="6"/><circle cx="74" cy="34" r="6"/><circle cx="94" cy="34" r="6"/>
        <circle cx="94" cy="54" r="6"/><circle cx="94" cy="74" r="6"/><circle cx="94" cy="94" r="6"/>
        <circle cx="34" cy="114" r="6"/><circle cx="54" cy="124" r="6"/><circle cx="74" cy="124" r="6"/><circle cx="94" cy="114" r="6"/>
        <circle cx="126" cy="34" r="6"/><circle cx="126" cy="54" r="6"/><circle cx="126" cy="74" r="6"/><circle cx="126" cy="94" r="6"/>
        <circle cx="166" cy="114" r="6"/><circle cx="146" cy="124" r="6"/><circle cx="126" cy="114" r="6"/>
        <circle cx="166" cy="34" r="6"/><circle cx="166" cy="54" r="6"/><circle cx="166" cy="74" r="6"/><circle cx="166" cy="94" r="6"/>
      </g>
      <circle cx="202" cy="80" r="11" fill="#D8FF4F"/>
    </svg>`;

/**
 * Product-specific motif on the shared Signal grammar. Family resemblance
 * without shipping one identical icon everywhere.
 */
const MOTIF = {
  juqode: `<g fill="none" stroke="#8DF6DC" stroke-width="4" stroke-linecap="square"><path d="M30 66 L14 78 L30 90"/><path d="M58 66 L74 78 L58 90"/></g>`,
  jutell: `<g stroke="#8DF6DC" stroke-width="4" stroke-linecap="square"><path d="M28 70 H68"/><path d="M28 86 H54"/></g>`,
};

export function signalIcon(slug) {
  return `<span class="tile-signal"><svg viewBox="0 0 240 160" aria-hidden="true">
    <g fill="currentColor">
      <circle cx="34" cy="34" r="6"/><circle cx="54" cy="34" r="6"/><circle cx="74" cy="34" r="6"/><circle cx="94" cy="34" r="6"/>
      <circle cx="94" cy="54" r="6"/><circle cx="94" cy="74" r="6"/><circle cx="94" cy="94" r="6"/>
      <circle cx="34" cy="114" r="6"/><circle cx="54" cy="124" r="6"/><circle cx="74" cy="124" r="6"/><circle cx="94" cy="114" r="6"/>
      <circle cx="126" cy="34" r="6"/><circle cx="126" cy="54" r="6"/><circle cx="126" cy="74" r="6"/><circle cx="126" cy="94" r="6"/>
      <circle cx="166" cy="114" r="6"/><circle cx="146" cy="124" r="6"/><circle cx="126" cy="114" r="6"/>
      <circle cx="166" cy="34" r="6"/><circle cx="166" cy="54" r="6"/><circle cx="166" cy="74" r="6"/><circle cx="166" cy="94" r="6"/>
    </g>
    <circle cx="202" cy="80" r="11" fill="#D8FF4F"/>
    ${MOTIF[slug] ?? ''}
  </svg></span>`;
}

export function layout(title, description, currentPath, body, { indexable = true, overlays = '' } = {}) {
  const isCurrent = (href) => currentPath === href || currentPath === href.slice(0, -1);

  // Canonical comes from Infra's canonicalOrigin() via canonicalUrl(); never from
  // the request host, so a Preview deployment can never become the canonical
  // origin. A non-indexable page (404) declares no canonical at all.
  const canonical = indexable ? canonicalUrl(currentPath) : '';
  const seo = indexable
    ? `<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="JU">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">`
    : '<meta name="robots" content="noindex, follow">';

  const links = NAV.map(
    (n) =>
      `<a class="rail-item" href="${n.href}" data-rail="${n.section}"${isCurrent(n.href) ? ' aria-current="page"' : ''}><span class="rail-num">${String(NAV.indexOf(n) + 1).padStart(2, '0')}</span><span class="rail-label">${n.label}</span></a>`,
  ).join('');

  const overlaysAttr = overlays ? ' data-has-overlay="true"' : '';

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${seo}
<link rel="stylesheet" href="/assets/portal.css">
</head>
<body${overlaysAttr}>
<a class="sr-only skip" href="#main">본문으로 건너뛰기</a>
<aside class="rail" aria-label="주요 메뉴">
  <a class="rail-mark" href="/" aria-label="JU 홈">${SIGNAL_MARK}</a>
  <nav class="rail-nav">${links}</nav>
  <div class="rail-progress" aria-hidden="true"><span class="rail-progress-fill" data-progress></span></div>
  <p class="rail-foot">HUMAN × AI × TOOLS</p>
</aside>
<div class="main">
<main id="main" class="page-main">
${body}
</main>
<footer class="foot">
  <span class="foot-mark">JU</span>
  <span>Products · Skills · Labs · Radar</span>
  <span>바이브코딩을 처음 만나는 사람을 위한 공식 제품 포털</span>
  <span class="foot-year">A MORE HUMAN WAY TO BUILD.</span>
</footer>
</div>
${overlays}
<script src="/assets/portal.js" defer></script>
</body>
</html>`;
}

/**
 * Media surface driven by the Registry. Never a broken <video> and never an
 * empty black void: real video, real poster, or a deliberate labelled
 * placeholder.
 */

/**
 * Poster siblings, injected by the render step.
 *
 * content/products/juqode.ts declares `pending: ['poster']` while
 * public/media/juqode/poster.v1.png now exists. The Registry is Infra-owned, so
 * the Builder discovers the real file on disk rather than editing it. Only files
 * that actually exist are mapped, and a media path literal never appears in
 * this source — the registry verifier rejects those.
 */
let POSTER_BY_VIDEO = {};

/** @internal render step only. */
export function setPosterMap(map) {
  POSTER_BY_VIDEO = map ?? {};
}

function siblingPoster(videoPath) {
  return POSTER_BY_VIDEO[videoPath] ?? null;
}

export function mediaFrame(entry, { controls = false, className = 'demoScreen' } = {}) {
  const media = entry.media;
  const alt = media?.overviewVideo?.alt ?? `${entry.title} 소개`;
  const poster = media?.poster?.path ?? (media?.overviewVideo?.path ? siblingPoster(media.overviewVideo.path) : null);
  const video = media?.overviewVideo?.path;

  if (video) {
    return `<div class="${className}">
  <video src="${esc(resolveMediaUrl(video))}"${poster ? ` poster="${esc(resolveMediaUrl(poster))}"` : ''}${controls ? ' controls' : ''} preload="none" playsinline muted></video>
</div>`;
  }
  if (poster) {
    return `<div class="${className}">
  <img src="${esc(resolveMediaUrl(poster))}" alt="${esc(alt)}" loading="lazy">
</div>`;
  }
  const pending = media?.pending?.includes('overviewVideo') ?? false;
  return `<div class="${className}">
  <div class="void">
    <span class="mark" aria-hidden="true">${esc(initials(entry.title))}</span>
    <span>${pending ? '소개 영상 준비 중' : '제품 화면 곧 공개'}</span>
    <small>실제 화면이 준비되면 여기에 표시됩니다</small>
  </div>
</div>`;
}

function initials(title) {
  return String(title ?? 'JU').replace(/^Ju/, '').slice(0, 2).toUpperCase();
}

/**
 * Primary CTA. Reads the Infra resolver; never renders a provider name and
 * never renders a link that does not resolve.
 */
export function primaryAction(entry, { cta = true, size = '' } = {}) {
  const action = getPrimaryAction(entry);
  const cls = `btn${cta ? ' cta' : ''}${size ? ' ' + size : ''}`;

  if (!action.resolved) {
    return `<span class="${cls} is-disabled" aria-disabled="true" title="${esc(action.reason ?? '아직 준비 중입니다.')}">앞으로 준비 중</span>`;
  }
  if (action.command) {
    return `<button class="${cls}" type="button" data-copy="${esc(action.command)}" data-label="${esc(ctaLabel(action))}">${esc(ctaLabel(action))}</button>`;
  }
  if (!action.href) {
    return `<span class="${cls} is-disabled" aria-disabled="true">앞으로 준비 중</span>`;
  }
  return `<a class="${cls}" href="${esc(action.href)}" rel="noopener" data-cta data-slug="${esc(entry.slug)}" data-verb="${esc(action.verb)}" data-provider="${esc(action.provider ?? '')}">${esc(ctaLabel(action))}</a>`;
}

/** Beginner register: the verb, never a provider name. */
function ctaLabel(action) {
  if (action.verb === 'Try') return '바로 써보기';
  if (action.verb === 'Install') return '설치하기';
  if (action.verb === 'Open') return '열어보기';
  return '내려받기';
}

export function commandBlock(action) {
  if (!action?.command) return '';
  return `<div class="installBox">
  <code>${esc(action.command)}</code>
  <button type="button" data-copy="${esc(action.command)}" data-label="복사됨">복사</button>
</div>`;
}

export function sourceLink(entry) {
  if (!entry.source?.url) return '';
  return `<a class="btn btn-sm" href="${esc(entry.source.url)}" rel="noopener">Source &#8599;</a>`;
}

export function breadcrumb(href, label) {
  return `<a class="crumb" href="${href}">&#8592; ${esc(label)}</a>`;
}

/**
 * Desktop showroom overlay. The content is the SAME showroom block the deep
 * route renders, so there is one visual design and the real URL is preserved.
 */
export function renderOverlay(entry, { releases = [] } = {}) {
  const id = `ov-${entry.slug}`;
  return `<div class="overlay" id="${id}" data-overlay="${esc(entry.slug)}" hidden>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
    <div class="modal-head">
      <div>
        <span class="label">JU PRODUCT</span>
        <h1 class="detail-title" id="${id}-title">${esc(entry.title)}</h1>
        <p class="detail-tagline">${esc(entry.summary)}</p>
      </div>
      <button class="close" type="button" data-overlay-close aria-label="${esc(entry.title)} 닫기">&times;</button>
    </div>
    ${showroom(entry, { releases })}
    <div class="detail-section"><a class="btn btn-sm" href="/products/${esc(entry.slug)}/">자세히 보기</a></div>
  </div>
</div>`;
}

/**
 * The showroom presentation, shared by the desktop overlay and the deep route.
 * Registry-driven throughout; no product data is invented here.
 */
export function showroom(entry, { releases = [] } = {}) {
  const action = getPrimaryAction(entry);
  const others = releases.filter((r) => r !== action.href);
  const tags = [...platformTags(entry), action.version].filter(Boolean);

  return `<div class="heroProduct">
    <div class="info">
      <div class="detail-section" style="margin-top:0">
        <h2>이걸로 무엇을 할 수 있나요</h2>
        ${ticks(capabilities(entry))}
      </div>
      ${tags.length ? `<div class="actions" style="margin-top:18px">${tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
      ${action.command ? `<div class="detail-section"><h2>설치</h2>${commandBlock(action)}</div>` : ''}
      <div class="tile-actions" style="margin-top:18px">
        ${primaryAction(entry)}
        ${sourceLink(entry)}
      </div>
      ${
        others.length
          ? `<div class="detail-section">
        <h2>다른 방법</h2>
        <div class="tile-actions">${others.map((href) => `<a class="btn btn-sm" href="${esc(href)}" rel="noopener">내려받기 &#8599;</a>`).join('')}</div>
      </div>`
          : ''
      }
    </div>
    <div class="demo">
      <div class="detail-section" style="margin-top:0"><h2>실제 화면</h2></div>
      ${mediaFrame(entry, { controls: true })}
    </div>
  </div>`;
}

function ticks(items) {
  if (!items.length) return '';
  return `<ul class="ticks">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function platformTags(entry) {
  const platforms = (entry.releases ?? []).flatMap((r) => r.platforms ?? []);
  const map = { web: '웹', windows: 'Windows', node: '터미널', macos: 'macOS', linux: 'Linux' };
  return [...new Set(platforms.map((p) => map[p] ?? p))];
}

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

export { NAV, ticks, platformTags, capabilities };
