/* JU Portal — JU Brand System V1 client behaviour.
   Progressive enhancement only: the Portal is fully usable with JS disabled —
   navigation is real links, media uses native controls, deep routes work.
   Motion follows APPEAR -> CONNECT -> PROCESS -> RESOLVE (state-driven, one-shot)
   and respects reduced-motion. The one deliberate exception is the hero
   sculpture: a living, seamlessly looping ambient object drawn on <canvas>. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var canObserve = 'IntersectionObserver' in window;

  // ---------- motion system (one contract) ----------
  // Hero:    [data-hero-sculpture]     -> the volumetric object (canvas), looping
  // Story:   [data-story].is-in        -> scroll-once, resolves to the final state
  // Reveal:  html.js-reveal .reveal.is-in -> generic rise for bands/tiles/rows
  // Reduced motion never adds .is-sequenced and resolves everything immediately.
  var hero = document.querySelector('[data-hero]');
  if (hero && !reduced) hero.classList.add('is-sequenced');

  // ---------- hero sculpture: one volumetric ASCII object ----------

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

  // ---------- volumetric renderer (shared factory, Hero SSOT) ----------
  // The Hero canvas engine below is the visual family SSOT. Lower narrative
  // sections create lighter instances of the SAME engine via `volumetric()`,
  // each with its own morph sequence — same material, different form.
  // Hero defaults preserve the approved loop byte-for-byte in behaviour:
  // dense lattice, seamless 9s cycle, offscreen pause, desktop pointer bend.
  var VOL_LEVELS = [
    { r: 36, g: 42, b: 54, a: 0.28, s: 2 },
    { r: 76, g: 90, b: 110, a: 0.6, s: 2 },
    { r: 134, g: 150, b: 174, a: 0.8, s: 2 },
    { r: 202, g: 212, b: 228, a: 0.94, s: 3 },
    { r: 242, g: 241, b: 234, a: 1.0, s: 3 }
  ];
  var VOL_LIME = { r: 216, g: 255, b: 79, a: 1.0 }; // JU lime: only the JU-moment core

  /** Deterministic micro-jitter from the lattice indices — never random. */
  function volHash(a, b) {
    var n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function volSmooth(x) { return x * x * (3 - 2 * x); }

  /**
   * Shared volumetric dot-matrix sculpture on a <canvas>.
   *
   * opts:
   *   states    5-scalar morph states [knot, capsule, openShell, juHint, ripple]
   *   weights   dwell weight per state (loop timing)
   *   loopMs    one seamless morph cycle
   *   static    reduced-motion phase: one resolved frame
   *   density   'hero' (300x140) | 'section' (160x76) | 'compact' (110x54)
   *   mode      'loop'  -> seamless cycle (Hero)
   *             'once'  -> plays the sequence once when the host enters, then
   *                        holds the resolved ambient frame (lower sections)
   *   reach/max bounded pointer bend (0 disables)
   *   pause     observe the host and stop rAF offscreen (default true)
   *
   * Returns { resume, pause } so scroll activation can be driven externally.
   */
  function volumetric(canvas, opts) {
    var host = (canvas.closest && canvas.closest('[data-sculpture-host]')) || canvas;
    var stage = (canvas.closest && canvas.closest('[data-hero-stage],[data-section-stage]')) || host;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var STATES = opts.states;
    var WEIGHTS = opts.weights;
    var LOOP_MS = opts.loopMs || 9000;
    var STATIC_PHASE = opts.static != null ? opts.static : 0.04;
    var P_RADIUS = opts.reach != null ? opts.reach : 150;
    var P_MAX = opts.max != null ? opts.max : 8;
    var CULL = 0.34;
    var LEVELS = VOL_LEVELS;
    var LIME = VOL_LIME;
    var MODE = opts.mode || 'loop';
    var FORM = opts.form || 'hero';
    var pointerProfile = opts.pointer || null;

    var W = 0, H = 0, U = 0, V = 0, pts = null;
    var bufW = 0, bufH = 0, dpr = 1, img = null, data = null;
    var running = false, raf = 0, resolved = false, built = false;
    var stageVisible = false, pointerTarget = 0, pointerStrength = 0;
    var t0 = 0, acc = 0, last = 0, wallMs = 0;
    var px = -9999, py = -9999, tpx = -9999, tpy = -9999, pointerOn = false;
    var pointerResult = { x: 0, y: 0 };

    function sizeCanvas() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return false;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      bufW = Math.round(w * dpr);
      bufH = Math.round(h * dpr);
      canvas.width = bufW;
      canvas.height = bufH;
      img = ctx.createImageData(bufW, bufH);
      data = img.data;
      W = w; H = h;
      return true;
    }

    function buildLattice() {
      var dense = W >= 520;
      if (opts.density === 'section') {
        U = dense ? 160 : 110; V = dense ? 76 : 54;
      } else if (opts.density === 'compact') {
        U = dense ? 110 : 80; V = dense ? 54 : 40;
      } else {
        U = dense ? 300 : 150; V = dense ? 140 : 72;
      }
      pts = [];
      if (FORM !== 'hero') {
        var serial = 0;
        function add(x, y, z, group, extra) {
          extra = extra || {};
          var id = serial++;
          var scattered = FORM === 'architecture' || (FORM === 'engine' && group === 'route');
          pts.push({
            x0: x, y0: y, z0: z, group: group,
            sx: extra.sx == null ? (scattered ? (volHash(id, 31) - 0.5) * 3.4 : x) : extra.sx,
            sy: extra.sy == null ? (scattered ? (volHash(31, id) - 0.5) * 1.8 : y) : extra.sy,
            sz: extra.sz == null ? (scattered ? (volHash(id + 2, 13) - 0.5) * 1.1 : z) : extra.sz,
            mx: extra.mx == null ? x : extra.mx,
            my: extra.my == null ? y : extra.my,
            mz: extra.mz == null ? z : extra.mz,
            nz: extra.nz == null ? -0.55 : extra.nz,
            accent: extra.accent || false,
            mobileSkip: volHash(id, 25) < 0.25,
            jx: (volHash(id, 8) - 0.5) * 0.008,
            jy: (volHash(8, id) - 0.5) * 0.008,
            jz: (volHash(id + 7, 3) - 0.5) * 0.008
          });
        }
        function line(a, b, group, extra) {
          var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
          var steps = Math.max(2, Math.ceil(Math.sqrt(dx * dx + dy * dy + dz * dz) / 0.028));
          for (var k = 0; k <= steps; k++) {
            var f = k / steps;
            add(a[0] + dx * f, a[1] + dy * f, a[2] + dz * f, group, extra && extra(f, k));
          }
        }

        if (FORM === 'architecture') {
          for (var layer = 0; layer < 2; layer++) {
            var z = layer ? 0.40 : -0.40;
            var xs = [-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2];
            var ys = [-0.68, -0.34, 0, 0.34, 0.68];
            for (var xi = 0; xi < xs.length; xi++) {
              line([xs[xi], -0.68, z], [xs[xi], 0.68, z], 'frame', function (f, k) {
                var scattered = FORM === 'architecture';
                return {
                  sx: scattered ? (volHash(k, xi + layer * 9) - 0.5) * 3.4 : 0,
                  sy: scattered ? (volHash(xi + 4, k + layer) - 0.5) * 1.8 : 0,
                  sz: scattered ? (volHash(k + 3, xi + 7) - 0.5) * 1.1 : z,
                  accent: k === 0 || k === Math.ceil(1 / 0.028) ? layer === 1 : false
                };
              });
            }
            for (var yi = 0; yi < ys.length; yi++) {
              line([-1.2, ys[yi], z], [1.2, ys[yi], z], 'frame');
            }
          }
          for (var ax = 0; ax < xs.length; ax++) {
            for (var ay = 0; ay < ys.length; ay++) {
              if ((ax + ay) % 2 === 0) line([xs[ax], ys[ay], -0.4], [xs[ax], ys[ay], 0.4], 'frame', function () { return { accent: true }; });
            }
          }
          for (var brace = 0; brace < 4; brace++) {
            var bx = -1.2 + brace * 0.8;
            line([bx, -0.68, -0.4], [bx + 0.4, 0.68, -0.4], 'frame');
          }
        } else if (FORM === 'receiver') {
          var rings = 12, sides = 80;
          for (var ri = 0; ri < rings; ri++) {
            var f = ri / (rings - 1), rx = -1.05 + f * 1.72, radius = 0.82 - f * 0.57;
            for (var side = 0; side < sides; side++) {
              var ang = side / sides * Math.PI * 2;
              add(rx, Math.cos(ang) * radius, Math.sin(ang) * radius * 0.76, 'receiver', { nz: -0.62 });
            }
          }
          for (var rib = 0; rib < 12; rib++) {
            var ra = rib / 12 * Math.PI * 2;
            line([-1.05, Math.cos(ra) * 0.82, Math.sin(ra) * 0.62], [0.67, Math.cos(ra) * 0.25, Math.sin(ra) * 0.19], 'receiver');
          }
          for (var packet = 0; packet < 42; packet++) {
            var angle = packet / 42 * Math.PI * 2;
            add(0, Math.cos(angle) * 0.08, Math.sin(angle) * 0.08, 'signal', {
              sx: Math.cos(angle) * 0.08, sy: Math.cos(angle) * 0.08, sz: Math.sin(angle) * 0.08,
              accent: packet % 7 === 0, nz: -0.8
            });
          }
        } else if (FORM === 'engine') {
          for (var route = 0; route < 3; route++) {
            var x = -1.2 + route * 1.2;
            line([x, -0.72, -0.48], [x, 0.72, -0.48], 'route');
            line([x, -0.72, 0.48], [x, 0.72, 0.48], 'route');
            line([x, -0.72, -0.48], [x, -0.72, 0.48], 'route');
            line([x, 0.72, -0.48], [x, 0.72, 0.48], 'route');
          }
          for (var cornerY = 0; cornerY < 2; cornerY++) {
            for (var cornerZ = 0; cornerZ < 2; cornerZ++) {
              var ry = cornerY ? 0.72 : -0.72, rz = cornerZ ? 0.48 : -0.48;
              line([-1.2, ry, rz], [1.2, ry, rz], 'route');
            }
          }
          for (var axis = 0; axis < 3; axis++) {
            for (var u = 0; u < 132; u++) {
              var theta = u / 132 * Math.PI * 2;
              for (var v = 0; v < 8; v++) {
                var phi = v / 8 * Math.PI * 2, tube = 0.12 * Math.cos(phi), ring = 0.62 + 0.12 * Math.sin(phi);
                var tx = ring * Math.cos(theta), ty = ring * Math.sin(theta), tz = tube;
                if (axis === 0) { var swapX = tz; tz = ty; ty = tx; tx = swapX; }
                else if (axis === 1) { var swapY = tx; tx = tz; tz = ty; ty = swapY; }
                add(tx, ty, tz, 'module', {
                  sx: tx + (axis - 1) * 0.9, sy: ty + (axis === 1 ? 0.9 : 0), sz: tz + (axis === 2 ? 0.8 : 0),
                  accent: axis === 0 && v === 0 && u % 22 === 0
                });
              }
            }
          }
          for (var gx = -2; gx <= 2; gx++) {
            for (var gy = -2; gy <= 2; gy++) {
              var cxg = gx * 0.18, cyg = gy * 0.18;
              line([cxg, cyg, -0.36], [cxg, cyg, 0.36], 'module', function () { return { sx: cxg + 0.72, sy: cyg, sz: -0.36 }; });
              line([cxg, -0.36, cyg], [cxg, 0.36, cyg], 'module', function () { return { sx: cxg, sy: -0.36 + (cyg < 0 ? -0.72 : 0.72), sz: cyg }; });
              line([-0.36, cxg, cyg], [0.36, cxg, cyg], 'module', function () { return { sx: -0.36, sy: cxg, sz: cyg + 0.72 }; });
            }
          }
          for (var gx = -0.34; gx <= 0.35; gx += 0.085) {
            for (var gy = -0.34; gy <= 0.35; gy += 0.085) {
              for (var gz = -0.34; gz <= 0.35; gz += 0.085) {
                if (gx * gx + gy * gy + gz * gz < 0.14) add(gx, gy, gz, 'volume', {
                  sx: gx * 0.04, sy: gy * 0.04, sz: gz * 0.04,
                  accent: Math.abs(gx) < 0.03 && Math.abs(gy) < 0.03
                });
              }
            }
          }
          for (var d = 0; d < 180; d++) {
            var dx = (volHash(d, 15) - 0.5) * 3.2, dy = (volHash(4, d) - 0.5) * 1.8, dz = (volHash(d + 8, 6) - 0.5) * 1.2;
            add(dx, dy, dz, 'debris', { accent: d % 29 === 0 });
          }
          for (var sy = 0; sy <= 14; sy++) {
            for (var sz = 0; sz <= 10; sz++) {
              add(0, -0.72 + sy * 0.103, -0.48 + sz * 0.096, 'scan', { my: -0.72 + sy * 0.103, mz: -0.48 + sz * 0.096, accent: sy === 7 });
            }
          }
        } else if (FORM === 'output') {
          for (var panel = 0; panel < 2; panel++) {
            var sign = panel ? 1 : -1;
            for (var py = 0; py <= 24; py++) {
              for (var px = 0; px <= 38; px++) {
                var u2 = px / 38, v2 = py / 24;
                var x2 = sign * (0.16 + u2 * 1.06);
                var y2 = (v2 - 0.5) * 0.92;
                var z2 = 0.08 + 0.11 * Math.sin(u2 * Math.PI) * (v2 - 0.5) * 2;
                add(x2, y2, z2, 'plane', {
                  sx: -1.45 + u2 * 0.95 + (volHash(px, py) - 0.5) * 0.22,
                  sy: (volHash(py, px) - 0.5) * 0.48,
                  sz: (volHash(px + 2, py + 8) - 0.5) * 0.62,
                  mx: sign * 0.11, my: y2 * 0.48, mz: z2 * 0.2,
                  accent: px === 0 && py % 6 === 0
                });
              }
            }
          }
          for (var flow = 0; flow < 360; flow++) {
            var fx = -1.65 + volHash(flow, 21) * 0.9;
            var fy = (volHash(21, flow) - 0.5) * (0.18 + (fx + 1.65) * 0.3);
            var fz = (volHash(flow + 9, 2) - 0.5) * 0.35;
            add(-0.08, fy * 0.3, fz * 0.2, 'flow', { sx: fx, sy: fy, sz: fz, mx: -0.08, my: fy * 0.3, mz: fz * 0.2 });
          }
        }
        return;
      }
      for (var j = 0; j < V; j++) {
        var v = (j + 0.5) / V * Math.PI;
        var y0 = Math.cos(v);
        var sv = Math.sin(v);
        for (var i = 0; i < U; i++) {
          var u = i / U * Math.PI * 2;
          pts.push({
            x0: sv * Math.cos(u),
            y0: y0,
            z0: sv * Math.sin(u),
            knot: Math.sin(3 * u + 3.2 * (v - Math.PI / 2)),
            ripple: Math.cos(6 * u) * Math.sin(3 * v),
            hump: Math.sin(Math.PI * y0),
            jx: (volHash(i, j) - 0.5) * 0.01,
            jy: (volHash(j, i) - 0.5) * 0.01,
            jz: (volHash(i + 7, j + 3) - 0.5) * 0.01
          });
        }
      }
    }

    /** Blend the five states into one scalar set at position t (0..1).
        Loop mode wraps seamlessly (JU dwell stretches across its edges).
        Once mode walks STATES[0]→STATES[4] without wrapping, so t≈1 is the
        resolved final form — never a blend back into the start. */
    function stateAt(t) {
      if (MODE === 'once') {
        var segs = STATES.length - 1;
        var pos = Math.min(0.9999, Math.max(0, t)) * segs;
        var k = Math.min(segs - 1, Math.floor(pos));
        var f = volSmooth(pos - k);
        var a = STATES[k], b = STATES[k + 1];
        return [
          a[0] + (b[0] - a[0]) * f,
          a[1] + (b[1] - a[1]) * f,
          a[2] + (b[2] - a[2]) * f,
          a[3] + (b[3] - a[3]) * f,
          a[4] + (b[4] - a[4]) * f
        ];
      }
      var total = 0, cum = [0];
      for (var w = 0; w < WEIGHTS.length; w++) { total += WEIGHTS[w]; cum.push(total); }
      var pos = (t % 1) * total;
      var k = 0;
      while (k < STATES.length - 1 && pos >= cum[k + 1]) k++;
      var edge = cum[k + 1] - cum[k];
      var f = volSmooth((pos - cum[k]) / edge);
      var a = STATES[k], b = STATES[(k + 1) % STATES.length];
      return [
        a[0] + (b[0] - a[0]) * f,
        a[1] + (b[1] - a[1]) * f,
        a[2] + (b[2] - a[2]) * f,
        a[3] + (b[3] - a[3]) * f,
        a[4] + (b[4] - a[4]) * f
      ];
    }

    /** Apply one bounded, scene-specific point response without moving its stage. */
    function deformLowerPoint(x, y, q) {
      pointerResult.x = x; pointerResult.y = y;
      if (!pointerProfile || !pointerOn || pointerStrength <= 0) return pointerResult;
      if (pointerProfile.mode === 'bend' && q.group !== 'receiver') return pointerResult;
      if (pointerProfile.mode === 'engine' && q.group !== 'module' && q.group !== 'volume') return pointerResult;
      if (pointerProfile.mode === 'separate' && q.group !== 'plane') return pointerResult;

      var dx = px * dpr - x, dy = py * dpr - y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      var reach = pointerProfile.reach * dpr;
      if (distance < 0.001 || distance >= reach) return pointerResult;
      var falloff = 1 - distance / reach;
      var amount = falloff * falloff * pointerProfile.max * dpr * pointerStrength;
      var nx = dx / distance, ny = dy / distance;

      if (pointerProfile.mode === 'organize') {
        pointerResult.x += nx * amount;
        pointerResult.y += ny * amount;
      } else if (pointerProfile.mode === 'bend') {
        pointerResult.x += nx * amount * 0.28;
        pointerResult.y += ny * amount * 0.82;
      } else if (pointerProfile.mode === 'engine') {
        pointerResult.x -= ny * amount;
        pointerResult.y += nx * amount;
      } else if (pointerProfile.mode === 'separate') {
        pointerResult.x += (q.x0 < 0 ? -1 : 1) * amount;
        pointerResult.y += ny * amount * 0.18;
      }
      return pointerResult;
    }

    function draw(t, rotMs) {
      if (!pts || !data) return;
      if (rotMs == null) rotMs = 0;
      var p = FORM === 'hero' ? stateAt(t) : null;
      var knot = p ? p[0] : 0, cap = p ? p[1] : 0, open = p ? p[2] : 0, ju = p ? p[3] : 0, rip = p ? p[4] : 0;

      // Rotation: loop mode turns exactly once per cycle (seamless). Once mode
      // turns on wall-clock time, so the resolved form keeps a slow ambient
      // rotation without ever jumping — pausing offscreen freezes it cleanly.
      var ang = FORM === 'hero' ? (MODE === 'once' ? (rotMs / 26000) * Math.PI * 2 : t * Math.PI * 2) : 0;
      var cy = Math.cos(ang + 0.6), sy = Math.sin(ang + 0.6);
      var rz = 0.3 * Math.sin(ang);
      var cz = Math.cos(rz), sz = Math.sin(rz);
      var sweep = FORM === 'hero' ? 0.9 + 0.1 * Math.cos(ang) : 0.98;

      var cx = bufW / 2, midY = bufH / 2;
      var R = Math.min(bufW, bufH) * 0.5 * 0.56;
      var scaleX = FORM === 'hero' ? 1 : FORM === 'architecture' ? 1.78 : FORM === 'receiver' ? 1.52 : FORM === 'engine' ? 1.48 : 1.55;
      var scaleY = FORM === 'hero' ? 1 : FORM === 'architecture' ? 1.34 : FORM === 'receiver' ? 1.2 : FORM === 'engine' ? 1.45 : 1.12;
      var openCut = 1.02 - open * 1.05;

      data.fill(0);

      for (var n = 0; n < pts.length; n++) {
        var q = pts[n];
        if (FORM !== 'hero' && window.innerWidth < 520 && q.mobileSkip) continue;

        // As the shell opens, a wedge is removed so the form reads as an
        // incomplete circle rather than a solid ball.
        if (FORM === 'hero' && open > 0.001 && (q.x0 * 0.7 + q.y0 * 0.45) > openCut) continue;

        var r = FORM === 'hero' ? 1 + 0.30 * knot * q.knot + 0.16 * rip * q.ripple : 1;
        var x = q.x0 * r, y = q.y0 * r, z = q.z0 * r, opacity = 1;

        if (FORM === 'architecture') {
          var assemble = volSmooth(Math.min(1, t / 0.48));
          x = q.sx + (q.x0 - q.sx) * assemble;
          y = q.sy + (q.y0 - q.sy) * assemble;
          z = q.sz + (q.z0 - q.sz) * assemble;
        } else if (FORM === 'receiver' && q.group === 'signal') {
          var travel = volSmooth(Math.max(0, Math.min(1, (t - 0.1) / 0.76)));
          x = -1.24 + travel * 2.0 + q.sx;
          y = q.sy; z = q.sz;
        } else if (FORM === 'engine') {
          if (q.group === 'volume') {
            var fill = volSmooth(Math.max(0, Math.min(1, (t - 0.18) / 0.34)));
            opacity = fill;
            x = q.sx + (q.x0 - q.sx) * fill; y = q.sy + (q.y0 - q.sy) * fill; z = q.sz + (q.z0 - q.sz) * fill;
          } else if (q.group === 'module') {
            var lock = volSmooth(Math.max(0, Math.min(1, (t - 0.42) / 0.34)));
            opacity = Math.min(1, (t - 0.38) / 0.12);
            x = q.sx + (q.x0 - q.sx) * lock; y = q.sy + (q.y0 - q.sy) * lock; z = q.sz + (q.z0 - q.sz) * lock;
          } else if (q.group === 'debris') {
            var scan = Math.max(0, Math.min(1, (t - 0.7) / 0.25));
            if (scan > 0 && q.x0 < -1.35 + scan * 2.7) continue;
            opacity = 0.65;
          } else if (q.group === 'scan') {
            if (t < 0.68 || t > 0.97) continue;
            x = -1.25 + ((t - 0.68) / 0.29) * 2.5;
            y = q.my; z = q.mz;
            opacity = 0.9;
          } else if (q.group === 'route') {
            var routeIn = volSmooth(Math.min(1, t / 0.2));
            x = q.sx + (q.x0 - q.sx) * routeIn; y = q.sy + (q.y0 - q.sy) * routeIn; z = q.sz + (q.z0 - q.sz) * routeIn;
          }
        } else if (FORM === 'output') {
          var resolve = Math.max(0, Math.min(1, t / 0.44));
          var open = volSmooth(Math.max(0, Math.min(1, (t - 0.4) / 0.58)));
          if (q.group === 'flow') opacity = 1 - open;
          var fx = q.sx + (q.mx - q.sx) * volSmooth(resolve);
          var fy = q.sy + (q.my - q.sy) * volSmooth(resolve);
          var fz = q.sz + (q.mz - q.sz) * volSmooth(resolve);
          x = fx + (q.x0 - fx) * open;
          y = fy + (q.y0 - fy) * open;
          z = fz + (q.z0 - fz) * open;
        }
        if (opacity <= 0.02) continue;

        // capsule: stretch vertically, squeeze laterally
        if (FORM === 'hero') {
          y *= 1 + 0.3 * cap;
          x *= 1 - 0.30 * cap;
          z *= 1 - 0.30 * cap;
        }

        // The JU signal hint: a deliberate double-fold etched into the form — a
        // long vertical inner gap (the J stem clearing) plus a shallow side seam
        // (the U shoulder) — abstract enough to never read as letters, but always
        // the same fold, so the sculpture is recognisably JU's object.
        if (FORM === 'hero' && ju > 0.001) {
          var gap = (q.x0 - 0.08) / 0.16;
          var jcut = Math.exp(-gap * gap) * Math.max(0, -q.y0 + 0.35);
          var seam = Math.exp(-Math.pow((q.z0 + 0.55) / 0.14, 2));
          x += ju * 0.30 * q.hump * (q.x0 >= 0.08 ? 1 : -1);
          y -= ju * 0.22 * Math.max(0, -q.y0);
          y += ju * 0.34 * jcut;
          z -= ju * 0.10 * seam;
        }

        x += q.jx; y += q.jy; z += q.jz;

        // rotate the position around Y, then a little around Z
        var x1 = x * cy + z * sy;
        var z1 = -x * sy + z * cy;
        var x2 = x1 * cz - y * sz;
        var y2 = x1 * sz + y * cz;
        // rotate the outward direction the same way, for face culling
        var nz1 = FORM === 'hero' ? -q.x0 * sy + q.z0 * cy : q.nz;

        // Cull the far side so the sculpture keeps a solid, defined front.
        if (FORM === 'hero' && nz1 > CULL) continue;

        var persp = 1 / (1 + z1 * 0.15);
        var sxp = cx + x2 * persp * R * scaleX;
        var syp = midY - y2 * persp * R * scaleY;

        // Shading: depth (front brighter) combined with face angle (rim darker),
        // so the cloud reads as a lit, rounded volume rather than a flat scatter.
        var dn = (z1 / 1.6 + 1) / 2;
        if (dn < 0) dn = 0; else if (dn > 1) dn = 1;
        var side = nz1 < 0 ? 0 : nz1 / CULL;
        var b = (1 - dn) * (1 - side * 0.82) * sweep;
        if (b < 0) b = 0; else if (b > 1) b = 1;
        var lvl = b * 4.999 | 0;
        if (lvl < 0) lvl = 0; else if (lvl > 4) lvl = 4;

        // edges are dissolved by the shading (b -> 0 at the rim), not a hard cut

        // secondary pointer response: a small local bend, object keeps morphing
        if (pointerOn) {
          if (FORM === 'hero') {
            var ax = sxp - px * dpr, ay = syp - py * dpr;
            var dd = Math.sqrt(ax * ax + ay * ay);
            var reach = P_RADIUS * dpr;
            if (dd > 0.001 && dd < reach) {
              var f2 = 1 - dd / reach;
              f2 = f2 * f2 * P_MAX * dpr;
              sxp += ax / dd * f2;
              syp += ay / dd * f2;
            }
          } else {
            var response = deformLowerPoint(sxp, syp, q);
            sxp = response.x; syp = response.y;
          }
        }

        var L = LEVELS[lvl];
        var a255 = L.a * opacity * 255 | 0;
        if (a255 < 4) continue;
        var lr = L.r, lg = L.g, lb = L.b;
        // At the JU moment, the sculpture's lit centre carries a breath of lime —
        // only the brightest core, and only while ju dominates, so it reads as
        // the brand colour welling up from inside rather than a tint.
        if (ju > 0.55 && lvl >= 3) {
          var mix = (ju - 0.55) * 1.6 * (lvl - 2) / 2;
          if (mix > 0.6) mix = 0.6;
          lr += (LIME.r - lr) * mix;
          lg += (LIME.g - lg) * mix;
          lb += (LIME.b - lb) * mix;
        } else if (FORM !== 'hero' && q.accent && lvl >= 2) {
          var signalMix = lvl >= 4 ? 0.42 : 0.26;
          lr += (LIME.r - lr) * signalMix;
          lg += (LIME.g - lg) * signalMix;
          lb += (LIME.b - lb) * signalMix;
        }
        var s = L.s;
        var ix0 = sxp - s / 2 | 0, iy0 = syp - s / 2 | 0;
        for (var oy = 0; oy < s; oy++) {
          var yy = iy0 + oy;
          if (yy < 0 || yy >= bufH) continue;
          var row = yy * bufW;
          for (var ox = 0; ox < s; ox++) {
            var xx = ix0 + ox;
            if (xx < 0 || xx >= bufW) continue;
            var idx = (row + xx) * 4;
            if (a255 > data[idx + 3]) {
              data[idx] = lr; data[idx + 1] = lg; data[idx + 2] = lb; data[idx + 3] = a255;
            }
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    function frame(ts) {
      raf = window.requestAnimationFrame(frame);
      if (!t0) { t0 = ts; last = ts; }
      var dt = Math.min(100, ts - last);
      last = ts;
      wallMs += dt;
      var t, completed = false;
      if (MODE === 'once') {
        if (resolved) {
          t = 0.999;
        } else {
          acc += dt;
          t = acc / LOOP_MS;
          if (t >= 1) { t = 0.999; resolved = true; completed = true; }
        }
      } else {
        var t2 = ((ts - t0) / LOOP_MS) % 1;
        if (t2 < 0) t2 += 1;
        t = t2;
      }
      if (pointerProfile) {
        pointerStrength += (pointerTarget - pointerStrength) * 0.18;
        if (!pointerTarget && pointerStrength < 0.012) {
          pointerStrength = 0;
          pointerOn = false;
        }
      }
      if (pointerOn) { px += (tpx - px) * 0.22; py += (tpy - py) * 0.22; }
      draw(t, wallMs);
      if (completed && opts.onResolve) window.requestAnimationFrame(opts.onResolve);
      if (MODE === 'once' && resolved && (!pointerProfile || (!pointerOn && pointerStrength === 0))) stopLoop();
    }
    function startLoop() {
      if (running) return;
      if (!built) return;
      if (MODE === 'once' && resolved && (!pointerProfile || !pointerOn || !stageVisible)) { draw(0.999); return; }
      running = true;
      last = 0;
      raf = window.requestAnimationFrame(frame);
    }
    function stopLoop() {
      if (!running) return;
      running = false;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    }
    function resume() { startLoop(); }

    function boot() {
      if (!sizeCanvas()) { window.requestAnimationFrame(boot); return; }
      if (reduced || FORM === 'hero' || opts.pause === false) {
        buildLattice(); built = true;
        draw(reduced ? STATIC_PHASE : 0);
      }
      if (reduced) return;

      if (FORM === 'hero' && finePointer && P_MAX > 0) {
        canvas.addEventListener('pointerenter', function (e) {
          px = tpx = e.offsetX; py = tpy = e.offsetY;
        }, { passive: true });
        canvas.addEventListener('pointermove', function (e) {
          if (!pointerOn) { px = e.offsetX; py = e.offsetY; pointerOn = true; }
          tpx = e.offsetX; tpy = e.offsetY;
        }, { passive: true });
        canvas.addEventListener('pointerleave', function () { pointerOn = false; }, { passive: true });
      } else if (pointerProfile && finePointer) {
        canvas.addEventListener('pointerenter', function (e) {
          px = tpx = e.offsetX; py = tpy = e.offsetY;
          pointerOn = true; pointerTarget = 1;
          if (resolved && stageVisible) startLoop();
        }, { passive: true });
        canvas.addEventListener('pointermove', function (e) {
          if (!pointerOn) { px = e.offsetX; py = e.offsetY; pointerOn = true; }
          tpx = e.offsetX; tpy = e.offsetY; pointerTarget = 1;
          if (resolved && stageVisible) startLoop();
        }, { passive: true });
        canvas.addEventListener('pointerleave', function () {
          pointerTarget = 0;
          if (!pointerStrength) pointerOn = false;
        }, { passive: true });
      }

      // Pause rendering while the host is offscreen; resume when it returns.
      if (opts.pause === false) {
        stageVisible = true;
        startLoop();
      } else if (canObserve) {
        var vis = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
              stageVisible = true;
              if (!built) { buildLattice(); built = true; draw(0); }
              startLoop();
            } else {
              stageVisible = false;
              pointerOn = false; pointerTarget = 0; pointerStrength = 0;
              stopLoop();
            }
          }
        }, { threshold: 0.02, rootMargin: '0px' });
        vis.observe(stage || canvas);
      } else {
        stageVisible = true;
        if (!built) { buildLattice(); built = true; draw(0); }
        startLoop();
      }
    }

    var rt = 0;
    window.addEventListener('resize', function () {
      if (rt) return;
      rt = window.setTimeout(function () {
        rt = 0;
        var prevU = U;
        if (!sizeCanvas()) return;
        var wantU = opts.density === 'section' ? (W >= 520 ? 160 : 110)
          : opts.density === 'compact' ? (W >= 520 ? 110 : 80)
          : (W >= 520 ? 300 : 150);
        if (built && FORM === 'hero' && wantU !== prevU) buildLattice();
        if (reduced) draw(STATIC_PHASE);
        else if (MODE === 'once' && resolved) draw(0.999);
      }, 150);
    }, { passive: true });

    boot();
    return { resume: resume, pause: stopLoop };
  }

  // ---------- hero sculpture: the approved object, unchanged behaviour ----------
  // Hero is a dense seamless loop with desktop pointer bend + offscreen pause.
  function initHeroSculpture() {
    var canvas = document.querySelector('[data-hero-sculpture]');
    if (!canvas || !canvas.getContext) return;
    volumetric(canvas, {
      states: [
        [1.0, 0.0, 0.0, 0.0, 0.15],
        [0.2, 1.0, 0.0, 0.0, 0.0],
        [0.1, 0.2, 1.0, 0.0, 0.35],
        [0.1, 0.0, 0.0, 1.0, 0.05],
        [0.7, 0.0, 0.0, 0.2, 0.5]
      ],
      weights: [1, 1, 1, 1.9, 1],
      loopMs: 9000,
      static: 0.04,
      reach: 150,
      max: 8,
      density: 'hero',
      mode: 'loop'
    });
  }

  // ---------- lower sections: same material, different forms ----------
  // One sculpture per narrative section: lighter than Hero, woken by scroll,
  // paused offscreen, one semantic one-shot sequence into a resolved form.
  var SECTION_SCULPTURES = {
    'brand-value': { form: 'architecture', loopMs: 4200, static: 0.995, density: 'section', pointer: { mode: 'organize', reach: 142, max: 5.0 } },
    'you-instruct': { form: 'receiver', loopMs: 4400, static: 0.995, density: 'section', pointer: { mode: 'bend', reach: 138, max: 4.2 } },
    'ai-works': { form: 'engine', loopMs: 9500, static: 0.995, density: 'section', pointer: { mode: 'engine', reach: 124, max: 2.6 } },
    'real-tool': { form: 'output', loopMs: 5400, static: 0.995, density: 'compact', pointer: { mode: 'separate', reach: 138, max: 3.2 } }
  };

  function initSectionSculptures() {
    var nodes = document.querySelectorAll('[data-section-sculpture]');
    for (var n = 0; n < nodes.length; n++) {
      (function (canvas) {
        if (!canvas.getContext) return;
        var spec = SECTION_SCULPTURES[canvas.getAttribute('data-section-sculpture')];
        if (!spec) return;
        volumetric(canvas, {
          form: spec.form,
          loopMs: spec.loopMs, static: spec.static,
          pointer: spec.pointer,
          density: spec.density, mode: 'once',
          onResolve: canvas.getAttribute('data-section-sculpture') === 'real-tool'
            ? function () {
              var section = canvas.closest('[data-story]');
              if (section) section.classList.add('is-resolved');
            }
            : null
        });
      })(nodes[n]);
    }
  }

  // Initialize only after VOL_LEVELS and the shared renderer are defined.
  initHeroSculpture();
  initSectionSculptures();

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

  // ---------- narrative signal figures (retired by V3.2) ----------
  // Lower sections now carry real volumetric sculptures ([data-section-sculpture],
  // same shared engine as the Hero). No DOM dot fields are generated anymore —
  // without JS the canvases stay empty but all copy remains fully readable.

  // ---------- story sections 01-04: play once when seen ----------
  document.querySelectorAll('[data-story]').forEach(function (story) {
    markWhenVisible(story, 'is-in', 0.18);
  });

  // ---------- narrative dot pointer bend (retired by V3.2) ----------
  // The sculpture canvases bend locally inside their own engine instead.

  // ---------- product tiles: the signal icon shares the sculpture's physics ----
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
