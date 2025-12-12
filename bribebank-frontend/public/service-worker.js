// public/service-worker.js

// Simple versioned cache name
const CACHE_NAME = "bribebank-static-v6";

// Which files (at minimum) to cache on install.
// You can expand this (CSS, fonts, etc.) later or let Workbox handle it.
const URLS_TO_CACHE = ["/", "/index.html", "/icons/bribebank-192.png", "/icons/bribebank-512.png"];

// Install: pre-cache basic shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_CACHE).catch((err) => {
        console.warn("[SW] cache addAll failed", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: cleanup old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: limit to same-origin *static* assets + app shell
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle GETs
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 1) Never touch cross-origin (your api.* domain)
  if (url.origin !== self.location.origin) return;

  // 2) Skip anything with query params (prevents token URL caching explosions)
  //    If you rely on same-origin URLs with queries for static content, remove this.
  if (url.search) return;

  // 3) Skip SSE explicitly (belt + suspenders)
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/event-stream")) return;

  // 4) Optionally skip obvious API paths if you ever add same-origin APIs
  if (url.pathname.startsWith("/api")) return;

  // 5) Only handle typical static destinations
  const dest = request.destination;
  const allowed = new Set(["document", "script", "style", "image", "font"]);
  if (dest && !allowed.has(dest)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Stale-while-revalidate-ish for static
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then(async (response) => {
          // Only cache good responses
          if (response && response.ok) {
            try {
              await cache.put(request, response.clone());
            } catch (e) {
              // Do not let cache failures break fetch
            }
          }
          return response;
        })
        .catch(() => null);

      // Return cache immediately if present, otherwise wait for network
      return cached || (await fetchPromise) || Response.error();
    })()
  );
});


// --- Web Push handling ---
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || "BribeBank";
  const body = data.body || "You have a new notification";
  const icon = "/icons/bribebank-192.png";
  const badge = "/icons/bribebank-192.png";

  const options = {
    body,
    icon,
    badge,
    tag: data.tag || undefined,
    data: {
      ...data,
      url: data.url || "/", // <-- default target
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ----- Notification click -----
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetPath = event.notification?.data?.url || "/";
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        try {
          const clientUrl = new URL(client.url);

          if (clientUrl.origin !== self.location.origin) continue;

          // Focus the window first
          await client.focus();

          // Set a flag in sessionStorage that we opened from notification
          client.postMessage({ 
            type: 'SET_NOTIFICATION_FLAG',
            url: targetUrl 
          });
          
          return;
        } catch (err) {
          console.error("Error handling notification click:", err);
        }
      }

      // No existing client - open a new one with flag in URL
      const urlWithFlag = new URL(targetUrl);
      urlWithFlag.searchParams.set('_from_notification', '1');
      await self.clients.openWindow(urlWithFlag.href);
    })()
  );
});


