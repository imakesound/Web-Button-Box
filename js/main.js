// main.js - Core initialization and global variables
console.log("Button Accordion - Preset XML Loading v1.9");

// --- Note Mappings ---
const fbeNoteMapping = {
    'B1':{push:62,pull:60},'B2':{push:56,pull:54},'B3':{push:59,pull:64},'B4':{push:63,pull:61},'B5':{push:65,pull:66},
    'B6':{push:68,pull:70},'B7':{push:71,pull:73},'B8':{push:75,pull:78},'B9':{push:77,pull:82},'B10':{push:80,pull:85},
    'B11':{push:83,pull:90},'B12':{push:67,pull:65},'B13':{push:58,pull:54},'B14':{push:61,pull:59},'B15':{push:64,pull:63},
    'B16':{push:68,pull:66},'B17':{push:70,pull:71},'B18':{push:73,pull:75},'B19':{push:76,pull:78},'B20':{push:80,pull:83},
    'B21':{push:82,pull:87},'B22':{push:85,pull:90},'B23':{push:88,pull:95},'B24':{push:72,pull:74},'B25':{push:63,pull:59},
    'B26':{push:66,pull:64},'B27':{push:69,pull:68},'B28':{push:73,pull:71},'B29':{push:75,pull:76},'B30':{push:78,pull:80},
    'B31':{push:81,pull:83},'B32':{push:85,pull:88},'B33':{push:87,pull:92},'B34':{push:90,pull:95}
};

const gcfNoteMapping = {
    'B1':{push:55,pull:59},'B2':{push:57,pull:61},'B3':{push:59,pull:63},'B4':{push:60,pull:65},'B5':{push:62,pull:67},
    'B6':{push:64,pull:69},'B7':{push:66,pull:71},'B8':{push:67,pull:73},'B9':{push:69,pull:75},'B10':{push:71,pull:77},
    'B11':{push:72,pull:79},'B12':{push:60,pull:64},'B13':{push:62,pull:66},'B14':{push:64,pull:68},'B15':{push:65,pull:70},
    'B16':{push:67,pull:72},'B17':{push:69,pull:74},'B18':{push:71,pull:76},'B19':{push:72,pull:78},'B20':{push:74,pull:80},
    'B21':{push:76,pull:82},'B22':{push:77,pull:84},'B23':{push:79,pull:86},'B24':{push:65,pull:69},'B25':{push:67,pull:71},
    'B26':{push:69,pull:73},'B27':{push:70,pull:75},'B28':{push:72,pull:77},'B29':{push:74,pull:79},'B30':{push:76,pull:81},
    'B31':{push:77,pull:83},'B32':{push:79,pull:85},'B33':{push:81,pull:87},'B34':{push:82,pull:88}
};

// Define Preset XML Files
const presetXmlFiles = [
    { title: "Example Song 1", path: "xml/example1.musicxml" },
    { title: "Example Song 2", path: "xml/example2.xml" },
    // Add more presets here: { title: "Your Song Title", path: "xml/your_song_file.xml" },
];

// --- Global Variables ---
let audioContext;
let audioBuffers = {};
let activeManualSources = {};
let activePlaybackNotes = new Map();
let isPointerDown = false;
const activeTouches = new Map();
let currentBellowsMode = 'push';
let currentToneName = 'FBE';
let activeNoteMapping = fbeNoteMapping;
let osmd;
let scoreNotes = [];
let allParsedNotes = [];
let isPlaying = false; // MusicXML playback flag
let tempo = 120;
let isScoreLoaded = false;
let currentScoreTitle = ""; // To store the title of the loaded score
let playbackStartTime = 0; // MusicXML playback start time ref
let visualTimeoutIds = []; // MusicXML visual timeouts
let playbackSpeedFactor = 1.0;
let progressUpdateId = null; // MusicXML progress animation frame ID
let parsedLastNoteEndTime1x = 0;
let currentLoopStartTime1x = 0;
let currentLoopEndTime1x = 0;
let totalMeasures = 0;

// --- Recorder State ---
let isRecording = false;
let recordingStartTime = 0;
let recordedEvents = [];
let isRecordingPlayback = false; // Recording playback flag
let recordingPlaybackStartTime = 0; // Recording playback start time ref
let recordingVisualTimeoutIds = []; // Recording visual timeouts
let recordingProgressUpdateId = null; // Recording progress animation frame ID
let recordingTotalDurationSeconds = 0; // Full duration of the loaded recording
let currentRecordingSegmentStartTimeSec = 0; // Start time of the segment being played/looped
let currentRecordingSegmentEndTimeSec = 0; // End time of the segment being played/looped
const RECORDINGS_INDEX_KEY = 'accordionRecordingsIndex';
const RECORDING_PREFIX = 'accordionRecording_';

// Element References
let loadingIndicator, board, bellowsToggle, toneSelect, themeSelect, body,
    musicSheetArea, toggleSheetBtn, osmdContainer, fileInput,
    xmlPresetSelect, loadPresetBtn,
    playBtn, playSubBtn, stopBtn, loopCheckbox,
    loopStartMeasureInput, loopEndMeasureInput,
    recordBtn, playRecBtn, stopRecBtn,
    recLoopCheckbox, recLoopStartTimeInput, recLoopEndTimeInput,
    saveRecBtn, downloadRecBtn,
    recordingSelect, loadRecBtn, deleteRecBtn, renameRecBtn,
    loadRecFileInput,
    statusDiv, speedSlider, speedDisplay, buttons, customHighlight, progressDisplayElement;

// --- Utility Function for Time Formatting ---
function formatTime(totalSeconds) {
    if (isNaN(totalSeconds) || !isFinite(totalSeconds) || totalSeconds < 0) {
        return "--:--";
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// --- Wait for DOM Ready ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed.");

    // --- Get Element References ---
    buttons = document.querySelectorAll('.acc-button');
    loadingIndicator = document.getElementById('loading-indicator');
    board = document.querySelector('.button-board');
    bellowsToggle = document.getElementById('bellows-toggle');
    toneSelect = document.getElementById('tone-select');
    themeSelect = document.getElementById('theme-select');
    body = document.body;
    musicSheetArea = document.getElementById('music-sheet-area');
    toggleSheetBtn = document.getElementById('toggle-sheet-music');
    osmdContainer = document.getElementById('osmd-container');
    fileInput = document.getElementById('musicxml-file');
    xmlPresetSelect = document.getElementById('xml-preset-select');
    loadPresetBtn = document.getElementById('load-preset-btn');
    playBtn = document.getElementById('play-btn');
    playSubBtn = document.getElementById('play-sub-btn');
    stopBtn = document.getElementById('stop-btn');
    loopCheckbox = document.getElementById('loop-checkbox');
    loopStartMeasureInput = document.getElementById('loop-start-measure');
    loopEndMeasureInput = document.getElementById('loop-end-measure');
    recordBtn = document.getElementById('record-btn');
    playRecBtn = document.getElementById('play-rec-btn');
    stopRecBtn = document.getElementById('stop-rec-btn');
    recLoopCheckbox = document.getElementById('rec-loop-checkbox');
    recLoopStartTimeInput = document.getElementById('rec-loop-start-time');
    recLoopEndTimeInput = document.getElementById('rec-loop-end-time');
    saveRecBtn = document.getElementById('save-rec-btn');
    downloadRecBtn = document.getElementById('download-rec-btn');
    recordingSelect = document.getElementById('recording-select');
    loadRecBtn = document.getElementById('load-rec-btn');
    deleteRecBtn = document.getElementById('delete-rec-btn');
    renameRecBtn = document.getElementById('rename-rec-btn');
    loadRecFileInput = document.getElementById('load-rec-file-input');
    statusDiv = document.getElementById('playback-status');
    progressDisplayElement = document.getElementById('playback-progress-display');
    speedSlider = document.getElementById('speed-slider');
    speedDisplay = document.getElementById('speed-display');
    customHighlight = document.getElementById('custom-highlight');
    console.log("Element references obtained.");

    // Check crucial elements
    if (!osmdContainer) { 
        console.error("CRITICAL: #osmd-container element NOT FOUND!"); 
        return; 
    }
    if (!customHighlight) { 
        console.warn("WARNING: #custom-highlight element NOT FOUND! Highlight disabled."); 
    }
    if (!toneSelect) { 
        console.error("CRITICAL: #tone-select element NOT FOUND!"); 
    }
    else { 
        toneSelect.value = currentToneName; 
        activeNoteMapping = (currentToneName === 'GCF') ? gcfNoteMapping : fbeNoteMapping; 
        console.log(`Initial active note mapping set to: ${currentToneName}`); 
    }
    if (!progressDisplayElement) { 
        console.error("CRITICAL: #playback-progress-display element NOT FOUND!"); 
    }
    if (!loopCheckbox || !loopStartMeasureInput || !loopEndMeasureInput) { 
        console.warn("Music loop control elements not found."); 
    }
    if (!recordBtn || !playRecBtn || !stopRecBtn || !recLoopCheckbox || !recLoopStartTimeInput || 
        !recLoopEndTimeInput || !saveRecBtn || !downloadRecBtn || !recordingSelect || 
        !loadRecBtn || !deleteRecBtn || !renameRecBtn || !loadRecFileInput) { 
        console.error("CRITICAL: One or more recorder UI elements not found!"); 
    }
    if (!xmlPresetSelect || !loadPresetBtn) { 
        console.error("CRITICAL: Preset XML UI elements not found!"); 
    }
    console.log("Crucial element checks done.");

    // --- Initialize Audio Context ---
    initAudioContext();
    console.log("Audio Context Init called.");

    // --- Initialize OSMD ---
    try {
        osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(osmdContainer, { 
            autoResize: true, 
            backend: "svg", 
            drawTitle: true, 
            drawMeasureNumbers: true 
        });
        console.log("OSMD Initialized (v1.8.4).");
        setTimeout(() => { 
            if (osmd && osmd.cursor) osmd.cursor.hide(); 
        }, 100);
    }
    catch (e) { 
        console.error("Error initializing OSMD:", e); 
        statusDiv.textContent = "Error initializing Sheet Music Display."; 
        if(fileInput) fileInput.disabled = true; 
        if(playBtn) playBtn.disabled = true; 
        if(playSubBtn) playSubBtn.disabled = true; 
        if(toggleSheetBtn) toggleSheetBtn.disabled = true; 
        if(xmlPresetSelect) xmlPresetSelect.disabled = true; 
        if(loadPresetBtn) loadPresetBtn.disabled = true; 
    }
    console.log("OSMD Init done.");

    // --- Populate Recordings List on Load ---
    populateRecordingsList();
    console.log("Recordings list populated.");

    // --- Populate Preset XML Dropdown ---
    if (xmlPresetSelect) {
        presetXmlFiles.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.path;
            option.textContent = preset.title;
            xmlPresetSelect.appendChild(option);
        });
        console.log("Preset XML dropdown populated.");
    }

    // --- Initial Setup ---
    if(musicSheetArea) musicSheetArea.classList.add('hidden');
    if(toggleSheetBtn) toggleSheetBtn.textContent = "Show Music";
    if(progressDisplayElement) progressDisplayElement.textContent = '--:-- / --:--';
    if(renameRecBtn) renameRecBtn.disabled = true;
    console.log("Initial setup complete.");

    // Setup event listeners is moved to dedicated files
});
