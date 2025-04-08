// storage.js - LocalStorage for recordings

function getSavedRecordingsIndex() {
    const indexJson = localStorage.getItem(RECORDINGS_INDEX_KEY);
    try {
        return indexJson ? JSON.parse(indexJson) : [];
    } catch (e) {
        console.error("Error parsing recordings index from localStorage:", e);
        return [];
    }
}

function saveRecordingToIndex(name) {
    console.log(`Attempting to save name "${name}" to index.`);
    const index = getSavedRecordingsIndex();
    console.log("Current index before save:", index);
    
    if (!index.includes(name)) {
        index.push(name);
        index.sort();
        console.log("New index to save:", index);
        
        try {
            localStorage.setItem(RECORDINGS_INDEX_KEY, JSON.stringify(index));
            console.log(`Successfully saved name "${name}" to index.`);
            return true;
        } catch (e) {
            console.error(`Error saving recordings index to localStorage for name "${name}":`, e);
            alert(`Error saving recording index. Storage might be full or data corrupted.\nError: ${e.message}`);
            return false;
        }
    } else {
        console.log(`Name "${name}" already exists in index. No update needed.`);
        return true;
    }
}

function removeRecordingFromIndex(name) {
    let index = getSavedRecordingsIndex();
    index = index.filter(item => item !== name);
    
    try {
        localStorage.setItem(RECORDINGS_INDEX_KEY, JSON.stringify(index));
        return true;
    } catch (e) {
        console.error("Error saving updated recordings index:", e);
        alert("Error updating recording index.");
        return false;
    }
}

function populateRecordingsList() {
    if (!recordingSelect) return;
    
    const index = getSavedRecordingsIndex();
    
    while (recordingSelect.options.length > 1) {
        recordingSelect.remove(1);
    }
    
    index.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        recordingSelect.appendChild(option);
    });
    
    const hasRecordings = index.length > 0;
    loadRecBtn.disabled = !hasRecordings || recordingSelect.value === "";
    deleteRecBtn.disabled = !hasRecordings || recordingSelect.value === "";
    renameRecBtn.disabled = !hasRecordings || recordingSelect.value === "";
    recordingSelect.disabled = !hasRecordings;
    
    if (!hasRecordings) recordingSelect.value = "";
}

function getUniqueRecordingName(baseName) {
    const existingNames = getSavedRecordingsIndex();
    
    if (!existingNames.includes(baseName)) {
        return baseName;
    }
    
    let counter = 1;
    let uniqueName = `${baseName} (${counter})`;
    
    while (existingNames.includes(uniqueName)) {
        counter++;
        uniqueName = `${baseName} (${counter})`;
    }
    
    return uniqueName;
}

function saveCurrentRecording() {
    if (recordedEvents.length === 0) {
        alert("No recording data to save.");
        return;
    }
    
    const name = prompt("Enter a name for this recording:", `Rec-${Date.now()}`);
    
    if (!name || name.trim() === "") {
        alert("Invalid name. Recording not saved.");
        return;
    }
    
    const trimmedName = name.trim();
    const recordingKey = RECORDING_PREFIX + trimmedName;
    
    try {
        const jsonData = JSON.stringify(recordedEvents);
        localStorage.setItem(recordingKey, jsonData);
        
        if (saveRecordingToIndex(trimmedName)) {
            populateRecordingsList();
            recordingSelect.value = trimmedName;
            loadRecBtn.disabled = false;
            deleteRecBtn.disabled = false;
            renameRecBtn.disabled = false;
            recordingSelect.disabled = false;
            alert(`Recording "${trimmedName}" saved successfully!`);
        }
    } catch (e) {
        console.error("Error saving recording to localStorage:", e);
        alert("Failed to save recording. Storage might be full.");
        removeRecordingFromIndex(trimmedName);
        populateRecordingsList();
    }
}

function downloadCurrentRecording() {
    if (recordedEvents.length === 0) {
        alert("No recording data to download.");
        return;
    }
    
    const defaultFilename = `accordion-recording-${Date.now()}.json`;
    const filename = prompt("Enter filename to download:", defaultFilename);
    
    if (!filename || filename.trim() === "") {
        alert("Invalid filename.");
        return;
    }
    
    try {
        const jsonData = JSON.stringify(recordedEvents, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.endsWith('.json') ? filename : filename + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`Recording downloaded as ${a.download}`);
    } catch (e) {
        console.error("Error creating download link:", e);
        alert("Failed to prepare recording for download.");
    }
}

function loadSelectedRecording() {
    if (!recordingSelect || recordingSelect.value === "") {
        alert("Please select a recording to load.");
        return;
    }
    
    const name = recordingSelect.value;
    const recordingKey = RECORDING_PREFIX + name;
    const jsonData = localStorage.getItem(recordingKey);
    
    if (!jsonData) {
        alert(`Error: Recording "${name}" not found in storage.`);
        removeRecordingFromIndex(name);
        populateRecordingsList();
        return;
    }
    
    try {
        const loadedData = JSON.parse(jsonData);
        
        if (Array.isArray(loadedData)) {
            recordedEvents = loadedData;
            
            if (recordedEvents.length > 0) {
                recordingTotalDurationSeconds = recordedEvents.reduce(
                    (maxTime, event) => Math.max(maxTime, event.time), 0);
            } else {
                recordingTotalDurationSeconds = 0;
            }
            
            statusDiv.textContent = `Loaded recording: "${name}" (${recordedEvents.length} events, ${recordingTotalDurationSeconds.toFixed(1)}s).`;
            console.log(`Loaded recording "${name}"`);
            
            const hasRecording = recordedEvents.length > 0;
            playRecBtn.disabled = !hasRecording;
            saveRecBtn.disabled = !hasRecording;
            downloadRecBtn.disabled = !hasRecording;
            deleteRecBtn.disabled = false;
            renameRecBtn.disabled = false;
            stopRecBtn.disabled = true;
            recLoopCheckbox.disabled = !hasRecording;
            recLoopStartTimeInput.disabled = !hasRecording;
            recLoopEndTimeInput.disabled = !hasRecording;
            recLoopStartTimeInput.value = 0;
            recLoopEndTimeInput.value = recordingTotalDurationSeconds.toFixed(1);
            recLoopEndTimeInput.max = recordingTotalDurationSeconds.toFixed(1);
            recLoopStartTimeInput.max = recordingTotalDurationSeconds.toFixed(1);
            
            updateProgressIndicator(0, recordingTotalDurationSeconds / playbackSpeedFactor);
        } else {
            throw new Error("Invalid data format in localStorage.");
        }
    } catch (e) {
        console.error(`Error loading or parsing recording "${name}":`, e);
        alert(`Failed to load recording "${name}". It might be corrupted.`);
    }
}

function deleteSelectedRecording() {
    if (!recordingSelect || recordingSelect.value === "") {
        alert("Please select a recording to delete.");
        return;
    }
    
    const name = recordingSelect.value;
    
    if (!confirm(`Are you sure you want to delete recording "${name}"?`)) {
        return;
    }
    
    const recordingKey = RECORDING_PREFIX + name;
    
    try {
        localStorage.removeItem(recordingKey);
        
        if (removeRecordingFromIndex(name)) {
            populateRecordingsList();
            
            recordedEvents = [];
            recordingTotalDurationSeconds = 0;
            playRecBtn.disabled = true;
            saveRecBtn.disabled = true;
            downloadRecBtn.disabled = true;
            deleteRecBtn.disabled = recordingSelect.options.length <= 1;
            renameRecBtn.disabled = recordingSelect.options.length <= 1;
            recLoopCheckbox.disabled = true;
            recLoopStartTimeInput.disabled = true;
            recLoopEndTimeInput.disabled = true;
            recLoopStartTimeInput.value = 0;
            recLoopEndTimeInput.value = 0;
            stopRecBtn.disabled = true;
            
            statusDiv.textContent = `Recording "${name}" deleted.`;
            console.log(`Deleted recording "${name}"`);
            
            updateProgressIndicator(0, 0);
        }
    } catch (e) {
        console.error(`Error deleting recording "${name}":`, e);
        alert(`Failed to delete recording "${name}".`);
    }
}

function renameSelectedRecording() {
    if (!recordingSelect || recordingSelect.value === "") {
        alert("Please select a recording to rename.");
        return;
    }
    
    const oldName = recordingSelect.value;
    const newName = prompt(`Enter new name for "${oldName}":`, oldName);
    
    if (!newName || newName.trim() === "" || newName.trim() === oldName) {
        alert("Invalid or unchanged name. Rename cancelled.");
        return;
    }
    
    const trimmedNewName = newName.trim();
    const oldKey = RECORDING_PREFIX + oldName;
    const newKey = RECORDING_PREFIX + trimmedNewName;
    const index = getSavedRecordingsIndex();
    
    if (index.includes(trimmedNewName)) {
        alert(`A recording named "${trimmedNewName}" already exists. Please choose a different name.`);
        return;
    }
    
    const jsonData = localStorage.getItem(oldKey);
    
    if (!jsonData) {
        alert(`Error: Original recording "${oldName}" not found.`);
        removeRecordingFromIndex(oldName);
        populateRecordingsList();
        return;
    }
    
    try {
        localStorage.setItem(newKey, jsonData);
        localStorage.removeItem(oldKey);
        
        if (removeRecordingFromIndex(oldName)) {
            if (saveRecordingToIndex(trimmedNewName)) {
                populateRecordingsList();
                recordingSelect.value = trimmedNewName;
                statusDiv.textContent = `Renamed "${oldName}" to "${trimmedNewName}".`;
                console.log(`Renamed "${oldName}" to "${trimmedNewName}"`);
            } else {
                alert("Error updating recording index after rename.");
            }
        } else {
            alert("Error removing old name from index during rename.");
            localStorage.removeItem(newKey);
        }
    } catch (e) {
        console.error(`Error renaming recording:`, e);
        alert("Failed to rename recording. Storage might be full or data corrupted.");
        
        if (!localStorage.getItem(oldKey) && localStorage.getItem(newKey)) {
            localStorage.removeItem(newKey);
        }
        
        populateRecordingsList();
    }
}

// File Storage Related Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Other Recording Buttons
    if (saveRecBtn) {
        saveRecBtn.addEventListener('click', saveCurrentRecording);
    }
    
    if (downloadRecBtn) {
        downloadRecBtn.addEventListener('click', downloadCurrentRecording);
    }
    
    if (loadRecBtn) {
        loadRecBtn.addEventListener('click', loadSelectedRecording);
    }
    
    if (deleteRecBtn) {
        deleteRecBtn.addEventListener('click', deleteSelectedRecording);
    }
    
    if (renameRecBtn) {
        renameRecBtn.addEventListener('click', renameSelectedRecording);
    }
    
    if (recordingSelect) {
        recordingSelect.addEventListener('change', () => {
            const hasSelection = recordingSelect.value !== "";
            deleteRecBtn.disabled = !hasSelection;
            loadRecBtn.disabled = !hasSelection;
            renameRecBtn.disabled = !hasSelection;
        });
    }
    
    if (loadRecFileInput) {
        loadRecFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const fileContent = e.target.result;
                    const parsedData = JSON.parse(fileContent);
                    
                    if (Array.isArray(parsedData)) {
                        recordedEvents = parsedData;
                        
                        if (recordedEvents.length > 0) {
                            recordingTotalDurationSeconds = recordedEvents.reduce(
                                (maxTime, event) => Math.max(maxTime, event.time), 0);
                            
                            const fileName = file.name.replace(/\.json$/, '');
                            const baseName = fileName || `Imported-${Date.now()}`;
                            const uniqueName = getUniqueRecordingName(baseName);
                            
                            const saveConfirm = confirm(`Recording imported (${recordedEvents.length} events, ${recordingTotalDurationSeconds.toFixed(1)}s).\n\nDo you want to save it as "${uniqueName}"?`);
                            
                            if (saveConfirm) {
                                const recordingKey = RECORDING_PREFIX + uniqueName;
                                
                                try {
                                    localStorage.setItem(recordingKey, JSON.stringify(recordedEvents));
                                    
                                    if (saveRecordingToIndex(uniqueName)) {
                                        populateRecordingsList();
                                        recordingSelect.value = uniqueName;
                                        statusDiv.textContent = `Imported and saved as "${uniqueName}".`;
                                    } else {
                                        localStorage.removeItem(recordingKey);
                                        statusDiv.textContent = "Imported but not saved.";
                                    }
                                } catch (err) {
                                    console.error("Error saving imported recording:", err);
                                    alert("Imported but could not save (storage might be full).");
                                    statusDiv.textContent = "Imported but not saved.";
                                }
                            } else {
                                statusDiv.textContent = "Recording imported but not saved.";
                            }
                            
                            playRecBtn.disabled = false;
                            saveRecBtn.disabled = false;
                            downloadRecBtn.disabled = false;
                            recLoopCheckbox.disabled = false;
                            recLoopStartTimeInput.disabled = false;
                            recLoopEndTimeInput.disabled = false;
                            recLoopStartTimeInput.value = 0;
                            recLoopEndTimeInput.value = recordingTotalDurationSeconds.toFixed(1);
                            recLoopEndTimeInput.max = recordingTotalDurationSeconds.toFixed(1);
                            recLoopStartTimeInput.max = recordingTotalDurationSeconds.toFixed(1);
                            
                            updateProgressIndicator(0, recordingTotalDurationSeconds / playbackSpeedFactor);
                        } else {
                            alert("Imported file contains no events.");
                            statusDiv.textContent = "Imported file contains no events.";
                        }
                    } else {
                        throw new Error("Invalid recording data format.");
                    }
                } catch (error) {
                    console.error("Error parsing imported file:", error);
                    alert(`Error importing file: ${error.message}`);
                    statusDiv.textContent = "Error importing file.";
                }
                
                loadRecFileInput.value = '';
            };
            
            reader.onerror = () => {
                console.error("Error reading file:", reader.error);
                alert("Error reading file.");
                statusDiv.textContent = "Error reading file.";
                loadRecFileInput.value = '';
            };
            
            reader.readAsText(file);
        });
    }
});
