/* =========================================================================
   motion.js — "Bloom" motion layer (pairs with motion.css)
   · Bioluminescent plankton: the cursor leaves a glowing wake; a click
     sets off a bloom (like dinoflagellates disturbed at night)
   · Hero algae shy away from the cursor
   · Cards: spotlight that follows the cursor + breathing membrane
   · Sedimentation reveal for JS-rendered cards (blog list)
   · Tubular photobioreactor in the footer
   Vanilla, no dependencies. Reduced motion → nothing hidden, nothing moves.
   ========================================================================= */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  var root = document.documentElement;
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  var isDark = function () {
    var t = root.getAttribute('data-theme');
    return t ? t === 'dark' : darkQuery.matches;
  };

  // ---------- Cards: spotlight + membrane ----------
  var CARDS = '.research-card, .quick-card, .blog-card, .grant-card, .sup-card, .course-card, .stat-card, .gallery-item, .about-card';
  var BREATHE = '.research-card, .quick-card, .blog-card, .grant-card, .sup-card, .course-card';
  function cellify(el) {
    if (el.classList.contains('m-cell')) return;
    el.classList.add('m-cell');
    if (el.matches(BREATHE)) el.classList.add('m-breathe');
  }
  $$(CARDS).forEach(cellify);

  if (fine) {
    var spot = null, sx = 0, sy = 0, sraf = 0;
    var paintSpot = function () {
      sraf = 0;
      if (!spot) return;
      var r = spot.getBoundingClientRect();
      spot.style.setProperty('--mx', (sx - r.left).toFixed(1) + 'px');
      spot.style.setProperty('--my', (sy - r.top).toFixed(1) + 'px');
    };
    document.addEventListener('pointermove', function (e) {
      spot = e.target.closest ? e.target.closest('.m-cell') : null;
      if (!spot) return;
      sx = e.clientX; sy = e.clientY;
      if (!sraf) sraf = requestAnimationFrame(paintSpot);
    }, { passive: true });
  }

  // ---------- Sedimentation for cards rendered by script (blog list) ----------
  var settleTargets = $$('#blogGrid > *, .blog-grid > .blog-card').filter(function (el) {
    return !el.closest('.reveal, .reveal-child');
  });
  if (!reduce && 'IntersectionObserver' in window && settleTargets.length) {
    var settleObs = new IntersectionObserver(function (entries) {
      var hits = entries.filter(function (e) { return e.isIntersecting; }).map(function (e) { return e.target; });
      hits.forEach(function (el, i) {
        settleObs.unobserve(el);
        el.style.setProperty('--m-d', Math.min(i, 6) * 80 + 'ms');
        el.classList.add('m-settle');
        el.classList.remove('m-wait');
        setTimeout(function () { el.classList.remove('m-settle'); el.style.removeProperty('--m-d'); }, 1600);
      });
    }, { threshold: 0 });
    settleTargets.forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.95) return;   // already in view: leave it alone
      el.classList.add('m-wait');
      el.addEventListener('focusin', function () { el.classList.remove('m-wait'); }, { once: true });
      settleObs.observe(el);
    });
    window.addEventListener('beforeprint', function () { $$('.m-wait').forEach(function (el) { el.classList.remove('m-wait'); }); });
  }

  // ---------- Hero algae avoid the cursor ----------
  var hero = document.querySelector('.hero');
  var algae = hero ? $$('.hero-bg .alga', hero) : [];
  if (hero && algae.length && fine && !reduce) {
    var hx = 0, hy = 0, hraf = 0;
    var pushAlgae = function () {
      hraf = 0;
      var rects = algae.map(function (a) { return a.getBoundingClientRect(); });
      algae.forEach(function (a, i) {
        var r = rects[i];
        var dx = r.left + r.width / 2 - hx, dy = r.top + r.height / 2 - hy;
        var d = Math.hypot(dx, dy) || 1, reach = 240;
        var k = d < reach ? (1 - d / reach) * 46 : 0;
        a.style.setProperty('--m-px', (dx / d * k).toFixed(1) + 'px');
        a.style.setProperty('--m-py', (dy / d * k).toFixed(1) + 'px');
      });
    };
    hero.addEventListener('pointermove', function (e) {
      hx = e.clientX; hy = e.clientY;
      if (!hraf) hraf = requestAnimationFrame(pushAlgae);
    }, { passive: true });
    hero.addEventListener('pointerleave', function () {
      algae.forEach(function (a) { a.style.removeProperty('--m-px'); a.style.removeProperty('--m-py'); });
    });
  }

  // ---------- Footer photobioreactor ----------
  var footer = document.querySelector('.footer');
  if (footer && !footer.querySelector('.m-pbr')) {
    var tube = document.createElement('span');
    tube.className = 'm-pbr';
    tube.setAttribute('aria-hidden', 'true');
    var html = '';
    for (var b = 0; b < 9; b++) {
      var s = (3 + (b * 7) % 5).toFixed(0), t = (5 + (b * 3) % 5).toFixed(1), d = (-b * 1.37).toFixed(2);
      html += '<i style="--s:' + s + 'px;--t:' + t + 's;--d:' + d + 's"></i>';
    }
    tube.innerHTML = html;
    footer.insertBefore(tube, footer.firstChild);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        tube.classList.toggle('m-off', !es[es.length - 1].isIntersecting);
      }).observe(footer);
    }
  }

  // ---------- Bioluminescent plankton ----------
  if (reduce || !fine) return;

  var canvas = document.createElement('canvas');
  canvas.className = 'm-plankton';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;
  function size() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  size();
  window.addEventListener('resize', size, { passive: true });

  // Pre-rendered glow sprites (one per colour per theme): cheap drawImage instead of per-frame gradients
  var PALETTE = {
    dark:  ['#67e8f9', '#8fd77f', '#7fcec1', '#a5f3fc'],
    light: ['#0891b2', '#4a9846', '#1f7c70', '#0e7490']
  };
  function sprite(color) {
    var c = document.createElement('canvas'), n = 48;
    c.width = c.height = n;
    var g = c.getContext('2d'), grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.18, color);
    grad.addColorStop(0.45, color + '55');
    grad.addColorStop(1, color + '00');
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
    return c;
  }
  var SPRITES = { dark: PALETTE.dark.map(sprite), light: PALETTE.light.map(sprite) };

  var MAX = 180, parts = [], rings = [], running = false, last = 0;
  var lx = null, ly = null;

  function spawn(x, y, vx, vy, life, r) {
    if (parts.length >= MAX) parts.shift();
    parts.push({ x: x, y: y, vx: vx, vy: vy, age: 0, life: life, r: r, c: (Math.random() * 4) | 0, ph: Math.random() * 6.28 });
  }
  function start() {
    if (running) return;
    running = true; last = performance.now();
    requestAnimationFrame(tick);
  }
  function tick(now) {
    var dt = Math.min(48, now - last); last = now;
    ctx.clearRect(0, 0, W, H);
    var dark = isDark(), set = SPRITES[dark ? 'dark' : 'light'];
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      var t = p.age / p.life;
      p.vx *= 0.965; p.vy = p.vy * 0.965 - 0.004 * dt / 16;          // drag, then a slow upward drift
      p.x += p.vx * dt / 16 + Math.sin(p.ph + p.age * 0.006) * 0.25;  // little flagellar wiggle
      p.y += p.vy * dt / 16;
      var flick = 0.75 + 0.25 * Math.sin(p.ph + p.age * 0.02);        // bioluminescent flicker
      var a = (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) * flick * (dark ? 0.95 : 0.55);
      var s = p.r * (dark ? 6 : 4.5) * (1 - t * 0.35);
      ctx.globalAlpha = Math.max(0, a);
      ctx.drawImage(set[p.c], p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (var j = rings.length - 1; j >= 0; j--) {
      var g = rings[j];
      g.age += dt;
      if (g.age >= g.life) { rings.splice(j, 1); continue; }
      var u = g.age / g.life, e = 1 - Math.pow(1 - u, 3);
      ctx.globalAlpha = (1 - u) * (dark ? 0.55 : 0.35);
      ctx.strokeStyle = dark ? '#67e8f9' : '#1f7c70';
      ctx.lineWidth = 1.5 * (1 - u) + 0.5;
      ctx.beginPath(); ctx.arc(g.x, g.y, 6 + e * 70, 0, 6.2832); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (parts.length || rings.length) requestAnimationFrame(tick);
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }

  document.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    var x = e.clientX, y = e.clientY;
    if (lx === null) { lx = x; ly = y; return; }
    var dx = x - lx, dy = y - ly, dist = Math.hypot(dx, dy);
    if (dist < 4) return;
    var n = Math.min(4, Math.floor(dist / 10) + 1);
    for (var k = 0; k < n; k++) {
      var f = (k + Math.random()) / n;
      spawn(lx + dx * f + (Math.random() - 0.5) * 6, ly + dy * f + (Math.random() - 0.5) * 6,
            dx * 0.02 + (Math.random() - 0.5) * 0.6, dy * 0.02 + (Math.random() - 0.5) * 0.6,
            700 + Math.random() * 700, 1.2 + Math.random() * 1.8);
    }
    lx = x; ly = y;
    start();
  }, { passive: true });
  document.addEventListener('pointerleave', function () { lx = ly = null; });
  window.addEventListener('blur', function () { lx = ly = null; });

  // A press disturbs the water: the plankton flare outward in a bloom
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    var x = e.clientX, y = e.clientY;
    for (var k = 0; k < 26; k++) {
      var ang = (k / 26) * 6.2832 + Math.random() * 0.3, sp = 1.2 + Math.random() * 2.6;
      spawn(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, 900 + Math.random() * 800, 1.4 + Math.random() * 2);
    }
    rings.push({ x: x, y: y, age: 0, life: 900 });
    start();
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { parts.length = 0; rings.length = 0; }
  });
})();
