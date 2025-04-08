// ui-controls.js - Button and bellows interactions

function handlePress(button) {
    if (!button || !button.classList.contains('acc-button')) return;
    
    const buttonId = button.dataset.buttonId;
    
    if (!audioContext || audioContext.state !== 'running') {
        console.log("Audio context not ready, attempting to initialize/resume...");
        resumeAudioContext();
        return;
    }
    
    if (!button.classList.contains('pressed')) {
        button.classList.add('pressed');
        playManualSound(buttonId);
    }
}

function handleRelease(button) {
    if (!button || !button.classList.contains('acc-button')) return;
    
    const buttonId = button.dataset.buttonId;
    
    if (button.classList.contains('pressed')) {
        button.classList.remove('pressed');
        stopManualSound(buttonId);
    }
}

function handleTouchEndOrCancel(event) {
    event.preventDefault();
    
    for (const touch of event.changedTouches) {
        const endedButton = activeTouches.get(touch.identifier);
        if (endedButton) {
            handleRelease(endedButton);
        }
        activeTouches.delete(touch.identifier);
    }
    
    if (event.touches.length === 0) {
        isPointerDown = false;
        buttons.forEach(button => {
            const buttonId = button.dataset.buttonId;
            const isPressed = button.classList.contains('pressed');
            let isStillActiveTouch = false;
            
            for (let btn of activeTouches.values()) {
                if (btn === button) {
                    isStillActiveTouch = true;
                    break;
                }
            }
            
            if (isPressed && !isStillActiveTouch) {
                console.warn(`Cleanup: Releasing potentially stuck button ${buttonId}`);
                handleRelease(button);
            }
        });
        
        if (activeTouches.size > 0) {
            console.warn("Cleanup: Active touches map not empty after last touch end. Clearing.", activeTouches);
            activeTouches.clear();
        }
    }
}

function setBellowsMode(mode, isInitial = false) {
    const newMode = (mode === 'pull') ? 'pull' : 'push';
    
    if (!isInitial && newMode === currentBellowsMode) return;
    
    if (isRecording && !isInitial) {
        const time = audioContext.currentTime - recordingStartTime;
        recordedEvents.push({ time: time, type: 'bellows', mode: newMode });
    }
    
    currentBellowsMode = newMode;
    
    if (currentBellowsMode === 'pull') {
        bellowsToggle.classList.add('active');
        bellowsToggle.textContent = 'P U L L';
        bellowsToggle.title = "Release for PUSH sound";
    } else {
        bellowsToggle.classList.remove('active');
        bellowsToggle.textContent = 'P U S H';
        bellowsToggle.title = "Hold for PULL sound";
    }
    
    if (!isInitial) {
        const heldButtonIds = new Set();
        
        buttons.forEach(btn => {
            if (btn.classList.contains('pressed')) {
                heldButtonIds.add(btn.dataset.buttonId);
            }
        });
        
        activeTouches.forEach(btn => {
            if (btn && btn.dataset) {
                heldButtonIds.add(btn.dataset.buttonId);
            }
        });
        
        heldButtonIds.forEach(id => {
            playManualSound(id, false, true); // Restart sound with new bellows mode
            const restartedSourceData = activeManualSources[id];
            
            if (restartedSourceData && restartedSourceData.source && 
                restartedSourceData.source.buffer && 
                restartedSourceData.source.buffer.duration > 1.0) {
                if (!isPlaying && !isRecordingPlayback) {
                    try {
                        restartedSourceData.source.loop = true;
                        restartedSourceData.source.loopStart = 1.0;
                        restartedSourceData.source.loopEnd = restartedSourceData.source.buffer.duration;
                    } catch (e) {
                        console.error(`Error re-enabling loop for ${id} after bellows change:`, e);
                    }
                }
            }
        });
    }
}

function setPlaybackBellowsMode(newMode) {
    if (newMode === currentBellowsMode) return;
    
    console.log(`Recording Playback: Setting bellows to ${newMode}`);
    currentBellowsMode = newMode;
    
    if (currentBellowsMode === 'pull') {
        bellowsToggle.classList.add('active');
        bellowsToggle.textContent = 'P U L L';
    } else {
        bellowsToggle.classList.remove('active');
        bellowsToggle.textContent = 'P U S H';
    }
    
    const currentlyPlayingIds = Object.keys(activeManualSources);
    currentlyPlayingIds.forEach(id => {
        console.log(`  Restarting held note ${id} for bellows change during playback`);
        playManualSound(id, true);
        pressButtonVisually(id, currentBellowsMode, false);
    });
}

function pressButtonVisually(buttonId, direction, isSubstituted) {
    const btnElement = document.querySelector(`.acc-button[data-button-id="${buttonId}"]`);
    
    if(btnElement) {
        btnElement.classList.remove('pull-active', 'push-active', 'sub-active');
        btnElement.classList.add('pressed');
        
        if (isSubstituted) {
            btnElement.classList.add('sub-active');
        } else if (direction === 'pull') {
            btnElement.classList.add('pull-active');
        } else if (direction === 'push') {
            btnElement.classList.add('push-active');
        }
    } else {
        console.warn(`pressButtonVisually: Could not find button ${buttonId}`);
    }
}

function releaseButtonVisually(buttonId) {
    const btnElement = document.querySelector(`.acc-button[data-button-id="${buttonId}"]`);
    
    if (btnElement) {
        btnElement.classList.remove('pull-active');
        btnElement.classList.remove('push-active');
        btnElement.classList.remove('sub-active');
        
        const isManuallyHeld = isPointerDown && btnElement.matches(':hover') || 
                               Array.from(activeTouches.values()).includes(btnElement);
        
        if (!isManuallyHeld) {
            btnElement.classList.remove('pressed');
        }
    }
}

// Set up UI event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Manual Play Interaction
    if (board) {
        board.addEventListener('mousedown', (event) => {
            if (event.target.classList.contains('acc-button')) {
                event.preventDefault();
                isPointerDown = true;
                handlePress(event.target);
            }
        });
        
        board.addEventListener('mouseover', (event) => {
            if (isPointerDown && event.target.classList.contains('acc-button')) {
                if (event.buttons === 1) {
                    handlePress(event.target);
                } else {
                    isPointerDown = false;
                    buttons.forEach(handleRelease);
                }
            }
        });
        
        board.addEventListener('mouseout', (event) => {
            if (isPointerDown && event.target.classList.contains('acc-button')) {
                handleRelease(event.target);
            }
        });
        
        board.addEventListener('touchstart', (event) => {
            event.preventDefault();
            isPointerDown = true;
            
            for (const touch of event.changedTouches) {
                const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);
                if (elementUnderTouch && elementUnderTouch.classList.contains('acc-button')) {
                    handlePress(elementUnderTouch);
                    activeTouches.set(touch.identifier, elementUnderTouch);
                }
            }
        }, { passive: false });
        
        board.addEventListener('touchmove', (event) => {
            event.preventDefault();
            
            for (const touch of event.changedTouches) {
                const currentElement = document.elementFromPoint(touch.clientX, touch.clientY);
                const lastButtonForThisTouch = activeTouches.get(touch.identifier);
                let currentButton = null;
                
                if (currentElement && currentElement.classList.contains('acc-button')) {
                    currentButton = currentElement;
                }
                
                if (currentButton !== lastButtonForThisTouch) {
                    if (lastButtonForThisTouch) {
                        handleRelease(lastButtonForThisTouch);
                    }
                    
                    if (currentButton) {
                        handlePress(currentButton);
                        activeTouches.set(touch.identifier, currentButton);
                    } else {
                        activeTouches.delete(touch.identifier);
                    }
                }
            }
        }, { passive: false });
        
        board.addEventListener('touchend', handleTouchEndOrCancel);
        board.addEventListener('touchcancel', handleTouchEndOrCancel);
    }
    
    document.addEventListener('mouseup', (event) => {
        if (isPointerDown) {
            isPointerDown = false;
            buttons.forEach(button => {
                if (button.classList.contains('pressed') && !Array.from(activeTouches.values()).includes(button)) {
                    handleRelease(button);
                }
            });
        }
    });
    
    document.addEventListener('dragstart', (e) => e.preventDefault());

    // Bellows Toggle Listeners
    if (bellowsToggle) {
        setBellowsMode('push', true);
        
        bellowsToggle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            setBellowsMode('pull');
        });
        
        bellowsToggle.addEventListener('mouseup', () => {
            setBellowsMode('push');
        });
        
        bellowsToggle.addEventListener('mouseleave', () => {
            if (bellowsToggle.classList.contains('active')) {
                setBellowsMode('push');
            }
        });
        
        bellowsToggle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            setBellowsMode('pull');
        }, { passive: false });
        
        bellowsToggle.addEventListener('touchend', () => {
            setBellowsMode('push');
        });
        
        bellowsToggle.addEventListener('touchcancel', () => {
            setBellowsMode('push');
        });
    }

    // Spacebar Listener for Bellows
    document.addEventListener('keydown', (event) => {
        if (event.metaKey || event.ctrlKey || event.altKey || event.target.matches('input, select, textarea')) {
            return;
        }
        
        if (event.code === 'Space') {
            event.preventDefault();
            
            if (currentBellowsMode !== 'pull') {
                setBellowsMode('pull');
                if(bellowsToggle) bellowsToggle.classList.add('active');
            }
        }
    });
    
    document.addEventListener('keyup', (event) => {
        if (event.target.matches('input, select, textarea')) {
            return;
        }
        
        if (event.code === 'Space') {
            event.preventDefault();
            setBellowsMode('push');
            if(bellowsToggle) bellowsToggle.classList.remove('active');
        }
    });

    // Tone Selection Listener
    if (toneSelect) {
        toneSelect.addEventListener('change', (event) => {
            const newTone = event.target.value;
            
            if (newTone !== currentToneName) {
                console.log(`Switching tone to: ${newTone}`);
                currentToneName = newTone;
                activeNoteMapping = (currentToneName === 'GCF') ? gcfNoteMapping : fbeNoteMapping;
                console.log(`Active note mapping switched to ${currentToneName}`);
                
                Object.keys(activeManualSources).forEach(id => stopManualSound(id, true));
                activeManualSources = {};
                buttons.forEach(btn => btn.classList.remove('pressed'));
                activeTouches.clear();
                isPointerDown = false;
                
                if (audioContext && audioContext.state === 'running') {
                    loadSamplesForTone(currentToneName);
                } else {
                    console.warn("AudioContext not running, samples will load on next interaction.");
                    resumeAudioContext();
                }
                
                if (isScoreLoaded && osmd) {
                    console.log(`Score is loaded, re-parsing for new tone: ${currentToneName}`);
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
                    
                    console.log(`Re-parsed score for ${currentToneName}. Found ${scoreNotes.length} strict notes, ${allParsedNotes.length} total notes. Total Measures: ${totalMeasures}`);
                    
                    statusDiv.textContent = `Ready (${currentToneName}): ${currentScoreTitle}`;
                    
                    if (!canPlayStrict && canPlaySub) {
                        statusDiv.textContent = `Ready (${currentToneName}, subs only): ${currentScoreTitle}`;
                    }
                    else if (!canPlayStrict && !canPlaySub) {
                        statusDiv.textContent = `No playable notes found in ${currentScoreTitle} for ${currentToneName} mapping.`;
                    }
                }
            }
        });
    }

    // Theme Selection Listener
    if (themeSelect) {
        themeSelect.addEventListener('change', (event) => {
            const selectedTheme = event.target.value;
            console.log(`Switching theme to: ${selectedTheme}`);
            
            body.classList.remove('theme-light', 'theme-mexico');
            
            if (selectedTheme === 'light') {
                body.classList.add('theme-light');
            } else if (selectedTheme === 'mexico') {
                body.classList.add('theme-mexico');
            }
        });
    }

    // Toggle Sheet Music Area Listener
    if (toggleSheetBtn) {
        toggleSheetBtn.addEventListener('click', () => {
            if (musicSheetArea) {
                const isHidden = musicSheetArea.classList.toggle('hidden');
                toggleSheetBtn.textContent = isHidden ? "Show Music" : "Hide Music";
                
                if (!isHidden) {
                    setTimeout(() => {
                        if (osmd && typeof osmd.handleResize === 'function') {
                            try {
                                osmd.handleResize();
                                console.log("Called osmd.handleResize()");
                                if (osmd.cursor && !isPlaying) osmd.cursor.hide();
                            } catch(e){
                                console.error("OSMD error after toggle/resize:", e);
                            }
                        }
                    }, 50);
                } else if (osmd && osmd.cursor) {
                    try {
                        osmd.cursor.hide();
                    } catch(e) {}
                }
            }
        });
    }

    // Speed Slider Listener
    if (speedSlider) {
        speedSlider.addEventListener('input', (event) => {
            playbackSpeedFactor = parseFloat(event.target.value);
            speedDisplay.textContent = `${playbackSpeedFactor.toFixed(2)}x`;
            let statusMsg = "";
            let totalDuration = 0;

            if (isPlaying) {
                stopPlayback();
                statusMsg = `Speed changed to ${playbackSpeedFactor.toFixed(2)}x. Press Play Music to restart.`;
                totalDuration = parsedLastNoteEndTime1x;
            } else if (isRecordingPlayback) {
                stopRecordingPlayback();
                statusMsg = `Speed changed to ${playbackSpeedFactor.toFixed(2)}x. Press Play Recording to restart.`;
                totalDuration = recordingTotalDurationSeconds;
            } else {
                if (isScoreLoaded) {
                    totalDuration = parsedLastNoteEndTime1x;
                    statusMsg = `Ready (${currentToneName}): ${currentScoreTitle || 'Score loaded'}`;
                } else if (recordedEvents.length > 0) {
                    totalDuration = recordingTotalDurationSeconds;
                    const selectedRecName = recordingSelect ? recordingSelect.value : "";
                    statusMsg = selectedRecName ? 
                        `Loaded recording: "${selectedRecName}" (${recordedEvents.length} events, ${recordingTotalDurationSeconds.toFixed(1)}s).` : 
                        "No recording loaded.";
                } else {
                    statusMsg = `Speed: ${playbackSpeedFactor.toFixed(2)}x`;
                    totalDuration = 0;
                }
            }
            
            statusDiv.textContent = statusMsg;
            updateProgressIndicator(0, totalDuration / playbackSpeedFactor);
            console.log(`Playback speed factor set to: ${playbackSpeedFactor}`);
        });
    }
});
