const CACHE = "nova-local-v47";
/* v44: dictionary shards (web/dict/*.json) never change within a dictionary build, so they live
   in their own cache that survives app version bumps. Rename DICT_CACHE when the shards are rebuilt. */
const DICT_CACHE = "nova-dict-wn30-v1";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== DICT_CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function isDict(req) {
  return req.method === "GET" && /\/dict\/[a-z_]{2}\.json$|\/dict\/index\.json$/.test(new URL(req.url).pathname);
}

self.addEventListener("fetch", function (event) {
  if (isDict(event.request)) {
    /* Cache first: a shard fetched once stays on the phone and works offline. */
    event.respondWith(
      caches.open(DICT_CACHE).then(function (cache) {
        return cache.match(event.request, { ignoreSearch: true }).then(function (hit) {
          if (hit) return hit;
          return fetch(event.request).then(function (res) {
            if (res && res.ok) cache.put(event.request, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then(function (res) {
        if (res && res.ok && event.request.method === "GET") {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(event.request, copy);
          });
        }
        return res;
      })
      .catch(function () {
        return caches.match(event.request);
      })
  );
});
