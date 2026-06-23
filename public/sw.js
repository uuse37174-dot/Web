const CACHE_NAME = "searchscrape-v2.6-cache-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-512.jpg"
];

// Install Service Worker and cache essential shell resources
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Prefetching and caching app shell assets...");
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn("[Service Worker] Some initial assets failed to cache, proceeding anyway: ", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate event (clean up old caches)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[Service Worker] Clearing legacy cache: ", key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercept requests and serve with offline-first / network-fallback logic
self.addEventListener("fetch", (event) => {
  const req = event.request;
  
  // Only handle standard GET requests
  if (req.method !== "GET") return;

  // Skip API calls so they always perform live database queries
  if (req.url.includes("/api/")) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        // If request succeeded, clone and store in cache for offline support
        if (networkResponse.status === 200) {
          const clonedResponse = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, clonedResponse);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback: search the query cache
        return caches.match(req).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If offline and request is index.html navigation, fallback to shell index
          if (req.mode === "navigate") {
            return caches.match("/");
          }
          return new Response("Offline material unavailable", {
            status: 503,
            statusText: "Service Unavailable",
            headers: new Headers({ "Content-Type": "text/plain" })
          });
        });
      })
  );
});
