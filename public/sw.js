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
 *  - RSC 요청(클라이언트 내비게이션의 페이지 데이터): network-first, 오프라인일 때만 캐시
 *  - 정적 자산(_next/static, 아이콘): cache-first (해시가 붙어 있어 안전)
 *  - 그 외 same-origin GET: stale-while-revalidate
 *
 * RSC 를 stale-while-revalidate 로 두면 안 된다 (v1 의 버그). 캐시된 RSC 응답은 그때 빌드의
 * JS 청크 이름을 가리키는데, 재배포(또는 dev 서버 재시작) 뒤 그게 먼저 나가면 이미 없는 청크를
 * 불러오다 404 가 나고 앱 전체가 Next 기본 에러 화면("This page couldn't load")으로 넘어간다.
 * 온라인이면 항상 서버의 것을 쓰고, 캐시는 오프라인에서만 꺼낸다.
 *
 * 설치할 때 탭 화면들의 HTML 과 그 청크를 미리 받아 둔다. 오프라인에서 RSC 캐시가 빗나가면
 * Next 는 문서 내비게이션으로 넘어가는데, 그때 그 화면의 HTML 이 없으면 "/" 가 대신 떠서
 * 주소는 /calendar 인데 홈이 보이게 된다.
 *
 * ?cache=off 로 등록되면(개발 서버) 캐시는 아예 안 쓰고 알림용으로만 산다.
 * dev 청크는 이름이 같아도 내용이 바뀌어서 cache-first 가 곧 낡은 코드다.
 */

// v2: RSC 가 stale-while-revalidate 로 쌓여 있던 v1 캐시를 버린다
const VERSION = "v2";
const CACHING = new URL(self.location.href).searchParams.get("cache") !== "off";
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;

/** 하단 탭에서 바로 가는 화면들. /session/[id] 는 동적이라 뺀다 */
const APP_ROUTES = ["/", "/calendar", "/exercises", "/stats", "/settings", "/settings/export"];

self.addEventListener("install", (event) => {
  event.waitUntil((CACHING ? precache() : Promise.resolve()).then(() => self.skipWaiting()));
});

async function precache() {
  const shell = await caches.open(SHELL);
  const assets = await caches.open(ASSETS);
  const chunks = new Set();
  for (const route of APP_ROUTES) {
    const response = await fetch(route);
    if (!response.ok) continue;
    const html = await response.clone().text();
    for (const m of html.matchAll(/\/_next\/static\/[^"'\s)]+/g)) chunks.add(m[0]);
    await shell.put(route, response);
  }
  // 청크 하나 실패로 설치 전체가 무산되지 않게 하나씩 넣는다
  await Promise.all([...chunks].map((url) => assets.add(url).catch(() => {})));
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !CACHING || !k.endsWith(VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (!CACHING) return;

  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL, "/"));
    return;
  }

  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    // 빗나가도 HTML 로 대신하면 안 된다 — 실패로 돌려줘야 Next 가 문서 내비게이션으로 넘어간다
    event.respondWith(networkFirst(request, ASSETS, null));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, ASSETS));
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (
      (await cache.match(request)) ??
      (fallbackUrl ? await cache.match(fallbackUrl) : undefined) ??
      Response.error()
    );
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
