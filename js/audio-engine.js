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
 * Initializes the Web Audio API AudioContext.
 */
function initAudioContext() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
            console.log(`AudioContext created. State: ${audioContext.state}`);
            if (audioContext.state === 'running') {
                loadSamplesForTone(currentToneName); // Assumes global var exists
            } else {
                console.log("AudioContext suspended. Waiting for user interaction.");
                document.addEventListener('click', resumeAudioContext, { once: true, capture: true });
                document.addEventListener('touchstart', resumeAudioContext, { once: true, capture: true });
            }
        } catch (e) {
            console.error("Web Audio API is not supported", e);
            alert("Web Audio API is not supported in this browser.");
            if(loadingIndicator) { loadingIndicator.textContent = "Error: Web Audio Not Supported"; loadingIndicator.style.display = 'block'; }
        }
    }
}

/**
 * Attempts to resume a suspended AudioContext.
 */
function resumeAudioContext() {
    if (audioContext && audioContext.state === 'suspended') {
        console.log("Attempting to resume AudioContext...");
        audioContext.resume().then(() => {
            console.log("AudioContext resumed successfully.");
            if (Object.keys(audioBuffers).length === 0) {
                console.log("Audio buffers empty, loading samples...");
                loadSamplesForTone(currentToneName); // Assumes global var exists
            } else {
                console.log("Audio buffers already loaded.");
            }
        }).catch(e => {
            console.error("Error resuming AudioContext:", e);
            if(statusDiv) statusDiv.textContent = "Error starting audio.";
        });
    }
    // Clean up listeners after first attempt
    document.removeEventListener('click', resumeAudioContext, { capture: true });
    document.removeEventListener('touchstart', resumeAudioContext, { capture: true });
}

/**
 * Loads audio samples for a given accordion tone.
 * @param {string} toneName - The name of the tone directory (e.g., 'FBE').
 */
async function loadSamplesForTone(toneName) {
    if (!audioContext || audioContext.state !== 'running') {
        console.warn(`Cannot load samples for ${toneName}, AudioContext not running. State: ${audioContext?.state}`);
        return;
    }
    const buttonURLs = generateButtonNoteURLs(toneName);
    if(loadingIndicator) { loadingIndicator.textContent = `Loading ${toneName} samples...`; loadingIndicator.style.display = 'block'; }
    console.log(`Starting sample loading for tone: ${toneName}...`);
    audioBuffers = {}; // Clear existing buffers
    let loadedCount = 0; let failedCount = 0;
    const totalSamples = Object.keys(buttonURLs).length * 2;
    const loadPromises = Object.entries(buttonURLs).flatMap(([buttonId, urls]) => [
        fetch(urls.pushUrl)
        .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status} for ${urls.pushUrl}`); return response.arrayBuffer(); })
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
        .then(decodedBuffer => { if (!audioBuffers[buttonId]) audioBuffers[buttonId] = { push: null, pull: null }; audioBuffers[buttonId].push = decodedBuffer; loadedCount++; })
        .catch(error => { console.warn(`Failed PUSH sample ${buttonId}:`, error.message); if (!audioBuffers[buttonId]) audioBuffers[buttonId] = { push: null, pull: null }; failedCount++; }),
                                                            fetch(urls.pullUrl)
                                                            .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status} for ${urls.pullUrl}`); return response.arrayBuffer(); })
                                                            .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
                                                            .then(decodedBuffer => { if (!audioBuffers[buttonId]) audioBuffers[buttonId] = { push: null, pull: null }; audioBuffers[buttonId].pull = decodedBuffer; loadedCount++; })
                                                            .catch(error => { console.warn(`Failed PULL sample ${buttonId}:`, error.message); if (!audioBuffers[buttonId]) audioBuffers[buttonId] = { push: null, pull: null }; failedCount++; })
    ]);
    await Promise.allSettled(loadPromises);
    console.log(`Loading finished for ${toneName}. Loaded: ${loadedCount}, Failed: ${failedCount}, Total Expected: ${totalSamples}`);
    if(loadingIndicator) {
        loadingIndicator.textContent = `Audio loaded (${toneName})`;
        setTimeout(() => { if(loadingIndicator) loadingIndicator.style.display = 'none'; }, 1500);
    }
    if (audioContext.state === 'suspended') console.warn("AudioContext suspended after loading samples.");
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
    if (!audioContext || audioContext.state !== 'running') {
        console.warn("AudioContext not running, cannot play sound.");
        return;
    }
    if (isRecording && !isPlaybackCall && !isBellowsChangeRestart) {
        const time = audioContext.currentTime - recordingStartTime;
        recordedEvents.push({ time: time, type: 'press', id: id, mode: currentBellowsMode });
    }

    // Get the correct audio buffer
    const bufferData = audioBuffers[id];
    const buffer = bufferData?.[currentBellowsMode]; // Uses currentBellowsMode global

    // <<< Log Buffer Lookup Result >>>
    console.log(`playManualSound: Buffer lookup for Btn: ${id} (${currentBellowsMode}):`, buffer ? 'Found' : 'NOT FOUND');

    if (!buffer) {
        console.warn(`Audio buffer not found for button ${id} in ${currentBellowsMode} mode.`);
        return; // No sound to play
    }

    // Stop any existing sound for this button
    const immediateStop = !(isPlaybackCall || isBellowsChangeRestart);
    stopManualSound(id, immediateStop, isBellowsChangeRestart); // Assumes stopManualSound exists

    const now = audioContext.currentTime;
    const gainNode = audioContext.createGain(); gainNode.gain.setValueAtTime(0.6, now);
    const source = audioContext.createBufferSource(); source.buffer = buffer;

    // Looping logic for manual play
    if (buffer.duration > 1.0 && !isPlaybackCall && !isBellowsChangeRestart && !isPlaying && !isRecordingPlayback) {
        source.loop = true; source.loopStart = 1.0; source.loopEnd = buffer.duration;
    } else { source.loop = false; }

    source.connect(gainNode); gainNode.connect(audioContext.destination);
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

// Ensure generateButtonNoteURLs exists if not defined elsewhere
if (typeof generateButtonNoteURLs === 'undefined') {
    function generateButtonNoteURLs(toneName) { /* ... implementation ... */ }
}
// Ensure formatTime exists if not defined elsewhere (e.g., main.js)
if (typeof formatTime === 'undefined') {
    function formatTime(totalSeconds) { /* ... implementation ... */ }
}
// Ensure necessary global variables are declared (usually in main.js)
// let audioContext, audioBuffers = {}, activeManualSources = {}, currentBellowsMode = 'push';
// let isRecording, recordingStartTime, recordedEvents = [];
// let isPlaying, isRecordingPlayback;
// let loadingIndicator, progressDisplayElement, statusDiv;
// Assume stopPlayback, stopRecordingPlayback exist

