/* JU Portal — JU Brand System V1 client behaviour.
   Progressive enhancement only: the Portal is fully usable with JS disabled —
   navigation is real links, media uses native controls, deep routes work.
   Motion follows APPEAR -> ASSEMBLE -> RESOLVE and respects reduced-motion. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Hero: APPEAR -> ASSEMBLE -> RESOLVE ----------
  var heroSignal = document.querySelector('[data-signal-field]');
  var hero = document.querySelector('[data-hero]');
  if (hero && !reduced) hero.classList.add('is-sequenced');

  // ---------- copy buttons ----------
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var value = btn.getAttribute('data-copy') || '';
      if (!navigator.clipboard || !navigator.clipboard.writeText) return;
      navigator.clipboard.writeText(value).then(
        function () {
          btn.textContent = '복사됨';
          setTimeout(function () { btn.textContent = '복사'; }, 1800);
        },
        function () {},
      );
    });
  });

  // ---------- founder portrait: derived dot geometry ----------
  // Loaded as separate JSON so the page never carries any raster of the source.
  var portraitHost = document.querySelector('[data-founder-dots]');
  if (portraitHost) {
    fetch('/brand/founder-signal.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var frag = document.createDocumentFragment();
        for (var i = 0; i < data.dots.length; i++) {
          var d = data.dots[i];
          var el = document.createElement('i');
          el.className = 'portrait-dot ' + d.t;
          el.style.left = ((d.x + 0.5) / data.cols * 100).toFixed(3) + '%';
          el.style.top = ((d.y + 0.5) / data.rows * 100).toFixed(3) + '%';
          // Slightly enlarge the sampled dots so the human remains legible on
          // small screens, without changing or shipping the private source.
          var dotSize = Math.max(2.2, d.r * 2.25);
          el.style.width = dotSize.toFixed(2) + 'px';
          el.style.height = dotSize.toFixed(2) + 'px';
          el.style.setProperty('--a', d.a);
          el.style.setProperty('--ox', (((d.x + 0.5) / data.cols - 0.5) * 30).toFixed(1) + 'px');
          el.style.setProperty('--oy', (((d.y + 0.5) / data.rows - 0.5) * 30).toFixed(1) + 'px');
          el.style.setProperty('--d', reduced ? '0s' : (((d.x * 0.6 + d.y * 1.1) % 18) * 0.045).toFixed(3) + 's');
          frag.appendChild(el);
        }
        portraitHost.appendChild(frag);

        document.querySelectorAll('[data-dots="human"]').forEach(function (host) {
          var storyFrag = document.createDocumentFragment();
          for (var j = 0; j < data.dots.length; j += 4) {
            var source = data.dots[j];
            var dot = document.createElement('i');
            dot.className = 'story-dot' + (j % 17 === 0 ? ' is-lime' : '');
            dot.style.left = ((source.x + 0.5) / data.cols * 100).toFixed(3) + '%';
            dot.style.top = ((source.y + 0.5) / data.rows * 100).toFixed(3) + '%';
            dot.style.setProperty('--a', source.a);
            dot.style.setProperty('--d', reduced ? '0s' : ((source.x * 0.4 + source.y * 0.6) % 14 * 0.045).toFixed(3) + 's');
            storyFrag.appendChild(dot);
          }
          host.appendChild(storyFrag);
        });
      })
      .catch(function () { portraitHost.remove(); });
  }

  // A small pointer parallax gives the hero signal field a response without a
  // canvas or continuous animation loop. Touch and reduced-motion are static.
  if (heroSignal && !reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var pointerFrame = 0;
    heroSignal.addEventListener('pointermove', function (event) {
      if (pointerFrame) return;
      pointerFrame = window.requestAnimationFrame(function () {
        var rect = heroSignal.getBoundingClientRect();
        var dx = (event.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
        var dy = (event.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
        heroSignal.style.setProperty('--px', (dx * 8).toFixed(1) + 'px');
        heroSignal.style.setProperty('--py', (dy * 8).toFixed(1) + 'px');
        pointerFrame = 0;
      });
    }, { passive: true });
    heroSignal.addEventListener('pointerleave', function () {
      heroSignal.style.setProperty('--px', '0px');
      heroSignal.style.setProperty('--py', '0px');
    }, { passive: true });
  }

  document.querySelectorAll('[data-beat]').forEach(function (beat) {
    if (reduced || !('IntersectionObserver' in window)) {
      beat.classList.add('is-live');
      return;
    }
    var beatObserver = new IntersectionObserver(function (entries) {
      if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
      beat.classList.add('is-live');
      beatObserver.disconnect();
    }, { threshold: 0.25 });
    beatObserver.observe(beat);
  });

  document.querySelectorAll('[data-story]').forEach(function (story) {
    var figure = story.querySelector('.story-figure');
    if (!figure) return;
    if (reduced || !('IntersectionObserver' in window)) {
      figure.classList.add('is-in');
      story.querySelectorAll('.story-body').forEach(function (body) { body.classList.add('is-in'); });
      return;
    }
    var storyObserver = new IntersectionObserver(function (entries) {
      if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
      figure.classList.add('is-in');
      story.querySelectorAll('.story-body').forEach(function (body) { body.classList.add('is-in'); });
      storyObserver.disconnect();
    }, { threshold: 0.15 });
    storyObserver.observe(story);
  });

  // ---------- scroll reveal ----------
  // The .js-reveal class is added here, not in CSS, so content is never hidden
  // unless this script is running and able to reveal it again.
  //
  // Hero copy is excluded: it is driven by the hero's own five-beat sequence
  // (is-sequenced), so it must not also be faded in by this observer.
  var revealables = Array.prototype.slice.call(
    document.querySelectorAll('.band-title, .band-head, .tile, .labrow, .empty')
  ).filter(function (el) { return !el.closest('.hero'); });
  if (!reduced && 'IntersectionObserver' in window && revealables.length) {
    document.documentElement.classList.add('js-reveal');
    revealables.forEach(function (el) { el.classList.add('reveal'); });
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );
    revealables.forEach(function (el) { io.observe(el); });
    setTimeout(function () {
      revealables.forEach(function (el) {
        if (el.getBoundingClientRect().top < window.innerHeight * 2.4) el.classList.add('is-in');
      });
    }, 1200);
  }

  // ---------- discovery (DESIGN_CONTRACT §4) ----------
  // Registry-driven keyword matching over a build-time dataset. Client-side
  // only: no backend, no LLM, no network request.
  var INDEX_RAW = document.body.getAttribute('data-discovery-index');
  var form = document.querySelector('[data-discovery]');
  var banner = document.querySelector('[data-banner]');
  if (INDEX_RAW && form && banner) {
    var INDEX;
    try {
      INDEX = JSON.parse(INDEX_RAW);
    } catch (e) {
      INDEX = null;
    }
    if (INDEX) {
      var input = form.querySelector('input');

      /** Exact title hits outweigh substring hits. */
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
          if (name.indexOf(t) !== -1) total += 12;
          else if (hay.indexOf(t) !== -1) total += 4;
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

      function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }

      function renderHit(query) {
        if (!query.trim()) {
          banner.hidden = true;
          banner.innerHTML = '';
          return;
        }
        var hit = find(query);
        banner.hidden = false;
        if (!hit) {
          banner.innerHTML =
            '<span>추천 없음</span><br>문제나 필요를 다른 표현으로 입력해보세요.';
          return;
        }
        banner.innerHTML =
          '추천: <span class="recname">' + escHtml(hit.name) + '</span> — ' +
          escHtml(hit.tagline) + ' <a href="' + escHtml(hit.href) + '">열어보기</a>';
      }

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        renderHit(input.value);
      });
      input.addEventListener('input', function () {
        renderHit(input.value);
      });
      document.querySelectorAll('[data-hint]').forEach(function (chip) {
        chip.addEventListener('click', function () {
          input.value = chip.getAttribute('data-hint') || '';
          renderHit(input.value);
        });
      });
    }
  }

  // ---------- side rail: active section + progress ----------
  var sections = Array.prototype.slice.call(document.querySelectorAll('[data-section]'));
  var railItems = Array.prototype.slice.call(document.querySelectorAll('[data-rail]'));
  var progress = document.querySelector('[data-progress]');

  function syncRail() {
    var y = window.scrollY;
    var vh = window.innerHeight;
    // Sections are identified by data-section, not id: most Portal pages carry
    // data-section without a matching id, so reading .id alone would leave the
    // rail with no active item.
    var current = sections.length
      ? sections[0].getAttribute('data-section') || sections[0].id
      : null;
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      if (s.offsetTop - vh * 0.35 <= y) current = s.getAttribute('data-section') || s.id;
    }
    railItems.forEach(function (item) {
      var on = item.getAttribute('data-rail') === current;
      item.classList.toggle('is-active', on);
      if (on) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    if (progress) {
      var max = Math.max(1, document.body.scrollHeight - vh);
      progress.style.height = Math.min(100, Math.max(0, (y / max) * 100)) + '%';
    }
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () { syncRail(); ticking = false; });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  syncRail();

  // ---------- showroom overlay ----------
  // Desktop only; below 850px the deep route is used. Modified clicks are not
  // intercepted, so "open in new tab" still reaches the real route.
  var DESKTOP_MIN = 850;
  if (document.body.getAttribute('data-has-overlay') === 'true' &&
      window.matchMedia('(min-width: ' + DESKTOP_MIN + 'px)').matches) {
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
      var close = ov.querySelector('[data-overlay-close]');
      if (close) close.focus();
      return true;
    }
    function closeOverlay(ov) {
      if (!ov || ov.hidden) return;
      ov.hidden = true;
      ov.classList.remove('open');
      if (!document.querySelector('.overlay.open')) document.body.classList.remove('is-locked');
      if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
      lastFocused = null;
    }

    document.querySelectorAll('[data-showroom]').forEach(function (trigger) {
      trigger.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if (openOverlay(trigger.getAttribute('data-showroom'), trigger)) e.preventDefault();
      });
    });

    document.addEventListener('click', function (e) {
      var ov = e.target.closest ? e.target.closest('.overlay') : null;
      if (!ov) return;
      if (e.target.closest('[data-overlay-close]')) { closeOverlay(ov); return; }
      if (e.target === ov) closeOverlay(ov);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var open = document.querySelector('.overlay.open');
      if (open) closeOverlay(open);
    });
  }
})();
