/* Shared runtime: theme, formatting helpers, monetisation slots.
   Loaded on every page before the per-page tool script. */
(function () {
  'use strict';

  /* ---------- theme ---------- */

  var root = document.documentElement;

  function currentTheme() {
    if (root.dataset.theme === 'dark' || root.dataset.theme === 'light') return root.dataset.theme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  var toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
    });
  }

  /* ---------- formatting ---------- */

  var fmt = {
    /* Money that stays readable across six orders of magnitude: cents matter
       at $3.20, they are noise at $41,900. */
    money: function (n, cur) {
      cur = cur || 'USD';
      if (!isFinite(n)) return '—';
      var abs = Math.abs(n);
      var dp = abs >= 1000 ? 0 : abs >= 10 ? 2 : abs >= 0.01 ? 2 : 4;
      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency', currency: cur,
          minimumFractionDigits: dp, maximumFractionDigits: dp
        }).format(n);
      } catch (e) {
        return '$' + n.toFixed(dp);
      }
    },
    num: function (n, dp) {
      if (!isFinite(n)) return '—';
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: dp || 0, maximumFractionDigits: dp === undefined ? 0 : dp
      }).format(n);
    },
    pct: function (n, dp) {
      if (!isFinite(n)) return '—';
      return n.toFixed(dp === undefined ? 1 : dp) + '%';
    },
    /* 1536 -> "1.5 TB". Storage vendors bill in decimal units, so 1000 not 1024. */
    bytes: function (gb) {
      if (gb >= 1000000) return (gb / 1000000).toFixed(2) + ' PB';
      if (gb >= 1000) return (gb / 1000).toFixed(gb % 1000 === 0 ? 0 : 2) + ' TB';
      return fmt.num(gb) + ' GB';
    },
    months: function (m) {
      if (!isFinite(m) || m <= 0) return 'never';
      if (m < 1) return Math.round(m * 30) + ' days';
      if (m < 24) return m.toFixed(1) + ' months';
      return (m / 12).toFixed(1) + ' years';
    }
  };

  /* ---------- small DOM helpers ---------- */

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* Numeric parsing is opt-in by input type, not the default. The inverse —
     "parse everything except text/select/textarea" — silently swallowed
     type="url" and type="email" values, because parseFloat('a@b.com') is NaN
     and the caller got its fallback instead of what the user typed. */
  function val(id, fallback) {
    var el = document.getElementById(id);
    if (!el) return fallback;
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number' || el.type === 'range') {
      var n = parseFloat(el.value);
      return isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
    }
    return el.value;
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  /* Re-run calc on any input change inside a form container. */
  function bind(container, handler) {
    var el = typeof container === 'string' ? $(container) : container;
    if (!el) return;
    ['input', 'change'].forEach(function (evt) {
      el.addEventListener(evt, handler);
    });
    handler();
  }

  /* Horizontal comparison bars, cheapest highlighted. */
  function renderBars(target, rows, formatter) {
    var el = typeof target === 'string' ? $(target) : target;
    if (!el) return;
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([0.0001]));
    var best = Math.min.apply(null, rows.map(function (r) { return r.value; }));
    el.innerHTML = rows.map(function (r) {
      var pct = Math.max(1.5, (r.value / max) * 100);
      return '<div class="bar-row">' +
        '<div class="bar-name" title="' + esc(r.name) + '">' + esc(r.name) + '</div>' +
        '<div class="bar-track"><div class="bar-fill' + (r.value === best ? ' is-best' : '') +
        '" style="width:' + pct.toFixed(1) + '%"></div></div>' +
        '<div class="bar-val">' + formatter(r.value) + '</div>' +
        '</div>';
    }).join('');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function copyBtn(btn, getText) {
    btn.addEventListener('click', function () {
      var text = getText();
      var done = function () {
        var old = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = old; }, 1600);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, function () { fallback(text, done); });
      } else {
        fallback(text, done);
      }
    });
    function fallback(text, done) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* nothing we can do */ }
      document.body.removeChild(ta);
    }
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- monetisation ----------
     window.MONETIZE is set by assets/monetize.js, which is the only file that
     needs editing once AdSense is approved. Until a publisher id exists we
     inject nothing at all: empty .ad-slot elements collapse via CSS, so the
     page never shows a blank reserved rectangle. */

  function initAds() {
    var cfg = window.MONETIZE || {};
    if (!cfg.adsenseClient) return;

    var s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
      encodeURIComponent(cfg.adsenseClient);
    document.head.appendChild(s);

    $$('.ad-slot').forEach(function (slot) {
      var ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-client', cfg.adsenseClient);
      if (slot.dataset.adSlot) ins.setAttribute('data-ad-slot', slot.dataset.adSlot);
      ins.setAttribute('data-ad-format', slot.dataset.adFormat || 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
      slot.appendChild(ins);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* blocked */ }
    });
  }

  /* Privacy-respecting analytics, off until a domain is configured. */
  function initAnalytics() {
    var cfg = window.MONETIZE || {};
    if (!cfg.plausibleDomain) return;
    var s = document.createElement('script');
    s.defer = true;
    s.setAttribute('data-domain', cfg.plausibleDomain);
    s.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(s);
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    initAds();
    initAnalytics();
  });

  window.UI = {
    fmt: fmt, $: $, $$: $$, val: val, setText: setText,
    bind: bind, renderBars: renderBars, esc: esc,
    copyBtn: copyBtn, download: download, ready: ready
  };
})();
