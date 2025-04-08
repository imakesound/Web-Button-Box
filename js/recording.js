// recording.js - Recording functionality

function recordingProgressLoop() {
    if (!isRecordingPlayback) {
        recordingProgressUpdateId = null;
        return;
    }
    
    let elapsedAudioTime = audioContext.currentTime - recordingPlaybackStartTime;
    const segmentDurationAdjusted = (currentRecordingSegmentEndTimeSec - currentRecordingSegmentStartTimeSec) / playbackSpeedFactor;
    elapsedAudioTime = Math.max(0, Math.min(elapsedAudioTime, segmentDurationAdjusted));
    
    updateProgressIndicator(elapsedAudioTime, segmentDurationAdjusted);
    recordingProgressUpdateId = requestAnimationFrame(recordingProgressLoop);
}

function startRecordingPlayback(loopRestart = false, explicitStartTime = null, explicitEndTime = null) {
    if (isRecording || isPlaying) {
        console.warn("Cannot start recording playback while recording or music playback is active.");
        return;
    }
    
    if (recordedEvents.length === 0) {
        console.warn("No recording available to play.");
        statusDiv.textContent = "No recording available.";
        return;
    }
    
    if (!audioContext || audioContext.state !== 'running') {
        console.warn("AudioContext not ready.");
        resumeAudioContext();
        statusDiv.textContent = "Audio not ready. Click Play again.";
        return;
    }
    
    if (isRecordingPlayback) {
        console.log("Stopping previous recording playback for restart/loop.");
        stopRecordingPlayback();
    } else {
        Object.keys(activeManualSources).forEach(id => stopManualSound(id, true));
        buttons.forEach(handleRelease);
        activeManualSources = {};
        activeTouches.clear();
        isPointerDown = false;
    }
    
    let startTimeSec = 0;
    let endTimeSec = recordingTotalDurationSeconds;
    let isLooping = recLoopCheckbox && recLoopCheckbox.checked;
    
    if (loopRestart && explicitStartTime !== null && explicitEndTime !== null) {
        startTimeSec = explicitStartTime;
        endTimeSec = explicitEndTime;
        isLooping = true;
        console.log(`Restarting loop for recording segment: ${startTimeSec.toFixed(3)}s - ${endTimeSec.toFixed(3)}s`);
    } else {
        const inputStart = parseFloat(recLoopStartTimeInput.value);
        const inputEnd = parseFloat(recLoopEndTimeInput.value);
        
        if (!isNaN(inputStart) && inputStart >= 0 && inputStart < recordingTotalDurationSeconds) {
            startTimeSec = inputStart;
        } else {
            console.warn(`Invalid start time input: ${recLoopStartTimeInput.value}. Defaulting to 0.`);
            startTimeSec = 0;
            recLoopStartTimeInput.value = 0;
        }
        
        if (!isNaN(inputEnd) && inputEnd > startTimeSec && inputEnd <= recordingTotalDurationSeconds) {
            endTimeSec = inputEnd;
        } else {
            console.warn(`Invalid end time input: ${recLoopEndTimeInput.value}. Defaulting to full duration (${recordingTotalDurationSeconds.toFixed(3)}s).`);
            endTimeSec = recordingTotalDurationSeconds;
            recLoopEndTimeInput.value = endTimeSec.toFixed(1);
        }
    }
    
    const eventsToPlay = recordedEvents.filter(event => 
        event.time >= startTimeSec && event.time <= endTimeSec);
    
    if (eventsToPlay.length === 0) {
        console.warn(`No recorded events found between ${startTimeSec.toFixed(3)}s and ${endTimeSec.toFixed(3)}s.`);
        statusDiv.textContent = `No events in time range ${startTimeSec.toFixed(1)}s - ${endTimeSec.toFixed(1)}s.`;
        playRecBtn.disabled = recordedEvents.length === 0;
        stopRecBtn.disabled = true;
        updateProgressIndicator(0, recordingTotalDurationSeconds);
        recLoopStartTimeInput.disabled = recordedEvents.length === 0;
        recLoopEndTimeInput.disabled = recordedEvents.length === 0;
        recLoopCheckbox.disabled = recordedEvents.length === 0;
        return;
    }
    
    currentRecordingSegmentStartTimeSec = startTimeSec;
    currentRecordingSegmentEndTimeSec = endTimeSec;
    const segmentDurationSeconds = currentRecordingSegmentEndTimeSec - currentRecordingSegmentStartTimeSec;
    
    console.log(`Starting playback of recording segment: ${startTimeSec.toFixed(3)}s to ${endTimeSec.toFixed(3)}s (${eventsToPlay.length} events). Loop: ${isLooping}`);
    
    isRecordingPlayback = true;
    playRecBtn.disabled = true;
    stopRecBtn.disabled = false;
    recordBtn.disabled = true;
    recLoopCheckbox.disabled = true;
    recLoopStartTimeInput.disabled = true;
    recLoopEndTimeInput.disabled = true;
    
    statusDiv.textContent = isLooping ? 
        `Looping Recording (${startTimeSec.toFixed(1)}s-${endTimeSec.toFixed(1)}s)...` : 
        `Playing Recording (${startTimeSec.toFixed(1)}s-${endTimeSec.toFixed(1)}s)...`;
    
    recordingVisualTimeoutIds = [];
    recordingPlaybackStartTime = audioContext.currentTime - (startTimeSec / playbackSpeedFactor);
    
    eventsToPlay.forEach(event => {
        const timeWithinSegment = event.time - startTimeSec;
        const scheduledAudioTime = recordingPlaybackStartTime + (timeWithinSegment / playbackSpeedFactor);
        const delayMs = Math.max(0, (scheduledAudioTime - audioContext.currentTime) * 1000);
        
        switch (event.type) {
            case 'press':
                recordingVisualTimeoutIds.push(setTimeout(() => {
                    if (!isRecordingPlayback) return;
                    
                    const pressMode = event.mode || 'push';
                    pressButtonVisually(event.id, pressMode, false);
                    
                    if (event.mode && event.mode !== currentBellowsMode) {
                        setPlaybackBellowsMode(event.mode);
                    }
                    
                    playManualSound(event.id, true);
                }, delayMs));
                break;
                
            case 'release':
                recordingVisualTimeoutIds.push(setTimeout(() => {
                    if (!isRecordingPlayback) return;
                    
                    releaseButtonVisually(event.id);
                    stopManualSound(event.id);
                }, delayMs));
                break;
                
            case 'bellows':
                recordingVisualTimeoutIds.push(setTimeout(() => {
                    if (!isRecordingPlayback) return;
                    
                    setPlaybackBellowsMode(event.mode);
                }, delayMs));
                break;
        }
    });
    
    const segmentDurationAdjusted = segmentDurationSeconds / playbackSpeedFactor;
    updateProgressIndicator(0, segmentDurationAdjusted);
    
    if (recordingProgressUpdateId) cancelAnimationFrame(recordingProgressUpdateId);
    recordingProgressUpdateId = requestAnimationFrame(recordingProgressLoop);
    
    const endDelayMillis = Math.max(10, segmentDurationAdjusted * 1000) + 100;
    
    recordingVisualTimeoutIds.push(setTimeout(() => {
        if (isRecordingPlayback) {
            if (isLooping) {
                console.log("Looping recording segment...");
                startRecordingPlayback(true, currentRecordingSegmentStartTimeSec, currentRecordingSegmentEndTimeSec);
            } else {
                console.log("Recording segment playback finished naturally.");
                stopRecordingPlayback();
            }
        }
    }, endDelayMillis));
}

function stopRecordingPlayback() {
    if (!isRecordingPlayback) return;
    
    console.log("Stopping recording playback...");
    isRecordingPlayback = false;
    
    if (recordingProgressUpdateId) {
        cancelAnimationFrame(recordingProgressUpdateId);
        recordingProgressUpdateId = null;
    }
    
    recordingVisualTimeoutIds.forEach(clearTimeout);
    recordingVisualTimeoutIds = [];
    
    Object.keys(activeManualSources).forEach(id => stopManualSound(id, true));
    buttons.forEach(btn => releaseButtonVisually(btn.dataset.buttonId));
    
    playRecBtn.disabled = recordedEvents.length === 0;
    stopRecBtn.disabled = true;
    recordBtn.disabled = false;
    
    const hasRecording = recordedEvents.length > 0;
    recLoopCheckbox.disabled = !hasRecording;
    recLoopStartTimeInput.disabled = !hasRecording;
    recLoopEndTimeInput.disabled = !hasRecording;
    
    statusDiv.textContent = "Recording playback stopped.";
    
    if (progressDisplayElement) {
        updateProgressIndicator(0, recordingTotalDurationSeconds / playbackSpeedFactor);
    }
    
    if (!isPlaying) {
        stopBtn.disabled = true;
    }
}

// Recording Control Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Recording Button
    if (recordBtn) {
        recordBtn.addEventListener('click', () => {
            if (!audioContext || audioContext.state !== 'running') {
                resumeAudioContext();
                statusDiv.textContent = "Audio not ready. Try again.";
                return;
            }
            
            if (!isRecording) {
                if (isPlaying || isRecordingPlayback) {
                    statusDiv.textContent = "Stop playback before recording.";
                    return;
                }
                
                isRecording = true;
                recordedEvents = [];
                recordingStartTime = audioContext.currentTime;
                recordingTotalDurationSeconds = 0; // Reset duration
                
                recordBtn.textContent = "Stop Recording";
                const indicator = document.createElement('span');
                indicator.id = 'record-indicator';
                recordBtn.appendChild(indicator);
                
                playRecBtn.disabled = true;
                stopRecBtn.disabled = true;
                saveRecBtn.disabled = true;
                downloadRecBtn.disabled = true;
                loadRecBtn.disabled = true;
                deleteRecBtn.disabled = true;
                renameRecBtn.disabled = true;
                recordingSelect.disabled = true;
                playBtn.disabled = true;
                playSubBtn.disabled = true;
                
                recLoopCheckbox.disabled = true;
                recLoopStartTimeInput.disabled = true;
                recLoopEndTimeInput.disabled = true;
                
                statusDiv.textContent = "Recording...";
                console.log("Recording started.");
            } else {
                isRecording = false;
                recordBtn.textContent = "Record";
                const indicator = document.getElementById('record-indicator');
                if (indicator) indicator.remove();
                
                if (recordedEvents.length > 0) {
                    recordingTotalDurationSeconds = recordedEvents.reduce(
                        (maxTime, event) => Math.max(maxTime, event.time), 0);
                } else {
                    recordingTotalDurationSeconds = 0;
                }
                
                const hasRecording = recordedEvents.length > 0;
                
                playRecBtn.disabled = !hasRecording;
                stopRecBtn.disabled = true;
                saveRecBtn.disabled = !hasRecording;
                downloadRecBtn.disabled = !hasRecording;
                
                const hasSavedRecordings = recordingSelect.options.length > 1;
                loadRecBtn.disabled = !hasSavedRecordings || recordingSelect.value === "";
                const hasSelection = recordingSelect.value !== "";
                deleteRecBtn.disabled = !hasSelection;
                renameRecBtn.disabled = !hasSelection;
                recordingSelect.disabled = !hasSavedRecordings;
                
                playBtn.disabled = !isScoreLoaded || scoreNotes.length === 0;
                playSubBtn.disabled = !isScoreLoaded || allParsedNotes.length === 0;
                
                recLoopCheckbox.disabled = !hasRecording;
                recLoopStartTimeInput.disabled = !hasRecording;
                recLoopEndTimeInput.disabled = !hasRecording;
                recLoopStartTimeInput.value = 0;
                recLoopEndTimeInput.value = recordingTotalDurationSeconds.toFixed(1);
                recLoopEndTimeInput.max = recordingTotalDurationSeconds.toFixed(1);
                recLoopStartTimeInput.max = recordingTotalDurationSeconds.toFixed(1);
                
                statusDiv.textContent = `Recording finished (${recordedEvents.length} events, ${recordingTotalDurationSeconds.toFixed(1)}s).`;
                console.log("Recording stopped.");
                console.log("Recorded Events:", recordedEvents);
                
                updateProgressIndicator(0, recordingTotalDurationSeconds / playbackSpeedFactor);
            }
        });
    }
    
    // Recording Play Button
    if (playRecBtn) {
        playRecBtn.addEventListener('click', () => startRecordingPlayback());
    }
    
    // Recording Stop Button
    if (stopRecBtn) {
        stopRecBtn.addEventListener('click', stopRecordingPlayback);
    }
    
    // Recording Loop Time Input Listeners
    if (recLoopStartTimeInput) {
        recLoopStartTimeInput.addEventListener('blur', () => {
            let start = parseFloat(recLoopStartTimeInput.value);
            let end = parseFloat(recLoopEndTimeInput.value);
            
            if (isNaN(start) || start < 0) {
                start = 0;
            }
            
            if (start >= end && end > 0) {
                start = Math.max(0, end - 0.1);
            }
            
            start = Math.min(start, recordingTotalDurationSeconds);
            recLoopStartTimeInput.value = start.toFixed(1);
        });
    }
    
    if (recLoopEndTimeInput) {
        recLoopEndTimeInput.addEventListener('blur', () => {
            let start = parseFloat(recLoopStartTimeInput.value);
            let end = parseFloat(recLoopEndTimeInput.value);
            
            if (isNaN(end) || end <= start) {
                end = start + 0.1;
            }
            
            end = Math.min(end, recordingTotalDurationSeconds);
            recLoopEndTimeInput.value = end.toFixed(1);
        });
    }
});
