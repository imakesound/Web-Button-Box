// preset-loader.js - XML preset loading

async function loadXmlFromUrl(url, title) {
    if (!osmd) {
        console.error("OSMD not initialized. Cannot load preset.");
        statusDiv.textContent = "Error: Sheet music display not ready.";
        return;
    }
    
    console.log(`Attempting to load preset: ${title} from ${url}`);
    statusDiv.textContent = `Loading ${title}...`;
    
    playBtn.disabled = true;
    playSubBtn.disabled = true;
    stopBtn.disabled = true;
    loadPresetBtn.disabled = true;
    xmlPresetSelect.disabled = true;
    isScoreLoaded = false;
    scoreNotes = [];
    allParsedNotes = [];
    parsedLastNoteEndTime1x = 0;
    totalMeasures = 0;
    currentScoreTitle = "";
    
    if (progressDisplayElement) progressDisplayElement.textContent = '--:-- / --:--';
    if (loopStartMeasureInput) loopStartMeasureInput.value = 1;
    if (loopEndMeasureInput) loopEndMeasureInput.value = 1;
    if (loopEndMeasureInput) loopEndMeasureInput.max = 1;

    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${url}`);
        }
        
        const fileContent = await response.text();

        statusDiv.textContent = `Rendering ${title}...`;
        
        while (osmdContainer.firstChild && osmdContainer.firstChild !== customHighlight) {
            osmdContainer.removeChild(osmdContainer.firstChild);
        }
        
        if (customHighlight && !osmdContainer.contains(customHighlight)) {
            osmdContainer.appendChild(customHighlight);
        }

        await osmd.load(fileContent);
        osmd.render();
        statusDiv.textContent = `Loaded: ${title}. Parsing...`;
        console.log(`Preset MusicXML "${title}" loaded and rendered.`);
        
        if (!osmd.cursor) {
            console.error("OSMD cursor not available after rendering.");
            statusDiv.textContent = "Error: Cursor initialization failed.";
            return;
        }
        
        osmd.cursor.hide();
        isScoreLoaded = true;
        currentScoreTitle = title;

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

        statusDiv.textContent = `Ready (${currentToneName}): ${title}`;
        
        if (!canPlayStrict && canPlaySub) {
            statusDiv.textContent = `Ready (${currentToneName}, subs only): ${title}`;
        }
        else if (!canPlayStrict && !canPlaySub) {
            statusDiv.textContent = `No playable notes found in ${title} for ${currentToneName} mapping.`;
        }

    } catch (error) {
        console.error(`Error loading preset XML from ${url}:`, error);
        statusDiv.textContent = `Error loading preset: ${error.message}`;
        playBtn.disabled = true;
        playSubBtn.disabled = true;
        stopBtn.disabled = true;
        isScoreLoaded = false;
        scoreNotes = [];
        allParsedNotes = [];
        currentScoreTitle = "";
    } finally {
        loadPresetBtn.disabled = false;
        xmlPresetSelect.disabled = false;
    }
}

// Preset XML Load Button Listener
document.addEventListener('DOMContentLoaded', () => {
    if (loadPresetBtn && xmlPresetSelect) {
        loadPresetBtn.addEventListener('click', () => {
            const selectedPath = xmlPresetSelect.value;
            const selectedOption = xmlPresetSelect.options[xmlPresetSelect.selectedIndex];
            const selectedTitle = selectedOption ? selectedOption.textContent : 'Preset';
            
            if (selectedPath) {
                // Call the function to load from URL
                loadXmlFromUrl(selectedPath, selectedTitle);
            } else {
                alert("Please select a preset XML file from the dropdown.");
            }
        });
    }
});
