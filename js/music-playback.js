// music-playback.js - MusicXML parsing and playback

function parseScoreData(osmdInstance, noteMapping, substituteUnplayable = false) {
    console.log(`Parsing score data for tone: ${currentToneName} (Substitute=${substituteUnplayable})`);
    
    const notesForPlayback = [];
    parsedLastNoteEndTime1x = 0;
    totalMeasures = 0;
    
    if (!osmdInstance || !osmdInstance.Sheet || !osmdInstance.cursor) {
        console.error("OSMD Sheet data or cursor not available for parsing.");
        return notesForPlayback;
    }
    
    if (!noteMapping) {
        console.error("No note mapping provided to parseScoreData.");
        return notesForPlayback;
    }
    
    const pushMidiToButtonId = {};
    const pullMidiToButtonId = {};
    const allPlayableMidiNotes = new Set();
    
    for (const [buttonId, notes] of Object.entries(noteMapping)) {
        if (notes.push !== null && notes.push !== undefined) {
            allPlayableMidiNotes.add(notes.push);
            if (!pushMidiToButtonId[notes.push]) {
                pushMidiToButtonId[notes.push] = buttonId;
            }
        }
        
        if (notes.pull !== null && notes.pull !== undefined) {
            allPlayableMidiNotes.add(notes.pull);
            if (!pullMidiToButtonId[notes.pull]) {
                pullMidiToButtonId[notes.pull] = buttonId;
            }
        }
    }
    
    const sortedPlayableMidiNotes = Array.from(allPlayableMidiNotes).sort((a, b) => a - b);
    
    try {
        let currentBpm = 120;
        
        if (osmdInstance.Sheet.SheetPlaybackSetting?.tempo) {
            currentBpm = osmdInstance.Sheet.SheetPlaybackSetting.tempo;
        } else if (osmdInstance.Sheet.HasBPMInfos && osmdInstance.Sheet.BPMInfos.length > 0) {
            currentBpm = osmdInstance.Sheet.BPMInfos[0].Tempo;
        }
        
        tempo = currentBpm;
        console.log("Tempo determined:", tempo, "BPM");
        
        const quarterNoteDurationSeconds = 60.0 / tempo;
        totalMeasures = osmdInstance.Sheet.SourceMeasures.length;
        console.log("Total Measures:", totalMeasures);
        
        if(loopEndMeasureInput) loopEndMeasureInput.max = totalMeasures;
        
        const cursor = osmdInstance.cursor;
        cursor.reset();
        
        let lastNoteEndTime = 0;
        
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
                            console.warn("Could not get valid note.Pitch.halfTone at timestamp:", startTimeStamp);
                            return;
                        }
                        
                        let chosenButtonId = undefined;
                        let chosenDirection = undefined;
                        let finalMidiPitch = originalMidiPitch;
                        let isSubstituted = false;
                        
                        const midiPitchStr = String(originalMidiPitch);
                        
                        if (pushMidiToButtonId[midiPitchStr] !== undefined) {
                            chosenButtonId = pushMidiToButtonId[midiPitchStr];
                            chosenDirection = 'push';
                        } else if (pullMidiToButtonId[midiPitchStr] !== undefined) {
                            chosenButtonId = pullMidiToButtonId[midiPitchStr];
                            chosenDirection = 'pull';
                        }
                        
                        if (chosenButtonId === undefined && substituteUnplayable) {
                            isSubstituted = true;
                            let minDiff = Infinity;
                            let closestMidi = null;
                            
                            for (const playableMidi of sortedPlayableMidiNotes) {
                                const diff = Math.abs(originalMidiPitch - playableMidi);
                                
                                if (diff < minDiff) {
                                    minDiff = diff;
                                    closestMidi = playableMidi;
                                } else if (diff === minDiff) {
                                    if (playableMidi < closestMidi) {
                                        closestMidi = playableMidi;
                                    }
                                }
                            }
                            
                            if (closestMidi !== null) {
                                finalMidiPitch = closestMidi;
                                const finalMidiPitchStr = String(finalMidiPitch);
                                
                                if (pushMidiToButtonId[finalMidiPitchStr] !== undefined) {
                                    chosenButtonId = pushMidiToButtonId[finalMidiPitchStr];
                                    chosenDirection = 'push';
                                } else if (pullMidiToButtonId[finalMidiPitchStr] !== undefined) {
                                    chosenButtonId = pullMidiToButtonId[finalMidiPitchStr];
                                    chosenDirection = 'pull';
                                }
                            } else {
                                console.warn(`Could not find any substitute for MIDI ${originalMidiPitch}`);
                                chosenButtonId = undefined;
                            }
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
                                osmdNote: note
                            });
                            
                            lastNoteEndTime = Math.max(lastNoteEndTime, startTimeSec + durationSec);
                        }
                    }
                });
            });
            
            cursor.next();
        }
        
        osmd.cursor.hide();
        parsedLastNoteEndTime1x = lastNoteEndTime;
        console.log(`Parsing complete. Found ${notesForPlayback.length} notes (${substituteUnplayable ? 'incl. substitutions' : 'strict mapping'}). Estimated duration @ 1x: ${parsedLastNoteEndTime1x.toFixed(2)}s`);
        
    } catch (error) {
        console.error("Error during score parsing:", error);
        statusDiv.textContent = "Error parsing score data.";
        return [];
    }
    
    notesForPlayback.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    return notesForPlayback;
}

function playbackProgressLoop() {
    if (!isPlaying) {
        progressUpdateId = null;
        return;
    }
    
    const segmentDurationAudio = (currentLoopEndTime1x - currentLoopStartTime1x) / playbackSpeedFactor;
    let elapsedAudioTime = audioContext.currentTime - playbackStartTime;
    elapsedAudioTime = Math.max(0, Math.min(elapsedAudioTime, segmentDurationAudio));
    
    updateProgressIndicator(elapsedAudioTime, segmentDurationAudio);
    progressUpdateId = requestAnimationFrame(playbackProgressLoop);
}

function stopPlayback() {
    if (!isPlaying && visualTimeoutIds.length === 0 && activePlaybackNotes.size === 0) {
        console.log("stopPlayback called but already stopped or nothing active.");
        return;
    }
    
    console.log("Stopping MusicXML playback...");
    isPlaying = false;
    
    if (progressUpdateId) {
        cancelAnimationFrame(progressUpdateId);
        progressUpdateId = null;
    }
    
    visualTimeoutIds.forEach(clearTimeout);
    visualTimeoutIds = [];
    
    console.log(`Stopping playback. Active playback notes before stop: ${activePlaybackNotes.size}`);
    const now = audioContext.currentTime;
    
    if (activePlaybackNotes.size > 0) {
        activePlaybackNotes.forEach((noteInfo, key) => {
            if (!noteInfo || !noteInfo.source || !noteInfo.gainNode || !noteInfo.gainNode.gain) {
                console.warn(`Skipping invalid noteInfo for key ${key} during stop.`);
                return;
            }
            
            try {
                noteInfo.gainNode.disconnect();
                noteInfo.gainNode.gain.cancelScheduledValues(now);
                noteInfo.gainNode.gain.setValueAtTime(0.0001, now);
                noteInfo.source.onended = null;
                noteInfo.source.stop(now);
            } catch(e) {
                console.error(`Error stopping/disconnecting playback node for key ${key}:`, e);
            }
        });
        
        activePlaybackNotes.clear();
        console.log(`Active playback notes after clear: ${activePlaybackNotes.size}`);
    } else {
        console.log("No active playback notes found to stop.");
    }
    
    buttons.forEach(btn => releaseButtonVisually(btn.dataset.buttonId));
    
    if (customHighlight) {
        customHighlight.style.display = 'none';
    }
    
    if (osmd && osmd.cursor) {
        try {
            osmd.cursor.hide();
        } catch(e) {
            console.warn("Error hiding cursor on stop:", e);
        }
    }
    
    playBtn.disabled = !isScoreLoaded || scoreNotes.length === 0;
    playSubBtn.disabled = !isScoreLoaded || allParsedNotes.length === 0;
    
    if (!isRecordingPlayback) {
        stopBtn.disabled = true;
    }
    
    statusDiv.textContent = "Music playback stopped.";
    
    if (progressDisplayElement) {
        const totalDurationAudio = parsedLastNoteEndTime1x / playbackSpeedFactor;
        updateProgressIndicator(0, totalDurationAudio);
    }
    
    console.log("stopPlayback finished.");
}

function startPlayback(substitute, loopStartMeasure = null, loopEndMeasure = null) {
    console.log(`Play button clicked (Substitute=${substitute}, Loop: ${loopStartMeasure}-${loopEndMeasure})`);
    
    if (!osmdContainer || !customHighlight) {
        console.error("Cannot start playback: crucial elements missing!");
        return;
    }
    
    if (!isScoreLoaded) {
        console.warn("No score loaded.");
        return;
    }
    
    if (!audioContext || audioContext.state !== 'running') {
        console.warn("AudioContext not ready.");
        resumeAudioContext();
        statusDiv.textContent = "Audio not ready. Click Play again.";
        return;
    }
    
    if (!osmd || !osmd.Sheet || !osmd.cursor) {
        console.error("OSMD not ready.");
        statusDiv.textContent = "Error: Sheet music display not ready.";
        return;
    }
    
    allParsedNotes = parseScoreData(osmd, activeNoteMapping, true);
    scoreNotes = parseScoreData(osmd, activeNoteMapping, false);
    
    if (totalMeasures === 0) {
        console.error("Score parsing failed or returned no measures.");
        statusDiv.textContent = "Error: Could not parse score measures.";
        return;
    }
    
    let actualStartMeasure = 1;
    let actualEndMeasure = totalMeasures;
    let isLooping = loopCheckbox && loopCheckbox.checked;
    let explicitLoopArgs = loopStartMeasure !== null && loopEndMeasure !== null;
    
    if (isLooping && !explicitLoopArgs) {
        const inputStart = parseInt(loopStartMeasureInput.value, 10);
        const inputEnd = parseInt(loopEndMeasureInput.value, 10);
        
        if (!isNaN(inputStart) && !isNaN(inputEnd) && 
            inputStart >= 1 && inputStart <= totalMeasures && 
            inputEnd >= inputStart && inputEnd <= totalMeasures) {
            actualStartMeasure = inputStart;
            actualEndMeasure = inputEnd;
            console.log(`Looping measures ${actualStartMeasure} to ${actualEndMeasure}`);
        } else {
            console.warn("Invalid loop measures provided, looping entire piece instead.");
            isLooping = true;
            actualStartMeasure = 1;
            actualEndMeasure = totalMeasures;
            if(loopStartMeasureInput) loopStartMeasureInput.value = actualStartMeasure;
            if(loopEndMeasureInput) loopEndMeasureInput.value = actualEndMeasure;
        }
    } else if (explicitLoopArgs) {
        actualStartMeasure = loopStartMeasure;
        actualEndMeasure = loopEndMeasure;
        isLooping = true;
        console.log(`Restarting loop for measures ${actualStartMeasure} to ${actualEndMeasure}`);
    } else {
        isLooping = false;
        actualStartMeasure = 1;
        actualEndMeasure = totalMeasures;
    }
    
    const notesToPlay = substitute ? allParsedNotes : scoreNotes;
    const notesInLoop = notesToPlay.filter(note => 
        note.measureNumber >= actualStartMeasure && note.measureNumber <= actualEndMeasure);
    
    if (notesInLoop.length === 0) {
        const modeText = substitute ? ' (with substitutions)' : ' (strict mapping)';
        console.warn(`No notes found in measure range ${actualStartMeasure}-${actualEndMeasure} for ${currentToneName}${modeText}.`);
        statusDiv.textContent = `No notes in measures ${actualStartMeasure}-${actualEndMeasure}.`;
        playBtn.disabled = !isScoreLoaded || scoreNotes.length === 0;
        playSubBtn.disabled = !isScoreLoaded || allParsedNotes.length === 0;
        stopBtn.disabled = true;
        updateProgressIndicator(0, parsedLastNoteEndTime1x / playbackSpeedFactor);
        return;
    }
    
    console.log(`Playing ${notesInLoop.length} notes from measures ${actualStartMeasure}-${actualEndMeasure}.`);
    
    currentLoopStartTime1x = notesInLoop[0].startTimeSeconds;
    
    if (isLooping) {
        const firstNoteAfterLoop = allParsedNotes.filter(note => 
            note.measureNumber > actualEndMeasure)
            .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)[0];
            
        if (firstNoteAfterLoop) {
            currentLoopEndTime1x = firstNoteAfterLoop.startTimeSeconds;
        } else {
            currentLoopEndTime1x = parsedLastNoteEndTime1x;
        }
        
        currentLoopEndTime1x = Math.max(currentLoopEndTime1x, currentLoopStartTime1x);
        
        if (currentLoopEndTime1x <= currentLoopStartTime1x) {
            console.warn("Could not determine precise loop end time, using full piece end time.");
            currentLoopEndTime1x = parsedLastNoteEndTime1x;
        }
    } else {
        currentLoopStartTime1x = 0;
        currentLoopEndTime1x = parsedLastNoteEndTime1x;
    }
    
    console.log(`Segment Time Range (1x): ${currentLoopStartTime1x.toFixed(3)}s - ${currentLoopEndTime1x.toFixed(3)}s`);
    
    if (isPlaying) {
        console.log("Stopping previous music playback for restart/loop.");
        stopPlayback();
    }
    
    if (isRecordingPlayback) {
        console.log("Stopping recording playback before starting music playback.");
        stopRecordingPlayback();
    }
    
    Object.keys(activeManualSources).forEach(id => stopManualSound(id, true));
    buttons.forEach(handleRelease);
    activeManualSources = {};
    activeTouches.clear();
    isPointerDown = false;
    
    playbackStartTime = audioContext.currentTime - (currentLoopStartTime1x / playbackSpeedFactor);
    
    console.log(`Starting music playback sequence (Speed: ${playbackSpeedFactor.toFixed(2)}x, Substitute: ${substitute}, Loop: ${isLooping ? `${actualStartMeasure}-${actualEndMeasure}` : 'Off'})...`);
    
    isPlaying = true;
    playBtn.disabled = true;
    playSubBtn.disabled = true;
    stopBtn.disabled = false;
    
    statusDiv.textContent = isLooping ? 
        `Looping Music ${actualStartMeasure}-${actualEndMeasure}...` : 
        "Playing Music...";
    
    visualTimeoutIds = [];
    activePlaybackNotes.clear();
    
    try {
        osmd.cursor.reset();
        osmd.cursor.hide();
    } catch (e) {
        console.error("Error resetting/hiding OSMD cursor:", e);
    }
    
    let lastNoteAudioEndTime = playbackStartTime;
    
    notesInLoop.forEach((noteInfo) => {
        if (!noteInfo.buttonId || !noteInfo.direction) {
            return;
        }
        
        const absoluteStartTime = playbackStartTime + (noteInfo.startTimeSeconds / playbackSpeedFactor);
        const adjustedDurationSeconds = noteInfo.durationSeconds / playbackSpeedFactor;
        const absoluteEndTime = absoluteStartTime + adjustedDurationSeconds;
        
        lastNoteAudioEndTime = Math.max(lastNoteAudioEndTime, absoluteEndTime);
        
        const bufferData = audioBuffers[noteInfo.buttonId];
        const buffer = bufferData?.[noteInfo.direction];
        
        if (buffer) {
            try {
                const gainNode = audioContext.createGain();
                gainNode.gain.setValueAtTime(0.6, absoluteStartTime);
                
                const source = audioContext.createBufferSource();
                source.buffer = buffer;
                source.loop = false;
                source.connect(gainNode);
                gainNode.connect(audioContext.destination);
                source.start(absoluteStartTime);
                
                const fadeDuration = 0.05;
                const rampStartTime = Math.max(absoluteStartTime, absoluteEndTime - fadeDuration);
                
                gainNode.gain.setValueAtTime(0.6, rampStartTime);
                gainNode.gain.linearRampToValueAtTime(0.0001, absoluteEndTime);
                source.stop(absoluteEndTime + 0.01);
                
                const noteKey = `${noteInfo.startTimeSeconds}-${noteInfo.originalMidiNote}-${noteInfo.buttonId}-${absoluteStartTime}`;
                activePlaybackNotes.set(noteKey, { source, gainNode, buttonId: noteInfo.buttonId });
                
                source.onended = () => {
                    if (activePlaybackNotes.has(noteKey)) {
                        try { gainNode.disconnect(); } catch(e) {}
                        activePlaybackNotes.delete(noteKey);
                    }
                };
            } catch (e) {
                console.error(`Error scheduling audio for button ${noteInfo.buttonId}:`, e);
            }
        } else {
            console.warn(`Buffer not found for playback: Button ${noteInfo.buttonId} in ${noteInfo.direction} mode`);
        }
        
        const startDelayMs = Math.max(0, (absoluteStartTime - audioContext.currentTime) * 1000);
        const endDelayMs = Math.max(0, (absoluteEndTime - audioContext.currentTime) * 1000);
        
        visualTimeoutIds.push(setTimeout(() => 
            pressButtonVisually(noteInfo.buttonId, noteInfo.direction, noteInfo.isSubstituted), 
            startDelayMs));
            
        visualTimeoutIds.push(setTimeout(() => 
            releaseButtonVisually(noteInfo.buttonId), 
            endDelayMs));
            
        visualTimeoutIds.push(setTimeout(() => {
            if (!isPlaying || !osmd || !osmd.cursor || !customHighlight) return;
            
            try {
                const cursorImg = document.getElementById('cursorImg-0');
                if (cursorImg && cursorImg.style.display !== 'none') {
                    const topPos = cursorImg.style.top;
                    const leftPos = cursorImg.style.left;
                    
                    if (topPos && leftPos) {
                        customHighlight.style.top = topPos;
                        const highlightWidth = 10;
                        customHighlight.style.left = `${parseFloat(leftPos) - (highlightWidth / 2)}px`;
                        customHighlight.style.height = cursorImg.style.height || '50px';
                        customHighlight.style.display = 'block';
                    } else {
                        if (customHighlight) customHighlight.style.display = 'none';
                    }
                } else {
                    if (customHighlight) customHighlight.style.display = 'none';
                }
                
                if (!osmd.cursor.Iterator.EndReached) {
                    osmd.cursor.next();
                }
            } catch (e) {
                console.error("Error positioning custom highlight or advancing cursor:", e);
                if (customHighlight) customHighlight.style.display = 'none';
            }
        }, startDelayMs));
        
        visualTimeoutIds.push(setTimeout(() => {
            if (customHighlight) {
                customHighlight.style.display = 'none';
            }
        }, endDelayMs + 50));
    });
    
    const initialSegmentDurationAudio = (currentLoopEndTime1x - currentLoopStartTime1x) / playbackSpeedFactor;
    updateProgressIndicator(0, initialSegmentDurationAudio);
    
    if (progressUpdateId) cancelAnimationFrame(progressUpdateId);
    progressUpdateId = requestAnimationFrame(playbackProgressLoop);
    
    if (notesInLoop.length > 0) {
        if (isLooping) {
            const loopDurationAudioSeconds = (currentLoopEndTime1x - currentLoopStartTime1x) / playbackSpeedFactor;
            const loopRestartDelayMs = Math.max(10, loopDurationAudioSeconds * 1000);
            
            console.log(`Scheduling music loop restart in ${loopRestartDelayMs.toFixed(0)}ms`);
            
            visualTimeoutIds.push(setTimeout(() => {
                if (isPlaying && isLooping) {
                    console.log("Looping music section (metrical)...");
                    startPlayback(substitute, actualStartMeasure, actualEndMeasure);
                }
            }, loopRestartDelayMs));
        } else {
            const naturalEndDelayMs = Math.max(0, (lastNoteAudioEndTime - audioContext.currentTime) * 1000) + 100;
            
            console.log(`Scheduling natural music stop in ${naturalEndDelayMs.toFixed(0)}ms`);
            
            visualTimeoutIds.push(setTimeout(() => {
                if (isPlaying && !isLooping) {
                    console.log("Music playback finished naturally.");
                    stopPlayback();
                }
            }, naturalEndDelayMs));
        }
    } else {
        stopPlayback();
    }
}

// MusicXML File Input Listener - Add after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (fileInput) {
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file || !osmd) {
                return;
            }
            
            currentScoreTitle = file.name; // Store file name as title
            statusDiv.textContent = `Loading ${currentScoreTitle}...`;
            playBtn.disabled = true;
            playSubBtn.disabled = true;
            stopBtn.disabled = true;
            isScoreLoaded = false;
            scoreNotes = [];
            allParsedNotes = [];
            parsedLastNoteEndTime1x = 0;
            totalMeasures = 0;
            
            if (progressDisplayElement) {
                progressDisplayElement.textContent = '--:-- / --:--';
            }
            
            if(loopStartMeasureInput) loopStartMeasureInput.value = 1;
            if(loopEndMeasureInput) loopEndMeasureInput.value = 1;
            loopEndMeasureInput.max = 1;
            
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                const fileContent = e.target.result;
                
                try {
                    statusDiv.textContent = `Rendering ${currentScoreTitle}...`;
                    
                    while (osmdContainer.firstChild && osmdContainer.firstChild !== customHighlight) {
                        osmdContainer.removeChild(osmdContainer.firstChild);
                    }
                    
                    if (customHighlight && !osmdContainer.contains(customHighlight)) {
                        osmdContainer.appendChild(customHighlight);
                    }
                    
                    await osmd.load(fileContent);
                    osmd.render();
                    statusDiv.textContent = `Loaded: ${currentScoreTitle}. Parsing...`;
                    console.log("MusicXML loaded and rendered.");
                    
                    if (!osmd.cursor) {
                        console.error("OSMD cursor not available after rendering.");
                        statusDiv.textContent = "Error: Cursor initialization failed.";
                        return;
                    }
                    
                    osmd.cursor.hide();
                    isScoreLoaded = true;
                    
                    scoreNotes = parseScoreData(osmd, activeNoteMapping, false);
                    allParsedNotes = parseScoreData(osmd, activeNoteMapping, true);
                    
                    const canPlayStrict = scoreNotes.length > 0;
                    const canPlaySub = allParsedNotes.length > 0;
                    
                    playBtn.disabled = !canPlayStrict;
                    playSubBtn.disabled = !canPlaySub;
                    
                    if(loopEndMeasureInput) {
                        loopEndMeasureInput.max = totalMeasures;
                        loopEndMeasureInput.value = totalMeasures;
                    }
                    
                    if(loopStartMeasureInput) {
                        loopStartMeasureInput.max = totalMeasures;
                    }
                    
                    const totalDurationAudio = parsedLastNoteEndTime1x / playbackSpeedFactor;
                    updateProgressIndicator(0, totalDurationAudio);
                    
                    console.log(`Parsed ${scoreNotes.length} strict notes, ${allParsedNotes.length} total notes for ${currentToneName}. Total Measures: ${totalMeasures}`);
                    
                    statusDiv.textContent = `Ready (${currentToneName}): ${currentScoreTitle}`;
                    
                    if (!canPlayStrict && canPlaySub) {
                        statusDiv.textContent = `Ready (${currentToneName}, subs only): ${currentScoreTitle}`;
                    } else if (!canPlayStrict && !canPlaySub) {
                        statusDiv.textContent = `No playable notes found in ${currentScoreTitle} for ${currentToneName} mapping.`;
                    }
                } catch (error) {
                    console.error("Error loading, rendering, or parsing MusicXML:", error);
                    statusDiv.textContent = `Error: ${error.message}`;
                    playBtn.disabled = true;
                    playSubBtn.disabled = true;
                    stopBtn.disabled = true;
                    isScoreLoaded = false;
                    scoreNotes = [];
                    allParsedNotes = [];
                    currentScoreTitle = "";
                } finally {
                    fileInput.value = '';
                }
            };
            
            reader.onerror = (e) => {
                console.error("Error reading file:", e);
                statusDiv.textContent = "Error reading file.";
                playBtn.disabled = true;
                playSubBtn.disabled = true;
                stopBtn.disabled = true;
                isScoreLoaded = false;
                scoreNotes = [];
                allParsedNotes = [];
                currentScoreTitle = "";
                fileInput.value = '';
            };
            
            if (file.name.endsWith('.mxl')) {
                /* reader.readAsArrayBuffer(file); */
                alert(".mxl files not supported via file input yet. Please use uncompressed .xml or .musicxml.");
                statusDiv.textContent = "Ready";
                currentScoreTitle = "";
            } else {
                reader.readAsText(file);
            }
        });
    }

    // Music Playback Control Listeners
    if (playBtn) {
        playBtn.addEventListener('click', () => startPlayback(false));
    }
    
    if (playSubBtn) {
        playSubBtn.addEventListener('click', () => startPlayback(true));
    }
    
    // General Stop Button for both music and recording playback
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            console.log("General Stop Button clicked.");
            if (isPlaying) {
                stopPlayback();
            }
            if (isRecordingPlayback) {
                stopRecordingPlayback();
            }
        });
    }
});
