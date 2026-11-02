// Offline support for the installed mobile app. API calls are never cached.
const CACHE = "uecf-v5";
const SHELL = ["./", "index.html", "shared.js?v=5", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "vendor/msal-browser.min.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/api/") || url.pathname.includes("/.netlify/")) return;
  // Network first for everything, so a new deploy never mixes old and new files; cache only when offline.
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request.mode === "navigate" ? "./" : e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request.mode === "navigate" ? "./" : e.request)));
});

// Phone notifications sent by the server (or shown by the app in demo mode).
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data.json(); } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "UE Campus Finder", {
    body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", tag: d.tag, data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) { open.postMessage({ go: url }); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
