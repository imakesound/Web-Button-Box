// service-worker.js - Enhanced for better PWA support
const CACHE_VERSION = 'v1.0.1'; // Update this version when you make changes
const APP_CACHE = 'accordion-app-' + CACHE_VERSION;
const AUDIO_CACHE = 'accordion-audio-' + CACHE_VERSION;
const XML_CACHE = 'accordion-xml-' + CACHE_VERSION;

// Core app assets to cache immediately
const CORE_ASSETS = [
    './',
'./index.html',
'./offline.html',
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
];

// External dependencies to cache
const EXTERNAL_DEPS = [
    'https://cdn.tailwindcss.com',
'https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@1.8.4/build/opensheetmusicdisplay.min.js',
'https://unpkg.com/lucide@latest'
];

// Service worker installation - cache core assets
self.addEventListener('install', event => {
    console.log('[Service Worker] Installing version ' + CACHE_VERSION);

    // Skip waiting to ensure the new service worker activates immediately
    self.skipWaiting();

    event.waitUntil(
        caches.open(APP_CACHE)
        .then(cache => {
            console.log('[Service Worker] Caching core app assets');
            return cache.addAll(CORE_ASSETS)
            .then(() => {
                console.log('[Service Worker] Core assets cached successfully');
                return cache.addAll(EXTERNAL_DEPS)
                .catch(err => {
                    console.warn('[Service Worker] Some external dependencies failed to cache:', err);
                    // Continue even if external deps fail - we'll try again later
                    return Promise.resolve();
                });
            });
        })
    );
});

// Cleanup old caches when service worker activates
self.addEventListener('activate', event => {
    console.log('[Service Worker] Activating version ' + CACHE_VERSION);

    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(cacheName => {
                    // Delete any old versions of our caches
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
            return self.clients.claim();
        })
    );
});

// Intercept fetch requests
self.addEventListener('fetch', event => {
    // Log the URL being fetched (helpful for debugging)
    // console.log('[Service Worker] Fetching:', event.request.url);

    const url = new URL(event.request.url);

    // Different strategies for different types of resources

    // 1. Audio sample files (.wav) - Cache with network fallback
    if (url.pathname.endsWith('.wav')) {
        event.respondWith(handleAudioFetch(event.request));
        return;
    }

    // 2. MusicXML files - Cache with network fallback
    if (url.pathname.endsWith('.xml') || url.pathname.endsWith('.musicxml')) {
        event.respondWith(handleXmlFetch(event.request));
        return;
    }

    // 3. External CDN resources - Cache with network update
    if (!url.pathname.startsWith('/') &&
        (url.host.includes('cdn.') || url.host.includes('unpkg.com'))) {
        event.respondWith(handleCdnFetch(event.request));
    return;
        }

        // 4. HTML page requests - Network with cache fallback, fallback to offline page
        if (event.request.mode === 'navigate' ||
            (event.request.method === 'GET' &&
            event.request.headers.get('accept').includes('text/html'))) {
            event.respondWith(handlePageFetch(event.request));
        return;
            }

            // 5. All other requests - Cache falling back to network
            event.respondWith(
                caches.match(event.request).then(response => {
                    return response || fetch(event.request)
                    .then(fetchResponse => {
                        // Don't cache non-GET requests
                        if (event.request.method !== 'GET') return fetchResponse;

                        // Cache successful responses
                        if (fetchResponse.ok) {
                            return caches.open(APP_CACHE).then(cache => {
                                cache.put(event.request, fetchResponse.clone());
                                return fetchResponse;
                            });
                        }

                        return fetchResponse;
                    })
                    .catch(error => {
                        console.error('[Service Worker] Fetch failed:', error);
                        // Try to respond with a fallback
                        if (event.request.headers.get('accept').includes('text/css')) {
                            // Empty CSS as fallback
                            return new Response('/* Offline fallback CSS */', { headers: { 'Content-Type': 'text/css' } });
                        }
                        if (event.request.headers.get('accept').includes('text/javascript')) {
                            // Empty JavaScript as fallback
                            return new Response('// Offline fallback JavaScript', { headers: { 'Content-Type': 'text/javascript' } });
                        }
                        return new Response('Network error', { status: 404, statusText: 'Not found' });
                    });
                })
            );
});

// Handle audio sample fetch requests
function handleAudioFetch(request) {
    return caches.match(request)
    .then(cachedResponse => {
        // Return cached response if available
        if (cachedResponse) {
            return cachedResponse;
        }

        // Otherwise fetch from network and cache
        return fetch(request)
        .then(networkResponse => {
            if (!networkResponse || networkResponse.status !== 200) {
                return networkResponse;
            }

            // Clone the response and cache it
            const responseToCache = networkResponse.clone();
            caches.open(AUDIO_CACHE)
            .then(cache => cache.put(request, responseToCache));

            return networkResponse;
        })
        .catch(error => {
            console.error('[Service Worker] Audio fetch failed:', error);
            return new Response(
                JSON.stringify({ error: 'Audio file not available offline' }),
                                {
                                    status: 503,
                                    headers: { 'Content-Type': 'application/json' }
                                }
            );
        });
    });
}

// Handle MusicXML fetch requests
function handleXmlFetch(request) {
    return caches.match(request)
    .then(cachedResponse => {
        // Return cached response if available
        if (cachedResponse) {
            return cachedResponse;
        }

        // Otherwise fetch from network and cache
        return fetch(request)
        .then(networkResponse => {
            if (!networkResponse || networkResponse.status !== 200) {
                return networkResponse;
            }

            // Clone the response and cache it
            const responseToCache = networkResponse.clone();
            caches.open(XML_CACHE)
            .then(cache => cache.put(request, responseToCache));

            return networkResponse;
        })
        .catch(error => {
            console.error('[Service Worker] XML fetch failed:', error);
            return new Response(
                JSON.stringify({ error: 'MusicXML file not available offline' }),
                                {
                                    status: 503,
                                    headers: { 'Content-Type': 'application/json' }
                                }
            );
        });
    });
}

// Handle CDN fetch requests
function handleCdnFetch(request) {
    return caches.match(request)
    .then(cachedResponse => {
        const fetchPromise = fetch(request)
        .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(APP_CACHE)
                .then(cache => cache.put(request, responseToCache));
            }
            return networkResponse;
        })
        .catch(() => {
            console.log('[Service Worker] Using cached version of CDN resource');
            return cachedResponse;
        });

        // Return cached response immediately if available, otherwise wait for fetch
        return cachedResponse || fetchPromise;
    });
}

// Handle HTML page fetch requests
function handlePageFetch(request) {
    return fetch(request)
    .then(response => {
        if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(APP_CACHE)
            .then(cache => cache.put(request, responseToCache));
        }
        return response;
    })
    .catch(() => {
        return caches.match(request)
        .then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }
            // If not in cache, return the offline page
            return caches.match('./offline.html');
        });
    });
}

// Listen for message events (e.g., to clear cache)
self.addEventListener('message', event => {
    if (event.data && event.data.action === 'CLEAR_CACHES') {
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
        const tone = event.data.tone;
        if (!tone) return;

        console.log(`[Service Worker] Received request to cache '${tone}' audio samples`);

        event.waitUntil(
            caches.open(AUDIO_CACHE).then(cache => {
                console.log(`[Service Worker] Caching ${tone} audio samples`);
                return self.clients.matchAll().then(clients => {
                    if (clients && clients.length > 0) {
                        clients[0].postMessage({
                            action: 'CACHING_AUDIO_TONE',
                            tone: tone
                        });
                    }
                });
            })
        );
    }

    if (event.data && event.data.action === 'SKIP_WAITING') {
        self.skipWaiting();
        console.log('[Service Worker] Skip waiting called');
    }
});
