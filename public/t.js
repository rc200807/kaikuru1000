/*!
 * 買いクル アクセス計測タグ
 * 使い方: <script src="https://system.rcinc.jp/t.js" data-site="SITE_KEY" async></script>
 * ボタン計測: 対象要素に data-track-id="btn_xxxxxxxx" を付与
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (navigator.webdriver) return; // bot除外
  if (window.__rctLoaded) return;  // 二重読み込み防止
  window.__rctLoaded = true;

  // ─── 設定 ───
  var script = document.currentScript || (function () {
    var list = document.querySelectorAll('script[data-site]');
    return list[list.length - 1];
  })();
  var SITE_KEY = script && script.getAttribute('data-site');
  if (!SITE_KEY) return;
  var ORIGIN = (function () {
    try { return new URL(script.src).origin; } catch (e) { return 'https://system.rcinc.jp'; }
  })();
  var ENDPOINT = ORIGIN + '/api/track/collect';
  var LINKER_PARAM = '_rctv';
  var VID_KEY = '_rct_vid';

  // ─── 訪問者ID（localStorage優先・cookieフォールバック） ───
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  function getVisitorKey() {
    var v = null;
    try { v = localStorage.getItem(VID_KEY); } catch (e) {}
    if (!v) {
      var m = document.cookie.match(new RegExp('(?:^|; )' + VID_KEY + '=([^;]+)'));
      if (m) v = m[1];
    }
    if (!v) v = uuid();
    try { localStorage.setItem(VID_KEY, v); } catch (e) {}
    try {
      document.cookie = VID_KEY + '=' + v + '; path=/; max-age=' + 60 * 60 * 24 * 730 + '; SameSite=Lax';
    } catch (e) {}
    return v;
  }
  var VISITOR_KEY = getVisitorKey();

  // ─── 送信 ───
  function send(payload) {
    payload.siteKey = SITE_KEY;
    payload.visitorKey = VISITOR_KEY;
    var body = JSON.stringify(payload);
    if (body.length > 8000) return;
    // Content-Type は text/plain（CORS safelist）にしてプリフライトを回避。サーバーは本文をJSONとして解釈する
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return;
    } catch (e) {}
    try {
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: body, keepalive: true, mode: 'cors' });
    } catch (e) {}
  }

  function queryParams(search) {
    var out = {};
    try {
      new URLSearchParams(search).forEach(function (value, key) {
        if (key === LINKER_PARAM) return;
        if (Object.keys(out).length >= 20) return;
        out[key] = String(value).slice(0, 200);
      });
    } catch (e) {}
    return out;
  }

  // ─── ページビュー + 滞在時間/スクロール深度 ───
  var currentPv = null; // { pvKey, shownAt, visibleMs, maxScroll, leaveSent }

  function maxScrollPercent() {
    try {
      var doc = document.documentElement;
      var pos = (window.scrollY || doc.scrollTop || 0) + window.innerHeight;
      return Math.min(100, Math.round((pos / Math.max(doc.scrollHeight, 1)) * 100));
    } catch (e) { return 0; }
  }

  function sendLeave() {
    if (!currentPv || currentPv.leaveSent) return;
    currentPv.leaveSent = true;
    var visible = currentPv.visibleMs + (document.visibilityState === 'visible' ? Date.now() - currentPv.shownAt : 0);
    send({
      type: 'pageleave',
      pvKey: currentPv.pvKey,
      durationSec: Math.min(3600, Math.round(visible / 1000)),
      scrollDepth: currentPv.maxScroll
    });
  }

  function trackPageView() {
    sendLeave(); // 前のPVの滞在情報を確定（SPA遷移時）
    var pvKey = uuid();
    currentPv = { pvKey: pvKey, shownAt: Date.now(), visibleMs: 0, maxScroll: 0, leaveSent: false };
    send({
      type: 'pageview',
      pvKey: pvKey,
      url: String(location.href).slice(0, 1000),
      path: location.host + location.pathname,
      title: String(document.title || '').slice(0, 200),
      referrer: String(document.referrer || '').slice(0, 1000),
      params: queryParams(location.search),
      screen: (window.screen ? screen.width + 'x' + screen.height : ''),
      lang: navigator.language || ''
    });
  }

  window.addEventListener('scroll', function () {
    if (!currentPv) return;
    var p = maxScrollPercent();
    if (p > currentPv.maxScroll) currentPv.maxScroll = p;
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (!currentPv) return;
    if (document.visibilityState === 'hidden') {
      currentPv.visibleMs += Date.now() - currentPv.shownAt;
      // 離脱の可能性が高いタイミングで送信（モバイルはpagehideが飛ばないことがある）
      sendLeave();
    } else {
      currentPv.shownAt = Date.now();
      currentPv.leaveSent = false; // 復帰したら再度計測を継続
    }
  });
  window.addEventListener('pagehide', sendLeave);

  // ─── SPA対応（pushState/replaceState/popstate） ───
  function hookHistory(name) {
    var orig = history[name];
    history[name] = function () {
      var ret = orig.apply(this, arguments);
      setTimeout(trackPageView, 50); // titleの更新を待つ
      return ret;
    };
  }
  hookHistory('pushState');
  hookHistory('replaceState');
  window.addEventListener('popstate', function () { setTimeout(trackPageView, 50); });

  // ─── クリック計測（data-track-id 委譲）+ クロスドメインリンカー ───
  document.addEventListener('click', function (ev) {
    var el = ev.target;
    // data-track-id（祖先も探索）
    var node = el && el.closest ? el.closest('[data-track-id]') : null;
    if (node) {
      var key = node.getAttribute('data-track-id');
      if (key) {
        send({
          type: 'click',
          buttonKey: String(key).slice(0, 64),
          url: String(location.href).slice(0, 1000)
        });
      }
    }
    // リンカー: 計測サーバーと同一ホストへのリンクに訪問者IDを付与
    var a = el && el.closest ? el.closest('a[href]') : null;
    if (a) {
      try {
        var u = new URL(a.href, location.href);
        if (u.origin === ORIGIN && !u.searchParams.has(LINKER_PARAM)) {
          u.searchParams.set(LINKER_PARAM, VISITOR_KEY);
          a.href = u.toString();
        }
      } catch (e) {}
    }
  }, true);

  // フォームのaction先が計測サーバーの場合もリンカー付与
  document.addEventListener('submit', function (ev) {
    var form = ev.target;
    if (!form || !form.action) return;
    try {
      var u = new URL(form.action, location.href);
      if (u.origin === ORIGIN && !u.searchParams.has(LINKER_PARAM)) {
        u.searchParams.set(LINKER_PARAM, VISITOR_KEY);
        form.action = u.toString();
      }
    } catch (e) {}
  }, true);

  // ─── 初回PV ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackPageView);
  } else {
    trackPageView();
  }
})();
