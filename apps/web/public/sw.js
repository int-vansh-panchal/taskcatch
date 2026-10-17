const CACHE_NAME = "taskcatch-v2";
const ASSETS_TO_CACHE = [
  "/manifest.json",
  "/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

// Cache strategies: Network-first for navigation & API, cache-first for immutable static assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Bypass cache for API, audio streams, and WebSockets
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/ws")) {
    return;
  }

  // 1. Navigation requests (HTML page loads): ALWAYS Network-First
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((res) => res || caches.match("/index.html")))
    );
    return;
  }

  // 2. Static assets: Cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          event.request.method === "GET"
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});

// Handle incoming Web Push notifications (FCM fallback)
self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.notification?.title || data.title || "TaskCatch Reminder";
    const options = {
      body: data.notification?.body || data.body || "You have a task reminder.",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: data.data || {},
      actions: [
        { action: "done", title: "Mark Done" },
        { action: "snooze", title: "Snooze 1h" }
      ],
      tag: data.data?.taskId || "taskcatch-notification",
      renotify: true,
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error("Push notification handling error:", err);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const taskId = event.notification.data?.taskId;
  const action = event.action;

  if (action === "done" && taskId) {
    event.waitUntil(
      fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      })
    );
    return;
  }

  if (action === "snooze" && taskId) {
    event.waitUntil(
      fetch(`/api/tasks/${taskId}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes: 60 }),
      })
    );
    return;
  }

  // Default click opens app
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("/");
      }
    })
  );
});
