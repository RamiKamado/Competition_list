/* Service Worker: オフラインでも前回の内容を表示できるようにする。
   ファイルを更新したら、VERSION と index.html / cal.html の「?v=数字」を同じ数字に上げてください。 */
const VERSION = "v8";
const SHELL_CACHE = `wca-finder-shell-${VERSION}`;
const DATA_CACHE = "wca-finder-data";
const CDN_CACHE = "wca-finder-cdn";

const SHELL = [
  "./",
  "./index.html",
  "./cal.html",
  "./css/style.css?v=8",
  "./js/common.js?v=8",
  "./js/app.js?v=8",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith("wca-finder-shell-") && k !== SHELL_CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ネットワーク優先、失敗したらキャッシュ
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    // ブラウザのHTTPキャッシュ（GitHub Pages は10分間）を使わず、毎回サーバーに更新を確認する
    const res = await fetch(request, { cache: "no-cache" });
    if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(request, { ignoreSearch: false });
    if (hit) return hit;
    if (request.mode === "navigate") {
      const shell = await caches.match("./index.html");
      if (shell) return shell;
    }
    throw e;
  }
}

// キャッシュ優先（アイコンフォントなど変わらないもの）
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, SHELL_CACHE));
  } else if (url.hostname === "www.worldcubeassociation.org" && url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(req, DATA_CACHE));
  } else if (url.hostname === "cdn.cubing.net") {
    event.respondWith(cacheFirst(req, CDN_CACHE));
  }
});
