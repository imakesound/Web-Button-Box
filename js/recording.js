// recording.js - Recording functionality and playback

/**
 * Updates the progress indicator display during recording playback.
 * Runs via requestAnimationFrame.
 */
function recordingProgressLoop() {
    // Stop the loop if recording playback is no longer active
    if (!isRecordingPlayback) {
        recordingProgressUpdateId = null;
        return;
    }

    // Calculate elapsed time since playback started
    let elapsedAudioTime = audioContext.currentTime - recordingPlaybackStartTime;
    // Calculate total duration of the current segment adjusted for recording speed
    // <<< UPDATED: Use recordingPlaybackSpeedFactor
    const segmentDurationAdjusted = (currentRecordingSegmentEndTimeSec - currentRecordingSegmentStartTimeSec) / recordingPlaybackSpeedFactor;
    // Clamp elapsed time to the segment boundaries
    elapsedAudioTime = Math.max(0, Math.min(elapsedAudioTime, segmentDurationAdjusted));

    // Update the progress display
    updateProgressIndicator(elapsedAudioTime, segmentDurationAdjusted); // Assumes updateProgressIndicator exists

    // Request the next frame
    recordingProgressUpdateId = requestAnimationFrame(recordingProgressLoop);
}

/**
 * Starts playback of the currently loaded recording.
 * @param {boolean} [loopRestart=false] - Internal flag indicating if this is a loop restart.
 * @param {number | null} [explicitStartTime=null] - Explicit start time for looping (seconds).
 * @param {number | null} [explicitEndTime=null] - Explicit end time for looping (seconds).
 */
function startRecordingPlayback(loopRestart = false, explicitStartTime = null, explicitEndTime = null) {
    // Prevent starting if already recording or playing music
    if (isRecording || isPlaying) {
        console.warn("Cannot start recording playback while recording or music playback is active.");
        if(statusDiv) statusDiv.textContent = "Stop other activities before playing recording.";
        return;
    }
    // Check if there's a recording loaded
    if (recordedEvents.length === 0) {
        console.warn("No recording available to play.");
        if(statusDiv) statusDiv.textContent = "No recording available.";
        return;
    }
    // Check AudioContext state
    if (!audioContext || audioContext.state !== 'running') {
        console.warn("AudioContext not ready.");
        resumeAudioContext(); // Try to resume
        if(statusDiv) statusDiv.textContent = "Audio not ready. Click Play Recording again.";
        return;
    }

    // Stop previous recording playback if restarting/looping
    if (isRecordingPlayback) {
        console.log("Stopping previous recording playback for restart/loop.");
        stopRecordingPlayback();
    }
    // If starting fresh, stop manual sounds and reset button states
    else {
        Object.keys(activeManualSources).forEach(id => stopManualSound(id, true));
        buttons.forEach(handleRelease); // Use handleRelease for proper cleanup
        activeManualSources = {};
        activeTouches.clear();
        isPointerDown = false;
    }

    // --- Determine Playback/Loop Time Range (in seconds, at 1x speed) ---
    let startTimeSec = 0;
    let endTimeSec = recordingTotalDurationSeconds; // Default to full duration
    let isLooping = recLoopCheckbox && recLoopCheckbox.checked; // Check UI checkbox

    // If restarting a loop with explicit times
    if (loopRestart && explicitStartTime !== null && explicitEndTime !== null) {
        startTimeSec = explicitStartTime;
        endTimeSec = explicitEndTime;
        isLooping = true; // Ensure looping flag is set
        console.log(`Restarting loop for recording segment: ${startTimeSec.toFixed(3)}s - ${endTimeSec.toFixed(3)}s`);
    }
    // If using UI for loop times (and checkbox is checked)
    else if (isLooping && recLoopStartTimeInput && recLoopEndTimeInput) {
        const inputStart = parseFloat(recLoopStartTimeInput.value);
        const inputEnd = parseFloat(recLoopEndTimeInput.value);

        // Validate start time input
        if (!isNaN(inputStart) && inputStart >= 0 && inputStart < recordingTotalDurationSeconds) {
            startTimeSec = inputStart;
        } else {
            console.warn(`Invalid start time input: ${recLoopStartTimeInput.value}. Defaulting to 0.`);
            startTimeSec = 0;
            recLoopStartTimeInput.value = startTimeSec.toFixed(1); // Correct UI
        }

        // Validate end time input (must be after start time and within duration)
        if (!isNaN(inputEnd) && inputEnd > startTimeSec && inputEnd <= recordingTotalDurationSeconds) {
            endTimeSec = inputEnd;
        } else {
            console.warn(`Invalid end time input: ${recLoopEndTimeInput.value}. Defaulting to full duration (${recordingTotalDurationSeconds.toFixed(3)}s).`);
            endTimeSec = recordingTotalDurationSeconds;
            recLoopEndTimeInput.value = endTimeSec.toFixed(1); // Correct UI
        }
        console.log(`Looping recording segment from UI: ${startTimeSec.toFixed(3)}s - ${endTimeSec.toFixed(3)}s`);
    }
    // If not looping, use full duration
    else {
        isLooping = false;
        startTimeSec = 0;
        endTimeSec = recordingTotalDurationSeconds;
    }

    // Filter recorded events to include only those within the selected time range
    const eventsToPlay = recordedEvents.filter(event =>
    event.time >= startTimeSec && event.time <= endTimeSec);

    // Check if there are any events to play in the range
    if (eventsToPlay.length === 0) {
        console.warn(`No recorded events found between ${startTimeSec.toFixed(3)}s and ${endTimeSec.toFixed(3)}s.`);
        if(statusDiv) statusDiv.textContent = `No events in time range ${startTimeSec.toFixed(1)}s - ${endTimeSec.toFixed(1)}s.`;
        // Update UI state: enable play, disable stop, ensure loop controls reflect state
        if(playRecBtn) playRecBtn.disabled = recordedEvents.length === 0;
        if(stopRecBtn) stopRecBtn.disabled = true;
        const hasRec = recordedEvents.length > 0;
        if(recLoopStartTimeInput) recLoopStartTimeInput.disabled = !hasRec;
        if(recLoopEndTimeInput) recLoopEndTimeInput.disabled = !hasRec;
        if(recLoopCheckbox) recLoopCheckbox.disabled = !hasRec;
        // Reset progress display (using recording speed)
        // <<< UPDATED: Use recordingPlaybackSpeedFactor
        updateProgressIndicator(0, recordingTotalDurationSeconds / recordingPlaybackSpeedFactor);
        return;
    }

    // Store the current segment boundaries (at 1x speed)
    currentRecordingSegmentStartTimeSec = startTimeSec;
    currentRecordingSegmentEndTimeSec = endTimeSec;
    const segmentDurationSeconds = currentRecordingSegmentEndTimeSec - currentRecordingSegmentStartTimeSec;

    console.log(`Starting playback of recording segment: ${startTimeSec.toFixed(3)}s to ${endTimeSec.toFixed(3)}s (${eventsToPlay.length} events). Loop: ${isLooping}`);

    // --- Update State and UI ---
    isRecordingPlayback = true; // Set playback flag
    // Disable play/record buttons, enable stop button
    if(playRecBtn) playRecBtn.disabled = true;
    if(stopRecBtn) stopRecBtn.disabled = false;
    if(recordBtn) recordBtn.disabled = true;
    // Disable loop controls during playback
    if(recLoopCheckbox) recLoopCheckbox.disabled = true;
    if(recLoopStartTimeInput) recLoopStartTimeInput.disabled = true;
    if(recLoopEndTimeInput) recLoopEndTimeInput.disabled = true;

    // Update status display
    if(statusDiv) statusDiv.textContent = isLooping ?
        `Looping Recording (${startTimeSec.toFixed(1)}s-${endTimeSec.toFixed(1)}s)...` :
        `Playing Recording (${startTimeSec.toFixed(1)}s-${endTimeSec.toFixed(1)}s)...`;

    // Clear previous visual timeouts
    recordingVisualTimeoutIds = [];
    // Calculate the audioContext time corresponding to the start of the segment
    // <<< UPDATED: Use recordingPlaybackSpeedFactor
    recordingPlaybackStartTime = audioContext.currentTime - (startTimeSec / recordingPlaybackSpeedFactor);

    // --- Schedule Events ---
    eventsToPlay.forEach(event => {
        // Calculate time offset within the current segment (at 1x speed)
        const timeWithinSegment = event.time - startTimeSec;
        // Calculate the absolute audio time for the event, adjusted for speed
        // <<< UPDATED: Use recordingPlaybackSpeedFactor
        const scheduledAudioTime = recordingPlaybackStartTime + (timeWithinSegment / recordingPlaybackSpeedFactor);
        // Calculate delay in milliseconds from now
        const delayMs = Math.max(0, (scheduledAudioTime - audioContext.currentTime) * 1000);

        // Schedule actions based on event type
        switch (event.type) {
            case 'press':
                recordingVisualTimeoutIds.push(setTimeout(() => {
                    if (!isRecordingPlayback) return; // Check if playback stopped early
                    // Ensure bellows mode matches the recorded event if specified
                    const pressMode = event.mode || currentBellowsMode; // Use current if mode wasn't recorded
                    if (event.mode && event.mode !== currentBellowsMode) {
                        setPlaybackBellowsMode(event.mode); // Assumes setPlaybackBellowsMode exists
                    }
                    // Trigger visual press and play sound
                    pressButtonVisually(event.id, pressMode, false); // Assumes pressButtonVisually exists
                    playManualSound(event.id, true); // Play sound (isPlaybackCall = true)
                }, delayMs));
                break;

            case 'release':
                recordingVisualTimeoutIds.push(setTimeout(() => {
                    if (!isRecordingPlayback) return; // Check if playback stopped early
                    // Trigger visual release and stop sound
                    releaseButtonVisually(event.id); // Assumes releaseButtonVisually exists
                    stopManualSound(event.id); // Stop sound (use default fade)
                }, delayMs));
                break;

            case 'bellows':
                recordingVisualTimeoutIds.push(setTimeout(() => {
                    if (!isRecordingPlayback) return; // Check if playback stopped early
                    // Set bellows mode
                    setPlaybackBellowsMode(event.mode); // Assumes setPlaybackBellowsMode exists
                }, delayMs));
                break;
        }
    });

    // --- Start Progress Updates & Schedule Loop/End ---

    // Calculate initial duration for progress display, adjusted for speed
    // <<< UPDATED: Use recordingPlaybackSpeedFactor
    const segmentDurationAdjusted = segmentDurationSeconds / recordingPlaybackSpeedFactor;
    updateProgressIndicator(0, segmentDurationAdjusted); // Set initial progress

    // Start the progress update loop
    if (recordingProgressUpdateId) cancelAnimationFrame(recordingProgressUpdateId);
    recordingProgressUpdateId = requestAnimationFrame(recordingProgressLoop);

    // Calculate delay for loop restart or natural end, adjusted for speed
    const endDelayMillis = Math.max(10, segmentDurationAdjusted * 1000) + 100; // Add buffer

    // Schedule the end action (loop or stop)
    recordingVisualTimeoutIds.push(setTimeout(() => {
        if (isRecordingPlayback) { // Check if still playing
            if (isLooping) {
                console.log("Looping recording segment...");
                // Restart playback with the same segment times
                startRecordingPlayback(true, currentRecordingSegmentStartTimeSec, currentRecordingSegmentEndTimeSec);
            } else {
                console.log("Recording segment playback finished naturally.");
                stopRecordingPlayback(); // Stop playback
            }
        }
    }, endDelayMillis));
}

/**
 * Stops recording playback immediately.
 * Cancels scheduled events and resets state.
 */
function stopRecordingPlayback() {
    if (!isRecordingPlayback) return; // Do nothing if not playing

    console.log("Stopping recording playback...");
    isRecordingPlayback = false; // Set flag

    // Cancel progress updates
    if (recordingProgressUpdateId) {
        cancelAnimationFrame(recordingProgressUpdateId);
        recordingProgressUpdateId = null;
    }

    // Clear all scheduled visual timeouts
    recordingVisualTimeoutIds.forEach(clearTimeout);
    recordingVisualTimeoutIds = [];

    // Stop any sounds currently playing due to this playback and reset visuals
    // Note: This reuses activeManualSources, assuming music isn't playing simultaneously
    Object.keys(activeManualSources).forEach(id => stopManualSound(id, true)); // Stop immediately
    buttons.forEach(btn => releaseButtonVisually(btn.dataset.buttonId)); // Reset visuals

    // Update UI button states
    const hasRec = recordedEvents.length > 0;
    if(playRecBtn) playRecBtn.disabled = !hasRec; // Enable play if recording exists
    if(stopRecBtn) stopRecBtn.disabled = true; // Disable stop
    if(recordBtn) recordBtn.disabled = false; // Re-enable record

    // Re-enable loop controls if a recording exists
    if(recLoopCheckbox) recLoopCheckbox.disabled = !hasRec;
    if(recLoopStartTimeInput) recLoopStartTimeInput.disabled = !hasRec;
    if(recLoopEndTimeInput) recLoopEndTimeInput.disabled = !hasRec;

    // Update status display
    if(statusDiv) statusDiv.textContent = "Recording playback stopped.";

    // Reset progress display (using recording speed)
    if (progressDisplayElement) {
        // <<< UPDATED: Use recordingPlaybackSpeedFactor
        updateProgressIndicator(0, recordingTotalDurationSeconds / recordingPlaybackSpeedFactor);
    }

    // Disable the general stop button if music isn't playing either
    if (stopBtn && !isPlaying) {
        stopBtn.disabled = true;
    }
}

// --- Recording Control Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // --- Record Button ---
    if (recordBtn && statusDiv) {
        recordBtn.addEventListener('click', () => {
            // Check AudioContext
            if (!audioContext || audioContext.state !== 'running') {
                resumeAudioContext();
                statusDiv.textContent = "Audio not ready. Try again.";
                return;
            }

            // --- Start Recording ---
            if (!isRecording) {
                // Prevent recording if music or recording playback is active
                if (isPlaying || isRecordingPlayback) {
                    statusDiv.textContent = "Stop playback before recording.";
                    return;
                }

                isRecording = true; // Set recording flag
                recordedEvents = []; // Clear previous events
                recordingStartTime = audioContext.currentTime; // Set time reference
                recordingTotalDurationSeconds = 0; // Reset duration

                // Update record button UI
                recordBtn.textContent = "Stop Recording";
                const indicator = document.createElement('span');
                indicator.id = 'record-indicator'; // Used by CSS for pulsing effect
                recordBtn.appendChild(indicator);

                // Disable other controls during recording
                if(playRecBtn) playRecBtn.disabled = true;
                if(stopRecBtn) stopRecBtn.disabled = true;
                if(saveRecBtn) saveRecBtn.disabled = true;
                if(downloadRecBtn) downloadRecBtn.disabled = true;
                if(loadRecBtn) loadRecBtn.disabled = true;
                if(deleteRecBtn) deleteRecBtn.disabled = true;
                if(renameRecBtn) renameRecBtn.disabled = true;
                if(recordingSelect) recordingSelect.disabled = true;
                if(playBtn) playBtn.disabled = true;
                if(playSubBtn) playSubBtn.disabled = true;
                if(recLoopCheckbox) recLoopCheckbox.disabled = true;
                if(recLoopStartTimeInput) recLoopStartTimeInput.disabled = true;
                if(recLoopEndTimeInput) recLoopEndTimeInput.disabled = true;

                statusDiv.textContent = "Recording...";
                console.log("Recording started.");
            }
            // --- Stop Recording ---
            else {
                isRecording = false; // Clear recording flag

                // Update record button UI
                recordBtn.textContent = "Record";
                const indicator = document.getElementById('record-indicator');
                if (indicator) indicator.remove(); // Remove pulsing indicator

                // Calculate total duration of the recording
                if (recordedEvents.length > 0) {
                    recordingTotalDurationSeconds = recordedEvents.reduce(
                        (maxTime, event) => Math.max(maxTime, event.time), 0);
                } else {
                    recordingTotalDurationSeconds = 0;
                }

                // Update UI button states based on whether a recording was made
                const hasRecording = recordedEvents.length > 0;
                if(playRecBtn) playRecBtn.disabled = !hasRecording;
                if(stopRecBtn) stopRecBtn.disabled = true; // Stop always disabled initially
                if(saveRecBtn) saveRecBtn.disabled = !hasRecording;
                if(downloadRecBtn) downloadRecBtn.disabled = !hasRecording;

                // Enable/disable recording management buttons based on saved recordings
                const hasSavedRecordings = recordingSelect && recordingSelect.options.length > 1;
                if(loadRecBtn) loadRecBtn.disabled = !hasSavedRecordings || recordingSelect.value === "";
                const hasSelection = recordingSelect && recordingSelect.value !== "";
                if(deleteRecBtn) deleteRecBtn.disabled = !hasSelection;
                if(renameRecBtn) renameRecBtn.disabled = !hasSelection;
                if(recordingSelect) recordingSelect.disabled = !hasSavedRecordings;

                // Re-enable music playback buttons if score is loaded
                if(playBtn) playBtn.disabled = !isScoreLoaded || scoreNotes.length === 0;
                if(playSubBtn) playSubBtn.disabled = !isScoreLoaded || allParsedNotes.length === 0;

                // Enable/disable loop controls based on new recording
                if(recLoopCheckbox) recLoopCheckbox.disabled = !hasRecording;
                if(recLoopStartTimeInput) recLoopStartTimeInput.disabled = !hasRecording;
                if(recLoopEndTimeInput) recLoopEndTimeInput.disabled = !hasRecording;
                // Set default loop times for the new recording
                if(recLoopStartTimeInput) recLoopStartTimeInput.value = 0;
                if(recLoopEndTimeInput) recLoopEndTimeInput.value = recordingTotalDurationSeconds.toFixed(1);
                if(recLoopEndTimeInput) recLoopEndTimeInput.max = recordingTotalDurationSeconds.toFixed(1);
                if(recLoopStartTimeInput) recLoopStartTimeInput.max = recordingTotalDurationSeconds.toFixed(1);

                statusDiv.textContent = `Recording finished (${recordedEvents.length} events, ${recordingTotalDurationSeconds.toFixed(1)}s).`;
                console.log("Recording stopped.");
                console.log("Recorded Events:", recordedEvents);

                // Update progress display for the new recording (using recording speed)
                // <<< UPDATED: Use recordingPlaybackSpeedFactor
                updateProgressIndicator(0, recordingTotalDurationSeconds / recordingPlaybackSpeedFactor);
            }
        });
    } // End recordBtn listener

    // --- Recording Play Button ---
    if (playRecBtn) {
        playRecBtn.addEventListener('click', () => startRecordingPlayback());
    }

    // --- Recording Stop Button ---
    if (stopRecBtn) {
        stopRecBtn.addEventListener('click', stopRecordingPlayback);
    }

    // --- Recording Loop Time Input Listeners ---
    // Add validation/adjustment logic on blur (when user clicks away)
    if (recLoopStartTimeInput && recLoopEndTimeInput) {
        recLoopStartTimeInput.addEventListener('blur', () => {
            let start = parseFloat(recLoopStartTimeInput.value);
            let end = parseFloat(recLoopEndTimeInput.value); // Get current end time

            // Basic validation and clamping
            if (isNaN(start) || start < 0) start = 0;
            // Ensure start is not >= end (if end is valid)
            if (start >= end && end > 0) start = Math.max(0, end - 0.1); // Set slightly before end
            // Ensure start doesn't exceed total duration
            start = Math.min(start, recordingTotalDurationSeconds);

            recLoopStartTimeInput.value = start.toFixed(1); // Update input with corrected value
        });

        recLoopEndTimeInput.addEventListener('blur', () => {
            let start = parseFloat(recLoopStartTimeInput.value); // Get current start time
            let end = parseFloat(recLoopEndTimeInput.value);

            // Basic validation and clamping
            if (isNaN(end) || end <= start) end = start + 0.1; // Ensure end is after start
            // Ensure end doesn't exceed total duration
            end = Math.min(end, recordingTotalDurationSeconds);

            recLoopEndTimeInput.value = end.toFixed(1); // Update input with corrected value
        });
    }
}); // End DOMContentLoaded
