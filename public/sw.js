const CACHE_NAME = 'webmcp-agent-file-cache';
const VIRTUAL_PREFIX = '/virtual-assets/';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Check if the request is for a virtual asset
    if (url.pathname.startsWith(VIRTUAL_PREFIX)) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((response) => {
                    // Return cached response if found, otherwise fallback to network
                    return response || fetch(event.request);
                });
            })
        );
    }
});
