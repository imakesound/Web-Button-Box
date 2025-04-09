// audio-engine.js - Audio context and sound handling

/**
 * Generates URLs for audio samples based on tone name and button ID.
 * @param {string} toneName - The name of the tone directory (e.g., 'FBE').
 * @returns {object} - An object mapping button IDs to push/pull URLs.
 */
function generateButtonNoteURLs(toneName) {
    const urls = {};
    // Assuming 34 buttons, adjust if different
    for (let i = 1; i <= 34; i++) {
        const buttonId = `B${i}`;
        urls[buttonId] = {
            pushUrl: `${toneName}/push/b${i}.wav`, // Path structure for push samples
            pullUrl: `${toneName}/pull/b${i}.wav`  // Path structure for pull samples
        };
    }
    return urls;
}

/**
 * Flag to avoid multiple audio initialization attempts
 */
let isAudioInitializing = false;

/**
 * Initializes the Web Audio API AudioContext.
 *
 * @param {boolean} [forceInit=false] - Whether to force initialization regardless of current state
 * @returns {Promise<boolean>} - Resolves to true if initialization was successful
 */
function initAudioContext(forceInit = false) {
    return new Promise((resolve) => {
        // Prevent multiple simultaneous initialization attempts
        if (isAudioInitializing && !forceInit) {
            console.log("Audio initialization already in progress");
            resolve(false);
            return;
        }

        isAudioInitializing = true;

        // If context already exists, try to resume it
        if (audioContext && !forceInit) {
            console.log(`AudioContext exists. Current state: ${audioContext.state}`);
            if (audioContext.state === 'running') {
                console.log("AudioContext already running");
                isAudioInitializing = false;
                resolve(true);
                return;
            } else {
                // Try to resume existing context
                audioContext.resume().then(() => {
                    console.log("AudioContext resumed successfully");
                    if (Object.keys(audioBuffers).length === 0) {
                        console.log("Audio buffers empty, loading samples...");
                        loadSamplesForTone(currentToneName).then(() => {
                            isAudioInitializing = false;
                            resolve(true);
                        });
                    } else {
                        console.log("Audio buffers already loaded");
                        isAudioInitializing = false;
                        resolve(true);
                    }
                }).catch(e => {
                    console.error("Failed to resume AudioContext", e);
                    isAudioInitializing = false;
                    resolve(false);
                });
                return;
            }
        }

        // Create new context if needed
        try {
            if (!audioContext || forceInit) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
                console.log(`New AudioContext created. State: ${audioContext.state}`);
            }

            if (audioContext.state === 'running') {
                console.log("New AudioContext is running, loading samples");
                loadSamplesForTone(currentToneName).then(() => {
                    isAudioInitializing = false;
                    resolve(true);
                });
            } else {
                console.log("AudioContext suspended, will resume on user interaction");
                isAudioInitializing = false;
                resolve(false);
            }
        } catch (e) {
            console.error("Web Audio API is not supported", e);
            alert("Web Audio API is not supported in this browser.");
            if(loadingIndicator) {
                loadingIndicator.textContent = "Error: Web Audio Not Supported";
                loadingIndicator.style.display = 'block';
            }
            isAudioInitializing = false;
            resolve(false);
        }
    });
}

/**
 * Attempts to resume a suspended AudioContext.
 *
 * @returns {Promise<boolean>} - Resolves to true if resumption was successful
 */
function resumeAudioContext() {
    return new Promise((resolve) => {
        if (!audioContext) {
            console.log("No AudioContext to resume, initializing new one");
            initAudioContext(true).then(resolve);
            return;
        }

        if (audioContext.state === 'running') {
            console.log("AudioContext already running");
            if (Object.keys(audioBuffers).length === 0) {
                console.log("Audio buffers empty, loading samples...");
                loadSamplesForTone(currentToneName).then(() => resolve(true));
            } else {
                resolve(true);
            }
            return;
        }

        console.log("Attempting to resume AudioContext...");
        audioContext.resume().then(() => {
            console.log("AudioContext resumed successfully.");
            if (Object.keys(audioBuffers).length === 0) {
                console.log("Audio buffers empty, loading samples...");
                loadSamplesForTone(currentToneName).then(() => resolve(true));
            } else {
                console.log("Audio buffers already loaded.");
                resolve(true);
            }
        }).catch(e => {
            console.error("Error resuming AudioContext:", e);
            if(statusDiv) statusDiv.textContent = "Error starting audio. Try again.";
            resolve(false);
        });
    });
}

/**
 * Setup event listeners for audio context initialization
 */
function setupAudioContextListeners() {
    // These events require user interaction so we can use them to initialize audio
    const events = ['touchstart', 'mousedown', 'keydown'];

    const initAudioOnInteraction = async function(e) {
        console.log(`User interaction detected (${e.type}), initializing audio...`);
        const success = await resumeAudioContext();

        if (success) {
            console.log("Audio initialized successfully on user interaction");
            // Remove the listeners once successfully initialized
            events.forEach(eventType => {
                document.removeEventListener(eventType, initAudioOnInteraction, true);
            });
        }
    };

    // Add capture listeners for these events (we want to be the first to get them)
    events.forEach(eventType => {
        document.addEventListener(eventType, initAudioOnInteraction, {
            capture: true,
            once: false // Don't use 'once' as the first interaction might not succeed on iOS
        });
    });

    console.log("Audio context initialization listeners set up");
}

/**
 * Loads audio samples for a given accordion tone.
 * @param {string} toneName - The name of the tone directory (e.g., 'FBE').
 * @returns {Promise<boolean>} - Resolves to true if loading was successful
 */
async function loadSamplesForTone(toneName) {
    if (!audioContext) {
        console.warn(`Cannot load samples for ${toneName}, AudioContext not created.`);
        return false;
    }

    if (audioContext.state !== 'running') {
        console.warn(`Cannot load samples for ${toneName}, AudioContext not running. State: ${audioContext?.state}`);
        try {
            await audioContext.resume();
            console.log("AudioContext resumed before loading samples");
        } catch (e) {
            console.error("Failed to resume AudioContext before loading samples:", e);
            return false;
        }
    }

    const buttonURLs = generateButtonNoteURLs(toneName);
    if(loadingIndicator) {
        loadingIndicator.textContent = `Loading ${toneName} samples...`;
        loadingIndicator.style.display = 'block';
    }

    console.log(`Starting sample loading for tone: ${toneName}...`);
    audioBuffers = {}; // Clear existing buffers
    let loadedCount = 0;
    let failedCount = 0;
    const totalSamples = Object.keys(buttonURLs).length * 2;

    try {
        const loadPromises = Object.entries(buttonURLs).flatMap(([buttonId, urls]) => [
            fetch(urls.pushUrl)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status} for ${urls.pushUrl}`);
                return response.arrayBuffer();
            })
            .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
            .then(decodedBuffer => {
                if (!audioBuffers[buttonId]) audioBuffers[buttonId] = { push: null, pull: null };
                audioBuffers[buttonId].push = decodedBuffer;
                loadedCount++;
            })
            .catch(error => {
                console.warn(`Failed PUSH sample ${buttonId}:`, error.message);
                if (!audioBuffers[buttonId]) audioBuffers[buttonId] = { push: null, pull: null };
                failedCount++;
            }),

            fetch(urls.pullUrl)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status} for ${urls.pullUrl}`);
                return response.arrayBuffer();
            })
            .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
            .then(decodedBuffer => {
                if (!audioBuffers[buttonId]) audioBuffers[buttonId] = { push: null, pull: null };
                audioBuffers[buttonId].pull = decodedBuffer;
                loadedCount++;
            })
            .catch(error => {
                console.warn(`Failed PULL sample ${buttonId}:`, error.message);
                if (!audioBuffers[buttonId]) audioBuffers[buttonId] = { push: null, pull: null };
                failedCount++;
            })
        ]);

        await Promise.allSettled(loadPromises);

        console.log(`Loading finished for ${toneName}. Loaded: ${loadedCount}, Failed: ${failedCount}, Total Expected: ${totalSamples}`);
        if(loadingIndicator) {
            loadingIndicator.textContent = `Audio loaded (${toneName})`;
            setTimeout(() => {
                if(loadingIndicator) loadingIndicator.style.display = 'none';
            }, 1500);
        }

        if (audioContext.state === 'suspended') {
            console.warn("AudioContext suspended after loading samples.");
        }

        return loadedCount > 0;
    } catch (e) {
        console.error(`Error loading samples for ${toneName}:`, e);
        if(loadingIndicator) {
            loadingIndicator.textContent = `Error loading ${toneName} samples`;
            setTimeout(() => {
                if(loadingIndicator) loadingIndicator.style.display = 'none';
            }, 1500);
        }
        return false;
    }
}


/**
 * Plays a sound manually when a button is pressed.
 * @param {string} id - The button ID (e.g., 'B1').
 * @param {boolean} [isPlaybackCall=false] - True if called during recording playback.
 * @param {boolean} [isBellowsChangeRestart=false] - True if called due to bellows change while button held.
 */
function playManualSound(id, isPlaybackCall = false, isBellowsChangeRestart = false) {
    if (!isPlaybackCall && !isBellowsChangeRestart && (isPlaying || isRecordingPlayback)) {
        console.log("User interaction detected, stopping playback.");
        if (isPlaying) stopPlayback();
        if (isRecordingPlayback) stopRecordingPlayback();
    }

    // First, check if audio is ready and handle initialization if necessary
    if (!audioContext || audioContext.state !== 'running') {
        console.log("Audio not ready, attempting to initialize...");

        // Show status if not already visible
        if(statusDiv && !isPlaybackCall && !isBellowsChangeRestart) {
            statusDiv.textContent = "Initializing audio...";
        }

        // Try to resume audio context
        resumeAudioContext().then(success => {
            if (success) {
                console.log("Audio initialized successfully, retrying sound playback");
                playManualSound(id, isPlaybackCall, isBellowsChangeRestart);
            } else {
                console.warn("Could not initialize audio, cannot play sound");
                if(statusDiv && !isPlaybackCall && !isBellowsChangeRestart) {
                    statusDiv.textContent = "Tap buttons to initialize audio";
                }
            }
        });
        return;
    }

    // Record this press if we're recording
    if (isRecording && !isPlaybackCall && !isBellowsChangeRestart) {
        const time = audioContext.currentTime - recordingStartTime;
        recordedEvents.push({ time: time, type: 'press', id: id, mode: currentBellowsMode });
    }

    // Get the correct audio buffer
    const bufferData = audioBuffers[id];
    const buffer = bufferData?.[currentBellowsMode]; // Uses currentBellowsMode global

    // Log Buffer Lookup Result
    console.log(`playManualSound: Buffer lookup for Btn: ${id} (${currentBellowsMode}):`, buffer ? 'Found' : 'NOT FOUND');

    if (!buffer) {
        console.warn(`Audio buffer not found for button ${id} in ${currentBellowsMode} mode.`);
        return; // No sound to play
    }

    // Stop any existing sound for this button
    const immediateStop = !(isPlaybackCall || isBellowsChangeRestart);
    stopManualSound(id, immediateStop, isBellowsChangeRestart); // Assumes stopManualSound exists

    const now = audioContext.currentTime;
    const gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(0.6, now);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;

    // Looping logic for manual play
    if (buffer.duration > 1.0 && !isPlaybackCall && !isBellowsChangeRestart && !isPlaying && !isRecordingPlayback) {
        source.loop = true;
        source.loopStart = 1.0;
        source.loopEnd = buffer.duration;
    } else {
        source.loop = false;
    }

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(now);
    activeManualSources[id] = { source, gainNode }; // Store reference
}

/**
 * Stops a manually played sound, either immediately or with a short fade.
 * @param {string} id - The button ID (e.g., 'B1').
 * @param {boolean} [immediate=false] - If true, stop instantly; otherwise, fade out.
 * @param {boolean} [internalRestart=false] - True if stopped as part of an internal restart.
 */
function stopManualSound(id, immediate = false, internalRestart = false) {
    if (isRecording && !immediate && !internalRestart && activeManualSources[id]) {
        const time = audioContext.currentTime - recordingStartTime;
        recordedEvents.push({ time: time, type: 'release', id: id });
    }
    if (audioContext && activeManualSources[id]) {
        const { source, gainNode } = activeManualSources[id];
        const now = audioContext.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        if (immediate) {
            try { source.stop(now); } catch (e) {}
            try { gainNode.disconnect(); } catch (e) {}
        } else {
            gainNode.gain.setValueAtTime(gainNode.gain.value, now);
            gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.05);
            try { source.stop(now + 0.06); } catch (e) {}
            source.onended = () => { try { gainNode.disconnect(); } catch(e) {} };
        }
        delete activeManualSources[id]; // Remove reference
    }
}

/**
 * Updates the text content of the progress display element.
 * @param {number} elapsedSeconds - The elapsed time in seconds.
 * @param {number} totalSeconds - The total duration in seconds.
 */
function updateProgressIndicator(elapsedSeconds, totalSeconds) {
    if (!progressDisplayElement) return;
    const elapsedFormatted = formatTime(elapsedSeconds); // Assumes formatTime exists
    const totalFormatted = formatTime(totalSeconds);
    progressDisplayElement.textContent = `${elapsedFormatted} / ${totalFormatted}`;
}

// Set up the audio context listeners on script load
document.addEventListener('DOMContentLoaded', () => {
    console.log("Setting up audio initialization listeners");
    setupAudioContextListeners();

    // Add a clear audio initialization button for mobile
    if (loadingIndicator && loadingIndicator.parentNode) {
        const initAudioButton = document.createElement('button');
        initAudioButton.id = 'init-audio-button';
        initAudioButton.className = 'control-button';
        initAudioButton.textContent = 'Initialize Audio';
        initAudioButton.style.marginTop = '10px';
        initAudioButton.style.width = '100%';

        initAudioButton.addEventListener('click', async () => {
            console.log("Manual audio initialization requested");
            const success = await resumeAudioContext();
            if (success) {
                initAudioButton.textContent = 'Audio Initialized ✓';
                initAudioButton.disabled = true;
                setTimeout(() => {
                    initAudioButton.style.display = 'none';
                }, 2000);
            } else {
                initAudioButton.textContent = 'Try Again to Initialize Audio';
            }
        });

        loadingIndicator.parentNode.insertBefore(initAudioButton, loadingIndicator.nextSibling);
    }
});

// Ensure formatTime exists if not defined elsewhere (e.g., main.js)
if (typeof formatTime === 'undefined') {
    function formatTime(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}
