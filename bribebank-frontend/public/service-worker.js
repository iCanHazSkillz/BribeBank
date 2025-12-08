// public/service-worker.js

// Simple versioned cache name
const CACHE_NAME = "bribebank-static-v2";

// Which files (at minimum) to cache on install.
// You can expand this (CSS, fonts, etc.) later or let Workbox handle it.
const URLS_TO_CACHE = ["/", "/index.html"];

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

// Fetch: network-first for now (we're not going heavy on offline yet)
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GETs
  if (request.method !== "GET") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Optionally cache the response
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(request);
      })
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

          await client.focus();

          // If already at target, don't re-navigate
          if (client.url === targetUrl) return;

          // Prefer navigate if available
          if (typeof client.navigate === "function") {
            await client.navigate(targetUrl);
            return;
          }

          // Otherwise open a new window at the target
          await self.clients.openWindow(targetUrl);
          return;
        } catch {
          // ignore
        }
      }

      // No existing client - open a new one
      await self.clients.openWindow(targetUrl);
    })()
  );
});


