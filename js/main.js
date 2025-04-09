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

// --- Preset XML Files ---
// Define your preset files here.
// Ensure the 'path' is correct relative to index.html (e.g., 'xml/your_song.xml')
// Ensure the actual files exist in an 'xml' folder at the same level as index.html
const presetXmlFiles = [
    { title: "Example Song 1", path: "xml/example1.musicxml" },
    { title: "Example Song 2", path: "xml/example2.xml" },
    // Add more objects like the ones above for each preset file in your 'xml' directory
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
let activeNoteMapping = fbeNoteMapping; // Default mapping
let osmd; // OpenSheetMusicDisplay instance
let scoreNotes = []; // Parsed notes strictly matching the mapping
let allParsedNotes = []; // Parsed notes including substitutions
let isPlaying = false; // MusicXML playback flag
let tempo = 120; // Default tempo, will be updated from score
let isScoreLoaded = false; // Flag if a score is loaded
let currentScoreTitle = ""; // Title of the loaded score
let playbackStartTime = 0; // Reference for music playback timing
let visualTimeoutIds = []; // Store timeouts for music playback visuals
// SEPARATE Speed Factors
let musicPlaybackSpeedFactor = 1.0; // Speed for MusicXML playback
let recordingPlaybackSpeedFactor = 1.0; // Speed for recording playback
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
const RECORDINGS_INDEX_KEY = 'accordionRecordingsIndex'; // localStorage key for index
const RECORDING_PREFIX = 'accordionRecording_'; // localStorage key prefix for recordings

// --- Element References ---
// Declare variables for DOM elements
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

// --- Utility Function for Time Formatting ---
/**
 * Formats seconds into MM:SS format.
 * @param {number} totalSeconds - Total seconds.
 * @returns {string} - Formatted time string.
 */
function formatTime(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) {
        return "--:--";
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// --- Wait for DOM Ready ---
// Executes when the HTML document is fully loaded and parsed.
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed.");

    // --- Get Element References ---
    // Assign DOM elements to variables
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
    xmlPresetSelect = document.getElementById('xml-preset-select'); // Preset dropdown
    loadPresetBtn = document.getElementById('load-preset-btn'); // Preset load button
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
    // Log errors if essential elements are missing
    if (!sidebarToggleBtn || !controlsSidebar) console.error("CRITICAL: Sidebar elements not found!");
    if (!speedSlider || !speedDisplay) console.error("CRITICAL: Music speed slider elements not found!");
    if (!recSpeedSlider || !recSpeedDisplay) console.error("CRITICAL: Recording speed slider elements not found!");
    if (!osmdContainer) console.error("CRITICAL: #osmd-container element NOT FOUND!");
    if (!statusDiv) console.error("CRITICAL: #playback-status element NOT FOUND!");
    if (!progressDisplayElement) console.error("CRITICAL: #playback-progress-display element NOT FOUND!");


    // --- Initialize Audio Context ---
    // Function assumed to be in audio-engine.js
    initAudioContext();
    console.log("Audio Context Init called.");

    // --- Initialize OSMD (Sheet Music Display) ---
    try {
        // Options for OSMD rendering
        osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(osmdContainer, {
            autoResize: true, // Adjust automatically on container resize
            backend: "svg", // Rendering engine
            drawTitle: true, // Display the score title
            // drawingParameters: "compact", // Try different rendering styles if needed
            followCursor: true, // Make the view follow the playback cursor
            // Add other OSMD options as needed
        });
        console.log("OSMD Initialized.");
        // Hide cursor initially
        setTimeout(() => { if (osmd?.cursor) osmd.cursor.hide(); }, 100);
    }
    catch (e) {
        console.error("Error initializing OSMD:", e);
        if(osmdContainer) osmdContainer.textContent = "Error initializing sheet music display.";
    }
    console.log("OSMD Init attempt done.");

    // --- Populate Recordings List on Load ---
    // Function assumed to be in storage.js
    populateRecordingsList();
    console.log("Recordings list populated.");

    // --- Populate Preset XML Dropdown --- // <<< --- MODIFIED/ADDED BLOCK --- >>>
    // Check if the dropdown element and the preset list exist
    if (xmlPresetSelect && typeof presetXmlFiles !== 'undefined' && presetXmlFiles.length > 0) {
        console.log(`Populating preset dropdown with ${presetXmlFiles.length} items...`);
        // Loop through the defined presets
        presetXmlFiles.forEach(preset => {
            // Create a new <option> element
            const option = document.createElement('option');
            option.value = preset.path; // Set the option value to the file path
            option.textContent = preset.title; // Set the display text to the title
            // Add the new option to the dropdown
            xmlPresetSelect.appendChild(option);
        });
        console.log("Preset XML dropdown populated."); // Log success
    } else if (xmlPresetSelect) {
         // Log if dropdown exists but no presets are defined
         console.log("Preset XML dropdown found, but no presets defined in presetXmlFiles array.");
    } else {
         // Log error if the dropdown element itself is missing
         console.error("Preset XML dropdown element (#xml-preset-select) not found.");
    }
    // <<< --- END OF MODIFIED/ADDED BLOCK --- >>>

    // --- Initial UI State ---
    // Set default states for UI elements
    if(musicSheetArea) musicSheetArea.classList.add('hidden'); // Start with sheet music hidden
    if(toggleSheetBtn) toggleSheetBtn.textContent = "Show Music";
    if(progressDisplayElement) progressDisplayElement.textContent = '--:-- / --:--';
    if(speedDisplay) speedDisplay.textContent = `${musicPlaybackSpeedFactor.toFixed(2)}x`;
    if(recSpeedDisplay) recSpeedDisplay.textContent = `${recordingPlaybackSpeedFactor.toFixed(2)}x`;
    // Disable recording management buttons if no recording is selected initially
    if(renameRecBtn) renameRecBtn.disabled = recordingSelect?.value === "";
    if(deleteRecBtn) deleteRecBtn.disabled = recordingSelect?.value === "";
    if(loadRecBtn) loadRecBtn.disabled = recordingSelect?.value === "";
    if(loadingIndicator) loadingIndicator.style.display = 'none'; // Hide loading indicator


    // --- Sidebar Toggle Logic (Mobile Overlay) ---
    // Handles showing/hiding the controls sidebar on mobile
    if (sidebarToggleBtn && controlsSidebar) {
        console.log("Attaching sidebar overlay toggle listener.");
        // Toggle 'open' class on button click
        sidebarToggleBtn.addEventListener('click', (e) => {
            console.log("Sidebar toggle button clicked.");
            controlsSidebar.classList.toggle('open');
            console.log("Sidebar 'open' class toggled. Current classes:", controlsSidebar.className);
        });
        // Close sidebar if clicking outside of it on mobile
        document.addEventListener('click', (event) => {
            // Check if sidebar is open, click was outside sidebar and toggle button, and screen is mobile width
            if (controlsSidebar.classList.contains('open') &&
                !controlsSidebar.contains(event.target) &&
                !sidebarToggleBtn.contains(event.target) &&
                window.matchMedia('(max-width: 767px)').matches) {
                console.log("Click outside sidebar detected on mobile, closing.");
                controlsSidebar.classList.remove('open');
            }
        });
    } else { console.error("Could not attach sidebar toggle listener - elements missing."); }

    console.log("Initial setup complete.");
}); // End DOMContentLoaded

// --- Add the 'open' class style dynamically ---
// This style makes the sidebar slide in when the 'open' class is added
const styleSheet = document.createElement("style");
styleSheet.innerText = `#controls-sidebar.open { transform: translateX(0); }`;
document.head.appendChild(styleSheet);
