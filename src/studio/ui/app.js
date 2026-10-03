/* JU Portal Studio client — vanilla, no framework. Relative URLs only. */
const ROOT = window.STUDIO || '/studio';
const api = (p) => (p.startsWith('http') ? p : ROOT + p);

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
function labelFor(k) {
  return k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (s) => s.toUpperCase());
}
function todayISO() { return new Date().toISOString().split('T')[0]; }

// ---- form builders ----
function renderValue(v, name) {
  if (v === undefined || v === null) return `<input name="${name}" value="" placeholder="(unset)">`;
  if (typeof v === 'boolean') return `<label class="row"><input type="checkbox" name="${name}" data-type="bool" ${v ? 'checked' : ''}> ${labelFor(name)}</label>`;
  if (typeof v === 'string') return `<label>${labelFor(name)}</label><input name="${name}" value="${esc(v)}">`;
  if (typeof v === 'number') return `<label>${labelFor(name)}</label><input name="${name}" type="number" value="${v}">`;
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'string')) return `<label>${labelFor(name)}</label><textarea name="${name}" data-type="lines">${esc(v.join('\n'))}</textarea>`;
    return `<label>${labelFor(name)}</label><textarea name="${name}" data-type="json" style="min-height:96px">${esc(JSON.stringify(v, null, 2))}</textarea>`;
  }
  // nested object
  let inner = '';
  for (const [k, val] of Object.entries(v)) inner += renderValue(val, `${name}.${k}`);
  return `<fieldset class="nested"><legend>${labelFor(name)}</legend>${inner}</fieldset>`;
}

function buildForm(obj) {
  const ordered = {};
  const prefer = ['slug', 'title', 'summary', 'status', 'media', 'releases', 'source', 'updatedAt', 'unavailableReason'];
  for (const k of prefer) if (k in obj) ordered[k] = obj[k];
  for (const k of Object.keys(obj)) if (!(k in ordered)) ordered[k] = obj[k];
  let html = '';
  html += `<input type="hidden" name="slug" value="${esc(ordered.slug ?? '')}">`;
  for (const [k, v] of Object.entries(ordered)) {
    if (k === 'slug') continue;
    html += `<div class="field small">${renderValue(v, k)}</div>`;
  }
  return html;
}

// ---- read form back into object ----
function readForm(formEl) {
  const out = {};
  const walk = (node, into) => {
    for (const el of node.elements ? node.elements : []) {
      if (el.type === 'checkbox') { into[el.name] = el.checked; return; }
      if (el.tagName === 'TEXTAREA') {
        if (el.dataset.type === 'lines') into[el.name] = el.value.split('\n');
        else if (el.dataset.type === 'json') { try { into[el.name] = JSON.parse(el.value); } catch (e) { into[el.name] = el.value; } }
        else into[el.name] = el.value;
        return;
      }
      if (el.tagName === 'INPUT') into[el.name] = el.value;
    }
  };
  walk(formEl, out);
  return out;
}

// ---- routing ----
let state = {};
async function refreshState() { const r = await fetchJSON(api('/studio/api/state')); if (r.ok) state = r.body; return state; }

const routes = {
  overview: () => renderOverview(),
  home: () => renderHome(),
  products: () => renderSection('products', 'Products'),
  labs: () => renderSection('labs', 'Labs'),
  skills: () => renderSection('skills', 'Skills'),
  radar: () => renderSection('radar', 'Radar'),
  media: () => renderMedia(),
  publish: () => renderPublish(),
};

function router() {
  const hash = (location.hash || '#overview').slice(1).split('/')[0];
  const handler = routes[hash] || routes.overview;
  handler();
  const page = document.getElementById('page-title');
  page.textContent = (hash.charAt(0).toUpperCase() + hash.slice(1)) || 'Overview';
  [...document.querySelectorAll('#nav button')].forEach((b) => b.classList.toggle('active', b.dataset.route === hash));
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', async () => { await refreshState(); renderNav(); router(); });

function renderNav() {
  const order = ['overview', 'home', 'products', 'labs', 'skills', 'radar', 'media', 'publish'];
  const labels = { overview: 'Overview', home: 'Home', products: 'Products', labs: 'Labs', skills: 'Skills', radar: 'Radar', media: 'Media', publish: 'Publish' };
  document.getElementById('nav').innerHTML = order.map((k) => `<button data-route="${k}" onclick="location.hash='#${k}'">${labels[k]}</button>`).join('');
  const s = getStateBadge(state);
  document.getElementById('status').innerHTML = s;
}

function getStateBadge(s) {
  const git = s.gitAllowed ? '<span class="badge allowed">GIT: ON</span>' : '<span class="badge frozen">GIT: FREEZE</span>';
  const dirty = s.dirty ? '<span class="badge tag-warn">dirty</span>' : '<span class="badge tag-ok">clean</span>';
  return `${git} ${dirty} ${s.branch || ''} ${s.head ? s.head.slice(0, 7) : ''}`;
}

async function renderOverview() {
  const s = await refreshState();
  const c = s.counts || {};
  const html = `
    <div class="card grid">
      <div class="grid-2"><div><div class="muted">Production URL</div><div>${esc(s.productionUrl || '(unset)')}</div></div>
        <div><div class="muted">Studio URL</div><div><a href="${esc(s.studioUrl || '')}">${esc(s.studioUrl || '')}</a></div></div>
        <div><div class="muted">Branch</div><div>${esc(s.branch || '')}</div></div>
        <div><div class="muted">HEAD</div><div>${esc(s.head || '')}</div></div>
        <div><div class="muted">Worktree</div><div>${s.dirty ? 'dirty' : 'clean'}</div></div>
        <div><div class="muted">Changed files</div><div>${(s.changedFiles || []).length || 0}${s.changedFiles ? ' · ' + s.changedFiles.join(', ') : ''}</div></div>
        <div><div class="muted">Counts</div><div>Products ${c.products || 0} · Labs ${c.labs || 0} · Skills ${c.skills || 0} · Radar ${c.radar || 0}</div></div>
        <div><div class="muted">Git writes</div><div>${s.gitAllowed ? 'enabled (STUDIO_ALLOW_GIT=1)' : 'disabled — Publish is a dry-run'}</div></div>
      </div>
    </div>`;
  document.getElementById('content').innerHTML = html;
}

async function renderHome() {
  const r = await fetchJSON(api('/studio/api/home'));
  const home = r.body.home || {};
  let form = '<form id="home-form"><div class="card">';
  form += buildForm(home);
  form += '</div><div class="row" style="margin-top:12px"><button class="btn btn-ghost" onclick="validateHome()">Validate</button><button class="btn btn-primary" onclick="saveHome()">Save</button></div></form>';
  form += '<div id="home-result" class="muted"></div>';
  document.getElementById('content').innerHTML = form;
}

async function validateHome() {
  const form = document.getElementById('home-form');
  const r = await fetchJSON(api('/studio/api/home/validate'), { method: 'POST', body: JSON.stringify({ home: readForm(form) }) });
  document.getElementById('home-result').innerHTML = r.ok && r.body.valid ? '<span class="tag-ok">VALID</span>' : '<span class="tag-bad">' + (r.body.errors || []).join('; ') + '</span>';
}

async function saveHome() {
  const form = document.getElementById('home-form');
  const r = await fetchJSON(api('/studio/api/home'), { method: 'POST', body: JSON.stringify({ home: readForm(form) }) });
  document.getElementById('home-result').innerHTML = r.ok ? '<span class="tag-ok">Saved locally · content/home.ts</span>' : '<span class="tag-bad">' + JSON.stringify(r.body) + '</span>';
  refreshState();
}

async function renderSection(section, label) {
  const r = await fetchJSON(api('/studio/api/entries/' + section));
  const items = (r.body.entries || []).map((e) => `<tr><td>${esc(e.slug)}</td><td>${esc((e.entry.title) || '')}</td><td><a href="#${section}/${e.slug}">edit</a></td></tr>`).join('');
  let html = `<div class="card"><h2>${label}</h2><table><thead><tr><th>Slug</th><th>Title</th><th></th></tr></thead><tbody>${items}</tbody></table></div>`;
  if (location.hash.startsWith('#' + section + '/')) { await renderEntryEditor(section); return; }
  document.getElementById('content').innerHTML = html;
}

async function renderEntryEditor(section) {
  const m = location.hash.slice(1).split('/'); // [section, slug]
  const slug = m[1];
  const r = await fetchJSON(api('/studio/api/entries/' + section + '/' + slug));
  const entry = r.body.entry || {};
  let html = `<div class="card"><h2>${section} / ${esc(slug)}</h2><form id="entry-form">${buildForm(entry)}</form>`;
  let actions = `<div class="row" style="margin-top:12px"><button class="btn btn-ghost" onclick="location.hash='#${section}'">Back</button><button class="btn btn-primary" onclick="saveEntry('${section}','${slug}')">Save</button>`;
  if (section === 'labs') actions += `<button class="btn btn-ghost" onclick="promoteLab('${slug}')">Promote to Product</button>`;
  actions += '</div>';
  html += actions;
  html += '<div id="entry-result" class="muted"></div></div>';
  document.getElementById('content').innerHTML = html;
}

/** Promote a Lab to a draft Product (status coming_soon, no invented release). */
async function promoteLab(slug) {
  const ok = window.confirm(
    'Promote lab "' + slug + '" to a DRAFT Product?\n\n' +
    'This creates content/products/' + slug + '.ts with status coming_soon and NO ' +
    'releases. Add a real release before it can be published as available.',
  );
  if (!ok) return;
  const r = await fetchJSON(api('/studio/api/entries/labs/' + slug + '/promote'), {
    method: 'POST',
    body: JSON.stringify({ create: true }),
  });
  document.getElementById('entry-result').innerHTML = r.ok
    ? '<span class="tag-ok">Draft product created · ' + esc((r.body.changedFiles || []).join(', ')) + '</span>'
    : '<span class="tag-bad">' + esc((r.body.errors || [r.body.error || 'failed']).join('; ')) + '</span>';
  refreshState();
}

async function saveEntry(section, slug) {
  const form = document.getElementById('entry-form');
  const r = await fetchJSON(api('/studio/api/entries/' + section + '/' + slug), { method: 'POST', body: JSON.stringify({ entry: readForm(form) }) });
  document.getElementById('entry-result').innerHTML = r.ok ? '<span class="tag-ok">Saved locally · ' + (r.body.changedFiles || []).join(', ') + '</span>' : '<span class="tag-bad">' + (r.body.errors ? r.body.errors.join('; ') : JSON.stringify(r.body)) + '</span>';
  refreshState();
}

async function renderMedia() {
  const s = state;
  let html = `<div class="card"><h2>Media</h2>`;
  html += `<p class="muted">Replacement assets are immutable & versioned. Old files are never overwritten or deleted.</p>`;
  html += `<form id="upload-form"><div class="row"><div class="field small"><label>Product slug</label><input name="slug" placeholder="e.g. jutell"></div>`;
  html += `<div class="field small"><label>Slot</label><select name="slot">${(['poster','overviewVideo','actualDemo'].map((x)=>`<option>${x}</option>`)).join('')}</select></div>`;
  html += `<div class="field small"><label>File</label><input type="file" id="upload-file"></div></div>`;
  html += `<button class="btn btn-primary" onclick="uploadMedia(event)">Upload</button></form>`;
  html += `<div id="media-result" class="muted"></div></div>`;
  // pre-list first product media if a slug typed
  document.getElementById('content').innerHTML = html;
}

async function uploadMedia(ev) {
  ev.preventDefault();
  const slug = document.querySelector('#upload-form input[name="slug"]').value.trim();
  const slot = document.querySelector('#upload-form select[name="slot"]').value;
  const file = document.getElementById('upload-file').files[0];
  if (!file) return (document.getElementById('media-result').innerHTML = '<span class="tag-bad">select a file</span>');
  const buf = await file.arrayBuffer();
  const r = await fetch(api('/studio/api/media/' + slug + '/' + slot), {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': file.name },
    body: buf,
  });
  const body = await r.text();
  let jsonResult; try { jsonResult = JSON.parse(body); } catch {}
  document.getElementById('media-result').innerHTML = r.ok
    ? '<span class="tag-ok">Uploaded ' + esc(jsonResult.path) + ' (' + jsonResult.byteSize + ' bytes)</span>'
    : '<span class="tag-bad">' + esc(jsonResult && jsonResult.error ? jsonResult.error : body) + '</span>';
}

async function renderPublish() {
  const r = await fetchJSON(api('/studio/api/publish/prepare'), { method: 'POST' });
  const p = r.body;
  const gates = p.gates || {};
  const gateStr = (k) => (gates[k] ? '<span class="tag-ok">PASS</span>' : '<span class="tag-bad">FAIL</span>');
  let html = `<div class="card"><h2>Publish</h2>`;
  html += `<div class="kv"><table><tr><td>Proposed branch</td><td>${esc(p.branch || '')}</td></tr>`;
  html += `<tr><td>HEAD</td><td>${esc(p.head || '')}</td></tr>`;
  html += `<tr><td>Remote main changed</td><td>${p.remoteMainChanged ? '<span class="tag-bad">YES — STOP</span>' : '<span class="tag-ok">no</span>'}</td></tr>`;
  html += `<tr><td>Changed files</td><td>${(p.changedFiles||[]).join(', ') || 'none'}</td></tr>`;
  html += `<tr><td>BUILD</td><td>${gateStr('build')}</td></tr>`;
  html += `<tr><td>TEST</td><td>${gateStr('test')}</td></tr>`;
  html += `<tr><td>REGISTRY</td><td>${gateStr('registry')}</td></tr>`;
  html += `<tr><td>LINKS</td><td>${gateStr('links')}</td></tr></table></div>`;
  if (!p.publishable) {
    html += `<p class="muted">Publish is blocked: ${p.reasons ? p.reasons.join('; ') : 'gates failed'}.</p>`;
    if (state.gitAllowed) { html += '<button class="btn btn-ghost" onclick="doPublish()">Attempt Publish anyway</button>'; }
    else { html += '<span class="badge frozen">GIT FREEZE ACTIVE — Commit/Push disabled</span>'; }
  } else {
    html += `<p class="muted">Ready to publish to ${esc(p.branch)}.</p>`;
    if (state.gitAllowed) html += '<button class="btn btn-primary" onclick="confirmPublish()">Publish (commit + push + PR)</button>';
    else html += '<span class="badge frozen">GIT FREEZE ACTIVE — Commit/Push disabled (dry-run only)</span>';
  }
  html += `</div><div id="publish-result" class="muted"></div>`;
  document.getElementById('content').innerHTML = html;
}

/** Explicit confirmation step before any git write (contract §12). */
function confirmPublish() {
  const ok = window.confirm(
    'Publish to a NEW content branch and open a Pull Request?\n\n' +
    'This commits the current content changes and pushes a branch. It never ' +
    'writes to main and never merges.',
  );
  if (ok) doPublish();
}

async function doPublish() {
  const r = await fetchJSON(api('/studio/api/publish'), { method: 'POST' });
  const b = r.body || {};
  const msg = r.ok
    ? '<span class="tag-ok">PULL REQUEST READY · ' + esc(b.branch || '') +
      (b.sha ? ' · ' + esc(String(b.sha).slice(0, 10)) : '') +
      (b.pr ? ' · <a href="' + esc(b.pr) + '" target="_blank" rel="noopener">' + esc(b.pr) + '</a>' : '') +
      '</span>'
    : '<span class="tag-bad">' + esc(b.message || b.reason || JSON.stringify(b)) + '</span>';
  document.getElementById('publish-result').innerHTML = msg;
}

// expose for inline onclick
window.validateHome = validateHome;
window.saveHome = saveHome;
window.saveEntry = saveEntry;
window.promoteLab = promoteLab;
window.uploadMedia = uploadMedia;
window.confirmPublish = confirmPublish;
window.doPublish = doPublish;
