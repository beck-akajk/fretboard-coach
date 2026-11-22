/* 프렛 코치 — 원곡 유튜브 플레이어 + 앱 소리 음소거
 * - 링크 입력(youtu.be / watch?v= / music.youtube.com / shorts / 11자리 ID) → YouTube IFrame Player API로 임베드
 * - 원곡 재생 속도(0.25·0.5·0.75·1×)를 유튜브 setPlaybackRate로 바로 조절
 * - 임베드가 막힌 영상(onError 101/150 등)은 안내 문구 + "새 탭에서 열기"
 * - 곡(악보)마다 마지막 링크를 localStorage에 저장해 두었다가 같은 곡을 다시 열면 복원
 */
(function (global) {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const MAP_KEY = 'fc_yt_map';      // { 곡키: { url, id, at } }
  const RATE_KEY = 'fc_yt_rate';    // 마지막 원곡 재생 속도
  const MUTE_KEY = 'fc_mute';       // 앱 소리 음소거 (audio.js와 같은 키)
  const RATES = [0.25, 0.5, 0.75, 1];

  const St = {
    open: false,
    videoId: null,
    start: 0,
    rate: 1,
    player: null,
    ready: false,
    api: null,
    lastUrl: ''
  };

  // ---------------------------------------------------------------- 저장소
  function readMap() {
    try {
      const raw = global.localStorage.getItem(MAP_KEY);
      const m = raw ? JSON.parse(raw) : {};
      return (m && typeof m === 'object') ? m : {};
    } catch (e) { return {}; }
  }

  function writeMap(map) {
    try {
      // 오래된 항목부터 정리해 저장소가 넘치지 않게 한다
      const keys = Object.keys(map);
      if (keys.length > 150) {
        keys.sort(function (a, b) { return (map[a].at || 0) - (map[b].at || 0); });
        keys.slice(0, keys.length - 150).forEach(function (k) { delete map[k]; });
      }
      global.localStorage.setItem(MAP_KEY, JSON.stringify(map));
    } catch (e) { /* 저장 실패는 무시 — 이번 세션에는 그대로 동작 */ }
  }

  function songKey() {
    const S = (global.FretCoach && global.FretCoach.S) || {};
    const title = (S.score && S.score.title) || ($('songTitle') ? $('songTitle').textContent : '') || 'demo';
    const id = S.lastId || ('title:' + title);
    return String(id).slice(0, 180);
  }

  function saveLink(url, id) {
    const map = readMap();
    map[songKey()] = { url: url, id: id, at: Date.now() };
    writeMap(map);
  }

  function savedLink() {
    const rec = readMap()[songKey()];
    return rec && rec.id ? rec : null;
  }

  // ---------------------------------------------------------------- 파싱
  // youtu.be/ID · youtube.com/watch?v=ID · music.youtube.com/watch?v=ID · shorts/ID · embed/ID · live/ID · 11자리 ID
  function parse(input) {
    if (!input) return null;
    let s = String(input).trim();
    if (!s) return null;
    // 붙여 넣다 섞여 들어온 앞뒤 문장 제거
    const m = s.match(/(https?:\/\/[^\s<>"']+|(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)\/[^\s<>"']*)/i);
    if (m) s = m[1];
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return { id: s, start: 0 };

    if (!/^https?:\/\//i.test(s)) {
      if (/^(www\.|m\.|music\.)?(youtube\.com|youtube-nocookie\.com)\//i.test(s) || /^youtu\.be\//i.test(s)) s = 'https://' + s;
      else return null;
    }

    let u;
    try { u = new URL(s); } catch (e) { return null; }
    const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    const startOf = function () {
      const t = u.searchParams.get('t') || u.searchParams.get('start') || '';
      const mm = String(t).match(/^(\d+)(?:s|m|h)?$/);
      if (mm) return Number(mm[1]) || 0;
      const hms = String(t).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
      if (hms && (hms[1] || hms[2] || hms[3])) {
        return (Number(hms[1] || 0) * 3600) + (Number(hms[2] || 0) * 60) + Number(hms[3] || 0);
      }
      return 0;
    };

    let id = '';
    if (host === 'youtu.be') {
      id = u.pathname.split('/').filter(Boolean)[0] || '';
    } else if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
      id = u.searchParams.get('v') || '';
      if (!id) {
        const parts = u.pathname.split('/').filter(Boolean);
        if (/^(shorts|embed|live|v|e)$/i.test(parts[0] || '')) id = parts[1] || '';
      }
    } else {
      return null;
    }
    id = String(id).trim();
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    return { id: id, start: startOf() };
  }

  function watchUrl(id, start) {
    return 'https://www.youtube.com/watch?v=' + id + (start ? '&t=' + start + 's' : '');
  }

  // ---------------------------------------------------------------- IFrame API
  function loadApi() {
    if (St.api) return Promise.resolve(St.api);
    if (global.YT && global.YT.Player) { St.api = global.YT; return Promise.resolve(global.YT); }
    if (St.apiPromise) return St.apiPromise;

    St.apiPromise = new Promise(function (resolve, reject) {
      let done = false;
      const finish = function (ok) {
        if (done) return;
        done = true;
        if (ok && global.YT && global.YT.Player) { St.api = global.YT; resolve(global.YT); }
        else reject(new Error('yt-api-unavailable'));
      };
      const prev = global.onYouTubeIframeAPIReady;
      global.onYouTubeIframeAPIReady = function () {
        try { if (typeof prev === 'function') prev(); } catch (e) { /* 무시 */ }
        finish(true);
      };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = function () { finish(false); };
      document.head.appendChild(tag);
      setTimeout(function () { finish(false); }, 10000);
    });
    return St.apiPromise;
  }

  // ---------------------------------------------------------------- 화면
  function cur(text) {
    const el = $('ytCur');
    if (el) el.textContent = text;
  }

  function sub(text) {
    const el = $('ytSub');
    if (el) el.textContent = text;
  }

  function setSubDefault() {
    if (St.videoId) sub('영상 준비됨 · 원곡 ' + fmtRate(St.rate) + ' · 링크 저장됨');
    else if (St.open) sub('링크를 붙여 넣고 불러오기');
    else sub('접힘 · 링크를 넣어 원곡과 함께 연습');
  }

  function fmtRate(r) {
    return String(r).replace(/0$/, '') + '×';
  }

  function showNote(text) {
    const box = $('ytNote');
    const t = $('ytNoteText');
    if (t && text) t.textContent = text;
    if (box) box.hidden = false;
  }

  function hideNote() {
    const box = $('ytNote');
    if (box) box.hidden = true;
  }

  function syncOpenLink() {
    const a = $('ytOpen');
    if (a) a.href = St.videoId ? watchUrl(St.videoId, St.start) : 'https://www.youtube.com/';
  }

  function syncRateButtons() {
    document.querySelectorAll('#ytSpeeds button').forEach(function (b) {
      b.classList.toggle('on', Math.abs(Number(b.getAttribute('data-rate')) - St.rate) < 0.001);
    });
  }

  function applyRate() {
    if (!St.player) return;
    try {
      if (typeof St.player.setPlaybackRate === 'function') St.player.setPlaybackRate(St.rate);
    } catch (e) { /* 준비 전이면 onReady에서 다시 건다 */ }
  }

  function setRate(r) {
    r = Number(r);
    if (!RATES.some(function (x) { return Math.abs(x - r) < 0.001; })) r = 1;
    St.rate = r;
    try { global.localStorage.setItem(RATE_KEY, String(r)); } catch (e) { /* 무시 */ }
    syncRateButtons();
    applyRate();
    setSubDefault();
    if (St.videoId) cur('원곡 ' + fmtRate(r) + ' 속도로 재생합니다');
  }

  function onReady() {
    St.ready = true;
    applyRate();
    syncRateButtons();
    hideNote();
  }

  function onError(e) {
    const code = e && e.data != null ? e.data : '?';
    // 2(잘못된 ID) · 5(HTML5 재생 불가) · 100(삭제/비공개) · 101·150(외부 재생 제한) · 153(요청 출처 확인 실패)
    if (code === 2 || code === 5 || code === 100) {
      showNote('이 영상은 재생할 수 없습니다(오류 ' + code + '). 다른 영상 링크를 넣어 주세요.');
      cur('재생할 수 없는 영상 (오류 ' + code + ')');
    } else {
      showNote('외부 재생이 제한된 영상이면 다른 영상 링크를 넣거나 새 탭에서 열어 주세요.');
      cur('외부 재생 제한 (오류 ' + code + ')');
    }
  }

  function mountPlayer(id, start) {
    const frame = $('ytFrame');
    if (frame) frame.hidden = false;
    syncOpenLink();

    loadApi().then(function (YT) {
      if (St.player && typeof St.player.cueVideoById === 'function') {
        try {
          St.player.cueVideoById({ videoId: id, startSeconds: start || 0 });
          applyRate();
          return;
        } catch (e) { /* 플레이어가 죽었으면 새로 만든다 */ }
      }
      const host = $('ytPlayer');
      if (!host) return;
      host.innerHTML = '';
      St.ready = false;
      St.player = new YT.Player('ytPlayer', {
        videoId: id,
        playerVars: {
          enablejsapi: 1,
          playsinline: 1,
          rel: 0,
          origin: global.location.origin,
          start: Math.max(0, Math.floor(start || 0))
        },
        events: {
          onReady: onReady,
          onError: onError,
          onStateChange: function (ev) {
            if (ev && ev.data === 1) cur(id.slice(0, 11) + ' 재생 중 · ' + fmtRate(St.rate));
          }
        }
      });
    }).catch(function () {
      showNote('유튜브 플레이어를 불러오지 못했습니다. 네트워크를 확인하거나 새 탭에서 열어 주세요.');
      cur('플레이어를 불러오지 못했습니다');
    });
  }

  function loadFromInput() {
    const input = $('ytUrl');
    const raw = input ? input.value.trim() : '';
    const parsed = parse(raw);
    if (!parsed) {
      if (input) { input.classList.add('bad'); input.focus(); }
      if (global.FretCoach && global.FretCoach.toast) global.FretCoach.toast('유튜브 링크를 확인해 주세요 · youtu.be/… 또는 watch?v=…', 3000);
      cur('링크를 읽지 못했습니다');
      return false;
    }
    if (input) { input.classList.remove('bad'); input.value = raw; }
    St.videoId = parsed.id;
    St.start = parsed.start || 0;
    St.lastUrl = raw;
    hideNote();
    syncOpenLink();
    cur('영상 ID ' + parsed.id + (parsed.start ? ' · ' + parsed.start + '초부터' : ''));
    setSubDefault();
    saveLink(raw, parsed.id);
    mountPlayer(parsed.id, St.start);
    return true;
  }

  function openPanel(done) {
    if (!St.open) {
      St.open = true;
      const body = $('ytBody');
      if (body) body.hidden = false;
      const panel = $('ytPanel');
      if (panel) panel.classList.add('open');
      const t = $('ytToggle');
      if (t) t.setAttribute('aria-expanded', 'true');
      if (St.videoId && !St.player) mountPlayer(St.videoId, St.start);
      syncOpenLink();
      syncRateButtons();
      setSubDefault();
    }
    if (done) done();
  }

  function closePanel() {
    St.open = false;
    const body = $('ytBody');
    if (body) body.hidden = true;
    const panel = $('ytPanel');
    if (panel) panel.classList.remove('open');
    const t = $('ytToggle');
    if (t) t.setAttribute('aria-expanded', 'false');
    setSubDefault();
  }

  // ---------------------------------------------------------------- 곡 바뀔 때
  function restore() {
    const rec = savedLink();
    const input = $('ytUrl');
    if (rec) {
      St.videoId = rec.id;
      St.start = 0;
      St.lastUrl = rec.url || '';
      if (input) { input.value = rec.url || ''; input.classList.remove('bad'); }
      cur('저장된 링크 · 영상 ID ' + rec.id);
      syncOpenLink();
      hideNote();
      if (St.open) mountPlayer(rec.id, 0);
    } else {
      St.videoId = null;
      St.start = 0;
      St.lastUrl = '';
      if (input) { input.value = ''; input.classList.remove('bad'); }
      cur('링크를 넣고 불러오기를 누르세요');
      hideNote();
    }
    syncRateButtons();
    setSubDefault();
  }

  // ---------------------------------------------------------------- 유튜브 검색
  function searchQuery() {
    const S = (global.FretCoach && global.FretCoach.S) || {};
    let title = ((S.score && S.score.title) || ($('songTitle') ? $('songTitle').textContent : '') || '').trim();
    const meta = (S.score && S.score.meta) || '';
    let artist = String(meta).split('·')[0].trim();
    // 설명이 함께 붙은 긴 제목은 검색어가 되기 전에 앞부분(곡명)만 남긴다
    if (title.length > 30 && title.indexOf(' · ') > 0) title = title.split(' · ')[0].trim();
    if (!artist || artist.length > 25 || /\.(gp\d?|gpx|musicxml|xml|mxl)$/i.test(artist) || /자작|데모|리프|BPM/i.test(artist)) artist = '';
    if (title && artist && title.toLowerCase().indexOf(artist.toLowerCase()) >= 0) artist = '';
    return [title, artist].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() + ' 원곡';
  }

  function searchYoutube() {
    const q = searchQuery();
    if (!q || q === '원곡') {
      if (global.FretCoach && global.FretCoach.toast) global.FretCoach.toast('곡을 먼저 열어 주세요', 2200);
      return;
    }
    const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
    const w = global.open(url, '_blank', 'noopener');
    if (w) { try { w.opener = null; } catch (e) { /* 무시 */ } }
    cur('“‘' + q.replace(/ 원곡$/, '') + '’ 검색을 새 탭에 열었습니다');
  }

  // ---------------------------------------------------------------- 앱 소리 음소거
  function muted() {
    const G = global.Guitar;
    // 아직 Web Audio를 열지 않았으면 Guitar.muted가 저장값을 모른다 — 저장값을 먼저 본다
    if (G && G.ctx) return !!G.muted;
    try { return global.localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return !!(G && G.muted); }
  }

  function syncMuteBtn() {
    const b = $('muteBtn');
    if (!b) return;
    const off = muted();
    b.textContent = off ? '🔇' : '🔊';
    b.setAttribute('aria-pressed', off ? 'true' : 'false');
    b.setAttribute('aria-label', off ? '앱 소리 켜기' : '앱 소리 끄기');
    b.title = off ? '앱 악보 소리 켜기' : '앱 악보 소리 끄기';
  }

  function toggleMute() {
    const G = global.Guitar;
    const next = !muted();
    if (G && typeof G.setMuted === 'function') G.setMuted(next);
    else { try { global.localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch (e) { /* 무시 */ } }
    syncMuteBtn();
    if (global.FretCoach && global.FretCoach.toast) {
      global.FretCoach.toast(next ? '앱 소리 꺼짐 · 원곡만 들립니다' : '앱 소리 켜짐', 1800);
    }
  }

  // ---------------------------------------------------------------- 초기화
  function bind() {
    const toggle = $('ytToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        if (St.open) closePanel(); else openPanel();
      });
    }

    const load = $('ytLoad');
    if (load) load.addEventListener('click', loadFromInput);

    const input = $('ytUrl');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); loadFromInput(); }
      });
      input.addEventListener('input', function () { input.classList.remove('bad'); });
    }

    const find = $('ytFind');
    if (find) find.addEventListener('click', searchYoutube);

    document.querySelectorAll('#ytSpeeds button').forEach(function (b) {
      b.addEventListener('click', function () { setRate(b.getAttribute('data-rate')); });
    });

    const mute = $('muteBtn');
    if (mute) mute.addEventListener('click', toggleMute);

    // 다른 곡을 열면 그 곡에 저장해 둔 원곡 링크를 다시 불러온다
    document.addEventListener('fc:loaded', restore);

    try {
      const r = Number(global.localStorage.getItem(RATE_KEY));
      if (RATES.some(function (x) { return Math.abs(x - r) < 0.001; })) St.rate = r;
    } catch (e) { /* 무시 */ }
    syncRateButtons();
    syncMuteBtn();
    syncOpenLink();
    restore();
  }

  global.YtCoach = {
    S: St,
    parse: parse,
    load: loadFromInput,
    open: openPanel,
    close: closePanel,
    setRate: setRate,
    searchQuery: searchQuery,
    toggleMute: toggleMute,
    muted: muted,
    songKey: songKey,
    saved: savedLink
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(window);
