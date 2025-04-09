// sw-register.js - Advanced service worker registration
(function() {
    'use strict';

    // Immediately check if service worker is supported
    if (!('serviceWorker' in navigator)) {
        console.warn('Service workers are not supported in this browser');
        return;
    }

    // Set up an immediate check
    checkServiceWorker();

    // And a check after the page has fully loaded
    window.addEventListener('load', checkServiceWorker);

    // Helper for checking and registering the service worker
    function checkServiceWorker() {
        // First check if a service worker is already controlling this page
        if (navigator.serviceWorker.controller) {
            console.log('Service worker is already controlling this page');

            // Force an update check
            navigator.serviceWorker.controller.postMessage({action: 'SKIP_WAITING'});
            return;
        }

        // If not controlling yet, register one with maximum compatibility
        registerServiceWorker();
    }

    // Register the service worker with best compatibility options
    function registerServiceWorker() {
        navigator.serviceWorker.register('./service-worker.js', {
            scope: './',
            updateViaCache: 'none' // Never use cached service worker
        })
        .then(function(registration) {
            console.log('ServiceWorker registration successful with scope:', registration.scope);

            // Force activate any waiting service worker
            if (registration.waiting) {
                console.log('Service worker is waiting, activating it now');
                registration.waiting.postMessage({action: 'SKIP_WAITING'});
            }

            // Handle updates
            registration.addEventListener('updatefound', function() {
                const newWorker = registration.installing;
                console.log('New service worker installing:', newWorker);

                newWorker.addEventListener('statechange', function() {
                    console.log('Service worker state changed to:', newWorker.state);

                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('New service worker installed but waiting, activating it now');
                        newWorker.postMessage({action: 'SKIP_WAITING'});
                    }
                });
            });
        })
        .catch(function(error) {
            console.error('ServiceWorker registration failed:', error);
        });
    }

    // Handle service worker updates
    navigator.serviceWorker.addEventListener('controllerchange', function() {
        console.log('Service worker controller changed');
    });

    // Check if the page is running in standalone mode (PWA installed)
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        console.log('App is running in standalone/installed mode');
    }

    // Check installation readiness after 3 seconds
    setTimeout(function() {
        if (!navigator.serviceWorker.controller) {
            console.warn('No service worker is controlling this page after 3 seconds. This might indicate a registration issue.');
            registerServiceWorker();
        }
    }, 3000);
})();
