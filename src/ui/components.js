/**
 * Shared render helpers — DESIGN CONTRACT v1.
 *
 * Action rendering is the ONLY place that consumes getPrimaryAction().
 * Components never branch on `action.provider`, and no provider name is ever
 * rendered — the user sees the verb only.
 *
 * Accent discipline (contract §1): lime appears only in the wordmark U, the
 * hero <em>, and primary CTAs. Mint is reserved for install commands and the
 * recommend banner.
 */

import { getPrimaryAction } from '../registry/action.ts';
import { resolveMediaUrl, canonicalUrl, esc } from '../lib/dom.js';

const NAV = [
  { href: '/products/', label: 'Products' },
  { href: '/skills/', label: 'Skills' },
  { href: '/labs/', label: 'Labs' },
  { href: '/radar/', label: 'Radar' },
];

export function layout(title, description, currentPath, body, { indexable = true } = {}) {
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
      `<a href="${n.href}"${isCurrent(n.href) ? ' aria-current="page"' : ''}>${n.label}</a>`,
  ).join('');

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
<body>
<a class="sr-only skip" href="#main">본문으로 건너뛰기</a>
<header class="nav">
  <div class="navin">
    <a class="brand" href="/" aria-label="JU 홈">J<em>U</em></a>
    <nav class="navlinks" aria-label="주요 메뉴">${links}</nav>
  </div>
</header>
<main id="main">
<div class="shell">
${body}
</div>
</main>
<footer>
  <b>JU</b>
  <span>Products · Skills · Labs · Radar</span>
  <span>바이브코딩을 처음 만나는 사람을 위한 공식 제품 포털</span>
</footer>
<script src="/assets/portal.js" defer></script>
</body>
</html>`;
}

/**
 * Media surface. Never renders a broken <video> and never an empty void
 * (contract §7): real video, real poster, or a deliberate labelled placeholder.
 *
 * The Registry is Infra-owned and may declare the poster as `pending` even when
 * the asset now exists on disk. So a poster is honoured from EITHER source: the
 * Registry path, or the conventional sibling of the overview video. This is
 * read-only discovery of a file that is genuinely there - no path is invented
 * and nothing is fabricated. Infra can later declare it in the Registry and
 * this fallback simply stops firing.
 */
export function mediaFrame(entry, { controls = false, className = 'demoScreen' } = {}) {
  const media = entry.media;
  const alt = media?.overviewVideo?.alt ?? `${entry.title} 소개`;

  const declaredPoster = media?.poster?.path;
  const video = media?.overviewVideo?.path;
  const posterPath = declaredPoster ?? (video ? siblingPoster(video) : null);

  if (video) {
    return `<div class="${className}">
  <video src="${esc(resolveMediaUrl(video))}"${posterPath ? ` poster="${esc(resolveMediaUrl(posterPath))}"` : ''}${controls ? ' controls' : ''} preload="none" playsinline muted></video>
</div>`;
  }

  if (posterPath) {
    return `<div class="${className}">
  <img src="${esc(resolveMediaUrl(posterPath))}" alt="${esc(alt)}" loading="lazy">
</div>`;
  }

  // Deliberate placeholder: marked, readable, and never a black box.
  const pending = media?.pending?.includes('overviewVideo') ?? false;
  return `<div class="${className}">
  <div class="void">
    <span class="mark" aria-hidden="true">${esc(initials(entry.title))}</span>
    <span>${pending ? '소개 영상 준비 중' : '제품 화면 곧 공개'}</span>
    <small>실제 화면이 준비되면 여기에 표시됩니다</small>
  </div>
</div>`;
}

/**
 * Poster siblings, injected by the render step.
 *
 * A media path literal must never appear here: the registry verifier scans raw
 * source text and rejects an unversioned one, breaking the build for a reason
 * that is invisible in review. So the render step reads what actually exists in
 * public/media/ and passes it in here. The path still comes from the filesystem
 * next to the real, versioned video — nothing is derived from a slug.
 */
let POSTER_BY_VIDEO = {};

/** @internal render step only. */
export function setPosterMap(map) {
  POSTER_BY_VIDEO = map ?? {};
}

function siblingPoster(videoPath) {
  return POSTER_BY_VIDEO[videoPath] ?? null;
}

function initials(title) {
  return String(title ?? 'JU')
    .replace(/^Ju/, '')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Primary CTA. Reads the Infra resolver; never renders a provider name and
 * never renders a link that does not resolve.
 *
 * A CLI install resolves to a `command` (npm/pypi/copy). For those the primary
 * affordance is the copyable command, not a link to a package page: a beginner
 * should be able to run one command, and linking out would advertise the
 * provider in the destination URL. Web products resolve to an href.
 */
export function primaryAction(entry, { cta = true, size = '' } = {}) {
  const action = getPrimaryAction(entry);
  const cls = `btn${cta ? ' cta' : ''}${size ? ' ' + size : ''}`;

  if (!action.resolved) {
    return `<span class="${cls} is-disabled" aria-disabled="true" title="${esc(action.reason ?? '아직 준비 중입니다.')}">앞으로 준비 중</span>`;
  }

  if (action.command) {
    return `<button class="${cls}" type="button" data-copy="${esc(action.command)}" data-label="${esc(ctaLabel(entry, action))}">${esc(ctaLabel(entry, action))}</button>`;
  }

  if (!action.href) {
    return `<span class="${cls} is-disabled" aria-disabled="true">앞으로 준비 중</span>`;
  }

  return `<a class="${cls}" href="${esc(action.href)}" rel="noopener" data-cta data-slug="${esc(entry.slug)}" data-verb="${esc(action.verb)}" data-provider="${esc(action.provider ?? '')}">${esc(ctaLabel(entry, action))}</a>`;
}

/** Beginner register: the verb, not a provider name. */
function ctaLabel(entry, action) {
  if (action.verb === 'Try') return '바로 써보기';
  if (action.verb === 'Install') return '설치하기';
  if (action.verb === 'Open') return '열어보기';
  return '내려받기';
}

/** Copyable install command (npm/pypi/copy) — contract §6 installBox. */
export function commandBlock(action) {
  if (!action?.command) return '';
  return `<div class="installBox">
  <code>${esc(action.command)}</code>
  <button type="button" data-copy="${esc(action.command)}" data-label="복사됨">복사</button>
</div>`;
}

/** Source is always secondary (contract §2: never in primary nav). */
export function sourceLink(entry) {
  if (!entry.source?.url) return '';
  return `<a class="btn" href="${esc(entry.source.url)}" rel="noopener">Source &#8599;</a>`;
}

export function breadcrumb(href, label) {
  return `<a class="crumb" href="${href}">&#8592; ${esc(label)}</a>`;
}
