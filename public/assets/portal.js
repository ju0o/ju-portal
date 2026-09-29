/* Progressive enhancement only. The site is fully usable with JS disabled:
   navigation is real links, video uses native controls. */
(function () {
  'use strict';

  // Mobile nav toggle
  var toggle = document.querySelector('[data-nav-toggle]');
  var panel = document.getElementById('mobile-nav');
  if (toggle && panel) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      toggle.setAttribute('aria-label', open ? '메뉴 열기' : '메뉴 닫기');
      toggle.innerHTML = open ? '&#9776;' : '&times;';
      panel.hidden = open;
    });
  }

  // Copy buttons
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var value = btn.getAttribute('data-copy') || '';
      var done = function () {
        var original = btn.getAttribute('data-label') || '복사';
        btn.textContent = '복사됨';
        setTimeout(function () {
          btn.textContent = original;
        }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(done, function () {});
      }
    });
  });

  // Analytics: the four contract events, no PII. Disabled unless enabled.
  var enabled = document.documentElement.getAttribute('data-analytics') === 'true';
  if (enabled && window.va && typeof window.va === 'function') {
    document.querySelectorAll('[data-cta]').forEach(function (el) {
      el.addEventListener('click', function () {
        window.va('product_cta_click', {
          slug: el.getAttribute('data-slug'),
          provider: el.getAttribute('data-provider') || undefined,
          verb: el.getAttribute('data-verb') || undefined,
        });
      });
    });
    document.querySelectorAll('video').forEach(function (v) {
      var sent = false;
      v.addEventListener('play', function () {
        if (sent) return;
        sent = true;
        window.va('media_play', { slug: document.body.getAttribute('data-slug') || undefined });
      });
    });
  }
})();
