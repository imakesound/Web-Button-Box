// music-playback.js - MusicXML parsing and playback (v4 - Add Mapping Logs)

/**
 * Parses score data from an OSMD instance to generate playable note events.
 * Ensures consistent string-based lookup for MIDI notes.
 * @param {object} osmdInstance - The initialized OpenSheetMusicDisplay instance.
 * @param {object} noteMapping - The mapping object (e.g., fbeNoteMapping) for the current tone.
 * @param {boolean} [substituteUnplayable=false] - If true, substitutes unplayable notes with the closest playable one.
 * @returns {object} - An object containing { notes: Array, duration: number, measures: number }.
 */
function parseScoreData(osmdInstance, noteMapping, substituteUnplayable = false) {
    console.log(`Parsing score data for tone: ${currentToneName} (Substitute=${substituteUnplayable})`);
    // <<< Log the received mapping object >>>
    // Use try-catch in case stringify fails on complex objects (like osmdNote refs later)
    try {
        console.log('Received noteMapping keys:', Object.keys(noteMapping || {}));
    } catch (e) {
        console.error("Could not stringify noteMapping", e);
        console.log('Received noteMapping (raw):', noteMapping);
    }


    const notesForPlayback = [];
    let calculatedEndTime1x = 0;
    let calculatedMeasures = 0;

    if (!osmdInstance || !osmdInstance.Sheet || !osmdInstance.cursor) {
        console.error("OSMD Sheet data or cursor not available for parsing.");
        return { notes: [], duration: 0, measures: 0 };
    }
    if (!noteMapping || Object.keys(noteMapping).length === 0) { // Check if mapping is empty
        console.error("No note mapping provided or mapping is empty.");
        return { notes: [], duration: 0, measures: 0 };
    }

    const pushMidiToButtonId = {};
    const pullMidiToButtonId = {};
    const allPlayableMidiNotes = new Set();

    for (const [buttonId, notes] of Object.entries(noteMapping)) {
        if (notes.push !== null && notes.push !== undefined) {
            allPlayableMidiNotes.add(notes.push);
            const pushMidiStr = String(notes.push);
            if (!pushMidiToButtonId[pushMidiStr]) {
                pushMidiToButtonId[pushMidiStr] = buttonId;
            }
        }
        if (notes.pull !== null && notes.pull !== undefined) {
            allPlayableMidiNotes.add(notes.pull);
            const pullMidiStr = String(notes.pull);
            if (!pullMidiToButtonId[pullMidiStr]) {
                pullMidiToButtonId[pullMidiStr] = buttonId;
            }
        }
    }

    // <<< Log the created lookup maps >>>
    console.log('Push Lookup Map:', pushMidiToButtonId);
    console.log('Pull Lookup Map:', pullMidiToButtonId);


    const sortedPlayableMidiNotes = Array.from(allPlayableMidiNotes).sort((a, b) => a - b);

    try {
        let currentBpm = 120;
        if (osmdInstance.Sheet.SheetPlaybackSetting?.tempo) {
            currentBpm = osmdInstance.Sheet.SheetPlaybackSetting.tempo;
        } else if (osmdInstance.Sheet.HasBPMInfos && osmdInstance.Sheet.BPMInfos.length > 0) {
            currentBpm = osmdInstance.Sheet.BPMInfos[0].Tempo;
        }
        console.log("Tempo determined for parsing:", currentBpm, "BPM");

        const quarterNoteDurationSeconds = 60.0 / currentBpm;
        calculatedMeasures = osmdInstance.Sheet.SourceMeasures.length;
        console.log("Total Measures found:", calculatedMeasures);

        const cursor = osmdInstance.cursor;
        cursor.reset();

        while (!cursor.Iterator.EndReached) {
            const voices = cursor.VoicesUnderCursor();
            voices.forEach(voiceEntry => {
                voiceEntry.Notes.forEach(note => {
                    const measureNumber = note.SourceMeasure?.MeasureNumber;
                    if (!note.isRest() && note.Pitch && measureNumber !== undefined) {
                        const startTimeStamp = note.getAbsoluteTimestamp().RealValue;
                        const duration = note.Length.RealValue;
                        let originalMidiPitch = null;
                        let rawHalfTone = note.Pitch.halfTone;
                        if (rawHalfTone !== undefined && typeof rawHalfTone === 'number') {
                            originalMidiPitch = rawHalfTone + 12;
                        } else {
                            return; // Skip note
                        }

                        let chosenButtonId = undefined;
                        let chosenDirection = undefined;
                        let finalMidiPitch = originalMidiPitch;
                        let isSubstituted = false;
                        const midiPitchStr = String(originalMidiPitch);

                        // <<< Log the lookup attempt >>>
                        const pushLookupResult = pushMidiToButtonId[midiPitchStr];
                        const pullLookupResult = pullMidiToButtonId[midiPitchStr];
                        // console.log(`Lookup MIDI: ${midiPitchStr}, Push Result: ${pushLookupResult}, Pull Result: ${pullLookupResult}`); // Optional: Very verbose log

                        if (pushLookupResult !== undefined) {
                            chosenButtonId = pushLookupResult;
                            chosenDirection = 'push';
                        } else if (pullLookupResult !== undefined) {
                            chosenButtonId = pullLookupResult;
                            chosenDirection = 'pull';
                        } else if (substituteUnplayable) {
                            // ... (substitution logic - unchanged) ...
                            isSubstituted = true;
                            let minDiff = Infinity;
                            let closestMidi = null;
                            for (const playableMidi of sortedPlayableMidiNotes) {
                                const diff = Math.abs(originalMidiPitch - playableMidi);
                                if (diff < minDiff) {
                                    minDiff = diff; closestMidi = playableMidi;
                                } else if (diff === minDiff) {
                                    if (playableMidi < closestMidi) closestMidi = playableMidi;
                                }
                            }
                            if (closestMidi !== null) {
                                finalMidiPitch = closestMidi;
                                const finalMidiPitchStr = String(finalMidiPitch);
                                const subPushResult = pushMidiToButtonId[finalMidiPitchStr]; // <<< Check substitution lookup
                                const subPullResult = pullMidiToButtonId[finalMidiPitchStr]; // <<< Check substitution lookup
                                if (subPushResult !== undefined) {
                                    chosenButtonId = subPushResult; chosenDirection = 'push';
                                } else if (subPullResult !== undefined) {
                                    chosenButtonId = subPullResult; chosenDirection = 'pull';
                                } else { chosenButtonId = undefined; } // Should not happen
                            } else { chosenButtonId = undefined; }
                        }

                        if (chosenButtonId !== undefined) {
                            const startTimeSec = startTimeStamp * quarterNoteDurationSeconds;
                            const durationSec = duration * quarterNoteDurationSeconds;
                            notesForPlayback.push({
                                startTimeSeconds: startTimeSec,
                                durationSeconds: durationSec,
                                buttonId: chosenButtonId,
                                direction: chosenDirection,
                                midiNote: finalMidiPitch,
                                originalMidiNote: originalMidiPitch,
                                isSubstituted: isSubstituted,
                                measureNumber: measureNumber,
                                osmdNote: note // Keep reference if needed, but avoid stringifying it
                            });
                            calculatedEndTime1x = Math.max(calculatedEndTime1x, startTimeSec + durationSec);
                        }
                    }
                });
            });
            cursor.next();
        }

        osmd.cursor.hide();
        console.log(`Parsing complete. Found ${notesForPlayback.length} notes (${substituteUnplayable ? 'incl. substitutions' : 'strict mapping'}). Estimated duration @ 1x: ${calculatedEndTime1x.toFixed(2)}s`);

    } catch (error) {
        console.error("Error during score parsing:", error);
        if(statusDiv) statusDiv.textContent = "Error parsing score data.";
        return { notes: [], duration: 0, measures: 0 };
    }

    notesForPlayback.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    return {
        notes: notesForPlayback,
        duration: calculatedEndTime1x,
        measures: calculatedMeasures
    };
}


/**
 * Updates the progress indicator display (MM:SS / MM:SS).
 * Runs via requestAnimationFrame during music playback.
 */
function playbackProgressLoop() {
    if (!isPlaying) { progressUpdateId = null; return; }
    const segmentDurationAudio = (currentLoopEndTime1x - currentLoopStartTime1x) / musicPlaybackSpeedFactor;
    let elapsedAudioTime = audioContext.currentTime - playbackStartTime;
    elapsedAudioTime = Math.max(0, Math.min(elapsedAudioTime, segmentDurationAudio));
    updateProgressIndicator(elapsedAudioTime, segmentDurationAudio);
    progressUpdateId = requestAnimationFrame(playbackProgressLoop);
}

/**
 * Stops music playback immediately.
 * Cancels scheduled audio events, visual events, and resets state.
 */
function stopPlayback() {
    if (!isPlaying && visualTimeoutIds.length === 0 && activePlaybackNotes.size === 0) { console.log("stopPlayback called but already stopped."); return; }
    console.log("Stopping MusicXML playback...");
    isPlaying = false;
    if (progressUpdateId) { cancelAnimationFrame(progressUpdateId); progressUpdateId = null; }
    visualTimeoutIds.forEach(clearTimeout); visualTimeoutIds = [];
    console.log(`Stopping playback. Active playback notes before stop: ${activePlaybackNotes.size}`);
    const now = audioContext.currentTime;
    if (activePlaybackNotes.size > 0) {
        activePlaybackNotes.forEach((noteInfo, key) => {
            if (!noteInfo?.source || !noteInfo?.gainNode?.gain) return;
            try {
                noteInfo.gainNode.disconnect();
                noteInfo.gainNode.gain.cancelScheduledValues(now);
                noteInfo.gainNode.gain.setValueAtTime(0.0001, now);
                noteInfo.source.onended = null;
                noteInfo.source.stop(now);
            } catch(e) { console.error(`Error stopping node ${key}:`, e); }
        });
        activePlaybackNotes.clear();
        console.log(`Active playback notes after clear: ${activePlaybackNotes.size}`);
    } else { console.log("No active playback notes found to stop."); }
    buttons.forEach(btn => releaseButtonVisually(btn.dataset.buttonId));
    if (customHighlight) customHighlight.style.display = 'none';
    if (osmd?.cursor) { try { osmd.cursor.hide(); } catch(e) {} }
    if(playBtn) playBtn.disabled = !isScoreLoaded || scoreNotes.length === 0;
    if(playSubBtn) playSubBtn.disabled = !isScoreLoaded || allParsedNotes.length === 0;
    if (stopBtn && !isRecordingPlayback) stopBtn.disabled = true;
    if(statusDiv) statusDiv.textContent = "Music playback stopped.";
    if (progressDisplayElement) {
        const totalDurationAudio = parsedLastNoteEndTime1x / musicPlaybackSpeedFactor;
        updateProgressIndicator(0, totalDurationAudio);
    }
    console.log("stopPlayback finished.");
}

/**
 * Starts music playback based on parsed score data.
 * @param {boolean} substitute - Whether to play notes including substitutions.
 * @param {number | null} [loopStartMeasure=null] - The starting measure for looping (null for no loop or use UI).
 * @param {number | null} [loopEndMeasure=null] - The ending measure for looping (null for no loop or use UI).
 */
function startPlayback(substitute, loopStartMeasure = null, loopEndMeasure = null) {
    console.log(`Play button clicked (Substitute=${substitute}, Loop: ${loopStartMeasure}-${loopEndMeasure})`);

    // --- Checks ---
    if (!osmdContainer) console.error("Cannot start playback: osmdContainer missing!");
    if (!customHighlight) console.warn("Custom highlight element not found, playback will continue without it.");
    if (!isScoreLoaded) { console.warn("No score loaded."); if(statusDiv) statusDiv.textContent = "Load a score first."; return; }
    if (!audioContext || audioContext.state !== 'running') { console.warn("AudioContext not ready."); if(statusDiv) statusDiv.textContent = "Audio not ready. Click Play again after interacting."; return; }
    if (!osmd?.Sheet || !osmd?.cursor) { console.error("OSMD not ready."); if(statusDiv) statusDiv.textContent = "Error: Sheet music display not ready."; return; }
    if (totalMeasures === 0) { console.error("Cannot play: No measures found in score."); if(statusDiv) statusDiv.textContent = "Error: Could not parse score measures."; return; }

    // --- Determine Loop Boundaries ---
    let actualStartMeasure = 1;
    let actualEndMeasure = totalMeasures;
    let isLooping = loopCheckbox && loopCheckbox.checked;
    let explicitLoopArgs = loopStartMeasure !== null && loopEndMeasure !== null;

    if (isLooping && !explicitLoopArgs && loopStartMeasureInput && loopEndMeasureInput) {
        const inputStart = parseInt(loopStartMeasureInput.value, 10);
        const inputEnd = parseInt(loopEndMeasureInput.value, 10);
        if (!isNaN(inputStart) && !isNaN(inputEnd) && inputStart >= 1 && inputStart <= totalMeasures && inputEnd >= inputStart && inputEnd <= totalMeasures) {
            actualStartMeasure = inputStart; actualEndMeasure = inputEnd;
            console.log(`Looping measures ${actualStartMeasure} to ${actualEndMeasure} from UI.`);
        } else {
            console.warn("Invalid loop measures in UI, looping entire piece instead.");
            isLooping = true; actualStartMeasure = 1; actualEndMeasure = totalMeasures;
            loopStartMeasureInput.value = actualStartMeasure; loopEndMeasureInput.value = actualEndMeasure;
        }
    } else if (explicitLoopArgs) {
        actualStartMeasure = loopStartMeasure; actualEndMeasure = loopEndMeasure; isLooping = true;
        console.log(`Restarting loop for measures ${actualStartMeasure} to ${actualEndMeasure}`);
    } else {
        isLooping = false; actualStartMeasure = 1; actualEndMeasure = totalMeasures;
    }

    // --- Filter Notes ---
    const notesToPlaySource = substitute ? allParsedNotes : scoreNotes;
    const notesInLoop = notesToPlaySource.filter(note =>
    note.measureNumber >= actualStartMeasure && note.measureNumber <= actualEndMeasure);

    // <<< Log filtered note count >>>
    console.log(`Filtered notes for measures ${actualStartMeasure}-${actualEndMeasure}: ${notesInLoop.length}`);

    if (notesInLoop.length === 0) {
        const modeText = substitute ? ' (with substitutions)' : ' (strict mapping)';
        console.warn(`No notes found in measure range ${actualStartMeasure}-${actualEndMeasure} for ${currentToneName}${modeText}.`);
        if(statusDiv) statusDiv.textContent = `No notes in measures ${actualStartMeasure}-${actualEndMeasure}.`;
        if(playBtn) playBtn.disabled = !isScoreLoaded || scoreNotes.length === 0;
        if(playSubBtn) playSubBtn.disabled = !isScoreLoaded || allParsedNotes.length === 0;
        if(stopBtn && !isRecordingPlayback) stopBtn.disabled = true;
        updateProgressIndicator(0, parsedLastNoteEndTime1x / musicPlaybackSpeedFactor);
        return;
    }
    console.log(`Playing ${notesInLoop.length} notes from measures ${actualStartMeasure}-${actualEndMeasure}.`);

    // --- Determine Time Range ---
    currentLoopStartTime1x = notesInLoop[0].startTimeSeconds;
    if (isLooping) {
        const firstNoteAfterLoop = allParsedNotes.filter(note => note.measureNumber > actualEndMeasure).sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)[0];
        currentLoopEndTime1x = firstNoteAfterLoop ? firstNoteAfterLoop.startTimeSeconds : parsedLastNoteEndTime1x;
        currentLoopEndTime1x = Math.max(currentLoopEndTime1x, currentLoopStartTime1x);
        if (currentLoopEndTime1x <= currentLoopStartTime1x && notesInLoop.length > 0) {
            const lastNoteInLoop = notesInLoop[notesInLoop.length - 1];
            currentLoopEndTime1x = lastNoteInLoop.startTimeSeconds + lastNoteInLoop.durationSeconds;
            console.warn(`Loop end time calc issue, using end of last note in loop: ${currentLoopEndTime1x.toFixed(3)}s`);
        }
        if (currentLoopEndTime1x <= currentLoopStartTime1x) {
            console.error("Critical loop end time error. Using full duration.");
            currentLoopEndTime1x = parsedLastNoteEndTime1x;
        }
    } else {
        currentLoopStartTime1x = 0; currentLoopEndTime1x = parsedLastNoteEndTime1x;
    }
    console.log(`Segment Time Range (1x): ${currentLoopStartTime1x.toFixed(3)}s - ${currentLoopEndTime1x.toFixed(3)}s`);

    // --- Stop Existing Playback & Reset State ---
    if (isPlaying) stopPlayback();
    if (isRecordingPlayback) stopRecordingPlayback();
    Object.keys(activeManualSources).forEach(id => stopManualSound(id, true));
    buttons.forEach(handleRelease);
    activeManualSources = {}; activeTouches.clear(); isPointerDown = false;

    // --- Start New Playback ---
    playbackStartTime = audioContext.currentTime - (currentLoopStartTime1x / musicPlaybackSpeedFactor);
    console.log(`Starting music playback sequence (Speed: ${musicPlaybackSpeedFactor.toFixed(2)}x, Substitute: ${substitute}, Loop: ${isLooping ? `${actualStartMeasure}-${actualEndMeasure}` : 'Off'})...`);
    isPlaying = true;
    if(playBtn) playBtn.disabled = true; if(playSubBtn) playSubBtn.disabled = true; if(stopBtn) stopBtn.disabled = false;
    if(statusDiv) statusDiv.textContent = isLooping ? `Looping Music ${actualStartMeasure}-${actualEndMeasure}...` : "Playing Music...";
    visualTimeoutIds = []; activePlaybackNotes.clear();
    try { osmd.cursor.reset(); osmd.cursor.hide(); } catch (e) {}

    let lastNoteAudioEndTime = playbackStartTime;

    // --- Schedule Audio and Visual Events ---
    console.log(`Scheduling ${notesInLoop.length} notes...`);
    notesInLoop.forEach((noteInfo, index) => {
        if (!noteInfo.buttonId || !noteInfo.direction) { console.warn(`Skipping note [${index}] missing data:`, noteInfo); return; }

        console.log(`[Note ${index}] MIDI: ${noteInfo.originalMidiNote} -> Btn: ${noteInfo.buttonId} (${noteInfo.direction}), Start: ${noteInfo.startTimeSeconds.toFixed(3)}s, Dur: ${noteInfo.durationSeconds.toFixed(3)}s, Sub: ${noteInfo.isSubstituted}`); // Detailed log

        const absoluteStartTime = playbackStartTime + (noteInfo.startTimeSeconds / musicPlaybackSpeedFactor);
        const adjustedDurationSeconds = noteInfo.durationSeconds / musicPlaybackSpeedFactor;
        const absoluteEndTime = absoluteStartTime + adjustedDurationSeconds;
        lastNoteAudioEndTime = Math.max(lastNoteAudioEndTime, absoluteEndTime);

        const bufferData = audioBuffers[noteInfo.buttonId];
        const buffer = bufferData?.[noteInfo.direction];

        if (buffer) {
            try { // Schedule audio...
                const gainNode = audioContext.createGain(); gainNode.gain.setValueAtTime(0.6, absoluteStartTime);
                const source = audioContext.createBufferSource(); source.buffer = buffer; source.loop = false;
                source.connect(gainNode); gainNode.connect(audioContext.destination);
                source.start(absoluteStartTime);
                const fadeDuration = 0.05; const rampStartTime = Math.max(absoluteStartTime, absoluteEndTime - fadeDuration);
                gainNode.gain.setValueAtTime(0.6, rampStartTime); gainNode.gain.linearRampToValueAtTime(0.0001, absoluteEndTime);
                source.stop(absoluteEndTime + 0.01);
                const noteKey = `${noteInfo.startTimeSeconds}-${noteInfo.originalMidiNote}-${noteInfo.buttonId}-${absoluteStartTime}`;
                activePlaybackNotes.set(noteKey, { source, gainNode, buttonId: noteInfo.buttonId });
                source.onended = () => { if (activePlaybackNotes.has(noteKey)) { try { gainNode.disconnect(); } catch(e) {} activePlaybackNotes.delete(noteKey); } };
            } catch (e) { console.error(`Error scheduling audio for button ${noteInfo.buttonId}:`, e); }
        } else { console.warn(`Buffer not found for playback: Button ${noteInfo.buttonId} in ${noteInfo.direction} mode`); }

        // Schedule visuals...
        const startDelayMs = Math.max(0, (absoluteStartTime - audioContext.currentTime) * 1000);
        const endDelayMs = Math.max(0, (absoluteEndTime - audioContext.currentTime) * 1000);
        visualTimeoutIds.push(setTimeout(() => pressButtonVisually(noteInfo.buttonId, noteInfo.direction, noteInfo.isSubstituted), startDelayMs));
        visualTimeoutIds.push(setTimeout(() => releaseButtonVisually(noteInfo.buttonId), endDelayMs));
        if (customHighlight) { /* ... highlight scheduling ... */
            visualTimeoutIds.push(setTimeout(() => {
                if (!isPlaying || !osmd || !osmd.cursor) return;
                try {
                    const cursorImg = document.getElementById('cursorImg-0');
                    if (cursorImg && cursorImg.style.display !== 'none') {
                        const topPos = cursorImg.style.top; const leftPos = cursorImg.style.left;
                        if (topPos && leftPos) {
                            customHighlight.style.top = topPos; const highlightWidth = 10;
                            customHighlight.style.left = `${parseFloat(leftPos) - (highlightWidth / 2)}px`;
                            customHighlight.style.height = cursorImg.style.height || '50px';
                            customHighlight.style.display = 'block';
                        } else { customHighlight.style.display = 'none'; }
                    } else { customHighlight.style.display = 'none'; }
                    if (!osmd.cursor.Iterator.EndReached) osmd.cursor.next();
                } catch (e) { console.error("Error positioning highlight:", e); customHighlight.style.display = 'none'; }
            }, startDelayMs));
            visualTimeoutIds.push(setTimeout(() => { if (customHighlight) customHighlight.style.display = 'none'; }, endDelayMs + 50));
        }
    }); // End notesInLoop.forEach

    // --- Start Progress Updates & Schedule Loop/End ---
    const initialSegmentDurationAudio = (currentLoopEndTime1x - currentLoopStartTime1x) / musicPlaybackSpeedFactor;
    updateProgressIndicator(0, initialSegmentDurationAudio);
    if (progressUpdateId) cancelAnimationFrame(progressUpdateId);
    progressUpdateId = requestAnimationFrame(playbackProgressLoop);

    if (notesInLoop.length > 0) {
        if (isLooping) { // Schedule loop restart...
            const loopDurationAudioSeconds = (currentLoopEndTime1x - currentLoopStartTime1x) / musicPlaybackSpeedFactor;
            const loopRestartDelayMs = Math.max(10, loopDurationAudioSeconds * 1000);
            console.log(`Scheduling music loop restart in ${loopRestartDelayMs.toFixed(0)}ms`);
            visualTimeoutIds.push(setTimeout(() => {
                const loopStillEnabled = loopCheckbox && loopCheckbox.checked;
                if (isPlaying && isLooping && loopStillEnabled) {
                    startPlayback(substitute, actualStartMeasure, actualEndMeasure);
                } else if (isPlaying) { stopPlayback(); }
            }, loopRestartDelayMs));
        } else { // Schedule natural stop...
            const naturalEndDelayMs = Math.max(0, (lastNoteAudioEndTime - audioContext.currentTime) * 1000) + 100;
            console.log(`Scheduling natural music stop in ${naturalEndDelayMs.toFixed(0)}ms`);
            visualTimeoutIds.push(setTimeout(() => { if (isPlaying && !isLooping) stopPlayback(); }, naturalEndDelayMs));
        }
    } else { stopPlayback(); }
}


// --- MusicXML File Input Listener ---
document.addEventListener('DOMContentLoaded', () => {
    if (fileInput && statusDiv && playBtn && playSubBtn && stopBtn && osmdContainer && progressDisplayElement && typeof parseScoreData === 'function') {
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file || !osmd) return;
            currentScoreTitle = file.name; statusDiv.textContent = `Loading ${currentScoreTitle}...`;
            playBtn.disabled = true; playSubBtn.disabled = true; stopBtn.disabled = true;
            isScoreLoaded = false; scoreNotes = []; allParsedNotes = [];
            parsedLastNoteEndTime1x = 0; totalMeasures = 0;
            progressDisplayElement.textContent = '--:-- / --:--';
            if(loopStartMeasureInput) loopStartMeasureInput.value = 1;
            if(loopEndMeasureInput) { loopEndMeasureInput.value = 1; loopEndMeasureInput.max = 1; }
            const reader = new FileReader();
            reader.onload = async (e) => {
                const fileContent = e.target.result;
                try {
                    statusDiv.textContent = `Rendering ${currentScoreTitle}...`;
                    while (osmdContainer.firstChild && osmdContainer.firstChild !== customHighlight) { osmdContainer.removeChild(osmdContainer.firstChild); }
                    if (customHighlight && !osmdContainer.contains(customHighlight)) { osmdContainer.appendChild(customHighlight); }
                    await osmd.load(fileContent); osmd.render();
                    statusDiv.textContent = `Loaded: ${currentScoreTitle}. Parsing...`; console.log("MusicXML loaded and rendered.");
                    if (!osmd.cursor) { console.error("OSMD cursor error."); statusDiv.textContent = "Error: Cursor init failed."; return; }
                    osmd.cursor.hide(); isScoreLoaded = true;

                    // Parse score data and update globals
                    const strictParseResult = parseScoreData(osmd, activeNoteMapping, false);
                    const subParseResult = parseScoreData(osmd, activeNoteMapping, true);
                    scoreNotes = strictParseResult.notes;
                    allParsedNotes = subParseResult.notes;
                    parsedLastNoteEndTime1x = strictParseResult.duration;
                    totalMeasures = strictParseResult.measures;
                    tempo = osmd.Sheet.SheetPlaybackSetting?.tempo || (osmd.Sheet.HasBPMInfos && osmd.Sheet.BPMInfos.length > 0 ? osmd.Sheet.BPMInfos[0].Tempo : 120);

                    const canPlayStrict = scoreNotes.length > 0; const canPlaySub = allParsedNotes.length > 0;
                    playBtn.disabled = !canPlayStrict; playSubBtn.disabled = !canPlaySub;
                    const maxMeasure = totalMeasures > 0 ? totalMeasures : 1;
                    if(loopEndMeasureInput) { loopEndMeasureInput.max = maxMeasure; loopEndMeasureInput.value = maxMeasure; }
                    if(loopStartMeasureInput) { loopStartMeasureInput.max = maxMeasure; }
                    const totalDurationAudio = parsedLastNoteEndTime1x / musicPlaybackSpeedFactor;
                    updateProgressIndicator(0, totalDurationAudio);
                    console.log(`Parsed ${scoreNotes.length} strict notes, ${allParsedNotes.length} total notes for ${currentToneName}. Total Measures: ${totalMeasures}`);
                    let newStatus = `Ready (${currentToneName}): ${currentScoreTitle}`;
                    if (!canPlayStrict && canPlaySub) newStatus = `Ready (${currentToneName}, subs only): ${currentScoreTitle}`;
                    else if (!canPlayStrict && !canPlaySub) newStatus = `No playable notes found in ${currentScoreTitle} for ${currentToneName} mapping.`;
                    statusDiv.textContent = newStatus;
                } catch (error) { /* ... error handling ... */
                    console.error("Error loading/parsing MusicXML:", error); statusDiv.textContent = `Error: ${error.message}`;
                    playBtn.disabled = true; playSubBtn.disabled = true; stopBtn.disabled = true;
                    isScoreLoaded = false; scoreNotes = []; allParsedNotes = []; currentScoreTitle = "";
                } finally { fileInput.value = ''; }
            };
            reader.onerror = (e) => { /* ... error handling ... */
                console.error("Error reading file:", reader.error); statusDiv.textContent = "Error reading file.";
                playBtn.disabled = true; playSubBtn.disabled = true; stopBtn.disabled = true;
                isScoreLoaded = false; scoreNotes = []; allParsedNotes = []; currentScoreTitle = "";
                fileInput.value = '';
            };
            if (file.name.endsWith('.mxl')) { /* ... handle .mxl ... */
                alert(".mxl files not supported. Use .xml or .musicxml."); statusDiv.textContent = "Ready"; currentScoreTitle = ""; fileInput.value = '';
            } else { reader.readAsText(file); }
        });
    }
    // --- Playback Control Button Listeners ---
    if (playBtn) playBtn.addEventListener('click', () => startPlayback(false));
    if (playSubBtn) playSubBtn.addEventListener('click', () => startPlayback(true));
    if (stopBtn) stopBtn.addEventListener('click', () => { if (isPlaying) stopPlayback(); if (isRecordingPlayback) stopRecordingPlayback(); });
});
