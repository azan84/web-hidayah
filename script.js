/* =========================================================================
   Dr. Nur Hidayah — Interaction layer v2 (redesign-v2)
   Vanilla JS, no dependencies. Respects prefers-reduced-motion.
   ========================================================================= */
(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supportsVT = typeof document.startViewTransition === 'function';

  // ── Theme (dark / light) ─────────────────────────────────────────────
  const THEME_KEY = 'hidayah-theme';
  const root = document.documentElement;

  function applyTheme(theme) {
    if (theme === 'dark' || theme === 'light') {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }
  }
  function currentResolvedTheme() {
    const attr = root.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  const saved = (() => { try { return localStorage.getItem(THEME_KEY); } catch (_) { return null; } })();
  if (saved === 'dark' || saved === 'light') applyTheme(saved);

  let themeBusy = false;
  function toggleTheme(e) {
    if (themeBusy) return;
    const next = currentResolvedTheme() === 'dark' ? 'light' : 'dark';
    const doSwap = () => {
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* ignore */ }
    };
    if (supportsVT && !prefersReducedMotion) {
      // The new palette blooms outward from the toggle, like a culture spreading
      const btn = e && e.currentTarget && e.currentTarget.getBoundingClientRect ? e.currentTarget : null;
      const b = btn ? btn.getBoundingClientRect() : { left: innerWidth / 2, top: 0, width: 0, height: 0 };
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      root.classList.add('vt-theme');
      themeBusy = true;
      const vt = document.startViewTransition(doSwap);
      vt.ready.then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 750, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(() => {});
      vt.finished.finally(() => { themeBusy = false; root.classList.remove('vt-theme'); });
    } else {
      doSwap();
    }
  }

  // ── Navbar scroll effect + scroll progress bar ──────────────────────
  const navbar = document.getElementById('navbar');
  const scrollBar = document.querySelector('.scroll-progress');
  function onScroll() {
    const doc = document.documentElement;
    const scrolled = doc.scrollTop || document.body.scrollTop;
    const max = (doc.scrollHeight - doc.clientHeight) || 1;
    const pct = Math.max(0, Math.min(100, (scrolled / max) * 100));
    if (navbar) navbar.classList.toggle('scrolled', scrolled > 32);
    if (scrollBar) scrollBar.style.width = pct + '%';
    updateParallax(scrolled);
  }

  // ── Parallax (subtle, 2–8%) ─────────────────────────────────────────
  const parallaxTargets = Array.from(document.querySelectorAll('[data-parallax]'));
  function updateParallax(scrollTop) {
    if (prefersReducedMotion || !parallaxTargets.length) return;
    parallaxTargets.forEach((el) => {
      const rate = parseFloat(el.dataset.parallax) || 0.05;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const midOffset = (rect.top + rect.height / 2) - vh / 2;
      const translate = -midOffset * rate;
      el.style.setProperty('--parallax-y', translate.toFixed(1) + 'px');
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // ── Mobile nav ──────────────────────────────────────────────────────
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  const navOverlay = document.querySelector('.nav-overlay');
  function closeNav() {
    if (navLinks) navLinks.classList.remove('open');
    if (navOverlay) navOverlay.classList.remove('visible');
    document.body.style.overflow = '';
  }
  function openNav() {
    if (navLinks) navLinks.classList.add('open');
    if (navOverlay) navOverlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.contains('open') ? closeNav() : openNav();
    });
    navLinks.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeNav));
  }
  if (navOverlay) navOverlay.addEventListener('click', closeNav);

  // ── Active-link highlight + sliding indicator ───────────────────────
  (function highlightAndIndicate() {
    const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const map = {
      'index.html': 'Home', '': 'Home',
      'academics.html': 'Academics',
      'students.html': 'Students',
      'blog.html': 'Blog',
      'blog-saf-microalgae.html': 'Blog',
      'blog-microalgae-vs-astrophage.html': 'Blog',
      'personal.html': 'Personal',
    };
    const label = map[page];
    const anchors = document.querySelectorAll('.nav-links a');
    let active = null;
    if (label) {
      anchors.forEach((a) => {
        if (a.textContent.trim() === label) { a.classList.add('active'); active = a; }
      });
    }
    const indicator = document.querySelector('.nav-indicator');
    if (!indicator || !anchors.length) return;

    function moveIndicator(target) {
      if (!target) return;
      const parentRect = indicator.parentElement.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      const w = r.width - 22;
      const x = r.left - parentRect.left + 11;
      indicator.style.width = w + 'px';
      indicator.style.transform = 'translateX(' + x + 'px)';
    }
    if (active) requestAnimationFrame(() => moveIndicator(active));
    anchors.forEach((a) => {
      a.addEventListener('mouseenter', () => moveIndicator(a));
      a.addEventListener('focus', () => moveIndicator(a));
    });
    const list = document.getElementById('navLinks');
    if (list) list.addEventListener('mouseleave', () => moveIndicator(active));
    window.addEventListener('resize', () => moveIndicator(active));
  })();

  // ── Theme toggle button wiring ──────────────────────────────────────
  document.querySelectorAll('.theme-toggle').forEach((btn) => {
    btn.addEventListener('click', toggleTheme);
  });

  // ── Scroll reveal (with staggered children) ─────────────────────────
  const revealEls = document.querySelectorAll('.reveal, .reveal-child');
  if (revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.add('visible');
        if (el.classList.contains('reveal-child')) {
          Array.from(el.children).forEach((child, i) => {
            child.style.setProperty('--i-delay', (i * 90) + 'ms');
          });
        }
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach((el) => io.observe(el));
  }

  // ── Animated stat counters ──────────────────────────────────────────
  function animateNumber(el, from, to, duration) {
    if (prefersReducedMotion) { el.textContent = String(to); return; }
    const start = performance.now();
    const isInt = Number.isInteger(to);
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      // easeOutQuart
      const eased = 1 - Math.pow(1 - t, 4);
      const v = from + (to - from) * eased;
      el.textContent = isInt ? Math.round(v).toLocaleString() : v.toFixed(1);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  const statCards = document.querySelectorAll('.stat-card');
  if (statCards.length) {
    const statIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const card = entry.target;
        const numEl = card.querySelector('.stat-number');
        const fill = card.querySelector('.stat-arc-fill');
        if (numEl && !numEl.dataset.counted) {
          const target = parseFloat(numEl.dataset.target || numEl.textContent);
          if (!isNaN(target)) {
            numEl.dataset.counted = '1';
            animateNumber(numEl, 0, target, 1400);
          }
        }
        if (fill) {
          const pct = fill.dataset.pct || '75';
          setTimeout(() => { fill.style.width = pct + '%'; }, 80);
        }
        statIO.unobserve(card);
      });
    }, { threshold: 0.35 });
    statCards.forEach((c) => statIO.observe(c));
  }

  // ── Contact form handler (preserved) ────────────────────────────────
  window.handleContactSubmit = function (e) {
    e.preventDefault();
    const btn = e.target.querySelector('.form-submit');
    if (!btn) return;
    btn.textContent = 'Message Sent!';
    btn.style.background = 'linear-gradient(145deg, var(--amber-500), #c49a45)';
    setTimeout(() => {
      btn.textContent = 'Send Message';
      btn.style.background = '';
      e.target.reset();
    }, 2500);
  };

  // ── Course resource toggle (preserved) ──────────────────────────────
  window.toggleResources = function (btn) {
    const list = btn.previousElementSibling;
    if (!list) return;
    const collapsed = list.classList.toggle('collapsed');
    btn.textContent = collapsed ? 'Show all resources' : 'Show fewer';
  };

  // ── Hero microalgae background (bubbles + drifting silhouettes) ─────
  (function mountHeroBackground() {
    const host = document.querySelector('.hero-bg[data-mount]');
    if (!host) return;
    if (prefersReducedMotion) return; // static fallback via CSS gradient only

    // Generate bubble stream
    const bubbleCount = 14;
    for (let i = 0; i < bubbleCount; i++) {
      const b = document.createElement('span');
      b.className = 'bubble';
      const size = 6 + Math.random() * 14;
      b.style.width = size + 'px';
      b.style.height = size + 'px';
      b.style.left = (Math.random() * 100) + '%';
      b.style.animationDuration = (10 + Math.random() * 14) + 's';
      b.style.animationDelay = (-Math.random() * 18) + 's';
      host.appendChild(b);
    }
    // Randomize alga placements & timings (DOM already rendered in HTML)
    host.querySelectorAll('.alga').forEach((a, i) => {
      a.style.animationDuration = (18 + Math.random() * 14) + 's';
      a.style.animationDelay = (-Math.random() * 20) + 's';
    });
  })();

  // Initial paint
  onScroll();
})();
