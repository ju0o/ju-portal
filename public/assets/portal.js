/* Progressive enhancement only. The site is fully usable with JS disabled:
   navigation is real links, media uses native controls, deep routes work.
   Discovery (contract §4) is client-side over a build-time dataset - no
   backend, no LLM, no network request.

   The nav toggle that used to live here was removed in DESIGN CONTRACT v1
   §11: the prototype has no hamburger, and the old one had a defect where
   aria-expanded="false" still left its panel rendered. */
(function () {
  'use strict';

  // ---------- showroom overlay (P0-6, contract §6) ----------
  //
  // Desktop only. Below 850px the contract keeps route-style detail, so a card
  // click navigates normally and no overlay is ever shown.
  //
  // Accessibility contract:
  //   - real dialog semantics already in the markup (role/aria-modal/label)
  //   - focus moves into the dialog on open, and returns to the originating
  //     control on close
  //   - Escape closes
  //   - backdrop click closes
  //   - background is inert and body scroll is locked while open
  //
  // Modified clicks (ctrl/meta/shift/middle) are NOT intercepted, so
  // "open in new tab" and the real href both keep working.
  var DESKTOP_MIN = 850;
  var hasOverlay = document.body.getAttribute('data-has-overlay') === 'true';
  if (hasOverlay && window.matchMedia('(min-width: ' + DESKTOP_MIN + 'px)').matches) {
    var lastFocused = null;

    function overlayFor(slug) {
      return document.querySelector('.overlay[data-overlay="' + slug + '"]');
    }

    function openOverlay(slug, trigger) {
      var ov = overlayFor(slug);
      if (!ov) return false;
      lastFocused = trigger || document.activeElement;
      ov.hidden = false;
      ov.classList.add('open');
      document.body.classList.add('is-locked');
      // Move focus into the dialog, onto the close control.
      var close = ov.querySelector('[data-overlay-close]');
      if (close) close.focus();
      return true;
    }

    function closeOverlay(ov) {
      if (!ov || ov.hidden) return;
      ov.hidden = true;
      ov.classList.remove('open');
      if (!document.querySelector('.overlay.open')) {
        document.body.classList.remove('is-locked');
      }
      // Return focus to whatever opened the dialog.
      if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
      lastFocused = null;
    }

    function closeTopmost() {
      var open = document.querySelector('.overlay.open');
      if (open) closeOverlay(open);
    }

    document.querySelectorAll('[data-showroom]').forEach(function (trigger) {
      trigger.addEventListener('click', function (e) {
        // Respect modified clicks: they mean "open the real route".
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        var slug = trigger.getAttribute('data-showroom');
        if (openOverlay(slug, trigger)) {
          e.preventDefault();
        }
      });
    });

    document.addEventListener('click', function (e) {
      var ov = e.target.closest ? e.target.closest('.overlay') : null;
      if (!ov) return;
      if (e.target.closest('[data-overlay-close]')) {
        closeOverlay(ov);
        return;
      }
      // Backdrop click: only when the click landed on the overlay itself.
      if (e.target === ov) closeOverlay(ov);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeTopmost();
    });
  }

  // ---------- copy buttons ----------
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var value = btn.getAttribute('data-copy') || '';
      if (!navigator.clipboard || !navigator.clipboard.writeText) return;
      navigator.clipboard.writeText(value).then(
        function () {
          btn.textContent = '복사됨';
          setTimeout(function () {
            btn.textContent = '복사';
          }, 1800);
        },
        function () {},
      );
    });
  });

  // ---------- discovery (P0-3) ----------
  var INDEX_RAW = document.body.getAttribute('data-discovery-index');
  var form = document.querySelector('[data-discovery]');
  var banner = document.querySelector('[data-banner]');
  if (!INDEX_RAW || !form || !banner) return;

  var INDEX;
  try {
    INDEX = JSON.parse(INDEX_RAW);
  } catch (e) {
    return;
  }

  var input = form.querySelector('input');

  /** Score an entry against the query. Exact title hits outweigh substrings. */
  function score(entry, query) {
    var q = query.trim().toLowerCase();
    if (!q) return 0;
    var hay = (entry.haystack || '').toLowerCase();
    var name = (entry.name || '').toLowerCase();
    var total = 0;
    var terms = q.split(/\s+/).filter(Boolean);
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (!t) continue;
      if (name.indexOf(t) !== -1) {
        total += 12;
      } else if (hay.indexOf(t) !== -1) {
        total += 4;
      }
    }
    return total;
  }

  function find(query) {
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < INDEX.length; i++) {
      var s = score(INDEX[i], query);
      if (s > bestScore) {
        bestScore = s;
        best = INDEX[i];
      }
    }
    return best;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render(query) {
    if (!query.trim()) {
      banner.hidden = true;
      banner.innerHTML = '';
      return;
    }
    var hit = find(query);
    if (!hit) {
      banner.hidden = false;
      banner.innerHTML =
        '<span>추천 없음</span><br>문제나 필요를 다른 표현으로 입력해보세요.';
      return;
    }
    banner.hidden = false;
    banner.innerHTML =
      '추천: <span class="recname">' +
      esc(hit.name) +
      '</span> — ' +
      esc(hit.tagline) +
      ' <a href="' +
      esc(hit.href) +
      '">열어보기</a>';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    render(input.value);
  });

  input.addEventListener('input', function () {
    render(input.value);
  });

  // Hint chips fill the field and run the same matcher.
  document.querySelectorAll('[data-hint]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      input.value = chip.getAttribute('data-hint') || '';
      render(input.value);
    });
  });
})();
