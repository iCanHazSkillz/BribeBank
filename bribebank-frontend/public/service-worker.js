// public/service-worker.js

// Dynamic versioned cache name - replaced at build time with timestamp
// Format: bribebank-static-TIMESTAMP
const CACHE_NAME = "bribebank-static-{{BUILD_TIMESTAMP}}";
const SW_BUILD_ID = "{{BUILD_TIMESTAMP}}";

// Which files (at minimum) to cache on install.
// You can expand this (CSS, fonts, etc.) later or let Workbox handle it.
const URLS_TO_CACHE = [
  "/",
  "/index.html",
  "/icons/bribebank-192.png",
  "/icons/bribebank-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/bribebank-notification.png",
  "/icons/bribebank-status-badge.png",
];

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

// Activate: cleanup old caches and claim all clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          })
      )
    ).then(() => {
      // Notify all clients that a new version is available
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_UPDATE_AVAILABLE',
            message: 'A new version of the app is available. Please refresh.',
            buildId: SW_BUILD_ID
          });
        });
      });
    })
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

  // 2) Always bypass update metadata endpoints so app-open checks stay fresh.
  if (url.pathname === "/version.json" || url.pathname === "/release-notes.json") return;

  // 3) Network-first for app shell navigation with cache fallback.
  const acceptHeader = request.headers.get("accept") || "";
  const isNavigation =
    request.mode === "navigate" ||
    request.destination === "document" ||
    acceptHeader.includes("text/html");

  if (isNavigation) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            await cache.put("/index.html", networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return (
            (await cache.match(request)) ||
            (await cache.match("/index.html")) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // 4) Skip anything with query params (prevents token URL caching explosions)
  if (url.search) return;

  // 5) Skip SSE explicitly (belt + suspenders)
  if (acceptHeader.includes("text/event-stream")) return;

  // 6) Optionally skip obvious API paths if you ever add same-origin APIs
  if (url.pathname.startsWith("/api")) return;

  // 7) Only handle typical static destinations
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
  const icon = "/icons/bribebank-notification.png";
  const badge = "/icons/bribebank-status-badge.png";

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


