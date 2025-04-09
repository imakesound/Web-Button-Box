// service-worker.js - Enhanced for better PWA support & faster offline load
const CACHE_VERSION = 'v1.0.2'; // Increment version for update
const APP_CACHE = 'accordion-app-' + CACHE_VERSION;
const AUDIO_CACHE = 'accordion-audio-' + CACHE_VERSION;
const XML_CACHE = 'accordion-xml-' + CACHE_VERSION;

// Core app assets to cache immediately
const CORE_ASSETS = [
    './', // Cache the root path (often serves index.html)
    './index.html',
    './offline.html', // Ensure offline page is cached
    './manifest.json',
    './css/styles.css',
    './js/main.js',
    './js/audio-engine.js',
    './js/ui-controls.js',
    './js/music-playback.js',
    './js/recording.js',
    './js/storage.js',
    './js/preset-loader.js',
    './js/pwa-handler.js',
    './icons/icon-192x192.png',
    './icons/icon-512x512.png'
    // Add other essential icons if needed (e.g., 152 for iOS)
    // './icons/icon-152x152.png'
];

// External dependencies to cache
const EXTERNAL_DEPS = [
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@1.8.4/build/opensheetmusicdisplay.min.js',
    'https://unpkg.com/lucide@latest'
];

// --- Service Worker Installation ---
self.addEventListener('install', event => {
    console.log('[Service Worker] Installing version ' + CACHE_VERSION);
    self.skipWaiting(); // Activate new SW immediately

    event.waitUntil(
        caches.open(APP_CACHE)
        .then(cache => {
            console.log('[Service Worker] Caching core app assets');
            // Cache core assets
            const coreCachePromise = cache.addAll(CORE_ASSETS).then(() => {
                console.log('[Service Worker] Core assets cached successfully');
            }).catch(err => {
                console.error('[Service Worker] Failed to cache some core assets:', err);
                // Don't let core asset failure block installation entirely if some succeed
                return Promise.resolve();
            });

            // Cache external dependencies (best effort)
            const externalDepsPromise = cache.addAll(EXTERNAL_DEPS).catch(err => {
                console.warn('[Service Worker] Some external dependencies failed to cache:', err);
                // Continue even if external deps fail
                return Promise.resolve();
            });

            return Promise.all([coreCachePromise, externalDepsPromise]);
        })
    );
});

// --- Service Worker Activation ---
self.addEventListener('activate', event => {
    console.log('[Service Worker] Activating version ' + CACHE_VERSION);

    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(cacheName => {
                    // Delete any old versions of our app/audio/xml caches
                    return cacheName.startsWith('accordion-') &&
                           cacheName !== APP_CACHE &&
                           cacheName !== AUDIO_CACHE &&
                           cacheName !== XML_CACHE;
                }).map(cacheName => {
                    console.log('[Service Worker] Removing old cache:', cacheName);
                    return caches.delete(cacheName);
                })
            );
        }).then(() => {
            console.log('[Service Worker] Claiming clients');
            // Ensure the newly activated service worker takes control immediately
            return self.clients.claim();
        })
    );
});

// --- Fetch Event Interception ---
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // --- Navigation Requests (HTML pages) ---
    // Use Cache First, falling back to Network, then Offline page
    if (event.request.mode === 'navigate') {
        event.respondWith(handlePageFetch(event.request));
        return;
    }

    // --- Audio sample files (.wav) ---
    // Cache First, then Network
    if (url.pathname.endsWith('.wav')) {
        event.respondWith(handleAudioFetch(event.request));
        return;
    }

    // --- MusicXML files ---
    // Cache First, then Network
    if (url.pathname.endsWith('.xml') || url.pathname.endsWith('.musicxml')) {
        event.respondWith(handleXmlFetch(event.request));
        return;
    }

    // --- External CDN resources ---
    // Cache First, then Network (Stale-while-revalidate pattern implicitly)
    if (!url.pathname.startsWith('/') &&
        (url.host.includes('cdn.') || url.host.includes('unpkg.com'))) {
        event.respondWith(handleCdnFetch(event.request));
        return;
    }

    // --- All Other Requests (CSS, JS, Fonts, Icons etc.) ---
    // Cache First, then Network
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                // console.log('[Service Worker] Serving from cache:', event.request.url);
                return cachedResponse;
            }

            // console.log('[Service Worker] Not in cache, fetching from network:', event.request.url);
            return fetch(event.request).then(networkResponse => {
                // Cache successful GET requests
                if (networkResponse && networkResponse.ok && event.request.method === 'GET') {
                    const responseToCache = networkResponse.clone();
                    caches.open(APP_CACHE).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(error => {
                console.error('[Service Worker] Fetch failed for non-navigation request:', event.request.url, error);
                // Provide a generic fallback for failed non-essential resources if needed
                // For CSS/JS, returning an empty response might be better than failing
                if (event.request.headers.get('accept').includes('text/css')) {
                    return new Response('', { headers: { 'Content-Type': 'text/css' } });
                }
                if (event.request.headers.get('accept').includes('text/javascript')) {
                    return new Response('', { headers: { 'Content-Type': 'text/javascript' } });
                }
                // Return a simple error response
                return new Response('Resource not available offline.', { status: 404, statusText: 'Not Found' });
            });
        })
    );
});


// --- Specific Fetch Handlers ---

/**
 * Handles navigation requests (HTML pages).
 * Cache first, then network, then offline page.
 */
async function handlePageFetch(request) {
    try {
        // 1. Try to get the response from the cache.
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            // console.log('[Service Worker] Serving page from cache:', request.url);
            return cachedResponse;
        }

        // 2. If not in cache, try to fetch from the network.
        // console.log('[Service Worker] Page not in cache, fetching from network:', request.url);
        const networkResponse = await fetch(request);

        // 3. If network fetch is successful, cache it and return it.
        if (networkResponse && networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            const cache = await caches.open(APP_CACHE);
            await cache.put(request, responseToCache);
            return networkResponse;
        }

        // 4. If network fetch fails (e.g., offline, server error), return the offline page from cache.
        console.warn('[Service Worker] Network fetch failed for page, serving offline page.');
        const offlinePage = await caches.match('./offline.html');
        return offlinePage || new Response("You are offline and the offline page isn't cached.", { status: 503, statusText: "Service Unavailable" });

    } catch (error) {
        // 5. Catch any other errors (e.g., network totally unavailable) and serve offline page.
        console.error('[Service Worker] Error handling page fetch:', error);
        const offlinePage = await caches.match('./offline.html');
        return offlinePage || new Response("You are offline and the offline page isn't cached.", { status: 503, statusText: "Service Unavailable" });
    }
}


/**
 * Handles audio sample fetch requests.
 * Cache first, then network.
 */
function handleAudioFetch(request) {
    return caches.match(request).then(cachedResponse => {
        if (cachedResponse) {
            return cachedResponse;
        }
        return fetch(request).then(networkResponse => {
            if (networkResponse && networkResponse.ok) {
                const responseToCache = networkResponse.clone();
                caches.open(AUDIO_CACHE).then(cache => cache.put(request, responseToCache));
            }
            return networkResponse;
        }).catch(error => {
            console.error('[Service Worker] Audio fetch failed:', request.url, error);
            return new Response('Audio not available offline.', { status: 404, headers: { 'Content-Type': 'text/plain' } });
        });
    });
}

/**
 * Handles MusicXML fetch requests.
 * Cache first, then network.
 */
function handleXmlFetch(request) {
    return caches.match(request).then(cachedResponse => {
        if (cachedResponse) {
            return cachedResponse;
        }
        return fetch(request).then(networkResponse => {
            if (networkResponse && networkResponse.ok) {
                const responseToCache = networkResponse.clone();
                caches.open(XML_CACHE).then(cache => cache.put(request, responseToCache));
            }
            return networkResponse;
        }).catch(error => {
            console.error('[Service Worker] XML fetch failed:', request.url, error);
            return new Response('XML not available offline.', { status: 404, headers: { 'Content-Type': 'text/plain' } });
        });
    });
}

/**
 * Handles CDN fetch requests.
 * Cache first, then network. Updates cache in background if network succeeds.
 */
function handleCdnFetch(request) {
    return caches.match(request).then(cachedResponse => {
        // Fetch from network in the background to update cache
        const fetchPromise = fetch(request).then(networkResponse => {
            if (networkResponse && networkResponse.ok) {
                const responseToCache = networkResponse.clone();
                caches.open(APP_CACHE).then(cache => cache.put(request, responseToCache));
            }
            return networkResponse; // Return network response if cache missed initially
        }).catch(err => {
            console.warn('[Service Worker] CDN fetch failed, relying on cache (if available):', request.url, err);
            // If network fails, and we didn't have a cached response initially, return an error
            if (!cachedResponse) {
                return new Response('CDN resource not available.', { status: 404, statusText: 'Not Found' });
            }
            // Otherwise, the cached response (returned below) is used.
        });

        // Return cached response immediately if available, otherwise wait for network fetch
        return cachedResponse || fetchPromise;
    });
}


// --- Message Event Listener ---
self.addEventListener('message', event => {
    if (event.data && event.data.action === 'CLEAR_CACHES') {
        // Handle cache clearing
        event.waitUntil(
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        console.log('[Service Worker] Deleting cache:', cacheName);
                        return caches.delete(cacheName);
                    })
                ).then(() => {
                    console.log('[Service Worker] All caches cleared');
                    if (event.ports && event.ports[0]) {
                        event.ports[0].postMessage({ result: 'success' });
                    }
                });
            })
        );
    }

    if (event.data && event.data.action === 'CACHE_AUDIO_TONE') {
        // Handle audio caching request (implementation likely in pwa-handler.js triggers fetches)
        const tone = event.data.tone;
        if (!tone) return;
        console.log(`[Service Worker] Received request to cache '${tone}' audio samples via message.`);
        // Actual caching happens via fetch events intercepted above
    }

    if (event.data && event.data.action === 'SKIP_WAITING') {
        // Allow forcing activation
        self.skipWaiting();
        console.log('[Service Worker] Skip waiting called via message');
    }
});
