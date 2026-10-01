/* JU Portal — JU Brand System V1 client behaviour.
   Progressive enhancement only: the Portal is fully usable with JS disabled —
   navigation is real links, media uses native controls, deep routes work.
   Motion follows APPEAR -> ASSEMBLE -> RESOLVE and respects reduced-motion. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var canObserve = 'IntersectionObserver' in window;

  // ---------- motion system (one contract) ----------
  // Hero:    [data-hero].is-sequenced  -> CSS timeline APPEAR -> ASSEMBLE -> RESOLVE
  // Story:   [data-story].is-in        -> scroll-once, resolves to the final state
  // Reveal:  html.js-reveal .reveal.is-in -> generic rise for bands/tiles/rows
  // Reduced motion never adds .is-sequenced and resolves everything immediately.
  var heroSignal = document.querySelector('[data-signal-field]');
  var hero = document.querySelector('[data-hero]');
  if (hero && !reduced) hero.classList.add('is-sequenced');

  /** Observe once, then mark. Falls back to marking immediately. */
  function markWhenVisible(el, cls, threshold) {
    if (reduced || !canObserve) { el.classList.add(cls); return; }
    var io = new IntersectionObserver(function (entries) {
      if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
      el.classList.add(cls);
      io.disconnect();
    }, { threshold: threshold });
    io.observe(el);
  }

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
  // Pointer response is per-particle, so the geometry the pointer maths needs is
  // cached here while the dots are created: normalised source position, its
  // deterministic tangential sign, and the element itself. Nothing below ever
  // reads a dot back from the DOM to learn where it is.
  var portraitDots = null;
  if (portraitHost) {
    fetch('/brand/founder-signal.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var frag = document.createDocumentFragment();
        var pts = [];
        var settleAt = 0;
        for (var i = 0; i < data.dots.length; i++) {
          var d = data.dots[i];
          var el = document.createElement('i');
          el.className = 'portrait-dot ' + d.t;
          el.style.left = ((d.x + 0.5) / data.cols * 100).toFixed(3) + '%';
          el.style.top = ((d.y + 0.5) / data.rows * 100).toFixed(3) + '%';
          // Feature dots stay larger than calm skin so the face reads as a
          // person. The floor is tiered: one shared floor turned every dot
          // into the same cloud.
          var dotSize = d.t === 'hi'
            ? Math.max(3.4, d.r * 2.55)
            : d.t === 'mid'
              ? Math.max(2.3, d.r * 2.1)
              : Math.max(1.6, d.r * 1.6);
          el.style.width = dotSize.toFixed(2) + 'px';
          el.style.height = dotSize.toFixed(2) + 'px';
          el.style.setProperty('--a', d.a);
          // ASSEMBLE: each dot travels in from a scatter offset derived from its
          // own grid position. Deterministic: the same dot always takes the
          // same path.
          el.style.setProperty('--ox', (((d.x + 0.5) / data.cols - 0.5) * 30).toFixed(1) + 'px');
          el.style.setProperty('--oy', (((d.y + 0.5) / data.rows - 0.5) * 30).toFixed(1) + 'px');
          // APPEAR: the sparse 'lo' dots land first (0-0.35s); the face ('mid'
          // and 'hi') assembles after them (0.35-1.25s).
          var phase = (d.x * 0.6 + d.y * 1.1) % 18;
          var delay = d.t === 'lo' ? phase * 0.02 : 0.35 + phase * 0.05;
          el.style.setProperty('--d', reduced ? '0s' : delay.toFixed(3) + 's');
          if (!reduced && delay + 0.9 > settleAt) settleAt = delay + 0.9;
          frag.appendChild(el);
          // Normalised source position (0-1) is enough: the pointer field maps
          // into the same space, so the portrait stays correct at any size.
          // The tangential sign is derived from position, not randomness, so
          // every reload produces the identical field.
          pts.push({
            nx: (d.x + 0.5) / data.cols,
            ny: (d.y + 0.5) / data.rows,
            spin: (d.x % 2 ? 1 : -1) * ((d.y % 2) ? 1 : -1),
            el: el,
            moved: false
          });
        }
        portraitHost.appendChild(frag);
        portraitDots = pts;

        // ASSEMBLE owns `transform` with fill:both while it runs, so the
        // per-dot pointer displacement cannot apply until the last dot has
        // landed. Releasing the animation hands the transform back to the base
        // rule at that exact moment; the class is one write on the container,
        // not 1.7k class removals, and the composed position is identical.
        if (settleAt) {
          window.setTimeout(function () {
            if (hero) hero.classList.add('is-settled');
          }, settleAt * 1000 + 40);
        }

        // Story figures reuse every 4th dot of the same derived geometry, so
        // the human silhouette in 01/02 is the same signal, sparser.
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

        // The pointer field can only be indexed once the particles exist, so it
        // starts here rather than on script load.
        startPortraitInteraction();
      })
      .catch(function () { portraitHost.remove(); });
  }

  // ---------- founder portrait: per-particle pointer response ----------
  // Each dot reacts on its own. The portrait is never translated as one layer:
  // the field itself stays put and only dots inside the pointer's radius are
  // displaced, each by an amount that falls off with distance from the pointer.
  //
  // Cost control, because this is ~1.7k particles:
  //   - source coordinates are cached as normalised values at build time, so
  //     there is no getBoundingClientRect() per dot and no layout read at all;
  //   - one pointer listener on the field, not one per dot;
  //   - one rAF per pointer event, and a new frame is only queued when the
  //     pointer actually moved, so an idle pointer costs nothing;
  //   - a uniform grid over normalised space is queried first, so a frame only
  //     ever touches the handful of dots near the pointer rather than all of
  //     them, and never restarts a transition on a dot it does not affect;
  //   - a style write happens only when that dot's displacement really changed.
  // Touch and reduced-motion never reach this block, so the portrait rests at
  // its resolved positions.
  var PORTRAIT_RADIUS = 96;   // px at desktop hero scale
  var PORTRAIT_MAX = 10;      // px, the ceiling for the dot nearest the pointer
  var PORTRAIT_BUCKETS = 10;  // grid divisions across the field

  function startPortraitInteraction() {
  if (heroSignal && portraitDots && portraitDots.length && !reduced && finePointer) {
      // Uniform grid over normalised space. Buckets are rebuilt only if the field
      // is resized, so pointer frames never touch the geometry again.
      var CELL = 1 / PORTRAIT_BUCKETS;
      var fieldW = 0;
      var fieldH = 0;
      var grid = null;
      var radiusN = 0;
      var active = [];
      var generation = 0;
      var pointerFrame = 0;

      /** (Re)measure the field once per layout change and index the particles. */
      function reindex() {
        var rect = heroSignal.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        fieldW = rect.width;
        fieldH = rect.height;
        radiusN = Math.min(1, PORTRAIT_RADIUS / fieldW);
        grid = new Array(PORTRAIT_BUCKETS * PORTRAIT_BUCKETS);
        for (var i = 0; i < portraitDots.length; i++) {
          var p = portraitDots[i];
          var b = Math.min(PORTRAIT_BUCKETS - 1, (p.nx / CELL) | 0) +
                  Math.min(PORTRAIT_BUCKETS - 1, (p.ny / CELL) | 0) * PORTRAIT_BUCKETS;
          (grid[b] || (grid[b] = [])).push(p);
        }
        return true;
      }
      // A hidden or zero-size field cannot be measured yet; render() retries on
      // every pointer frame and re-indexes as soon as it has a size.
      reindex();

      /** Displace one dot for this frame. Returns true if it is being moved. */
      function displace(dot, px, py, stamp) {
        var pdx = px - dot.nx * fieldW;
        var pdy = py - dot.ny * fieldH;
        var dist = Math.sqrt(pdx * pdx + pdy * pdy);
        if (dist >= PORTRAIT_RADIUS) return false;
        // Squared falloff: the closest dots move the most, the ones near the rim
        // of the radius barely move, everything past it does not move at all.
        var prox = 1 - dist / PORTRAIT_RADIUS;
        var push = prox * prox * PORTRAIT_MAX;
        if (push < 0.05) return false;
        var ux = dist > 0.001 ? pdx / dist : 1;
        var uy = dist > 0.001 ? pdy / dist : 0;
        // Repulsion plus a small deterministic tangential term, so the field bends
        // around the pointer instead of only thinning.
        var spin = dot.spin;
        var ex = ux * push + uy * spin * push * 0.3;
        var ey = uy * push - ux * spin * push * 0.3;
        var sx = ex.toFixed(2) + 'px';
        var sy = ey.toFixed(2) + 'px';
        if (dot.dx !== sx || dot.dy !== sy) {
          dot.dx = sx;
          dot.dy = sy;
          dot.el.style.setProperty('--dx', sx);
          dot.el.style.setProperty('--dy', sy);
        }
        dot.moved = true;
        dot.stamp = stamp;
        return true;
      }

      /** Return a dot to its own source position, once. */
      function clear(dot) {
        if (!dot.moved) return;
        dot.moved = false;
        dot.dx = '0px';
        dot.dy = '0px';
        dot.el.style.setProperty('--dx', '0px');
        dot.el.style.setProperty('--dy', '0px');
      }

      function render(clientX, clientY) {
        var rect = heroSignal.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        if (rect.width !== fieldW || rect.height !== fieldH) {
          if (!reindex()) return;
          // A resize invalidates the previous frame's active set; settle first so
          // no dot is left holding a displacement in the old geometry.
          for (var s = 0; s < active.length; s++) clear(active[s]);
          active = [];
        }
        var px = clientX - rect.left;
        var py = clientY - rect.top;
        var stamp = ++generation;
        var span = Math.ceil(radiusN / CELL);
        var cx = Math.floor(px / fieldW / CELL);
        var cy = Math.floor(py / fieldH / CELL);
        var x0 = Math.max(0, cx - span);
        var x1 = Math.min(PORTRAIT_BUCKETS - 1, cx + span);
        var y0 = Math.max(0, cy - span);
        var y1 = Math.min(PORTRAIT_BUCKETS - 1, cy + span);
        var seen = [];
        for (var by = y0; by <= y1; by++) {
          for (var bx = x0; bx <= x1; bx++) {
            var bucket = grid[by * PORTRAIT_BUCKETS + bx];
            if (!bucket) continue;
            for (var k = 0; k < bucket.length; k++) {
              var dot = bucket[k];
              if (displace(dot, px, py, stamp)) seen.push(dot);
            }
          }
        }
        // Any dot moved last frame but not this one has left the radius, so it
        // returns to its own source position instead of staying displaced.
        for (var j = 0; j < active.length; j++) {
          if (active[j].stamp !== stamp) clear(active[j]);
        }
        active = seen;
        renderMark(clientX, clientY);
      }

      // The JU Signal Dot Mark gets the same individual-dot treatment, at a
      // lower amplitude than the portrait. It is never moved as one block.
      var markHost = heroSignal.querySelector('.signal-resolve .tile-signal');
      var markDots = [];
      if (markHost) {
        Array.prototype.slice.call(markHost.querySelectorAll('circle')).forEach(function (c) {
          markDots.push({
            nx: parseFloat(c.getAttribute('cx')) / 240,
            ny: parseFloat(c.getAttribute('cy')) / 160,
            el: c,
            dx: '',
            dy: ''
          });
        });
      }
      var MARK_RADIUS = 46;  // viewBox units; the mark is 240x160, so this stays local
      var MARK_MAX = 3;      // deliberately well under the portrait's 10px

      function renderMark(clientX, clientY) {
        if (!markDots.length || !markHost) return;
        var box = markHost.getBoundingClientRect();
        if (!box.width || !box.height) return;
        var px = (clientX - box.left) / box.width * 240;
        var py = (clientY - box.top) / box.height * 160;
        for (var k = 0; k < markDots.length; k++) {
          var d = markDots[k];
          var pdx = px - d.nx * 240;
          var pdy = py - d.ny * 160;
          var dist = Math.sqrt(pdx * pdx + pdy * pdy);
          var sx = '0px';
          var sy = '0px';
          if (dist < MARK_RADIUS) {
            var prox = 1 - dist / MARK_RADIUS;
            var push = prox * prox * MARK_MAX;
            var ux = dist > 0.001 ? pdx / dist : 1;
            var uy = dist > 0.001 ? pdy / dist : 0;
            sx = (ux * push).toFixed(2) + 'px';
            sy = (uy * push).toFixed(2) + 'px';
          }
          if (d.dx !== sx || d.dy !== sy) {
            d.dx = sx;
            d.dy = sy;
            d.el.style.setProperty('--dx', sx);
            d.el.style.setProperty('--dy', sy);
          }
        }
      }

      function settleMark() {
        for (var k = 0; k < markDots.length; k++) {
          var d = markDots[k];
          if (d.dx === '0px') continue;
          d.dx = '0px';
          d.dy = '0px';
          d.el.style.setProperty('--dx', '0px');
          d.el.style.setProperty('--dy', '0px');
        }
      }

      function settle() {
        for (var j = 0; j < active.length; j++) clear(active[j]);
        active = [];
        settleMark();
      }

      heroSignal.addEventListener('pointermove', function (event) {
        if (pointerFrame) return;
        pointerFrame = window.requestAnimationFrame(function () {
          pointerFrame = 0;
          render(event.clientX, event.clientY);
        });
      }, { passive: true });

      heroSignal.addEventListener('pointerleave', settle, { passive: true });

      // The field is a fluid aspect box, so its pixel size changes with the
      // viewport. Re-index on resize and settle; the next pointermove rebuilds
      // the field for the new geometry. The particle data itself never changes.
      window.addEventListener('resize', function () {
        if (reindex()) settle();
      }, { passive: true });
  }
  }

  // ---------- story sections 01-04: play once when seen ----------
  document.querySelectorAll('[data-story]').forEach(function (story) {
    markWhenVisible(story, 'is-in', 0.18);
  });

  // ---------- narrative signal figures: the middle tier of the same physics ----
  // The sparse figures in 01/02 bend around the pointer like the portrait does,
  // but at half the amplitude: enough to feel like one material, never enough
  // to compete with the face. One listener per figure, coordinates read from
  // the DOM once.
  if (!reduced && finePointer) {
    var STORY_RADIUS = 62;
    var STORY_MAX = 4.5;
    document.querySelectorAll('[data-dots="human"]').forEach(function (host) {
      var dots = Array.prototype.slice.call(host.querySelectorAll('.story-dot'));
      if (!dots.length) return;
      var box0 = host.getBoundingClientRect();
      var sources = dots.map(function (d) {
        return {
          nx: (parseFloat(d.style.left) / 100) * box0.width,
          ny: (parseFloat(d.style.top) / 100) * box0.height,
          el: d,
          dx: '',
          dy: ''
        };
      });
      var frame = 0;
      host.addEventListener('pointermove', function (event) {
        if (frame) return;
        frame = window.requestAnimationFrame(function () {
          var rect = host.getBoundingClientRect();
          if (!rect.width) { frame = 0; return; }
          var px = event.clientX - rect.left;
          var py = event.clientY - rect.top;
          for (var k = 0; k < sources.length; k++) {
            var s = sources[k];
            var vx = px - s.nx;
            var vy = py - s.ny;
            var dist = Math.sqrt(vx * vx + vy * vy);
            var sx = '0px';
            var sy = '0px';
            if (dist > 0.001 && dist < STORY_RADIUS) {
              var prox = 1 - dist / STORY_RADIUS;
              var push = prox * prox * STORY_MAX;
              sx = ((vx / dist) * push).toFixed(2) + 'px';
              sy = ((vy / dist) * push).toFixed(2) + 'px';
            }
            if (s.dx !== sx || s.dy !== sy) {
              s.dx = sx;
              s.dy = sy;
              s.el.style.setProperty('--dx', sx);
              s.el.style.setProperty('--dy', sy);
            }
          }
          frame = 0;
        });
      }, { passive: true });
      host.addEventListener('pointerleave', function () {
        for (var k = 0; k < sources.length; k++) {
          if (sources[k].dx === '0px') continue;
          sources[k].dx = '0px';
          sources[k].dy = '0px';
          sources[k].el.style.setProperty('--dx', '0px');
          sources[k].el.style.setProperty('--dy', '0px');
        }
      }, { passive: true });
    });
  }

  // ---------- product tiles: the signal icon shares the portrait's physics -----
  // Same material as the hero field, at the weakest strength: each circle
  // repels the pointer locally (max 1.6px) instead of the mark moving as one
  // block. Coordinates are read from the SVG viewBox once, so a pointer frame
  // never touches the DOM. Touch and reduced-motion skip this entirely.
  // Icon micro-assembly on reveal keys off --i, so it is set for every pointer type.
  document.querySelectorAll('.tile .tile-signal').forEach(function (icon) {
    icon.querySelectorAll('circle').forEach(function (c, index) { c.style.setProperty('--i', index); });
  });
  if (!reduced && finePointer) {
    var ICON_RADIUS = 70;   // viewBox units (the mark is 240x160)
    var ICON_MAX = 1.6;     // the quietest tier of the same physics
    document.querySelectorAll('.tile .tile-signal').forEach(function (icon) {
      var tile = icon.closest('.tile');
      if (!tile) return;
      var circles = Array.prototype.slice.call(icon.querySelectorAll('circle')).map(function (c) {
        return {
          nx: parseFloat(c.getAttribute('cx')),
          ny: parseFloat(c.getAttribute('cy')),
          el: c,
          dx: '',
          dy: ''
        };
      });
      if (!circles.length) return;
      var frame = 0;
      tile.addEventListener('pointermove', function (event) {
        if (frame) return;
        frame = window.requestAnimationFrame(function () {
          var box = icon.getBoundingClientRect();
          if (!box.width) { frame = 0; return; }
          var scale = box.width / 240;
          var px = (event.clientX - box.left) / scale;
          var py = (event.clientY - box.top) / scale;
          for (var k = 0; k < circles.length; k++) {
            var dot = circles[k];
            var vx = px - dot.nx;
            var vy = py - dot.ny;
            var dist = Math.sqrt(vx * vx + vy * vy);
            var sx = '0px';
            var sy = '0px';
            if (dist > 0.001 && dist < ICON_RADIUS) {
              var prox = 1 - dist / ICON_RADIUS;
              var push = prox * prox * ICON_MAX;
              sx = ((vx / dist) * push).toFixed(2) + 'px';
              sy = ((vy / dist) * push).toFixed(2) + 'px';
            }
            if (dot.dx !== sx || dot.dy !== sy) {
              dot.dx = sx;
              dot.dy = sy;
              dot.el.style.setProperty('--dx', sx);
              dot.el.style.setProperty('--dy', sy);
            }
          }
          frame = 0;
        });
      }, { passive: true });
      tile.addEventListener('pointerleave', function () {
        for (var k = 0; k < circles.length; k++) {
          if (circles[k].dx === '0px') continue;
          circles[k].dx = '0px';
          circles[k].dy = '0px';
          circles[k].el.style.setProperty('--dx', '0px');
          circles[k].el.style.setProperty('--dy', '0px');
        }
      }, { passive: true });
    });
  }

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
    document.addEventListener('animationend', function (event) {
      var el = event.target;
      if (el.classList && el.classList.contains('reveal') && event.animationName === 'ju-rise') el.classList.add('is-done');
    });
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
