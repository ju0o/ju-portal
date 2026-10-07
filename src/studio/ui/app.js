/* JU Portal 관리 — Founder-facing Studio client. Korean-first, no framework.
 *
 * Scope of this file: navigation clarity and Korean copy only. It calls the same
 * local Studio API as before; no publish/git/registry logic lives here.
 */
const ROOT = window.STUDIO || '/studio';
// Absolute paths ('/studio/api/...') are already rooted; leave them untouched.
// Only a bare relative path is joined onto the Studio base.
const api = (p) => (p.startsWith('http') || p.startsWith('/') ? p : ROOT + '/' + p);

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json', ...opts.headers }, ...opts });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { ok: res.ok, status: res.status, body };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------------------------------------------ *
 * Korean-first vocabulary
 * ------------------------------------------------------------------ */

const NAV = [
  { key: 'overview', ko: '홈', tech: 'Overview' },
  { key: 'home', ko: '홈페이지', tech: 'Home' },
  { key: 'products', ko: '제품', tech: 'Products' },
  { key: 'labs', ko: '개발 중', tech: 'Labs' },
  { key: 'skills', ko: '스킬', tech: 'Skills' },
  { key: 'radar', ko: '레이더', tech: 'Radar' },
  { key: 'media', ko: '이미지 · 영상', tech: 'Media' },
  { key: 'verify', ko: '검사', tech: 'Verify' },
  { key: 'publish', ko: '게시', tech: 'Publish' },
];

const SECTION_HELP = {
  overview: '이곳이 JuPortal 관리의 시작 화면입니다. 위쪽에서 원하는 항목을 고르세요.',
  home: 'JuPortal 메인 화면에 보이는 문구를 수정합니다. 디자인과 애니메이션은 여기서 변경하지 않습니다.',
  products: '공개된 제품의 설명, 상태, 링크를 관리합니다.',
  labs: '아직 정식 출시 전인 프로젝트를 관리합니다.',
  skills: 'Agent에게 붙이는 스킬을 관리합니다.',
  radar: 'JU Radar 연결 정보를 관리합니다.',
  media: '제품에 표시되는 이미지와 영상을 관리합니다. 기존 파일을 덮어쓰지 않고 새 버전으로 저장합니다.',
  verify: '게시하기 전에 사이트에 문제가 없는지 확인합니다.',
  publish: 'GitHub 접근은 복구되었지만 Git Freeze가 유지 중이라 게시할 수 없습니다.',
};

const GATE_KO = { build: '사이트 만들기', test: '테스트', registry: '콘텐츠 검사', links: '링크 검사' };

/** Leaf field names that are technical and move under [고급 설정 펼치기]. */
const ADVANCED_KEYS = new Set([
  'slug', 'updatedAt', 'license', 'provider', 'platforms', 'platform', 'tag', 'repo', 'asset',
  'productId', 'appId', 'packageName', 'byteSize', 'durationSec', 'alt', 'pending', 'embed',
  'primary', 'installMethod', 'installTarget', 'compatibleAgents', 'unavailableReason',
  'external', 'externalUrl', 'originEnv', 'createdAt', 'whatItDoes', 'demoVideo',
  'exampleAria', 'listLabel', 'statesLabel', 'radarPending', 'radarDetails',
]);

const KO = {
  title: '이름', summary: '설명', status: '상태', slug: '식별자', updatedAt: '수정일',
  unavailableReason: '공개 보류 사유', media: '이미지 · 영상', poster: '대표 이미지',
  overviewVideo: '소개 영상', actualDemo: '사용 화면', path: '파일 경로', byteSize: '용량(바이트)',
  durationSec: '길이(초)', alt: '대체 텍스트', pending: '준비 중 항목', releases: '사용 버튼',
  provider: '제공 방식', repo: '저장소', asset: '파일 이름', tag: '버전 태그', package: '설치 패키지',
  url: '링크 주소', productId: '스토어 ID', appId: '앱 ID', packageName: '패키지 이름',
  version: '버전', platforms: '지원 환경', verb: '버튼 동작', primary: '대표 버튼',
  source: '출처', license: '라이선스', external: '연결 정보', originEnv: '주소 환경변수',
  embed: '사이트 안에 표시', compatibleAgents: '사용 가능한 Agent', installMethod: '설치 방식',
  installTarget: '설치 대상',
  label: '상단 라벨', titleLines: '제목 줄', titleAccent: '강조 문구', subtitleLines: '부제 줄',
  discoverPlaceholder: '검색 안내 문구', discoverLabel: '검색 버튼', hints: '예시 버튼 목록',
  primaryCta: '주요 버튼', secondaryCta: '보조 버튼', index: '번호 라벨', bodyLines: '본문 줄',
  chain: '연결 단어', listLabel: '목록 제목', exampleLabel: '예시 라벨', exampleAria: '예시 접근성 이름',
  exampleText: '예시 문장', statesLabel: '단계 제목', states: '단계 목록',
  skillsTitle: '스킬 제목', skillsBody: '스킬 설명', labsTitle: '개발 중 제목', labsBody: '개발 중 설명',
  radarTitle: '레이더 제목', radarBody: '레이더 설명', radarCta: '레이더 버튼',
  radarDetails: '레이더 자세히', radarPending: '레이더 준비 중',
  body: '본문', button: '버튼 문구', state: '상태 문구', footnote: '각주', meta: '페이지 정보',
  description: '설명',
};

function labelFor(path) {
  const last = Array.isArray(path) ? path[path.length - 1] : String(path);
  const base = KO[last] || last;
  const ctx = Array.isArray(path) && path.length > 1 ? path.slice(0, -1).join(' › ') : '';
  return { base, ctx };
}
function leafName(path) { return Array.isArray(path) ? path.join('.') : String(path); }
function isAdvanced(path) { return ADVANCED_KEYS.has(path[path.length - 1]); }

/* ------------------------------------------------------------------ *
 * Form building — flat leaves, advanced collapsed, nested rebuild on read
 * ------------------------------------------------------------------ */

function flattenLeaves(value, path, out) {
  if (value === null || typeof value !== 'object') { out.push({ path, value, kind: 'scalar' }); return out; }
  if (Array.isArray(value)) {
    if (value.length && value.every((x) => typeof x !== 'object' || x === null)) {
      out.push({ path, value, kind: 'lines' });
    } else if (value.length === 0) {
      out.push({ path, value, kind: 'json' });
    } else {
      value.forEach((item, i) => flattenLeaves(item, [...path, String(i)], out));
    }
    return out;
  }
  for (const k of Object.keys(value)) flattenLeaves(value[k], [...path, k], out);
  return out;
}

function renderField(leaf) {
  const name = leafName(leaf.path);
  const { base, ctx } = labelFor(leaf.path);
  const hint = ctx ? `<span class="hint">${esc(ctx)}</span>` : '';
  if (leaf.kind === 'lines') {
    return `<div class="field"><label>${esc(base)}${hint}</label><textarea name="${name}" data-type="lines">${esc(leaf.value.join('\n'))}</textarea></div>`;
  }
  if (leaf.kind === 'json') {
    return `<div class="field"><label>${esc(base)}${hint}</label><textarea name="${name}" data-type="json">${esc(JSON.stringify(leaf.value, null, 2))}</textarea></div>`;
  }
  const v = leaf.value;
  if (typeof v === 'boolean') {
    return `<div class="field"><label class="row"><input type="checkbox" name="${name}" data-type="bool" ${v ? 'checked' : ''}> ${esc(base)}${hint}</label></div>`;
  }
  if (typeof v === 'number') {
    return `<div class="field"><label>${esc(base)}${hint}</label><input type="number" name="${name}" value="${v}"></div>`;
  }
  if (v === undefined || v === null) {
    return `<div class="field"><label>${esc(base)}${hint}</label><input name="${name}" value="" placeholder="(비어 있음)"></div>`;
  }
  return `<div class="field"><label>${esc(base)}${hint}</label><input name="${name}" value="${esc(v)}"></div>`;
}

function buildForm(obj) {
  const leaves = flattenLeaves(obj, [], []);
  const general = leaves.filter((l) => !isAdvanced(l.path));
  const advanced = leaves.filter((l) => isAdvanced(l.path));
  let html = 'slug' in obj ? `<input type="hidden" name="slug" value="${esc(obj.slug ?? '')}">` : '';
  for (const leaf of general) html += renderField(leaf);
  if (advanced.length) {
    html += `<details class="advanced"><summary>고급 설정 펼치기 (${advanced.length}개)</summary>`;
    html += '<p class="muted" style="font-size:12px;margin:8px 0">여기의 값은 대부분 자동으로 채워집니다. 정확히 알 때만 수정하세요.</p>';
    for (const leaf of advanced) html += renderField(leaf);
    html += '</details>';
  }
  return html;
}

/** Assign value at a dotted path, creating nested objects / arrays as needed. */
function setPath(root, path, value) {
  let cur = root;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    const nk = path[i + 1];
    const key = /^\d+$/.test(k) ? Number(k) : k;
    if (cur[key] === undefined || cur[key] === null) cur[key] = /^\d+$/.test(nk) ? [] : {};
    cur = cur[key];
  }
  const last = path[path.length - 1];
  cur[/^\d+$/.test(last) ? Number(last) : last] = value;
}

function readForm(formEl) {
  const out = {};
  for (const el of formEl.elements) {
    const name = el.name;
    if (!name) continue;
    let val;
    if (el.type === 'checkbox') val = el.checked;
    else if (el.tagName === 'TEXTAREA') {
      if (el.dataset.type === 'lines') val = el.value.split('\n');
      else if (el.dataset.type === 'json') { try { val = JSON.parse(el.value); } catch { val = el.value; } }
      else val = el.value;
    } else val = el.value;
    setPath(out, name.split('.'), val);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Workflow bar + status strip
 * ------------------------------------------------------------------ */

const WORKFLOW = ['수정', '저장', '미리보기', '검사', '게시'];
const prog = { edited: false, saved: false, previewed: false, verified: false, published: false };
const stepDone = () => [prog.edited, prog.saved, prog.previewed, prog.verified, prog.published];
function currentStep() {
  const d = stepDone();
  for (let i = 0; i < d.length; i++) if (!d[i]) return i + 1;
  return 5;
}
function renderWorkflow() {
  const el = document.getElementById('workflow');
  if (!el) return;
  const cur = currentStep();
  el.innerHTML =
    WORKFLOW.map((label, i) => {
      const n = i + 1;
      const cls = n < cur ? 'step done' : n === cur ? 'step active' : 'step';
      return `<span class="${cls}"><span class="n">${n}</span>${esc(label)}</span>`;
    }).join('<span class="sep">→</span>') +
    `<span class="sep" style="margin-left:auto"></span><span class="step">지금: <b>${cur}. ${esc(WORKFLOW[cur - 1])}</b></span>`;
}
function setProgress(patch) { Object.assign(prog, patch); renderWorkflow(); }

function renderStatus(s) {
  const el = document.getElementById('status');
  if (!el) return;
  const git = '<span class="s ok">GitHub <b>접근 복구됨</b></span><span class="s warn">Git Freeze <b>유지 중 · 게시 잠김</b></span>';
  const dirty = s.dirty ? '<span class="s">저장 안 된 변경 <b>있음</b></span>' : '<span class="s ok">저장 안 된 변경 <b>없음</b></span>';
  el.innerHTML = [
    '<span class="s">작업 위치 <b>이 컴퓨터 (로컬)</b></span>',
    '<span class="s">인터넷 반영 <b>아직 안 됨</b></span>',
    git,
    dirty,
    '<span class="s ok">실서비스 <b>변경 없음</b></span>',
  ].join('');
}

/* ------------------------------------------------------------------ *
 * Routing
 * ------------------------------------------------------------------ */

let state = {};
async function refreshState() { const r = await fetchJSON(api('/studio/api/state')); if (r.ok) state = r.body; return state; }

const routes = {
  overview: () => renderOverview(),
  home: () => renderHomeEditor(),
  products: () => renderSection('products'),
  labs: () => renderSection('labs'),
  skills: () => renderSection('skills'),
  radar: () => renderSection('radar'),
  media: () => renderMedia(),
  verify: () => renderVerify(),
  publish: () => renderPublish(),
};

function activeRoute() { return (location.hash || '#overview').slice(1).split('/')[0]; }

function router() {
  const nav = NAV.find((n) => n.key === activeRoute()) || NAV[0];
  (routes[nav.key] || routes.overview)();
  const page = document.getElementById('page-title');
  if (page) page.textContent = nav.ko;
  [...document.querySelectorAll('#nav button')].forEach((b) => b.classList.toggle('active', b.dataset.route === nav.key));
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', async () => {
  await refreshState();
  renderNav();
  renderWorkflow();
  renderStatus(state);
  router();
  maybeFirstRun();
});

function renderNav() {
  document.getElementById('nav').innerHTML = NAV.map(
    (n) => `<button data-route="${n.key}" onclick="location.hash='#${n.key}'"><span class="ko">${esc(n.ko)}</span><span class="tech">${esc(n.tech)}</span></button>`,
  ).join('');
}

/* ------------------------------------------------------------------ *
 * Overview
 * ------------------------------------------------------------------ */

async function renderOverview() {
  const s = await refreshState();
  renderStatus(s);
  const c = s.counts || {};
  const quick = [
    { hash: '#home', emoji: '📝', t: '홈페이지 문구', d: 'Hero · Brand Value · AI Works 등' },
    { hash: '#products', emoji: '📦', t: '제품', d: 'JuQode · JuTell' },
    { hash: '#labs', emoji: '🧪', t: '개발 중', d: 'JuDoctor · JuControler' },
    { hash: '#media', emoji: '🖼️', t: '이미지 · 영상', d: '제품 이미지와 영상 교체' },
  ];
  const changed = s.changedFiles || [];
  const html = `
    <div class="card intro">
      <h1>JU Portal 관리</h1>
      <p>여기서 JuPortal의 <b>문구 · 제품 · Labs · 미디어</b>를 직접 수정할 수 있습니다.</p>
      <p class="safe">수정한 내용은 저장해도 바로 인터넷에 배포되지 않습니다. Git Freeze가 유지되는 동안 게시할 수 없습니다.</p>
    </div>

    <div class="card">
      <h2>무엇을 수정하시겠어요?</h2>
      <p class="muted">아래에서 골라 바로 시작할 수 있습니다.</p>
      <div class="quick-grid">
        ${quick.map((q) => `<button class="quick-card" onclick="location.hash='${q.hash}'"><div class="emoji">${q.emoji}</div><div class="t">${esc(q.t)}</div><div class="d">${esc(q.d)}</div></button>`).join('')}
      </div>
    </div>

    <div class="card">
      <h2>현재 상태</h2>
      <table class="kv">
        <tr><td>홈페이지 주소</td><td>${esc(s.productionUrl || '(설정 없음)')}</td></tr>
        <tr><td>작업 브랜치</td><td>${esc(s.branch || '')}</td></tr>
        <tr><td>작업 지점(HEAD)</td><td>${esc((s.head || '').slice(0, 10))}</td></tr>
        <tr><td>저장 안 된 변경</td><td>${s.dirty ? '있음' : '없음'}</td></tr>
        <tr><td>콘텐츠 개수</td><td>제품 ${c.products || 0} · 개발 중 ${c.labs || 0} · 스킬 ${c.skills || 0} · 레이더 ${c.radar || 0}</td></tr>
        <tr><td>GitHub</td><td>접근 복구됨</td></tr>
        <tr><td>현재 제한</td><td><span class="tag-warn">Git Freeze 유지 중 · 게시 잠김</span></td></tr>
      </table>
      <div class="row" style="margin-top:14px">
        <button class="btn" onclick="runPreview()"><span>미리보기 열기</span><span class="sub">실제 JuPortal 화면으로 확인합니다</span></button>
        <button class="btn" onclick="runVerify()"><span>오류 검사</span><span class="sub">사이트에 문제가 있는지 확인합니다</span></button>
      </div>
      <div id="action-result" class="feedback"></div>
    </div>

    <div class="card">
      <h2>최근 변경</h2>
      ${changed.length
        ? `<ul>${changed.slice(0, 12).map((f) => `<li><span class="muted">${esc(f)}</span></li>`).join('')}</ul>${changed.length > 12 ? `<p class="muted">외 ${changed.length - 12}개</p>` : ''}`
        : '<p class="muted">아직 변경된 파일이 없습니다.</p>'}
    </div>`;
  document.getElementById('content').innerHTML = html;
}

/* ------------------------------------------------------------------ *
 * Section editors
 * ------------------------------------------------------------------ */

function sectionHeader(key) {
  const n = NAV.find((x) => x.key === key) || { ko: key, tech: '' };
  return `<div class="card"><h2>${esc(n.ko)}</h2><p class="muted">${esc(SECTION_HELP[key] || '')}</p></div>`;
}

async function renderHomeEditor() {
  const r = await fetchJSON(api('/studio/api/home'));
  const home = r.body.home || {};
  let html = sectionHeader('home');
  html += `<div class="card"><form id="home-form">${buildForm(home)}</form>
    <div class="row" style="margin-top:14px">
      <button class="btn btn-ghost" onclick="validateHome()"><span>내용 확인</span><span class="sub">저장하지 않고 형식만 검사합니다</span></button>
      <button class="btn btn-primary" onclick="saveHome()"><span>저장</span><span class="sub">이 컴퓨터에만 저장됩니다</span></button>
    </div>
    <div id="home-result" class="feedback"></div></div>`;
  document.getElementById('content').innerHTML = html;
}

async function validateHome() {
  const form = document.getElementById('home-form');
  const r = await fetchJSON(api('/studio/api/home/validate'), { method: 'POST', body: JSON.stringify({ home: readForm(form) }) });
  const el = document.getElementById('home-result');
  el.className = 'feedback ' + (r.ok && r.body.valid ? 'ok' : 'bad');
  el.innerHTML = r.ok && r.body.valid
    ? '✓ 형식이 올바릅니다'
    : '⚠ 확인이 필요합니다<span class="sub">' + esc((r.body.errors || []).join(' / ')) + '</span>';
}

async function saveHome() {
  const form = document.getElementById('home-form');
  const r = await fetchJSON(api('/studio/api/home'), { method: 'POST', body: JSON.stringify({ home: readForm(form) }) });
  const el = document.getElementById('home-result');
  if (r.ok) {
    el.className = 'feedback ok';
    el.innerHTML = '✓ 저장했습니다<span class="sub">아직 인터넷에는 반영되지 않았습니다. 미리보기로 확인하세요.</span>';
    setProgress({ edited: true, saved: true });
  } else {
    el.className = 'feedback bad';
    el.innerHTML = '⚠ 저장하지 못했습니다<span class="sub">' + esc((r.body.errors || [r.body.error || '']).join(' / ')) + '</span>';
  }
  refreshState();
}

async function renderSection(section) {
  const r = await fetchJSON(api('/studio/api/entries/' + section));
  const items = (r.body.entries || []).map(
    (e) => `<tr><td>${esc(e.slug)}</td><td>${esc(e.entry.title || '')}</td><td><a href="#${section}/${e.slug}">수정하기</a></td></tr>`,
  ).join('');
  let html = sectionHeader(section);
  html += `<div class="card"><table><thead><tr><th>식별자</th><th>이름</th><th></th></tr></thead><tbody>${items || '<tr><td colspan="3" class="muted">항목이 없습니다.</td></tr>'}</tbody></table></div>`;
  if (location.hash.startsWith('#' + section + '/')) { await renderEntryEditor(section); return; }
  document.getElementById('content').innerHTML = html;
}

async function renderEntryEditor(section) {
  const m = location.hash.slice(1).split('/');
  const slug = m[1];
  const r = await fetchJSON(api('/studio/api/entries/' + section + '/' + slug));
  const entry = r.body.entry || {};
  let html = sectionHeader(section);
  html += `<div class="card"><h2 style="font-size:15px">${esc(entry.title || slug)} <span class="muted">(${esc(slug)})</span></h2><form id="entry-form">${buildForm(entry)}</form>`;
  let actions = `<div class="row" style="margin-top:14px"><button class="btn btn-ghost" onclick="location.hash='#${section}'"><span>목록으로</span></button><button class="btn btn-primary" onclick="saveEntry('${section}','${slug}')"><span>저장</span><span class="sub">이 컴퓨터에만 저장됩니다</span></button>`;
  if (section === 'labs') actions += `<button class="btn btn-ghost" onclick="promoteLab('${slug}')"><span>제품으로 승격</span><span class="sub">초안 제품을 만듭니다</span></button>`;
  actions += '</div>';
  html += actions;
  html += '<div id="entry-result" class="feedback"></div></div>';
  document.getElementById('content').innerHTML = html;
}

async function saveEntry(section, slug) {
  const form = document.getElementById('entry-form');
  const r = await fetchJSON(api('/studio/api/entries/' + section + '/' + slug), { method: 'POST', body: JSON.stringify({ entry: readForm(form) }) });
  const el = document.getElementById('entry-result');
  if (r.ok) {
    el.className = 'feedback ok';
    el.innerHTML = '✓ 저장했습니다<span class="sub">' + esc((r.body.changedFiles || []).join(', ')) + ' · 아직 인터넷에는 반영되지 않았습니다.</span>';
    setProgress({ edited: true, saved: true });
  } else {
    el.className = 'feedback bad';
    el.innerHTML = '⚠ 저장하지 못했습니다<span class="sub">' + esc((r.body.errors || [r.body.error || '']).join(' / ')) + '</span>';
  }
  refreshState();
}

async function promoteLab(slug) {
  const ok = window.confirm('"' + slug + '" 을(를) 초안 제품으로 만들까요?\n\n상태는 "준비 중"이고 사용 버튼은 비어 있습니다. 실제 배포 전에 사용 버튼을 채워야 합니다.');
  if (!ok) return;
  const r = await fetchJSON(api('/studio/api/entries/labs/' + slug + '/promote'), { method: 'POST', body: JSON.stringify({ create: true }) });
  const el = document.getElementById('entry-result');
  el.className = 'feedback ' + (r.ok ? 'ok' : 'bad');
  el.innerHTML = r.ok
    ? '✓ 초안 제품을 만들었습니다<span class="sub">' + esc((r.body.changedFiles || []).join(', ')) + '</span>'
    : '⚠ 만들지 못했습니다<span class="sub">' + esc((r.body.errors || [r.body.error || '실패']).join(' / ')) + '</span>';
  refreshState();
}

/* ------------------------------------------------------------------ *
 * Media
 * ------------------------------------------------------------------ */

async function renderMedia() {
  let html = sectionHeader('media');
  html += `<div class="card">
    <form id="upload-form" onsubmit="uploadMedia(event)">
      <div class="row">
        <div class="field" style="min-width:180px"><label>제품 식별자<span class="hint">예: jutell</span></label><input name="slug" placeholder="jutell"></div>
        <div class="field" style="min-width:180px"><label>종류</label><select name="slot"><option value="poster">대표 이미지</option><option value="overviewVideo">소개 영상</option><option value="actualDemo">사용 화면</option></select></div>
        <div class="field" style="min-width:220px"><label>파일 선택</label><input type="file" id="upload-file"></div>
      </div>
      <button class="btn btn-primary" type="submit"><span>올리기</span><span class="sub">기존 파일을 덮어쓰지 않고 새 버전으로 저장합니다</span></button>
    </form>
    <div id="media-result" class="feedback"></div>
  </div>`;
  document.getElementById('content').innerHTML = html;
}

async function uploadMedia(ev) {
  ev.preventDefault();
  const slug = document.querySelector('#upload-form input[name="slug"]').value.trim();
  const slot = document.querySelector('#upload-form select[name="slot"]').value;
  const file = document.getElementById('upload-file').files[0];
  const el = document.getElementById('media-result');
  if (!file) { el.className = 'feedback bad'; el.innerHTML = '⚠ 파일을 선택하세요'; return; }
  const buf = await file.arrayBuffer();
  const r = await fetch(api('/studio/api/media/' + slug + '/' + slot), {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': file.name },
    body: buf,
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { /* non-JSON */ }
  if (r.ok) { el.className = 'feedback ok'; el.innerHTML = '✓ 올렸습니다<span class="sub">' + esc(j.path) + ' · 새 버전으로 저장되어 기존 파일은 그대로 남습니다.</span>'; }
  else { el.className = 'feedback bad'; el.innerHTML = '⚠ 올리지 못했습니다<span class="sub">' + esc(j && j.error ? j.error : text) + '</span>'; }
  refreshState();
}

/* ------------------------------------------------------------------ *
 * Preview / Verify
 * ------------------------------------------------------------------ */

let lastPreviewUrl = null;

async function runPreview() {
  const box = document.getElementById('action-result');
  if (box) { box.className = 'feedback'; box.innerHTML = '⏳ 사이트를 만드는 중입니다…'; }
  const r = await fetchJSON(api('/studio/api/preview'), { method: 'POST' });
  lastPreviewUrl = (r.body && r.body.url) || '/preview/';
  const out = document.getElementById('action-result');
  const ok = r.ok && r.body && r.body.buildPass;
  if (out) {
    out.className = 'feedback ' + (ok ? 'ok' : 'bad');
    out.innerHTML = ok
      ? '✓ 미리보기 준비 완료 <button class="btn btn-ghost" onclick="openPreview()">미리보기 열기</button><span class="sub">실제 JuPortal 화면으로 확인합니다.</span>'
      : '⚠ 사이트 만들기에 실패했습니다<span class="sub">아래 [기술 정보 보기]에서 원인을 확인하세요.</span><details class="advanced"><summary>기술 정보 보기</summary><div class="code">' + esc((r.body && r.body.output) || '') + '</div></details>';
  }
  if (ok) setProgress({ saved: true, previewed: true });
}

function openPreview() { window.open(lastPreviewUrl || '/preview/', '_blank'); }

function gateWhy(g, v) {
  if (v[g] && v[g].pass) return '통과';
  if (g === 'build') return '사이트를 만들지 못했습니다.';
  if (g === 'test') return '자동 테스트가 실패했습니다.';
  if (g === 'registry') return '콘텐츠 규칙을 어긴 항목이 있습니다.';
  if (g === 'links') return '인터넷 링크 확인이 안 됩니다(네트워크 필요).';
  return '실패';
}

async function runVerify() {
  const box = document.getElementById('action-result') || document.getElementById('verify-result');
  if (box) { box.className = 'feedback'; box.innerHTML = '⏳ 검사 중입니다…'; }
  const r = await fetchJSON(api('/studio/api/verify'), { method: 'POST' });
  const v = r.body || {};
  const gates = ['build', 'test', 'registry', 'links'];
  const rows = gates.map((g) => {
    const ok = v[g] && v[g].pass;
    return `<div class="gate"><span class="name">${esc(GATE_KO[g])}</span><span class="state ${ok ? 'tag-ok' : 'tag-bad'}">${ok ? '통과' : '실패'}</span><span class="why">${esc(gateWhy(g, v))}</span></div>`;
  }).join('');
  const html = (v.allPass
    ? '<div class="feedback ok">✓ 게시 준비 완료<span class="sub">사이트 / 테스트 / 콘텐츠 / 링크 검사를 모두 통과했습니다.</span></div>'
    : '<div class="feedback bad">⚠ 게시할 수 없습니다<span class="sub">아래에서 실패한 검사를 확인하세요. [기술 정보 보기]에 자세한 원인이 있습니다.</span></div>')
    + rows
    + '<details class="advanced"><summary>기술 정보 보기</summary><div class="code">' + esc(gates.map((g) => '── ' + GATE_KO[g] + ' ──\n' + ((v[g] && v[g].output) || '')).join('\n\n')) + '</div></details>';
  const target = document.getElementById('action-result') || document.getElementById('verify-result');
  if (target) { target.className = 'feedback'; target.innerHTML = html; }
  if (v.allPass) setProgress({ saved: true, previewed: true, verified: true });
}

async function renderVerify() {
  let html = sectionHeader('verify');
  html += `<div class="card">
    <div class="row">
      <button class="btn btn-primary" onclick="runVerify()"><span>오류 검사</span><span class="sub">사이트에 문제가 있는지 확인합니다</span></button>
    </div>
    <div id="verify-result" class="feedback"><span class="sub">아직 검사하지 않았습니다. 위 버튼을 누르세요.</span></div>
  </div>`;
  document.getElementById('content').innerHTML = html;
}

/* ------------------------------------------------------------------ *
 * Publish
 * ------------------------------------------------------------------ */

async function renderPublish() {
  const r = await fetchJSON(api('/studio/api/publish/prepare'), { method: 'POST' });
  const p = r.body || {};
  const gates = p.gates || {};
  const gateStr = (k) => (gates[k] ? '<span class="tag-ok">통과</span>' : '<span class="tag-bad">실패</span>');
  let html = sectionHeader('publish');
  html += `<div class="card">
    <table class="kv">
      <tr><td>게시될 브랜치</td><td>${esc(p.branch || '')}</td></tr>
      <tr><td>변경된 파일</td><td>${(p.changedFiles || []).length}개${(p.changedFiles || []).length ? ' · ' + esc((p.changedFiles || []).slice(0, 6).join(', ')) : ''}</td></tr>
      <tr><td>인터넷 반영</td><td>아직 안 됨</td></tr>
      <tr><td>GitHub</td><td>접근 복구됨</td></tr>
      <tr><td>현재 제한</td><td>Git Freeze 유지 중</td></tr>
      <tr><td>사이트 만들기</td><td>${gateStr('build')}</td></tr>
      <tr><td>테스트</td><td>${gateStr('test')}</td></tr>
      <tr><td>콘텐츠 검사</td><td>${gateStr('registry')}</td></tr>
      <tr><td>링크 검사</td><td>${gateStr('links')}</td></tr>
    </table>`;
  html += `<div class="row" style="margin-top:14px"><button class="btn" type="button" disabled><span>게시 잠김</span><span class="sub">Git Freeze 유지 중</span></button></div>
    <p class="muted" style="margin-top:10px">GitHub 접근은 복구되었지만 현재 프로젝트의 Git Freeze가 유지 중입니다. Freeze가 명시적으로 해제되기 전에는 브랜치·커밋·PR을 만들지 않습니다.</p>`;
  html += '<div id="publish-result" class="feedback"></div></div>';
  document.getElementById('content').innerHTML = html;
}

function confirmPublish() {
  if (!state.gitAllowed) return;
  const ok = window.confirm('변경사항을 게시할까요?\n\n· 새 브랜치를 만들고 PR(검토 요청)을 엽니다\n· 실제 사이트(main)에 바로 반영되지 않습니다\n· 자동 병합되지 않습니다');
  if (ok) doPublish();
}

async function doPublish() {
  if (!state.gitAllowed) return;
  const r = await fetchJSON(api('/studio/api/publish'), { method: 'POST' });
  const b = r.body || {};
  const el = document.getElementById('publish-result');
  el.className = 'feedback ' + (r.ok ? 'ok' : 'bad');
  el.innerHTML = r.ok
    ? '✓ 게시 요청을 만들었습니다<span class="sub">브랜치 ' + esc(b.branch || '') + (b.sha ? ' · ' + esc(String(b.sha).slice(0, 10)) : '') + (b.pr ? ' · <a href="' + esc(b.pr) + '" target="_blank" rel="noopener">PR 열기</a>' : '') + '</span>'
    : '⚠ 게시할 수 없습니다<span class="sub">' + esc(b.message || b.reason || '') + '</span>';
}

/* ------------------------------------------------------------------ *
 * First-run help (once) + reopen via [? 사용법]
 * ------------------------------------------------------------------ */

const HELP_KEY = 'ju-portal-studio-seen';
let helpReturnFocus = null;

function openHelp() {
  const modal = document.getElementById('help-modal');
  if (modal.hidden) helpReturnFocus = document.activeElement;
  modal.hidden = false;
  modal.innerHTML = `<div class="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" aria-describedby="help-description" tabindex="-1">
    <h2 id="help-title">JU Portal Studio에 오신 것을 환영합니다</h2>
    <p class="muted" id="help-description">여기서 AI 없이 JuPortal을 직접 관리할 수 있습니다.</p>
    <ol>
      <li><b>수정</b>하세요 — 위쪽에서 홈페이지 문구, 제품 등을 고릅니다.</li>
      <li><b>저장</b>하세요 — 이 컴퓨터에만 저장됩니다.</li>
      <li><b>미리보기</b>로 실제 화면을 확인하세요.</li>
      <li><b>오류 검사</b>를 실행하세요.</li>
      <li><b>게시 상태</b>를 확인하세요 — 현재는 Git Freeze로 잠겨 있습니다.</li>
    </ol>
    <p class="muted" style="font-size:12px">저장·미리보기만으로는 인터넷의 실제 사이트가 바뀌지 않습니다. 안심하고 눌러보세요.</p>
    <div class="row" style="margin-top:14px"><button class="btn btn-primary" onclick="closeHelp()"><span>시작하기</span></button></div>
  </div>`;
  modal.addEventListener('keydown', onHelpKeydown);
  modal.querySelector('button')?.focus();
}
function onHelpKeydown(event) { if (event.key === 'Escape') closeHelp(); }
function closeHelp() {
  const modal = document.getElementById('help-modal');
  modal.hidden = true;
  modal.removeEventListener('keydown', onHelpKeydown);
  try { localStorage.setItem(HELP_KEY, '1'); } catch { /* ignore */ }
  const target = helpReturnFocus && helpReturnFocus !== document.body ? helpReturnFocus : document.getElementById('help-btn');
  helpReturnFocus = null;
  target?.focus?.();
}
function maybeFirstRun() {
  let seen = false;
  try { seen = localStorage.getItem(HELP_KEY) === '1'; } catch { /* ignore */ }
  if (!seen) openHelp();
}

/* expose for inline onclick */
window.openHelp = openHelp;
window.closeHelp = closeHelp;
window.validateHome = validateHome;
window.saveHome = saveHome;
window.saveEntry = saveEntry;
window.promoteLab = promoteLab;
window.uploadMedia = uploadMedia;
window.runPreview = runPreview;
window.openPreview = openPreview;
window.runVerify = runVerify;
window.confirmPublish = confirmPublish;
window.doPublish = doPublish;
