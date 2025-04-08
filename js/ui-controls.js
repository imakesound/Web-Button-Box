// ui-controls.js - Button/bellows interactions, speed controls, theme, sheet music toggle

// --- Button Interaction Handlers ---
function handlePress(button) {
    if (!button || !button.classList.contains('acc-button')) return;
    const buttonId = button.dataset.buttonId;
    // console.log(`handlePress called for button: ${buttonId}`); // Optional: Keep for debugging clicks
    if (!audioContext || audioContext.state !== 'running') {
        console.log("Audio context not running yet in handlePress (should resume on user gesture).");
        return; // Rely on document listener in audio-engine.js to resume
    }
    if (!button.classList.contains('pressed')) {
        button.classList.add('pressed');
        // Ensure playManualSound exists before calling
        if (typeof playManualSound === 'function') {
            playManualSound(buttonId);
        } else {
            console.error("playManualSound function is not defined!");
        }
    }
}
function handleRelease(button) {
    if (!button || !button.classList.contains('acc-button')) return;
    const buttonId = button.dataset.buttonId;
    if (button.classList.contains('pressed')) {
        button.classList.remove('pressed');
        // Ensure stopManualSound exists before calling
        if (typeof stopManualSound === 'function') {
            stopManualSound(buttonId);
        } else {
            console.error("stopManualSound function is not defined!");
        }
    }
}
function handleTouchEndOrCancel(event) {
    event.preventDefault();
    for (const touch of event.changedTouches) {
        const endedButton = activeTouches.get(touch.identifier); // Assumes activeTouches is global
        if (endedButton) handleRelease(endedButton);
        activeTouches.delete(touch.identifier);
    }
    if (event.touches.length === 0) {
        isPointerDown = false; // Assumes isPointerDown is global
        if(typeof buttons !== 'undefined') { // Check if buttons exist
            buttons.forEach(button => {
                const isPressed = button.classList.contains('pressed');
                let isStillActiveTouch = false;
                if(typeof activeTouches !== 'undefined') { // Check if activeTouches exist
                    for (let btn of activeTouches.values()) { if (btn === button) { isStillActiveTouch = true; break; } }
                }
                if (isPressed && !isStillActiveTouch) {
                    console.warn(`Cleanup: Releasing potentially stuck button ${button.dataset.buttonId}`);
                    handleRelease(button);
                }
            });
        }
        if (typeof activeTouches !== 'undefined' && activeTouches.size > 0) {
            console.warn("Cleanup: Clearing non-empty active touches map.", activeTouches);
            activeTouches.clear();
        }
    }
}

// --- Bellows Mode Handlers ---
function setBellowsMode(mode, isInitial = false) {
    const newMode = (mode === 'pull') ? 'pull' : 'push';
    // Assumes currentBellowsMode is global
    if (!isInitial && newMode === currentBellowsMode) return;
    // Assumes isRecording, audioContext, recordingStartTime, recordedEvents are global
    if (isRecording && !isInitial && typeof audioContext !== 'undefined' && typeof recordingStartTime !== 'undefined' && typeof recordedEvents !== 'undefined') {
        const time = audioContext.currentTime - recordingStartTime;
        recordedEvents.push({ time: time, type: 'bellows', mode: newMode });
    }
    currentBellowsMode = newMode;
    if (bellowsToggle) { // Assumes bellowsToggle is global
        if (currentBellowsMode === 'pull') { bellowsToggle.classList.add('active'); bellowsToggle.textContent = 'P U L L'; bellowsToggle.title = "Release for PUSH sound"; }
        else { bellowsToggle.classList.remove('active'); bellowsToggle.textContent = 'P U S H'; bellowsToggle.title = "Hold for PULL sound"; }
    }
    if (!isInitial) {
        const heldButtonIds = new Set();
        // Assumes buttons, activeTouches are global
        if(typeof buttons !== 'undefined') buttons.forEach(btn => { if (btn.classList.contains('pressed')) heldButtonIds.add(btn.dataset.buttonId); });
        if(typeof activeTouches !== 'undefined') activeTouches.forEach(btn => { if (btn?.dataset) heldButtonIds.add(btn.dataset.buttonId); });
        heldButtonIds.forEach(id => {
            // Assumes playManualSound, activeManualSources, isPlaying, isRecordingPlayback are global/exist
            if(typeof playManualSound === 'function') playManualSound(id, false, true);
            const sourceData = activeManualSources[id];
            if (sourceData?.source?.buffer?.duration > 1.0 && !isPlaying && !isRecordingPlayback) {
                try { sourceData.source.loop = true; sourceData.source.loopStart = 1.0; sourceData.source.loopEnd = sourceData.source.buffer.duration; }
                catch (e) { console.error(`Error re-enabling loop for ${id}:`, e); }
            }
        });
    }
}
function setPlaybackBellowsMode(newMode) {
    // Assumes currentBellowsMode is global
    if (newMode === currentBellowsMode) return;
    console.log(`Recording Playback: Setting bellows to ${newMode}`);
    currentBellowsMode = newMode;
    if (bellowsToggle) { // Assumes bellowsToggle is global
        if (currentBellowsMode === 'pull') { bellowsToggle.classList.add('active'); bellowsToggle.textContent = 'P U L L'; }
        else { bellowsToggle.classList.remove('active'); bellowsToggle.textContent = 'P U S H'; }
    }
    // Assumes activeManualSources is global
    const currentlyPlayingIds = Object.keys(activeManualSources);
    currentlyPlayingIds.forEach(id => {
        console.log(`  Restarting held note ${id} for bellows change during playback`);
        // Assumes playManualSound, pressButtonVisually exist
        if(typeof playManualSound === 'function') playManualSound(id, true);
        if(typeof pressButtonVisually === 'function') pressButtonVisually(id, currentBellowsMode, false);
    });
}

// --- Visual Feedback ---
function pressButtonVisually(buttonId, direction, isSubstituted) {
    const btnElement = document.querySelector(`.acc-button[data-button-id="${buttonId}"]`);
    if(btnElement) {
        btnElement.classList.remove('pull-active', 'push-active', 'sub-active');
        btnElement.classList.add('pressed');
        if (isSubstituted) btnElement.classList.add('sub-active');
        else if (direction === 'pull') btnElement.classList.add('pull-active');
        else if (direction === 'push') btnElement.classList.add('push-active');
    } else { console.warn(`pressButtonVisually: Could not find button ${buttonId}`); }
}
function releaseButtonVisually(buttonId) {
    const btnElement = document.querySelector(`.acc-button[data-button-id="${buttonId}"]`);
    if (btnElement) {
        btnElement.classList.remove('pull-active', 'push-active', 'sub-active');
        // Assumes isPointerDown, activeTouches are global
        const isManuallyHeld = isPointerDown && btnElement.matches(':hover') || Array.from(activeTouches.values()).includes(btnElement);
        if (!isManuallyHeld) btnElement.classList.remove('pressed');
    }
}

// --- Set up UI event listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("ui-controls.js: DOMContentLoaded handler executing.");

    // --- Manual Play Interaction Listeners ---
    // Assumes board, handlePress, handleRelease, handleTouchEndOrCancel, buttons, activeTouches exist
    if (board && typeof handlePress === 'function' && typeof handleRelease === 'function' && typeof handleTouchEndOrCancel === 'function') {
        console.log("Attaching manual play listeners...");
        board.addEventListener('mousedown', (event) => { if (event.target.classList.contains('acc-button')) { event.preventDefault(); isPointerDown = true; handlePress(event.target); } });
        board.addEventListener('mouseover', (event) => { if (isPointerDown && event.target.classList.contains('acc-button')) { if (event.buttons === 1) handlePress(event.target); else { isPointerDown = false; if(typeof buttons !== 'undefined') buttons.forEach(handleRelease); } } });
        board.addEventListener('mouseout', (event) => { if (isPointerDown && event.target.classList.contains('acc-button')) handleRelease(event.target); });
        board.addEventListener('touchstart', (event) => { event.preventDefault(); isPointerDown = true; for (const touch of event.changedTouches) { const el = document.elementFromPoint(touch.clientX, touch.clientY); if (el?.classList.contains('acc-button')) { handlePress(el); if(typeof activeTouches !== 'undefined') activeTouches.set(touch.identifier, el); } } }, { passive: false });
        board.addEventListener('touchmove', (event) => { event.preventDefault(); for (const touch of event.changedTouches) { const currentEl = document.elementFromPoint(touch.clientX, touch.clientY); const lastBtn = activeTouches.get(touch.identifier); let currentBtn = null; if (currentEl?.classList.contains('acc-button')) currentBtn = currentEl; if (currentBtn !== lastBtn) { if (lastBtn) handleRelease(lastBtn); if (currentBtn) { handlePress(currentBtn); if(typeof activeTouches !== 'undefined') activeTouches.set(touch.identifier, currentBtn); } else { if(typeof activeTouches !== 'undefined') activeTouches.delete(touch.identifier); } } } }, { passive: false });
        board.addEventListener('touchend', handleTouchEndOrCancel);
        board.addEventListener('touchcancel', handleTouchEndOrCancel);
        console.log("Manual play listeners attached.");
    } else { console.error("Could not attach manual play listeners - board or handler functions missing."); }

    // Global mouseup listener
    if(typeof handleRelease === 'function') {
        document.addEventListener('mouseup', () => { if (isPointerDown) { isPointerDown = false; if(typeof buttons !== 'undefined') buttons.forEach(button => { if (button.classList.contains('pressed') && !Array.from(activeTouches.values()).includes(button)) handleRelease(button); }); } });
    }
    // Prevent drag
    document.addEventListener('dragstart', (e) => e.preventDefault());

    // --- Bellows Toggle Listeners ---
    // Assumes bellowsToggle, setBellowsMode exist
    if (bellowsToggle && typeof setBellowsMode === 'function') {
        console.log("Attaching bellows toggle listeners...");
        setBellowsMode('push', true);
        bellowsToggle.addEventListener('mousedown', (e) => { e.preventDefault(); setBellowsMode('pull'); });
        bellowsToggle.addEventListener('mouseup', () => { setBellowsMode('push'); });
        bellowsToggle.addEventListener('mouseleave', () => { if (bellowsToggle.classList.contains('active')) setBellowsMode('push'); });
        bellowsToggle.addEventListener('touchstart', (e) => { e.preventDefault(); setBellowsMode('pull'); }, { passive: false });
        bellowsToggle.addEventListener('touchend', () => { setBellowsMode('push'); });
        bellowsToggle.addEventListener('touchcancel', () => { setBellowsMode('push'); });
        console.log("Bellows toggle listeners attached.");
    } else { console.error("Could not attach bellows listeners - bellowsToggle or setBellowsMode missing."); }

    // --- Spacebar Listener for Bellows ---
    // Assumes setBellowsMode exists
    if(typeof setBellowsMode === 'function') {
        console.log("Attaching spacebar listeners.");
        document.addEventListener('keydown', (event) => { if (event.metaKey || event.ctrlKey || event.altKey || event.target.matches('input, select, textarea')) return; if (event.code === 'Space') { event.preventDefault(); if (currentBellowsMode !== 'pull') { setBellowsMode('pull'); if(bellowsToggle) bellowsToggle.classList.add('active'); } } });
        document.addEventListener('keyup', (event) => { if (event.target.matches('input, select, textarea')) return; if (event.code === 'Space') { event.preventDefault(); setBellowsMode('push'); if(bellowsToggle) bellowsToggle.classList.remove('active'); } });
        console.log("Spacebar listeners attached.");
    } else { console.error("Could not attach spacebar listeners - setBellowsMode missing."); }


    // --- Toggle Sheet Music Area Listener ---
    // Assumes toggleSheetBtn, musicSheetArea, osmd exist
    if (toggleSheetBtn && musicSheetArea) {
        console.log("Attaching sheet music toggle listener.");
        toggleSheetBtn.addEventListener('click', () => {
            console.log("Toggle sheet music button clicked.");
            console.log("Classes BEFORE toggle:", musicSheetArea.className);
            musicSheetArea.classList.toggle('sheet-music-hidden');
            musicSheetArea.classList.remove('hidden'); // Force remove just in case
            console.log("Classes AFTER toggle:", musicSheetArea.className);
            const isHidden = musicSheetArea.classList.contains('sheet-music-hidden');
            console.log("Is Hidden NOW (based on sheet-music-hidden class):", isHidden);
            toggleSheetBtn.textContent = isHidden ? "Show Music" : "Hide Music";
            if (!isHidden) {
                console.log("Sheet music shown, attempting OSMD resize.");
                setTimeout(() => { if (osmd?.handleResize) { try { osmd.handleResize(); console.log("Called osmd.handleResize() after toggle show."); if (osmd.cursor && !isPlaying && !isRecordingPlayback) osmd.cursor.hide(); } catch(e){ console.error("OSMD error after toggle/resize:", e); } } else { console.log("OSMD or handleResize not available for resize."); } }, 50);
            } else if (osmd?.cursor) { console.log("Sheet music hidden."); try { osmd.cursor.hide(); } catch(e) {} }
        });
        console.log("Sheet music toggle listener attached.");
    } else { console.error("Could not attach sheet music toggle listener - elements missing."); }

    // --- *** Restore Speed Slider Listeners with Checks *** ---
    console.log("Attempting to attach speed slider listeners...");

    // --- Music Speed Slider Listener ---
    // Assumes speedSlider, speedDisplay, statusDiv, stopPlayback, updateProgressIndicator exist
    if (speedSlider && speedDisplay && statusDiv) {
        console.log("Attaching music speed listener.");
        speedSlider.addEventListener('input', (event) => {
            // Assumes musicPlaybackSpeedFactor, isPlaying, parsedLastNoteEndTime1x, currentToneName, currentScoreTitle, isScoreLoaded exist
            musicPlaybackSpeedFactor = parseFloat(event.target.value);
            speedDisplay.textContent = `${musicPlaybackSpeedFactor.toFixed(2)}x`;
            let statusMsg = ""; let totalMusicDuration = parsedLastNoteEndTime1x;
            if (isPlaying) {
                // Check if stopPlayback function exists before calling
                if(typeof stopPlayback === 'function') {
                    stopPlayback();
                } else { console.error("stopPlayback function is not defined!"); }
                statusMsg = `Music speed changed to ${musicPlaybackSpeedFactor.toFixed(2)}x. Press Play Music to restart.`;
                // Check if updateProgressIndicator exists before calling
                if(typeof updateProgressIndicator === 'function') {
                    updateProgressIndicator(0, totalMusicDuration / musicPlaybackSpeedFactor);
                } else { console.error("updateProgressIndicator function is not defined!"); }
            } else if (isScoreLoaded) {
                statusMsg = `Ready (${currentToneName}): ${currentScoreTitle || 'Score loaded'}`;
                // Check if updateProgressIndicator exists before calling
                if(typeof updateProgressIndicator === 'function') {
                    updateProgressIndicator(0, totalMusicDuration / musicPlaybackSpeedFactor);
                } else { console.error("updateProgressIndicator function is not defined!"); }
            } else { statusMsg = `Music Speed: ${musicPlaybackSpeedFactor.toFixed(2)}x`; }
            statusDiv.textContent = statusMsg; console.log(`Music playback speed factor set to: ${musicPlaybackSpeedFactor}`);
        });
        console.log("Music speed listener attached.");
    } else { console.error("Could not attach music speed listener - elements missing."); }

    // --- Recording Speed Slider Listener ---
    // Assumes recSpeedSlider, recSpeedDisplay, statusDiv, stopRecordingPlayback, updateProgressIndicator exist
    if (recSpeedSlider && recSpeedDisplay && statusDiv) {
        console.log("Attaching recording speed listener.");
        recSpeedSlider.addEventListener('input', (event) => {
            // Assumes recordingPlaybackSpeedFactor, isRecordingPlayback, recordingTotalDurationSeconds, recordedEvents, recordingSelect exist
            recordingPlaybackSpeedFactor = parseFloat(event.target.value);
            recSpeedDisplay.textContent = `${recordingPlaybackSpeedFactor.toFixed(2)}x`;
            let statusMsg = ""; let totalRecDuration = recordingTotalDurationSeconds;
            if (isRecordingPlayback) {
                // Check if stopRecordingPlayback exists before calling
                if(typeof stopRecordingPlayback === 'function') {
                    stopRecordingPlayback();
                } else { console.error("stopRecordingPlayback function is not defined!"); }
                statusMsg = `Recording speed changed to ${recordingPlaybackSpeedFactor.toFixed(2)}x. Press Play Recording to restart.`;
                // Check if updateProgressIndicator exists before calling
                if(typeof updateProgressIndicator === 'function') {
                    updateProgressIndicator(0, totalRecDuration / recordingPlaybackSpeedFactor);
                } else { console.error("updateProgressIndicator function is not defined!"); }
            } else if (recordedEvents.length > 0) {
                const selectedRecName = recordingSelect ? recordingSelect.value : "";
                statusMsg = selectedRecName ? `Loaded recording: "${selectedRecName}" (${recordedEvents.length} events, ${totalRecDuration.toFixed(1)}s).` : "No recording loaded.";
                // Check if updateProgressIndicator exists before calling
                if(typeof updateProgressIndicator === 'function') {
                    updateProgressIndicator(0, totalRecDuration / recordingPlaybackSpeedFactor);
                } else { console.error("updateProgressIndicator function is not defined!"); }
            } else { statusMsg = `Recording Speed: ${recordingPlaybackSpeedFactor.toFixed(2)}x`; }
            statusDiv.textContent = statusMsg; console.log(`Recording playback speed factor set to: ${recordingPlaybackSpeedFactor}`);
        });
        console.log("Recording speed listener attached.");
    } else { console.error("Could not attach recording speed listener - elements missing."); }
    // --- End of Speed Slider Listeners ---


    // --- Tone Selection Listener ---
    // Assumes toneSelect, loadSamplesForTone, parseScoreData, updateProgressIndicator exist
    if (toneSelect && typeof loadSamplesForTone === 'function' && typeof parseScoreData === 'function' && typeof updateProgressIndicator === 'function') {
        console.log("Attaching tone select listener.");
        toneSelect.addEventListener('change', (event) => {
            const newTone = event.target.value;
            if (newTone !== currentToneName) {
                console.log(`Switching tone to: ${newTone}`); currentToneName = newTone;
                activeNoteMapping = (currentToneName === 'GCF') ? gcfNoteMapping : fbeNoteMapping;
                console.log(`Active note mapping switched to ${currentToneName}`);
                Object.keys(activeManualSources).forEach(id => stopManualSound(id, true)); activeManualSources = {};
                buttons.forEach(btn => btn.classList.remove('pressed')); activeTouches.clear(); isPointerDown = false;
                if (audioContext?.state === 'running') loadSamplesForTone(currentToneName);
                else console.warn("AudioContext not running, samples will load on next interaction.");
                if (isScoreLoaded && osmd) {
                    console.log(`Score loaded, re-parsing for new tone: ${currentToneName}`);
                    const strictParseResult = parseScoreData(osmd, activeNoteMapping, false);
                    const subParseResult = parseScoreData(osmd, activeNoteMapping, true);
                    scoreNotes = strictParseResult.notes; allParsedNotes = subParseResult.notes;
                    parsedLastNoteEndTime1x = strictParseResult.duration; totalMeasures = strictParseResult.measures;
                    tempo = osmd.Sheet.SheetPlaybackSetting?.tempo || (osmd.Sheet.HasBPMInfos && osmd.Sheet.BPMInfos.length > 0 ? osmd.Sheet.BPMInfos[0].Tempo : 120);
                    const canPlayStrict = scoreNotes.length > 0; const canPlaySub = allParsedNotes.length > 0;
                    if(playBtn) playBtn.disabled = !canPlayStrict; if(playSubBtn) playSubBtn.disabled = !canPlaySub;
                    const maxMeasure = totalMeasures > 0 ? totalMeasures : 1;
                    if(loopEndMeasureInput) { loopEndMeasureInput.max = maxMeasure; loopEndMeasureInput.value = maxMeasure; }
                    if(loopStartMeasureInput) { loopStartMeasureInput.max = maxMeasure; }
                    const totalDurationAudio = parsedLastNoteEndTime1x / musicPlaybackSpeedFactor;
                    updateProgressIndicator(0, totalDurationAudio);
                    console.log(`Re-parsed score for ${currentToneName}. Found ${scoreNotes.length} strict notes, ${allParsedNotes.length} total notes. Total Measures: ${totalMeasures}`);
                    let newStatus = `Ready (${currentToneName}): ${currentScoreTitle}`;
                    if (!canPlayStrict && canPlaySub) newStatus = `Ready (${currentToneName}, subs only): ${currentScoreTitle}`;
                    else if (!canPlayStrict && !canPlaySub) newStatus = `No playable notes found in ${currentScoreTitle} for ${currentToneName} mapping.`;
                    if(statusDiv) statusDiv.textContent = newStatus;
                } else { if(statusDiv) statusDiv.textContent = `Tone set to ${currentToneName}. Ready.`; }
            }
        });
        console.log("Tone select listener attached.");
    } else { console.error("Could not attach tone select listener - elements or functions missing."); }

    // --- Theme Selection Listener ---
    // Assumes themeSelect, body exist
    if (themeSelect && body) {
        console.log("Attaching theme select listener.");
        themeSelect.addEventListener('change', (event) => {
            const selectedTheme = event.target.value;
            console.log(`Switching theme to: ${selectedTheme}`);
            body.classList.remove('theme-light', 'theme-mexico');
            if (selectedTheme === 'light') body.classList.add('theme-light');
            else if (selectedTheme === 'mexico') body.classList.add('theme-mexico');
        });
            console.log("Theme select listener attached.");
    } else { console.error("Could not attach theme select listener - elements missing."); }


    console.log("ui-controls.js: DOMContentLoaded handler finished."); // Log End

}); // End DOMContentLoaded
