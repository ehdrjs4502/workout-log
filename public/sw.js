/*
 * 손으로 쓴 서비스워커.
 *
 * @serwist/next 는 webpack 플러그인이라 Next 16 의 기본 Turbopack 빌드와 맞지 않는다.
 * 이 앱은 데이터가 전부 IndexedDB 에 있고 서버에서 받아올 게 앱 셸뿐이라
 * 빌드 매니페스트 없이 런타임 캐싱만으로 충분하다.
 *
 * 전략
 *  - 내비게이션: network-first → 실패하면 캐시 → 그것도 없으면 캐시된 "/"
 *    (비행기 모드에서 앱이 열려야 한다)
 *  - 정적 자산(_next/static, 아이콘): cache-first (해시가 붙어 있어 안전)
 *  - 그 외 same-origin GET: stale-while-revalidate
 */

const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(["/"])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, ASSETS));
});

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ?? (await cache.match("/")) ?? Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);

  const fetching = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit ?? Response.error());

  return hit ?? fetching;
}

// 휴식 알림을 탭하면 앱으로 돌아온다
self.addEventListener("notificationclick", (event) => {
  // 진행 중인 휴식 알림은 탭해도 닫지 않는다 — 앱을 잠깐 확인하고 다시
  // 나가더라도 종료 예정 시각이 알림창에 남아 있어야 한다.
  if (!(event.notification.data && event.notification.data.ongoing)) {
    event.notification.close();
  }
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = clientList.find((c) => "focus" in c);
      if (existing) return existing.focus();
      return self.clients.openWindow("/");
    })(),
  );
});
