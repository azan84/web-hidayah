// "Ask about Dr. Hidayah" chat widget. Talks to the Cloudflare Worker in
// chat-worker/, which answers from the site's published content via Claude.
(function () {
  'use strict';

  var ENDPOINT = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'http://localhost:8787/chat' // `npm run dev` in chat-worker/
    : 'https://hidayah-site-chat.azan-sapardi.workers.dev/chat';
  var STORE_KEY = 'ask-hidayah-chat-v1';
  var OPEN_KEY = 'ask-hidayah-open';
  var MAX_HISTORY = 12;
  var MAX_CHARS = 1500;

  var script = document.currentScript;
  var siteRoot = new URL('./', script ? script.src : location.href);

  var SUGGESTIONS = [
    'What does Dr. Hidayah research?',
    'Show her most cited publications',
    'Where are the Thermodynamics notes?',
    'Is she supervising postgraduate students?'
  ];

  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" stroke-width="2.4"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ICON_RESET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  // Stylesheet lives next to this script, so it works from any page.
  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('ask-hidayah.css?v=1', siteRoot).href;
  document.head.appendChild(css);

  var root = document.createElement('div');
  root.id = 'ask-hidayah';
  root.className = 'aa-root';
  root.innerHTML =
    '<button type="button" class="aa-launcher" aria-haspopup="dialog" aria-controls="aa-panel" aria-expanded="false">' +
      ICON_CHAT + '<span class="aa-launcher-label">Ask about my research</span>' +
    '</button>' +
    '<div class="aa-panel" id="aa-panel" role="dialog" aria-modal="false" aria-labelledby="aa-title">' +
      '<div class="aa-head">' +
        '<div class="aa-head-text">' +
          '<p class="aa-title" id="aa-title">Ask about Dr. Hidayah</p>' +
          '<p class="aa-sub">Research, publications, courses and posts — answered from this website.</p>' +
        '</div>' +
        '<button type="button" class="aa-icon-btn aa-reset" aria-label="Start a new conversation" title="New conversation">' + ICON_RESET + '</button>' +
        '<button type="button" class="aa-icon-btn aa-close" aria-label="Close chat" title="Close">' + ICON_CLOSE + '</button>' +
      '</div>' +
      '<div class="aa-log" aria-live="polite" aria-relevant="additions"></div>' +
      '<form class="aa-form">' +
        '<label class="aa-sr" for="aa-input">Your question</label>' +
        '<textarea class="aa-input" id="aa-input" rows="1" maxlength="' + MAX_CHARS + '" placeholder="Ask a question…" autocomplete="off"></textarea>' +
        '<button type="submit" class="aa-send" aria-label="Send" disabled>' + ICON_SEND + '</button>' +
      '</form>' +
      '<p class="aa-foot">AI assistant · can make mistakes — check the linked pages.</p>' +
    '</div>';
  document.body.appendChild(root);

  var launcher = root.querySelector('.aa-launcher');
  var panel = root.querySelector('.aa-panel');
  var log = root.querySelector('.aa-log');
  var form = root.querySelector('.aa-form');
  var input = root.querySelector('.aa-input');
  var send = root.querySelector('.aa-send');
  var resetBtn = root.querySelector('.aa-reset');
  var mobile = window.matchMedia('(max-width: 520px)');

  var history = load();
  var busy = false;

  function load() {
    try {
      var data = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]');
      if (!Array.isArray(data)) return [];
      data = data.filter(function (m) {
        return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
      });
      // Only complete exchanges are stored, but guard against an older/corrupt entry.
      while (data.length && data[data.length - 1].role !== 'assistant') data.pop();
      return data;
    } catch (e) { return []; }
  }
  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-MAX_HISTORY * 2))); } catch (e) { /* storage unavailable */ }
  }
  function remember(key, value) {
    try { sessionStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }
  function recall(key) {
    try { return sessionStorage.getItem(key); } catch (e) { return null; }
  }

  // --- Minimal, safe Markdown: escape everything, then allow links, bold, bullets.
  function esc(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeHref(raw) {
    var href = raw.trim();
    if (/^(javascript|data|vbscript):/i.test(href)) return null;
    try {
      var url = new URL(href, siteRoot);
      if (url.protocol !== 'https:' && url.protocol !== 'http:' && url.protocol !== 'mailto:') return null;
      return url;
    } catch (e) { return null; }
  }
  // noLinks: inside a link label, so don't nest another <a>.
  function inline(text, noLinks) {
    var out = '';
    var re = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|(https?:\/\/[^\s<)]+[^\s<).,;:!?'"])|(?:^|(?<=[\s(]))[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g;
    var last = 0, m;
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index));
      if (m[1]) {
        var url = noLinks ? null : safeHref(m[2]);
        out += url ? link(url, inline(m[1], true)) : inline(m[1], noLinks);
      } else if (m[3]) {
        out += '<strong>' + inline(m[3], noLinks) + '</strong>';
      } else if (m[5]) {
        out += '<em>' + inline(m[5], noLinks) + '</em>';
      } else {
        var bare = noLinks ? null : safeHref(m[4]);
        out += bare ? link(bare, esc(m[4])) : esc(m[4]);
      }
      last = re.lastIndex;
    }
    return out + esc(text.slice(last));
  }
  // Downloads (lecture PDFs) and other sites open in a new
  // tab so the visitor keeps the chat; site pages open in place (the panel reopens there).
  function link(url, label) {
    var sameSite = url.origin === siteRoot.origin;
    var isPage = sameSite && (/\.html$/.test(url.pathname) || url.pathname === siteRoot.pathname);
    var newTab = url.protocol !== 'mailto:' && !isPage;
    return '<a href="' + esc(url.href) + '"' + (newTab ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + label + '</a>';
  }
  function render(md) {
    var html = '', list = null, para = [];
    function flush() {
      if (para.length) { html += '<p>' + para.map(function (l) { return inline(l); }).join('<br>') + '</p>'; para = []; }
    }
    function closeList() { if (list) { html += '</' + list + '>'; list = null; } }
    md.split('\n').forEach(function (line) {
      var item = line.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
      if (item) {
        flush();
        var type = /\d/.test(item[1]) ? 'ol' : 'ul';
        if (list !== type) { closeList(); html += '<' + type + '>'; list = type; }
        html += '<li>' + inline(item[2]) + '</li>';
      } else {
        closeList();
        if (line.trim()) para.push(line.replace(/^#+\s*/, '').trim()); else flush();
      }
    });
    flush();
    closeList();
    return html;
  }

  // --- View
  function addMessage(role, content) {
    var el = document.createElement('div');
    el.className = 'aa-msg ' + (role === 'user' ? 'aa-msg-user' : 'aa-msg-bot');
    var who = '<span class="aa-sr">' + (role === 'user' ? 'You said: ' : 'Assistant: ') + '</span>';
    el.innerHTML = who + (role === 'user' ? esc(content) : render(content));
    log.appendChild(el);
    scrollDown(true);
    return el;
  }
  function setBotContent(el, html) {
    el.innerHTML = '<span class="aa-sr">Assistant: </span>' + html;
  }
  // Follow the stream only if the visitor hasn't scrolled up to read.
  function scrollDown(force) {
    if (force || log.scrollHeight - log.scrollTop - log.clientHeight < 80) log.scrollTop = log.scrollHeight;
  }

  function renderAll() {
    log.innerHTML = '';
    if (!history.length) {
      var intro = document.createElement('p');
      intro.className = 'aa-intro';
      intro.textContent = 'Hi! I can answer questions about Dr. Hidayah’s research, publications, grants, students, courses and blog posts — based on what’s published on this site.';
      var chips = document.createElement('div');
      chips.className = 'aa-chips';
      SUGGESTIONS.forEach(function (q) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'aa-chip';
        b.textContent = q;
        b.addEventListener('click', function () { input.focus(); ask(q); });
        chips.appendChild(b);
      });
      log.appendChild(intro);
      log.appendChild(chips);
      return;
    }
    history.forEach(function (m) { addMessage(m.role, m.content); });
  }

  function setOpen(open, restoring) {
    root.classList.toggle('aa-open', open);
    launcher.setAttribute('aria-expanded', String(open));
    panel.setAttribute('aria-modal', String(open && mobile.matches));
    remember(OPEN_KEY, open ? '1' : '0');
    if (open) {
      if (!log.childElementCount) renderAll();
      scrollDown(true);
      // Don't grab focus (or pop the mobile keyboard) when reopening after navigation.
      if (!restoring) setTimeout(function () { input.focus(); }, 60);
    } else if (!restoring) {
      launcher.focus();
    }
  }

  function syncControls() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    send.disabled = busy || !input.value.trim();
    resetBtn.disabled = busy;
  }

  // --- Network
  async function ask(question) {
    question = question.trim().slice(0, MAX_CHARS);
    if (!question || busy) return;
    busy = true;
    input.value = '';
    syncControls();
    if (!history.length) log.innerHTML = '';

    var turn = history.concat({ role: 'user', content: question });
    addMessage('user', question);

    var bubble = addMessage('assistant', '');
    bubble.innerHTML = '<span class="aa-typing" role="status"><span class="aa-sr">Assistant is typing…</span><span></span><span></span><span></span></span>';
    // Screen readers announce the finished reply once, not every streamed chunk.
    log.setAttribute('aria-busy', 'true');
    var answer = '';
    var streamError = null;

    try {
      var res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: turn.slice(-MAX_HISTORY) })
      });
      if (!res.ok || !res.body) {
        var info = await res.json().catch(function () { return {}; });
        throw new Error(info.error || 'The assistant is unavailable right now.');
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      for (;;) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        var events = buffer.split('\n\n');
        buffer = events.pop();
        events.forEach(function (evt) {
          var line = evt.trim();
          if (line.indexOf('data: ') !== 0) return;
          var data;
          try { data = JSON.parse(line.slice(6)); } catch (e) { return; }
          if (data.reset) answer = '';
          if (data.t) answer += data.t;
          if (data.error) streamError = data.error;
        });
        if (answer) { setBotContent(bubble, render(answer)); scrollDown(); }
      }
      if (streamError) throw new Error(streamError);
      if (!answer) throw new Error('No answer came back. Please try again.');
      // Store only complete exchanges so the history always alternates.
      history = turn.concat({ role: 'assistant', content: answer });
      save();
    } catch (err) {
      var msg = (err && err.message && !/fetch|network/i.test(err.message))
        ? err.message
        : 'Couldn’t reach the assistant. Check your connection and try again.';
      if (answer) {
        // Keep what arrived visible, but flag it as cut short and leave it out of history.
        setBotContent(bubble, render(answer) + '<span class="aa-note">' + esc('The answer was cut short. ' + msg) + '</span>');
      } else {
        bubble.classList.add('aa-error');
        setBotContent(bubble, esc(msg));
      }
    } finally {
      busy = false;
      log.setAttribute('aria-busy', 'false');
      syncControls();
      if (root.classList.contains('aa-open')) input.focus();
    }
  }

  // --- Events
  launcher.addEventListener('click', function () { setOpen(true); });
  root.querySelector('.aa-close').addEventListener('click', function () { setOpen(false); });
  resetBtn.addEventListener('click', function () {
    if (busy) return;
    history = [];
    save();
    renderAll();
    input.focus();
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
  input.addEventListener('input', syncControls);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); }
  });
  mobile.addEventListener('change', function () {
    panel.setAttribute('aria-modal', String(root.classList.contains('aa-open') && mobile.matches));
  });
  document.addEventListener('keydown', function (e) {
    if (!root.classList.contains('aa-open')) return;
    if (e.key === 'Escape') { setOpen(false); return; }
    // Full-screen on phones: keep Tab inside the chat.
    if (e.key === 'Tab' && mobile.matches) {
      var items = [].slice.call(panel.querySelectorAll('button:not([disabled]), textarea, a[href]'));
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
    }
  });

  // Reopen after moving to another page if the chat was open.
  if (recall(OPEN_KEY) === '1') setOpen(true, true);
})();
