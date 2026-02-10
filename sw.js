const CACHE_NAME = 'rad-center-v1';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/api.js',
    './js/templates.js',
    './icon.png',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.quilljs.com/1.3.6/quill.snow.css',
    'https://cdn.quilljs.com/1.3.6/quill.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    // Network first, fall back to cache for data consistency
    // But for static assets, we can try cache first maybe? 
    // For MVP, let's just do Cache First for assets, Network First for everything else?
    // Actually, Network First is safer for "No-Build" to ensure updates are seen.
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
