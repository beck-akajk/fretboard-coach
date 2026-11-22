/* 프렛 코치 — 내 악보 보관함 (구글 드라이브 '프렛 코치' 폴더 · 기기 간 동기화)
 * Apps Script 웹 앱이 구글 드라이브의 '프렛 코치' 폴더를 읽고 쓰는 중계를 한다.
 *   GET  {API}?action=list                → { ok, files:[{id,name,size,updatedAt}] }
 *   GET  {API}?action=get&id=…            → { ok, id, name, dataBase64 }
 *   POST {API} body JSON {action:'upload',name,dataBase64}
 *   POST {API} body JSON {action:'delete',id}
 * POST는 Content-Type: text/plain 으로 보내 CORS preflight를 피한다.
 * 네트워크가 없거나 실패하면 조용히 안내만 하고, 이 기기의 로컬 저장(IndexedDB)으로 계속 쓴다.
 */
(function (global) {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const API = 'https://script.google.com/macros/s/AKfycbxBjytsxhzywllP2wMuk6FwBbTq1wYBrKbgwdue8KWw4wBui1SeQ36bXRIySTFexXMZIA/exec';
  const TIMEOUT = 30000;
  const LAST_KEY = 'fc_drive_open';

  const D = {
    files: [],
    state: 'idle',     // idle | loading | ok | error
    error: '',
    up: null,          // { name, state: 'saving' | 'done' | 'fail' }
    busyId: null,
    openId: null,
    bound: false,
    loadedAt: 0,
    gone: {}           // 이번 화면에서 지운 id — 목록이 늦게 따라와도 잠시 다시 보이지 않게
  };
  let upTimer = null;

  // ---------------------------------------------------------------- 유틸
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function humanSize(n) {
    const v = Number(n);
    if (!isFinite(v) || v < 0) return '';
    if (v < 1024) return v + ' B';
    if (v < 1024 * 1024) return (v / 1024).toFixed(v < 10240 ? 1 : 0) + ' KB';
    return (v / 1048576).toFixed(1) + ' MB';
  }
  function humanDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    if (d.getFullYear() === now.getFullYear()) {
      return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  }
  function toBase64(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  }
  function fromBase64(b64) {
    const bin = atob(String(b64 || ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  function toast(msg, ms) {
    if (global.FretCoach && global.FretCoach.toast) global.FretCoach.toast(msg, ms);
  }

  // ---------------------------------------------------------------- 통신
  async function call(method, body, qs) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT) : 0;
    const init = {
      method: method,
      cache: 'no-store',
      redirect: 'follow',
      credentials: 'omit'
    };
    if (ctl) init.signal = ctl.signal;
    if (method === 'POST') {
      init.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      init.body = JSON.stringify(body || {});
    }
    try {
      const res = await fetch(API + (qs || ''), init);
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch (e) { data = null; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (!data) throw new Error('응답을 읽지 못했습니다');
      if (data.ok !== true) throw new Error(data.error || '드라이브 오류');
      return data;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------- 목록
  async function refresh(opts) {
    const quiet = !!(opts && opts.quiet);
    if (!quiet) { D.state = 'loading'; render(); }
    try {
      const data = await call('GET', null, '?action=list');
      const now = Date.now();
      const files = (data.files || []).filter(function (f) {
        const at = D.gone[f.id];
        return !at || now - at > 15000;
      });
      files.sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
      D.files = files;
      D.state = 'ok';
      D.error = '';
      D.loadedAt = Date.now();
    } catch (e) {
      D.state = 'error';
      D.error = (e && e.message) || '연결 실패';
      console.warn('[drive] 목록을 불러오지 못했습니다', e);
    }
    render();
    return D.state === 'ok';
  }

  // ---------------------------------------------------------------- 열기
  async function open(id) {
    const f = D.files.filter(function (x) { return x.id === id; })[0];
    const name = f ? f.name : '';
    D.busyId = id;
    render();
    try {
      if (!global.FretCoach || !global.FretCoach.loadBytes) throw new Error('앱이 아직 준비되지 않았습니다');
      const data = await call('GET', null, '?action=get&id=' + encodeURIComponent(id));
      const buf = fromBase64(data.dataBase64);
      const fileName = data.name || name || '악보.gp';
      global.FretCoach.loadBytes(buf, fileName, { id: 'drive:' + id });
      D.openId = id;
      try { localStorage.setItem(LAST_KEY, id); } catch (e) { /* 무시 */ }
      D.busyId = null;
      render();
      toast('드라이브에서 열었습니다 · ' + fileName, 2200);
      scrollToPlayer();
    } catch (e) {
      D.busyId = null;
      render();
      console.warn('[drive] 파일을 열지 못했습니다', e);
      toast('드라이브에서 파일을 받지 못했습니다 · 잠시 뒤 다시 시도해 주세요', 3200);
    }
  }

  function scrollToPlayer() {
    const el = document.querySelector('.now-panel');
    if (!el || window.innerWidth > 560) return;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* 무시 */ }
  }

  // ---------------------------------------------------------------- 올리기 / 지우기
  async function push(name, buf) {
    if (!name) return false;
    clearTimeout(upTimer);
    D.up = { name: name, state: 'saving' };
    render();
    try {
      const data = await call('POST', { action: 'upload', name: name, dataBase64: toBase64(buf) });
      D.up = { name: name, state: 'done' };
      render();
      toast('드라이브 보관함에 저장했습니다 · ' + name, 2400);
      await refresh({ quiet: true });
      // 방금 만든 파일이 드라이브 목록에 살짝 늦게 잡힐 수 있어 한 번 더 확인한다
      if (!D.files.some(function (f) { return f.name === name; })) {
        await new Promise(function (r) { setTimeout(r, 1300); });
        await refresh({ quiet: true });
      }
      upTimer = setTimeout(function () {
        if (D.up && D.up.state === 'done') { D.up = null; render(); }
      }, 3500);
      return !!(data && data.ok);
    } catch (e) {
      D.up = { name: name, state: 'fail' };
      render();
      console.warn('[drive] 업로드에 실패했습니다', e);
      toast('드라이브에 저장하지 못했습니다 · 이 기기에는 저장해 두었습니다', 3600);
      return false;
    }
  }

  async function remove(id) {
    const f = D.files.filter(function (x) { return x.id === id; })[0];
    const name = f ? f.name : '이 곡';
    if (!window.confirm('"' + name + '" 을(를) 구글 드라이브 휴지통으로 보낼까요?\n다른 기기의 보관함에서도 사라집니다.')) return;
    try {
      await call('POST', { action: 'delete', id: id });
      D.gone[id] = Date.now();
      D.files = D.files.filter(function (x) { return x.id !== id; });
      if (D.openId === id) {
        D.openId = null;
        try { localStorage.removeItem(LAST_KEY); } catch (e) { /* 무시 */ }
      }
      render();
      toast('드라이브 휴지통으로 보냈습니다 · ' + name, 2400);
      refresh({ quiet: true });
    } catch (e) {
      console.warn('[drive] 삭제하지 못했습니다', e);
      toast('드라이브에서 지우지 못했습니다 · 잠시 뒤 다시 시도해 주세요', 3200);
      refresh({ quiet: true });
    }
  }

  // ---------------------------------------------------------------- 화면
  function currentDriveId() {
    const S = global.FretCoach && global.FretCoach.S;
    const last = S && S.lastId ? String(S.lastId) : '';
    if (last.indexOf('drive:') === 0) return last.slice(6);
    return D.openId || null;
  }

  function render() {
    const list = $('driveList');
    if (!list) return;
    const sub = $('driveSub');
    const status = $('driveStatus');
    const refreshBtn = $('driveRefresh');
    const cur = currentDriveId();
    const rows = [];

    if (D.up && D.up.state !== 'done') {
      rows.push('<div class="ditem pending">' +
        '<div class="drow" role="status">' +
        '<span class="drow-main"><span class="dname">' + esc(D.up.name) + '</span>' +
        '<span class="dmeta">' + (D.up.state === 'saving' ? '저장 중…' : '저장 실패') + '</span></span>' +
        '<span class="dgo">' + (D.up.state === 'saving' ? '⏳' : '!') + '</span>' +
        '</div></div>');
    }

    for (let i = 0; i < D.files.length; i++) {
      const f = D.files[i];
      const on = cur === f.id;
      const busy = D.busyId === f.id;
      const meta = [humanSize(f.size), humanDate(f.updatedAt)].filter(Boolean).join(' · ');
      rows.push('<div class="ditem' + (on ? ' on' : '') + (busy ? ' busy' : '') + '">' +
        '<button type="button" class="drow" data-open="' + esc(f.id) + '" aria-label="' + esc(f.name) + ' 열기">' +
        '<span class="drow-main"><span class="dname">' + esc(f.name) + '</span>' +
        '<span class="dmeta">' + esc(meta) + (on ? ' · 지금 보는 중' : '') + '</span></span>' +
        '<span class="dgo">' + (busy ? '여는 중' : (on ? '보는 중' : '열기')) + '</span>' +
        '</button>' +
        '<button type="button" class="ddel" data-del="' + esc(f.id) + '" aria-label="' + esc(f.name) + ' 삭제" title="삭제">🗑</button>' +
        '</div>');
    }

    if (!rows.length) {
      if (D.state === 'loading' || D.state === 'idle') {
        list.innerHTML = '<div class="dempty">드라이브 보관함을 불러오는 중…</div>';
      } else if (D.state === 'error') {
        list.innerHTML = '<div class="dempty">드라이브에 연결하지 못했습니다. 지금은 이 기기에 저장된 곡으로 계속 연습할 수 있고, 새로고침을 누르면 다시 시도합니다.</div>';
      } else {
        list.innerHTML = '<div class="dempty">보관함이 비어 있습니다. <b>＋ 올리기</b>로 악보(.gp3·.gp4·.gp5·.gpx)를 올리면 폰과 노트북 어디서든 같은 목록이 열립니다.</div>';
      }
    } else {
      list.innerHTML = rows.join('');
    }

    if (sub) {
      let txt = '구글 드라이브 · 프렛 코치';
      if (D.state === 'loading') txt += ' · 확인 중…';
      else if (D.state === 'error') txt += ' · 연결 안 됨';
      else if (D.state === 'ok') txt += ' · ' + D.files.length + '곡';
      sub.textContent = txt;
    }

    if (status) {
      const parts = [];
      let cls = 'drive-status';
      if (D.up && D.up.state === 'saving') { parts.push('저장 중 · ' + D.up.name); cls += ' saving'; }
      else if (D.up && D.up.state === 'done') { parts.push('저장 완료 · ' + D.up.name); cls += ' ok'; }
      else if (D.up && D.up.state === 'fail') { parts.push('저장 실패 · 이 기기에는 저장됨'); cls += ' err'; }
      else if (D.state === 'error') { parts.push('드라이브 연결 실패 · 이 기기 저장분으로 계속 사용'); cls += ' err'; }
      status.className = cls;
      status.hidden = !parts.length;
      status.innerHTML = parts.length ? '<i class="dstat-dot"></i>' + esc(parts[0]) : '';
    }

    if (refreshBtn) {
      refreshBtn.disabled = D.state === 'loading';
      refreshBtn.classList.toggle('spin', D.state === 'loading');
    }
  }

  // ---------------------------------------------------------------- 이벤트
  function bind() {
    if (D.bound) return;
    D.bound = true;
    const list = $('driveList');
    if (list) {
      list.addEventListener('click', function (e) {
        const del = e.target.closest('[data-del]');
        if (del) { remove(del.getAttribute('data-del')); return; }
        const row = e.target.closest('[data-open]');
        if (row && !row.disabled) open(row.getAttribute('data-open'));
      });
    }
    const rb = $('driveRefresh');
    if (rb) rb.addEventListener('click', function () { refresh(); });
    const upBtn = $('driveUpload');
    if (upBtn) {
      upBtn.addEventListener('click', function () {
        const input = $('fileInput');
        if (input) input.click();
      });
    }
    // 로컬에서 파일을 열면 목록 강조를 다시 그린다
    document.addEventListener('fc:loaded', function () { render(); });
  }

  function init() {
    bind();
    try { D.openId = localStorage.getItem(LAST_KEY) || null; } catch (e) { D.openId = null; }
    render();
    refresh({ quiet: true });
  }

  global.Drive = {
    API: API,
    S: D,
    init: init,
    refresh: refresh,
    open: open,
    push: push,
    remove: remove,
    // 로컬 파일(.gp)을 열었을 때 백그라운드로 드라이브에 저장
    onLocalFile: function (name, buf) {
      if (!name || !buf) return;
      push(name, buf);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
