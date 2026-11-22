/* 프렛 코치 서비스 워커 — 항상 네트워크 우선(업데이트가 바로 반영), 오프라인일 때만 캐시 */
const CACHE = 'fretcoach-v10';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 내 악보 보관함(구글 드라이브 Apps Script) 요청은 캐시하지 않고 항상 네트워크로 — 늘 최신 목록을 본다
  if (url.hostname === 'script.google.com' ||
      url.hostname === 'script.googleusercontent.com' ||
      url.hostname === 'www.googleapis.com' ||
      /(^|\.)googleapis\.com$/.test(url.hostname) ||
      /(^|\.)googleusercontent\.com$/.test(url.hostname)) {
    return;
  }
  // 유튜브(임베드·썸네일·플레이어 API)는 서비스 워커가 캐시하거나 가로채지 않는다 — 항상 브라우저가 직접 불러온다
  if (/(^|\.)youtube\.com$/.test(url.hostname) ||
      /(^|\.)youtube-nocookie\.com$/.test(url.hostname) ||
      /(^|\.)ytimg\.com$/.test(url.hostname) ||
      /(^|\.)googlevideo\.com$/.test(url.hostname)) {
    return;
  }
  // 다른 출처는 서비스 워커가 가로채지 않는다
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).then(function (res) {
      const copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
