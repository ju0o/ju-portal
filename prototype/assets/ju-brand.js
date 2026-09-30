/* JU Brand System V1 — motion.
   APPEAR → ASSEMBLE → RESOLVE. Everything here is progressive enhancement:
   with JS off the page is fully readable and navigable. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── scroll reveal ──────────────────────────────────────
  // The .js-reveal class is added here, not in CSS, so content is never hidden
  // unless this script is running and able to reveal it again.
  var revealables = Array.prototype.slice.call(
    document.querySelectorAll('.hero-copy > *, .band-title, .beat, .tile, .join-title, .join-sub, .join-form')
  );
  if (!reduced && 'IntersectionObserver' in window && revealables.length) {
    document.documentElement.classList.add('js-reveal');
    revealables.forEach(function (el) { el.classList.add('reveal'); });
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          var delay = parseFloat(el.getAttribute('data-delay') || '0');
          setTimeout(function () { el.classList.add('is-in'); }, delay * 1000);
          io.unobserve(el);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );
    revealables.forEach(function (el) { io.observe(el); });

    // Safety net: anything still hidden after load is force-revealed, so a
    // capture or an odd scroll position can never show blank sections.
    setTimeout(function () {
      revealables.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 2.2) el.classList.add('is-in');
      });
    }, 1200);
  }

  // ── side rail: active section + vertical progress ──────
  var sections = Array.prototype.slice.call(document.querySelectorAll('[data-section]'));
  var railItems = Array.prototype.slice.call(document.querySelectorAll('[data-rail]'));
  var progress = document.querySelector('[data-progress]');

  function syncRail() {
    var y = window.scrollY;
    var vh = window.innerHeight;

    var currentId = sections.length ? sections[0].id : null;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].offsetTop - vh * 0.35 <= y) currentId = sections[i].id;
    }
    railItems.forEach(function (item) {
      item.classList.toggle('is-active', item.getAttribute('data-rail') === currentId);
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
    window.requestAnimationFrame(function () {
      syncRail();
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  syncRail();

  // ── founder portrait: derived dot field ─────────────────
  // The data is luminance-sampled dot geometry, not image bytes. It is loaded
  // as a separate JSON so the page never carries any raster of the source.
  var portraitHost = document.querySelector('[data-founder-dots]');
  if (portraitHost) {
    fetch('assets/founder-signal.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var frag = document.createDocumentFragment();
        for (var i = 0; i < data.dots.length; i++) {
          var d = data.dots[i];
          var el = document.createElement('i');
          el.className = 'portrait-dot ' + d.t;
          el.style.left = ((d.x + 0.5) / data.cols * 100).toFixed(3) + '%';
          el.style.top = ((d.y + 0.5) / data.rows * 100).toFixed(3) + '%';
          el.style.width = d.r + 'px';
          el.style.height = d.r + 'px';
          el.style.opacity = d.a;
          // staggered assembly, deterministic
          el.style.animation = 'ju-draw .5s var(--ease) backwards';
          el.style.animationDelay = ((d.x * 0.6 + d.y * 1.1) % 18) * 0.05 + 's';
          frag.appendChild(el);
        }
        portraitHost.appendChild(frag);
      })
      .catch(function () {
        // Missing derived data must not break the hero.
        portraitHost.remove();
      });
  }

  // ── human dot field: a figure assembled from dots ───────
  // Deterministic layout so the shape is stable between renders.
  var field = document.querySelector('[data-dots="human"]');
  if (field) {
    var COLS = 18;
    var ROWS = 16;
    var html = '';
    var seed = 7;
    function rnd() {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    }
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var nx = c / (COLS - 1) - 0.5;
        var ny = r / (ROWS - 1) - 0.5;
        // head + shoulders silhouette
        var head = nx * nx * 3.2 + ny * ny * 2.1 < 0.16;
        var body = ny > 0.08 && Math.abs(nx) < 0.42 - ny * 0.22;
        if (!head && !body) continue;
        if (rnd() > 0.86) continue; // sparse, so it reads as scattered signal
        var size = 3 + Math.round(rnd() * 2);
        html +=
          '<i class="dot" style="left:' + (c * 5.4 + 1) + '%;top:' + (r * 5.6 + 1) +
          '%;width:' + size + 'px;height:' + size + 'px;animation-delay:' + (rnd() * 1.6).toFixed(2) + 's"></i>';
      }
    }
    field.innerHTML = html;
  }

  // ── AI working states sequence ─────────────────────────
  if (!reduced) {
    var states = Array.prototype.slice.call(document.querySelectorAll('.state'));
    var idx = 0;
    setInterval(function () {
      if (!states.length) return;
      states.forEach(function (s) { s.classList.remove('is-on'); });
      states[idx % states.length].classList.add('is-on');
      idx++;
    }, 1100);
  }

  // ── email CTA (prototype only: no backend) ─────────────
  var form = document.querySelector('[data-join-form]');
  var status = document.querySelector('[data-join-status]');
  if (form && status) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = form.querySelector('input').value.trim();
      if (!value) return;
      // Prototype: no subscription backend exists at V1.
      status.textContent = 'PROTOTYPE ONLY — no subscription endpoint yet.';
    });
  }
})();
