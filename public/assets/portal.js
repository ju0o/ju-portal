/* JU Portal — JU Brand System V1 client behaviour.
   Progressive enhancement only: the Portal is fully usable with JS disabled —
   navigation is real links, media uses native controls, deep routes work.
   Motion follows APPEAR -> ASSEMBLE -> RESOLVE and respects reduced-motion. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
          el.style.width = d.r + 'px';
          el.style.height = d.r + 'px';
          el.style.opacity = d.a;
          el.style.animation = 'ju-draw .5s var(--ease) backwards';
          el.style.animationDelay = ((d.x * 0.6 + d.y * 1.1) % 18) * 0.05 + 's';
          frag.appendChild(el);
        }
        portraitHost.appendChild(frag);
      })
      .catch(function () { portraitHost.remove(); });
  }

  // ---------- scroll reveal ----------
  // The .js-reveal class is added here, not in CSS, so content is never hidden
  // unless this script is running and able to reveal it again.
  var revealables = Array.prototype.slice.call(
    document.querySelectorAll('.hero-copy > *, .band-title, .band-head, .tile, .labrow, .empty')
  );
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

  // ---------- side rail: active section + progress ----------
  var sections = Array.prototype.slice.call(document.querySelectorAll('[data-section]'));
  var railItems = Array.prototype.slice.call(document.querySelectorAll('[data-rail]'));
  var progress = document.querySelector('[data-progress]');

  function syncRail() {
    var y = window.scrollY;
    var vh = window.innerHeight;
    var current = sections.length ? sections[0].id : null;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].offsetTop - vh * 0.35 <= y) current = sections[i].id;
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
