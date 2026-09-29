/**
 * Shared render helpers.
 *
 * Action rendering is intentionally the ONLY place that consumes
 * getPrimaryAction(). Components never branch on `action.provider`, and no
 * provider name is ever rendered — the user sees the verb only.
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

  // Canonical comes from NEXT_PUBLIC_SITE_URL via canonicalUrl(); never from the
  // request host, so a Preview deployment can never become the canonical origin.
  // A non-indexable page (404) declares no canonical at all.
  const canonical = indexable ? canonicalUrl(currentPath) : '';
  const seo = indexable
    ? `<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="JU">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">`
    : '<meta name="robots" content="noindex, follow">';

  const desktop = NAV.map(
    (n) =>
      `<a href="${n.href}"${isCurrent(n.href) ? ' aria-current="page"' : ''}>${n.label}</a>`,
  ).join('');

  const mobile = NAV.map(
    (n) => `<a href="${n.href}"${isCurrent(n.href) ? ' aria-current="page"' : ''}>${n.label}</a>`,
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
<div class="shell">
<a class="sr-only skip" href="#main">본문으로 건너뛰기</a>
<header class="nav">
  <div class="wrap nav-in">
    <a class="brand" href="/">JU</a>
    <nav class="nav-links" aria-label="주요 메뉴">${desktop}</nav>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="메뉴 열기" data-nav-toggle>&#9776;</button>
  </div>
  <div class="wrap">
    <nav class="nav-panel" id="mobile-nav" aria-label="주요 메뉴" hidden>${mobile}</nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="footer">
  <div class="wrap">
    <p style="font-weight:700;color:var(--ink-200);margin:0 0 .25rem">JU</p>
    <p style="margin:0">바이브코딩을 처음 만나는 사람을 위한 제품 모음.</p>
  </div>
</footer>
</div>
<script src="/assets/portal.js" defer></script>
</body>
</html>`;
}

/** Media surface. Never renders a broken <video>; absence degrades explicitly. */
export function mediaFrame(entry, { controls = false, flat = false } = {}) {
  const media = entry.media;
  const alt = media?.overviewVideo?.alt ?? `${entry.title} 소개`;

  // A poster is separate from the video slot. The Registry may declare the
  // poster as `pending` (JuQode does), and a declared-but-absent poster must not
  // become a broken image — in that case fall back to the first frame the
  // browser renders from the video itself once it is played.
  const posterPath = media?.poster?.path;

  if (media?.overviewVideo?.path) {
    return `<div class="media${flat ? ' media-flat' : ''}">
  <video src="${esc(resolveMediaUrl(media.overviewVideo.path))}"${posterPath ? ` poster="${esc(resolveMediaUrl(posterPath))}"` : ''}${controls ? ' controls' : ''} preload="none" playsinline muted></video>
</div>`;
  }

  if (posterPath) {
    return `<div class="media${flat ? ' media-flat' : ''}">
  <img src="${esc(resolveMediaUrl(posterPath))}" alt="${esc(alt)}" loading="lazy">
</div>`;
  }

  const pending = media?.pending?.includes('overviewVideo');
  return `<div class="media${flat ? ' media-flat' : ''}">
  <div class="media-empty">
    <span aria-hidden="true" style="font-size:1.75rem;color:var(--ink-600)">&#9654;</span>
    <p style="margin:0">${pending ? '소개 영상을 준비하고 있습니다.' : '아직 소개 미디어가 없습니다.'}</p>
  </div>
</div>`;
}

/**
 * Primary CTA. Reads the Infra resolver; never renders a provider name and
 * never renders a link that does not resolve.
 *
 * A CLI install resolves to a `command` (npm/pypi/copy). For those the primary
 * affordance is the copyable command, not a link to a package page: a beginner
 * should be able to run one command, and linking out would advertise the
 * provider in the destination URL. Web products resolve to an href and render
 * a normal link.
 */
export function primaryAction(entry, { size = '' } = {}) {
  const action = getPrimaryAction(entry);
  const cls = `btn${size ? ` btn-${size}` : ''}`;

  if (!action.resolved) {
    return `<span class="${cls} btn-disabled" aria-disabled="true" title="${esc(action.reason ?? 'Not available yet.')}">Coming soon</span>`;
  }

  if (action.command) {
    return `<button class="${cls} btn-secondary" type="button" data-copy="${esc(action.command)}" data-label="${esc(entry.title)} ${esc(action.verb)}">${esc(entry.title)} ${esc(action.verb)}</button>`;
  }

  if (!action.href) {
    return `<span class="${cls} btn-disabled" aria-disabled="true">Coming soon</span>`;
  }

  return `<a class="${cls}" href="${esc(action.href)}" rel="noopener" data-cta data-slug="${esc(entry.slug)}" data-verb="${esc(action.verb)}" data-provider="${esc(action.provider ?? '')}">${esc(entry.title)} ${esc(action.verb)}</a>`;
}

/** Copyable install command (npm/pypi/copy). */
export function commandBlock(action) {
  if (!action?.command) return '';
  return `<pre class="cmd">${esc(action.command)}</pre>`;
}

/** Source is always secondary and always labelled. */
export function sourceLink(entry) {
  if (!entry.source?.url) return '';
  return `<div class="stack" style="gap:.5rem">
  <a class="btn btn-ghost btn-sm" href="${esc(entry.source.url)}" rel="noopener">Source &#8599;</a>
</div>`;
}

export function breadcrumb(href, label) {
  return `<a class="breadcrumb" href="${href}">&#8592; ${esc(label)}</a>`;
}
