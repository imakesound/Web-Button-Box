// pwa-handler.js - PWA functionality for offline support

// Global variables
let deferredPrompt;
let isAppInstalled = false;
let networkStatusDisplayTimeout;
// Define all available tone sets here to match your app's available tones
const ALL_TONES = ['FBE', 'GCF']; // Add more tones if your app supports more

// Check if the app is already installed
if (window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true) {
    isAppInstalled = true;
console.log('App is running in standalone/installed mode');
    }

    // Update UI based on online/offline status
    function updateOnlineStatus() {
        const isOnline = navigator.onLine;
        console.log(`Network status: ${isOnline ? 'Online' : 'Offline'}`);

        // Clear any pending timeout
        if (networkStatusDisplayTimeout) {
            clearTimeout(networkStatusDisplayTimeout);
        }

        if (statusDiv) {
            if (!isOnline) {
                statusDiv.textContent = "You're offline. Some features may be limited.";

                // Disable network-dependent features
                if (fileInput) fileInput.disabled = true;
                if (xmlPresetSelect) xmlPresetSelect.disabled = true;
                if (loadPresetBtn) loadPresetBtn.disabled = true;

                // Add an offline indicator to the UI
                document.body.classList.add('offline-mode');

            } else {
                statusDiv.textContent = "You're back online!";

                // Re-enable network-dependent features
                if (fileInput) fileInput.disabled = false;
                if (xmlPresetSelect) xmlPresetSelect.disabled = false;
                if (loadPresetBtn) loadPresetBtn.disabled = false;

                // Remove offline indicator
                document.body.classList.remove('offline-mode');

                // Restore normal status after 3 seconds
                networkStatusDisplayTimeout = setTimeout(() => {
                    if (isScoreLoaded && statusDiv) {
                        statusDiv.textContent = `Ready (${currentToneName}): ${currentScoreTitle}`;
                    } else if (statusDiv) {
                        statusDiv.textContent = "Ready";
                    }
                }, 3000);
            }
        }
    }

    // Pre-cache audio samples for a specific tone
    async function cacheAudioSamplesForTone(toneName) {
        console.log(`Caching audio samples for ${toneName} tone...`);
        if (loadingIndicator) {
            loadingIndicator.textContent = `Caching ${toneName} samples for offline use...`;
            loadingIndicator.style.display = 'block';
        }

        try {
            // Generate URLs for all samples in this tone
            const buttonURLs = generateButtonNoteURLs(toneName);
            const totalSamples = Object.keys(buttonURLs).length * 2; // Push and pull
            let loadedCount = 0;

            // Message the service worker to start caching
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    action: 'CACHE_AUDIO_TONE',
                    tone: toneName
                });
            }

            // Request each sample to trigger caching in the service worker
            for (const [buttonId, urls] of Object.entries(buttonURLs)) {
                try {
                    // Fetch push sample
                    const pushResponse = await fetch(urls.pushUrl);
                    if (pushResponse.ok) loadedCount++;

                    // Update UI every 5 samples
                    if (loadedCount % 5 === 0 && loadingIndicator) {
                        loadingIndicator.textContent =
                        `Caching ${toneName} samples: ${loadedCount}/${totalSamples}`;
                    }

                    // Fetch pull sample
                    const pullResponse = await fetch(urls.pullUrl);
                    if (pullResponse.ok) loadedCount++;

                    // Update UI every 5 samples
                    if (loadedCount % 5 === 0 && loadingIndicator) {
                        loadingIndicator.textContent =
                        `Caching ${toneName} samples: ${loadedCount}/${totalSamples}`;
                    }
                } catch (e) {
                    console.warn(`Failed to cache sample for button ${buttonId}:`, e);
                }
            }

            console.log(`Cached ${loadedCount}/${totalSamples} ${toneName} samples for offline use`);

            // Mark this tone as cached in localStorage
            localStorage.setItem(`${toneName}_samples_cached`, 'true');

            if (loadingIndicator) {
                loadingIndicator.textContent = `${toneName} samples ready for offline use`;
                setTimeout(() => {
                    if (loadingIndicator) loadingIndicator.style.display = 'none';
                }, 2000);
            }

            return true;
        } catch (error) {
            console.error(`Error caching ${toneName} samples:`, error);
            if (loadingIndicator) {
                loadingIndicator.textContent = `Error caching ${toneName} samples`;
                setTimeout(() => {
                    if (loadingIndicator) loadingIndicator.style.display = 'none';
                }, 3000);
            }
            return false;
        }
    }

    // Cache all available tone sets
    async function cacheAllTones() {
        if (!navigator.onLine || !navigator.serviceWorker.controller) {
            console.log('Cannot cache tones: offline or service worker not ready');
            return;
        }

        // Check if we've already cached all tones
        const allTonesCached = localStorage.getItem('all_tones_cached') === 'true';
        if (allTonesCached) {
            console.log('All tones already cached');
            return;
        }

        console.log('Starting to cache all tone sets...');
        if (loadingIndicator) {
            loadingIndicator.textContent = 'Preparing to cache all tone sets for offline use...';
            loadingIndicator.style.display = 'block';
        }

        // Keep track of success for each tone
        const results = {};

        // Cache each tone sequentially to avoid overwhelming the network
        for (const tone of ALL_TONES) {
            if (loadingIndicator) {
                loadingIndicator.textContent = `Caching ${tone} tone set...`;
            }

            try {
                // Check if this specific tone is already cached
                const isToneCached = localStorage.getItem(`${tone}_samples_cached`) === 'true';
                if (isToneCached) {
                    console.log(`${tone} already cached, skipping`);
                    results[tone] = true;
                    continue;
                }

                // Cache this tone
                results[tone] = await cacheAudioSamplesForTone(tone);
            } catch (e) {
                console.error(`Error caching ${tone}:`, e);
                results[tone] = false;
            }
        }

        // Check if all tones were cached successfully
        const allSuccess = Object.values(results).every(result => result === true);

        if (allSuccess) {
            console.log('All tones cached successfully');
            localStorage.setItem('all_tones_cached', 'true');
            if (loadingIndicator) {
                loadingIndicator.textContent = 'All tones cached for offline use';
                setTimeout(() => {
                    if (loadingIndicator) loadingIndicator.style.display = 'none';
                }, 2000);
            }
        } else {
            console.warn('Some tones failed to cache:', results);
            if (loadingIndicator) {
                loadingIndicator.textContent = 'Some tones could not be cached. Try again later.';
                setTimeout(() => {
                    if (loadingIndicator) loadingIndicator.style.display = 'none';
                }, 3000);
            }
        }

        return allSuccess;
    }

    // Add an install button to the UI if the app can be installed
    function createInstallButton() {
        if (isAppInstalled || !deferredPrompt) return;

        console.log("Creating install button - deferredPrompt available");

        // Remove any existing install button first
        const existingBtn = document.getElementById('install-button');
        if (existingBtn) {
            existingBtn.remove();
        }

        // Create the install button
        const installBtn = document.createElement('button');
        installBtn.id = 'install-button';
        installBtn.className = 'control-button';
        installBtn.textContent = 'Install App';
        installBtn.style.background = '#4CAF50';
        installBtn.style.color = 'white';
        installBtn.style.marginTop = '10px';
        installBtn.style.width = '100%';
        installBtn.style.fontSize = '16px';
        installBtn.style.padding = '10px';
        installBtn.style.fontWeight = 'bold';

        // Add click handler
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) {
                console.log("No deferredPrompt available anymore");
                installBtn.textContent = "Installation not available";
                installBtn.disabled = true;
                setTimeout(() => installBtn.remove(), 2000);
                return;
            }

            // Show the installation prompt
            deferredPrompt.prompt();
            console.log("Installation prompt shown to user");

            // Wait for user response
            try {
                const choiceResult = await deferredPrompt.userChoice;
                console.log(`User ${choiceResult.outcome === 'accepted' ? 'accepted' : 'declined'} the installation`);

                if (choiceResult.outcome === 'accepted') {
                    installBtn.textContent = "Installing...";
                    installBtn.disabled = true;
                } else {
                    installBtn.textContent = "Install App (Declined)";
                    setTimeout(() => {
                        installBtn.textContent = "Install App";
                    }, 3000);
                }
            } catch (e) {
                console.error("Error during installation prompt:", e);
                installBtn.textContent = "Installation failed";
                setTimeout(() => {
                    installBtn.textContent = "Install App";
                }, 3000);
            }

            // Reset the deferred prompt
            deferredPrompt = null;
        });

        // Insert the button into the general controls section
        const generalSection = document.querySelector('.control-section:first-of-type');
        if (generalSection) {
            // Insert at the top of the section for better visibility on mobile
            if (generalSection.firstChild) {
                generalSection.insertBefore(installBtn, generalSection.firstChild);
            } else {
                generalSection.appendChild(installBtn);
            }
            console.log("Install button added to the UI");
        } else {
            // Fallback: add to body if control section not found
            console.warn("General control section not found for install button");

            // Create a floating install button
            installBtn.style.position = 'fixed';
            installBtn.style.bottom = '20px';
            installBtn.style.left = '50%';
            installBtn.style.transform = 'translateX(-50%)';
            installBtn.style.zIndex = '1000';
            installBtn.style.padding = '12px 20px';
            installBtn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';

            document.body.appendChild(installBtn);
            console.log("Floating install button added to the body");
        }
    }

    // Create a direct install button for Android Chrome
    function createChromeInstallButton() {
        console.log("Creating Android Chrome install button");

        // Remove any existing install button first
        const existingBtn = document.getElementById('install-button');
        if (existingBtn) {
            existingBtn.remove();
        }

        // Create a new install button
        const installBtn = document.createElement('button');
        installBtn.id = 'install-button';
        installBtn.className = 'control-button';
        installBtn.textContent = 'Add to Home Screen';
        installBtn.style.background = '#4CAF50';
        installBtn.style.color = 'white';
        installBtn.style.marginTop = '10px';
        installBtn.style.width = '100%';
        installBtn.style.fontSize = '16px';
        installBtn.style.padding = '12px';
        installBtn.style.fontWeight = 'bold';

        // For Android Chrome, we can try to trigger the browser's built-in "Add to Home Screen" flow
        installBtn.addEventListener('click', () => {
            if (deferredPrompt) {
                // Use the stashed prompt if we have it
                console.log("Using deferred prompt for installation");
                deferredPrompt.prompt();

                deferredPrompt.userChoice.then(choiceResult => {
                    console.log("User choice result:", choiceResult.outcome);
                    if (choiceResult.outcome === 'accepted') {
                        installBtn.textContent = "Installing...";
                        installBtn.disabled = true;
                        setTimeout(() => {
                            installBtn.remove();
                        }, 2000);
                    } else {
                        installBtn.textContent = "Add to Home Screen";
                    }
                    deferredPrompt = null;
                });
            } else {
                // Show manual instructions as fallback
                console.log("No deferred prompt, showing manual instructions");
                alert("To install this app on Android Chrome:\n\n1. Open Chrome menu (3 dots)\n2. Select 'Add to Home screen'\n3. Follow the prompts to install");

                // Change button text to reflect shown instructions
                installBtn.textContent = "See Chrome Menu ⋮";
                setTimeout(() => {
                    installBtn.textContent = "Add to Home Screen";
                }, 5000);
            }
        });

        // Add the button to the UI
        const generalSection = document.querySelector('.control-section:first-of-type');
        if (generalSection) {
            // Insert at the top for visibility
            if (generalSection.firstChild) {
                generalSection.insertBefore(installBtn, generalSection.firstChild);
            } else {
                generalSection.appendChild(installBtn);
            }
            console.log("Install button added to general section");
        } else {
            // Fallback: add a floating button
            installBtn.style.position = 'fixed';
            installBtn.style.bottom = '20px';
            installBtn.style.left = '50%';
            installBtn.style.transform = 'translateX(-50%)';
            installBtn.style.zIndex = '1000';
            installBtn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
            document.body.appendChild(installBtn);
            console.log("Floating install button added to body");
        }
    }

    // Check if preset MusicXML files need to be cached
    async function checkAndCachePresets() {
        if (!navigator.onLine || !navigator.serviceWorker.controller) return;

        const presetsCached = localStorage.getItem('musicxml_presets_cached') === 'true';
        if (presetsCached) return;

        console.log('Caching MusicXML presets for offline use...');
        let cachedCount = 0;

        try {
            if (presetXmlFiles && presetXmlFiles.length > 0) {
                for (const preset of presetXmlFiles) {
                    try {
                        const response = await fetch(preset.path);
                        if (response.ok) cachedCount++;
                    } catch (e) {
                        console.warn(`Failed to cache preset ${preset.title}:`, e);
                    }
                }

                console.log(`Cached ${cachedCount}/${presetXmlFiles.length} MusicXML presets`);
                localStorage.setItem('musicxml_presets_cached', 'true');
            }
        } catch (e) {
            console.error('Error caching MusicXML presets:', e);
        }
    }

    // Debug function to check installation eligibility
    function debugPwaStatus() {
        // Manifest check
        fetch('./manifest.json')
        .then(response => {
            console.log(`Manifest fetch status: ${response.status}`);
            return response.ok;
        })
        .catch(err => {
            console.error("Error fetching manifest:", err);
            return false;
        })
        .then(manifestOk => {
            // Service worker check
            const swStatus = 'serviceWorker' in navigator ?
            (navigator.serviceWorker.controller ? 'Controlled' : 'Registered but not controlling') :
            'Not supported';

        // Display installation status
        console.log('PWA Installation Status:');
        console.log(`- Manifest available: ${manifestOk}`);
        console.log(`- Service Worker: ${swStatus}`);
        console.log(`- Display mode: ${window.matchMedia('(display-mode: standalone)').matches ? 'Standalone' : 'Browser'}`);
        console.log(`- iOS standalone: ${window.navigator.standalone === true}`);
        console.log(`- Install prompt deferred: ${deferredPrompt ? 'Yes' : 'No'}`);
        console.log(`- Can be installed (estimation): ${manifestOk && swStatus !== 'Not supported' && !isAppInstalled}`);

        // On iOS, show special instructions
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
            console.log("iOS detected: requires manual installation via Share menu > Add to Home Screen");
            showIOSInstallInstructions();
        }
        });
    }

    // Show installation instructions specifically for iOS
    function showIOSInstallInstructions() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (!isIOS || isAppInstalled) return;

        // Check if we've already shown instructions
        const instructionsShown = localStorage.getItem('ios_install_instructions_shown') === 'true';
        if (instructionsShown) return;

        // Create an iOS-specific install instructions button
        const iosInstallBtn = document.createElement('button');
        iosInstallBtn.id = 'ios-install-button';
        iosInstallBtn.className = 'control-button';
        iosInstallBtn.textContent = 'How to Install on iOS';
        iosInstallBtn.style.background = '#0070C9';
        iosInstallBtn.style.color = 'white';
        iosInstallBtn.style.marginTop = '10px';
        iosInstallBtn.style.width = '100%';

        iosInstallBtn.addEventListener('click', () => {
            // Create a modal with instructions
            const modal = document.createElement('div');
            modal.style.position = 'fixed';
            modal.style.left = '0';
            modal.style.top = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0,0,0,0.8)';
            modal.style.zIndex = '10000';
            modal.style.display = 'flex';
            modal.style.flexDirection = 'column';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.padding = '20px';

            const content = document.createElement('div');
            content.style.backgroundColor = 'white';
            content.style.borderRadius = '10px';
            content.style.padding = '20px';
            content.style.maxWidth = '320px';
            content.style.maxHeight = '80%';
            content.style.overflowY = 'auto';
            content.style.color = 'black';

            content.innerHTML = `
            <h3 style="margin-top:0;">Install on iOS</h3>
            <p>To install this app on your iOS device:</p>
            <ol style="text-align:left; padding-left:20px;">
            <li>Tap the Share icon <span style="font-size:1.5em;">ᐃ</span> at the bottom of the screen</li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
            <li>Tap <strong>Add</strong> in the top right corner</li>
            </ol>
            <p>The app will then appear on your home screen like a native app!</p>
            <button id="close-ios-modal" style="background:#0070C9; color:white; border:none; padding:8px 16px; border-radius:4px; margin-top:10px;">Got it!</button>
            `;

            modal.appendChild(content);
            document.body.appendChild(modal);

            document.getElementById('close-ios-modal').addEventListener('click', () => {
                modal.remove();
                localStorage.setItem('ios_install_instructions_shown', 'true');
            });
        });

        // Insert at the top of the general section
        const generalSection = document.querySelector('.control-section:first-of-type');
        if (generalSection) {
            if (generalSection.firstChild) {
                generalSection.insertBefore(iosInstallBtn, generalSection.firstChild);
            } else {
                generalSection.appendChild(iosInstallBtn);
            }
        } else {
            // Fallback: add to body
            iosInstallBtn.style.position = 'fixed';
            iosInstallBtn.style.bottom = '20px';
            iosInstallBtn.style.left = '50%';
            iosInstallBtn.style.transform = 'translateX(-50%)';
            iosInstallBtn.style.zIndex = '1000';
            iosInstallBtn.style.padding = '12px 20px';
            iosInstallBtn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';

            document.body.appendChild(iosInstallBtn);
        }
    }

    // Listen for network status changes
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome < 67 from automatically showing the prompt
        e.preventDefault();
        console.log('beforeinstallprompt event fired and captured!');

        // Stash the event so it can be triggered later
        deferredPrompt = e;

        // Add the install button to the UI
        createInstallButton();
    });

    // Listen for appinstalled event
    window.addEventListener('appinstalled', (e) => {
        console.log('Web Button Accordion was installed!');
        isAppInstalled = true;

        // Remove the install button if it exists
        const installBtn = document.getElementById('install-button');
        if (installBtn) installBtn.remove();

        // Also remove iOS instructions if they exist
        const iosInstallBtn = document.getElementById('ios-install-button');
        if (iosInstallBtn) iosInstallBtn.remove();
    });

        // Listen for messages from the service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.action === 'CACHING_AUDIO_TONE') {
                console.log(`Received confirmation that service worker is caching ${event.data.tone} tone`);
            }
        });

        // Initialize PWA features on page load
        document.addEventListener('DOMContentLoaded', () => {
            // Check initial network status
            updateOnlineStatus();

            // Debug PWA status
            debugPwaStatus();

            // Check for iOS and show installation instructions if needed
            showIOSInstallInstructions();

            // If the beforeinstallprompt event didn't fire yet but we have a deferred prompt,
            // create the install button
            if (deferredPrompt && !isAppInstalled) {
                console.log("Creating install button from DOMContentLoaded");
                createInstallButton();
            }

            // For Android Chrome, create an install button regardless of beforeinstallprompt
            const isAndroid = /Android/i.test(navigator.userAgent);
            const isChrome = /Chrome/i.test(navigator.userAgent) && !/Edge|Edg/i.test(navigator.userAgent);

            if (isAndroid && isChrome && !isAppInstalled) {
                console.log("Android Chrome detected, forcing install button creation");
                setTimeout(() => {
                    createChromeInstallButton();
                }, 1000); // Short delay to ensure DOM is ready
            }

            // Force a button after 3 seconds if we haven't seen the event but we're on Android Chrome
            setTimeout(() => {
                if (isAndroid && isChrome && !isAppInstalled && !document.getElementById('install-button')) {
                    console.log("No install button after timeout, creating one");
                    createChromeInstallButton();
                }
            }, 3000);

            // Add clean caches button to settings (for debugging/development)
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                const generalSection = document.querySelector('.control-section:first-of-type');
                if (generalSection) {
                    const clearCacheBtn = document.createElement('button');
                    clearCacheBtn.className = 'control-button';
                    clearCacheBtn.textContent = 'Clear PWA Caches';
                    clearCacheBtn.addEventListener('click', async () => {
                        if (navigator.serviceWorker.controller) {
                            try {
                                const messageChannel = new MessageChannel();
                                navigator.serviceWorker.controller.postMessage(
                                    { action: 'CLEAR_CACHES' },
                                    [messageChannel.port2]
                                );

                                messageChannel.port1.onmessage = (event) => {
                                    if (event.data.result === 'success') {
                                        alert('PWA caches cleared successfully');
                                        // Reset cache flags in localStorage
                                        localStorage.removeItem('all_tones_cached');
                                        ALL_TONES.forEach(tone => {
                                            localStorage.removeItem(`${tone}_samples_cached`);
                                        });
                                        localStorage.removeItem('musicxml_presets_cached');
                                    }
                                };
                            } catch (e) {
                                console.error('Error clearing caches:', e);
                                alert('Error clearing caches');
                            }
                        } else {
                            alert('Service worker not active');
                        }
                    });
                    generalSection.appendChild(clearCacheBtn);
                }
            }

            // Modify the "Cache Tone" button to be a "Refresh Offline Cache" button
            const cacheToneBtn = document.getElementById('cache-tone-btn');
            if (cacheToneBtn) {
                cacheToneBtn.textContent = 'Refresh All Tones Cache';
                cacheToneBtn.title = 'Refresh all tone sets for offline use';
                cacheToneBtn.addEventListener('click', async () => {
                    if (!navigator.onLine) {
                        alert('Cannot cache tones while offline');
                        return;
                    }

                    // Remove cache flags to force refresh
                    localStorage.removeItem('all_tones_cached');
                    ALL_TONES.forEach(tone => {
                        localStorage.removeItem(`${tone}_samples_cached`);
                    });

                    // Cache all tones again
                    const success = await cacheAllTones();
                    if (success) {
                        alert('All tones refreshed for offline use');
                    } else {
                        alert('Some tones could not be refreshed. Try again when you have a better connection.');
                    }
                });
            }

            // Set a timeout to cache all tones and presets after initial load
            setTimeout(async () => {
                if (navigator.onLine) {
                    // Cache all tone sets
                    await cacheAllTones();

                    // Cache preset MusicXML files
                    await checkAndCachePresets();
                } else {
                    console.log('Device is offline, will try to cache tones when online');
                    // Add an event listener to try caching again when we come online
                    const onlineHandler = async () => {
                        console.log('Device came online, attempting to cache tones');
                        await cacheAllTones();
                        await checkAndCachePresets();
                        window.removeEventListener('online', onlineHandler);
                    };
                    window.addEventListener('online', onlineHandler);
                }
            }, 3000); // Start caching 3 seconds after page load
        });

        // Add styles for offline indicator and install button
        const styleSheet = document.createElement('style');
        styleSheet.textContent = `
        body.offline-mode::after {
            content: "OFFLINE";
            position: fixed;
            bottom: 10px;
            left: 10px;
            background-color: rgba(0, 0, 0, 0.7);
            color: orange;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
        }

        #install-button {
        animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.7; }
            100% { opacity: 1; }
        }
        `;
        document.head.appendChild(styleSheet);
