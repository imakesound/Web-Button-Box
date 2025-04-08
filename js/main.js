// main.js - Core initialization and global variables
console.log("Button Accordion - UI Revamp v5.0 (Separate Speed Vars)"); // Keep version or update as needed

// --- Note Mappings ---
// *** COMPLETE FBE MAPPING ***
const fbeNoteMapping = {
    'B1':{push:62,pull:60}, 'B2':{push:56,pull:54}, 'B3':{push:59,pull:64}, 'B4':{push:63,pull:61}, 'B5':{push:65,pull:66},
    'B6':{push:68,pull:70}, 'B7':{push:71,pull:73}, 'B8':{push:75,pull:78}, 'B9':{push:77,pull:82}, 'B10':{push:80,pull:85},
    'B11':{push:83,pull:90}, 'B12':{push:67,pull:65}, 'B13':{push:58,pull:54}, 'B14':{push:61,pull:59}, 'B15':{push:64,pull:63},
    'B16':{push:68,pull:66}, 'B17':{push:70,pull:71}, 'B18':{push:73,pull:75}, 'B19':{push:76,pull:78}, 'B20':{push:80,pull:83},
    'B21':{push:82,pull:87}, 'B22':{push:85,pull:90}, 'B23':{push:88,pull:95}, 'B24':{push:72,pull:74}, 'B25':{push:63,pull:59},
    'B26':{push:66,pull:64}, 'B27':{push:69,pull:68}, 'B28':{push:73,pull:71}, 'B29':{push:75,pull:76}, 'B30':{push:78,pull:80},
    'B31':{push:81,pull:83}, 'B32':{push:85,pull:88}, 'B33':{push:87,pull:92}, 'B34':{push:90,pull:95}
};

// *** COMPLETE GCF MAPPING ***
const gcfNoteMapping = {
    'B1':{push:55,pull:59}, 'B2':{push:57,pull:61}, 'B3':{push:59,pull:63}, 'B4':{push:60,pull:65}, 'B5':{push:62,pull:67},
    'B6':{push:64,pull:69}, 'B7':{push:66,pull:71}, 'B8':{push:67,pull:73}, 'B9':{push:69,pull:75}, 'B10':{push:71,pull:77},
    'B11':{push:72,pull:79}, 'B12':{push:60,pull:64}, 'B13':{push:62,pull:66}, 'B14':{push:64,pull:68}, 'B15':{push:65,pull:70},
    'B16':{push:67,pull:72}, 'B17':{push:69,pull:74}, 'B18':{push:71,pull:76}, 'B19':{push:72,pull:78}, 'B20':{push:74,pull:80},
    'B21':{push:76,pull:82}, 'B22':{push:77,pull:84}, 'B23':{push:79,pull:86}, 'B24':{push:65,pull:69}, 'B25':{push:67,pull:71},
    'B26':{push:69,pull:73}, 'B27':{push:70,pull:75}, 'B28':{push:72,pull:77}, 'B29':{push:74,pull:79}, 'B30':{push:76,pull:81},
    'B31':{push:77,pull:83}, 'B32':{push:79,pull:85}, 'B33':{push:81,pull:87}, 'B34':{push:82,pull:88}
};

// --- Preset XML Files (Example - use your actual presets) ---
const presetXmlFiles = [
    { title: "Example Song 1", path: "xml/example1.musicxml" },
{ title: "Example Song 2", path: "xml/example2.xml" },
];

// --- Global Variables ---
let audioContext;
let audioBuffers = {};
let activeManualSources = {};
let activePlaybackNotes = new Map();
let isPointerDown = false;
const activeTouches = new Map();
let currentBellowsMode = 'push';
let currentToneName = 'FBE'; // Default tone
let activeNoteMapping = fbeNoteMapping; // Default mapping (NOW USES FULL MAP)
let osmd;
let scoreNotes = [];
let allParsedNotes = [];
let isPlaying = false; // MusicXML playback flag
let tempo = 120; // Default tempo, will be updated from score
let isScoreLoaded = false;
let currentScoreTitle = ""; // Title of the loaded score
let playbackStartTime = 0; // Reference for music playback timing
let visualTimeoutIds = []; // Store timeouts for music playback visuals
// SEPARATE Speed Factors
let musicPlaybackSpeedFactor = 1.0;
let recordingPlaybackSpeedFactor = 1.0;
let progressUpdateId = null; // requestAnimationFrame ID for music progress
let parsedLastNoteEndTime1x = 0; // Duration of the parsed score at 1x speed
let currentLoopStartTime1x = 0; // Start time (1x) for music loop segment
let currentLoopEndTime1x = 0; // End time (1x) for music loop segment
let totalMeasures = 0; // Total measures in the score

// --- Recorder State ---
let isRecording = false;
let recordingStartTime = 0;
let recordedEvents = [];
let isRecordingPlayback = false;
let recordingPlaybackStartTime = 0;
let recordingVisualTimeoutIds = [];
let recordingProgressUpdateId = null;
let recordingTotalDurationSeconds = 0;
let currentRecordingSegmentStartTimeSec = 0;
let currentRecordingSegmentEndTimeSec = 0;
const RECORDINGS_INDEX_KEY = 'accordionRecordingsIndex';
const RECORDING_PREFIX = 'accordionRecording_';

// --- Element References ---
// (Keep the rest of the variable declarations as they were)
let loadingIndicator, board, bellowsToggle, toneSelect, themeSelect, body,
musicSheetArea, toggleSheetBtn, osmdContainer, fileInput,
xmlPresetSelect, loadPresetBtn,
playBtn, playSubBtn, stopBtn, loopCheckbox,
loopStartMeasureInput, loopEndMeasureInput,
recordBtn, playRecBtn, stopRecBtn,
recLoopCheckbox, recLoopStartTimeInput, recLoopEndTimeInput,
saveRecBtn, downloadRecBtn,
recordingSelect, loadRecBtn, deleteRecBtn, renameRecBtn,
loadRecFileInput, loadRecFileLabel,
statusDiv, progressDisplayElement,
speedSlider, speedDisplay, recSpeedSlider, recSpeedDisplay,
buttons, customHighlight,
sidebarToggleBtn, controlsSidebar;

// --- Utility Function for Time Formatting (Unchanged) ---
function formatTime(totalSeconds) { /* ... */ }

// --- Wait for DOM Ready ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed.");

    // --- Get Element References ---
    // (Keep all the getElementById/querySelectorAll calls as they were)
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
    loadRecFileLabel = document.getElementById('load-rec-file-label');
    statusDiv = document.getElementById('playback-status');
    progressDisplayElement = document.getElementById('playback-progress-display');
    speedSlider = document.getElementById('speed-slider');
    speedDisplay = document.getElementById('speed-display');
    recSpeedSlider = document.getElementById('rec-speed-slider');
    recSpeedDisplay = document.getElementById('rec-speed-display');
    customHighlight = document.getElementById('custom-highlight');
    sidebarToggleBtn = document.getElementById('sidebar-toggle');
    controlsSidebar = document.getElementById('controls-sidebar');
    console.log("Element references obtained.");

    // --- Check crucial elements ---
    // (Keep checks as they were)
    if (!sidebarToggleBtn || !controlsSidebar) console.error("CRITICAL: Sidebar elements not found!");
    if (!speedSlider || !speedDisplay) console.error("CRITICAL: Music speed slider elements not found!");
    if (!recSpeedSlider || !recSpeedDisplay) console.error("CRITICAL: Recording speed slider elements not found!");
    if (!osmdContainer) console.error("CRITICAL: #osmd-container element NOT FOUND!");
    if (!statusDiv) console.error("CRITICAL: #playback-status element NOT FOUND!");
    if (!progressDisplayElement) console.error("CRITICAL: #playback-progress-display element NOT FOUND!");


    // --- Initialize Audio Context ---
    initAudioContext(); // Assumes this function exists in audio-engine.js
    console.log("Audio Context Init called.");

    // --- Initialize OSMD (Sheet Music Display) ---
    try {
        osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(osmdContainer, { /* ... options ... */ });
        console.log("OSMD Initialized.");
        setTimeout(() => { if (osmd?.cursor) osmd.cursor.hide(); }, 100);
    }
    catch (e) { /* ... error handling ... */ }
    console.log("OSMD Init attempt done.");

    // --- Populate Recordings List on Load ---
    populateRecordingsList(); // Assumes this function exists in storage.js
    console.log("Recordings list populated.");

    // --- Populate Preset XML Dropdown ---
    if (xmlPresetSelect) { /* ... populate ... */ }
    console.log("Preset XML dropdown populated.");

    // --- Initial UI State ---
    // (Keep initial state settings as they were)
    if(musicSheetArea) musicSheetArea.classList.add('hidden');
    if(toggleSheetBtn) toggleSheetBtn.textContent = "Show Music";
    if(progressDisplayElement) progressDisplayElement.textContent = '--:-- / --:--';
    if(speedDisplay) speedDisplay.textContent = `${musicPlaybackSpeedFactor.toFixed(2)}x`;
    if(recSpeedDisplay) recSpeedDisplay.textContent = `${recordingPlaybackSpeedFactor.toFixed(2)}x`;
    if(renameRecBtn) renameRecBtn.disabled = recordingSelect?.value === "";
    if(deleteRecBtn) deleteRecBtn.disabled = recordingSelect?.value === "";
    if(loadRecBtn) loadRecBtn.disabled = recordingSelect?.value === "";
    if(loadingIndicator) loadingIndicator.style.display = 'none';


    // --- Sidebar Toggle Logic (Mobile Overlay) ---
    // (Keep toggle logic as it was)
    if (sidebarToggleBtn && controlsSidebar) {
        console.log("Attaching sidebar overlay toggle listener.");
        sidebarToggleBtn.addEventListener('click', (e) => {
            console.log("Sidebar toggle button clicked.");
            controlsSidebar.classList.toggle('open');
            console.log("Sidebar 'open' class toggled. Current classes:", controlsSidebar.className);
        });
        document.addEventListener('click', (event) => {
            if (controlsSidebar.classList.contains('open') && !controlsSidebar.contains(event.target) && !sidebarToggleBtn.contains(event.target) && window.matchMedia('(max-width: 767px)').matches) {
                console.log("Click outside sidebar detected on mobile, closing.");
                controlsSidebar.classList.remove('open');
            }
        });
    } else { console.error("Could not attach sidebar toggle listener - elements missing."); }

    console.log("Initial setup complete.");
});

// --- Add the 'open' class style dynamically ---
// (Keep this style injection as it was)
const styleSheet = document.createElement("style");
styleSheet.innerText = `#controls-sidebar.open { transform: translateX(0); }`;
document.head.appendChild(styleSheet);

// --- Stubs ---
// Remove any stubs you might have added here earlier
// function initAudioContext() { console.log("stub: initAudioContext called"); }
// function populateRecordingsList() { console.log("stub: populateRecordingsList called"); }
