// audio-engine.js - Audio context and sound handling

function generateButtonNoteURLs(toneName) {
    const urls = {};
    for (let i = 1; i <= 34; i++) {
        const buttonId = `B${i}`;
        urls[buttonId] = { 
            pushUrl: `${toneName}/push/b${i}.wav`, 
            pullUrl: `${toneName}/pull/b${i}.wav` 
        };
    }
    return urls;
}

function initAudioContext() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
            console.log(`AudioContext created. State: ${audioContext.state}`);
            if (audioContext.state === 'running') {
                loadSamplesForTone(currentToneName);
            } else {
                console.log("AudioContext suspended. Waiting for user interaction.");
                document.addEventListener('click', resumeAudioContext, { once: true, capture: true });
                document.addEventListener('touchstart', resumeAudioContext, { once: true, capture: true });
            }
        } catch (e) {
            console.error("Web Audio API is not supported", e);
            alert("Web Audio API is not supported in this browser.");
            loadingIndicator.textContent = "Error: Web Audio Not Supported";
            loadingIndicator.style.display = 'block';
        }
    }
}

function resumeAudioContext() {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log("AudioContext resumed successfully.");
            if (Object.keys(audioBuffers).length === 0) {
                loadSamplesForTone(currentToneName);
            }
        }).catch(e => console.error("Error resuming AudioContext:", e));
    }
    document.removeEventListener('click', resumeAudioContext, { capture: true });
    document.removeEventListener('touchstart', resumeAudioContext, { capture: true });
}

async function loadSamplesForTone(toneName) {
    if (!audioContext || audioContext.state !== 'running') {
        console.warn(`Cannot load samples for ${toneName}, AudioContext not running. State: ${audioContext?.state}`);
        if (audioContext && audioContext.state === 'suspended') {
            resumeAudioContext();
        }
        return;
    }

    const buttonURLs = generateButtonNoteURLs(toneName);
    loadingIndicator.textContent = `Loading ${toneName} samples...`;
    loadingIndicator.style.display = 'block';
    console.log(`Starting sample loading for tone: ${toneName}...`);
    
    audioBuffers = {};
    let loadedCount = 0;
    let failedCount = 0;
    const totalSamples = Object.keys(buttonURLs).length * 2;
    
    const loadPromises = Object.entries(buttonURLs).flatMap(([buttonId, urls]) => [
        fetch(urls.pushUrl)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for ${urls.pushUrl}`);
                return response.arrayBuffer();
            })
            .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
            .then(decodedBuffer => {
                if (!audioBuffers[buttonId]) audioBuffers[buttonId] = { push: null, pull: null };
                audioBuffers[buttonId].push = decodedBuffer;
                loadedCount++;
            })
            .catch(error => {
                console.warn(`Failed to load/decode PUSH sample for ${buttonId} (${urls.pushUrl}):`, error.message);
                if (!audioBuffers[buttonId]) audioBuffers[buttonId] = { push: null, pull: null };
                failedCount++;
            }),
            
        fetch(urls.pullUrl)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for ${urls.pullUrl}`);
                return response.arrayBuffer();
            })
            .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
            .then(decodedBuffer => {
                if (!audioBuffers[buttonId]) audioBuffers[buttonId] = { push: null, pull: null };
                audioBuffers[buttonId].pull = decodedBuffer;
                loadedCount++;
            })
            .catch(error => {
                console.warn(`Failed to load/decode PULL sample for ${buttonId} (${urls.pullUrl}):`, error.message);
                if (!audioBuffers[buttonId]) audioBuffers[buttonId] = { push: null, pull: null };
                failedCount++;
            })
    ]);
    
    await Promise.allSettled(loadPromises);
    console.log(`Loading finished for ${toneName}. Loaded: ${loadedCount}, Failed: ${failedCount}, Total Expected: ${totalSamples}`);
    loadingIndicator.textContent = `Audio loaded (${toneName})`;
    setTimeout(() => {
        loadingIndicator.style.display = 'none';
    }, 2500);
    
    if (audioContext.state === 'suspended') {
        console.warn("AudioContext suspended after loading samples.");
    }
}

function playManualSound(id, isPlaybackCall = false, isBellowsChangeRestart = false) {
    if (!isPlaybackCall && !isBellowsChangeRestart && (isPlaying || isRecordingPlayback)) {
        console.log("User interaction detected, stopping playback.");
        if (isPlaying) stopPlayback();
        if (isRecordingPlayback) stopRecordingPlayback();
    }
    
    if (!audioContext || audioContext.state !== 'running') {
        console.warn("AudioContext not running, cannot play sound.");
        resumeAudioContext();
        return;
    }
    
    if (isRecording && !isPlaybackCall && !isBellowsChangeRestart) {
        const time = audioContext.currentTime - recordingStartTime;
        recordedEvents.push({ time: time, type: 'press', id: id, mode: currentBellowsMode });
    }
    
    const bufferData = audioBuffers[id];
    const buffer = bufferData?.[currentBellowsMode];
    
    if (!buffer) {
        console.warn(`Audio buffer not found for button ${id} in ${currentBellowsMode} mode.`);
        return;
    }
    
    const immediateStop = !(isPlaybackCall || isBellowsChangeRestart);
    stopManualSound(id, immediateStop, isBellowsChangeRestart);
    
    const now = audioContext.currentTime;
    const gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(0.6, now);
    
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = false;
    
    if (buffer.duration > 1.0 && !isPlaybackCall && !isBellowsChangeRestart && !isPlaying && !isRecordingPlayback) {
        source.loop = true;
        source.loopStart = 1.0;
        source.loopEnd = buffer.duration;
    }
    
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(now);
    
    activeManualSources[id] = { source, gainNode };
}

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
            
            source.onended = () => {
                try { gainNode.disconnect(); } catch(e) {}
            };
        }
        
        delete activeManualSources[id];
    }
}

function updateProgressIndicator(elapsedSeconds, totalSeconds) {
    if (!progressDisplayElement) return;
    const elapsedFormatted = formatTime(elapsedSeconds);
    const totalFormatted = formatTime(totalSeconds);
    progressDisplayElement.textContent = `${elapsedFormatted} / ${totalFormatted}`;
}
