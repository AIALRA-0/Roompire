const SHELL_CACHE = "roompire-shell-v1";
const SHELL_ASSETS = ["/offline", "/icon.svg", "/manifest.webmanifest"];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isNetworkOnly(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname.includes("/download")
  );
}

function isCacheableStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/offline" ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/manifest.webmanifest"
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  if (response.ok) {
    await cache.put(request, response.clone());
  }

  return response;
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match("/offline")) || Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== SHELL_CACHE)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (!isSameOrigin(url) || isNetworkOnly(url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isCacheableStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  event.waitUntil(
    (async () => {
      let payload;

      try {
        payload = event.data.json();
      } catch {
        payload = {
          title: "Roompire",
          body: event.data.text(),
        };
      }

      const title = typeof payload.title === "string" ? payload.title : "Roompire";
      const body = typeof payload.body === "string" ? payload.body : "";
      const url =
        typeof payload.url === "string" && payload.url.startsWith("/") ? payload.url : "/en-US/app";
      const tag = typeof payload.tag === "string" ? payload.tag : "roompire";

      await self.registration.showNotification(title, {
        badge: "/icon.svg",
        body,
        data: {
          url,
        },
        icon: "/icon.svg",
        tag,
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const targetUrl =
        typeof event.notification.data?.url === "string" &&
        event.notification.data.url.startsWith("/")
          ? new URL(event.notification.data.url, self.location.origin).href
          : new URL("/en-US/app", self.location.origin).href;
      const clientList = await clients.matchAll({
        includeUncontrolled: true,
        type: "window",
      });

      for (const client of clientList) {
        if ("focus" in client && client.url === targetUrl) {
          return client.focus();
        }
      }

      return clients.openWindow(targetUrl);
    })(),
  );
});
