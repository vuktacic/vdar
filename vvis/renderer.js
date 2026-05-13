import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const TITLEBAR_HEIGHT = 38;
const VIEW_FRAME_RADIUS_M = 8.0;

function getViewportWidth() {
    return window.innerWidth;
}

function getViewportHeight() {
    return Math.max(1, window.innerHeight - TITLEBAR_HEIGHT);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);

const camera = new THREE.PerspectiveCamera(65, getViewportWidth() / getViewportHeight(), 0.1, 1000);
camera.position.set(VIEW_FRAME_RADIUS_M * 1.35, VIEW_FRAME_RADIUS_M * 0.95, VIEW_FRAME_RADIUS_M * 1.35);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(getViewportWidth(), getViewportHeight());
renderer.domElement.style.position = 'fixed';
renderer.domElement.style.top = `${TITLEBAR_HEIGHT}px`;
renderer.domElement.style.left = '0';
renderer.domElement.style.zIndex = '0';
renderer.domElement.style.display = 'block';
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.target.set(0, 0, 0);
controls.minDistance = VIEW_FRAME_RADIUS_M * 0.5;
controls.maxDistance = VIEW_FRAME_RADIUS_M * 8.0;
controls.update();

const grid = new THREE.GridHelper(VIEW_FRAME_RADIUS_M * 2.5, 24, 0x00ff88, 0x222222);
scene.add(grid);

const MAX_POINTS = 100000;
const lidarGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(MAX_POINTS * 3);
const colors = new Float32Array(MAX_POINTS * 3);
const pointLives = new Float32Array(MAX_POINTS);
const pointIdleFlags = new Uint8Array(MAX_POINTS);
lidarGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
lidarGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const lidarMaterial = new THREE.PointsMaterial({ 
    size: 0.03, 
    color: 0x00ff88, 
    vertexColors: true,
    transparent: true, 
    opacity: 0.8,
    blending: THREE.AdditiveBlending 
});

const pointCloud = new THREE.Points(lidarGeometry, lidarMaterial);
scene.add(pointCloud);

let pointWriteIndex = 0;
let pointsInitialized = 0;
let activePointCount = 0;
let serialConnected = false;
let appLoaded = false;
let espConnected = false;
let runtimeStatus = 'idle';
let serialBuffer = '';
let showDebugLines = true;
const logEntries = [];
let themePrimary = '#00ff88';
let themeSecondary = '#5aa9ff';
let accumulatedScanMs = 0;
let scanStartedAtMs = null;
let currentFps = 0;
let fpsFrames = 0;
let fpsWindowStartMs = performance.now();
let hasSerialScanData = false;
let themePrimaryR = 0;
let themePrimaryG = 1;
let themePrimaryB = 0.533;
let idlePointsPerSecond = 15000;
let idlePatternSpeed = 1.0;
let idleEmissionCarry = 0;
let idlePatternPhase = 0;
let idlePatternBranch = 0;
let lastAnimationMs = performance.now();
let selectedIdlePattern = 'ribbon-bloom';

const IDLE_PATTERN_PRESETS = {
    'ribbon-bloom': { density: 4500, speed: 0.1 },
    'helix-shell': { density: 12250, speed: 0.4 },
    'rose-lattice': { density: 6750, speed: 0.1 }
};

const COLOR_READY = '#00ff88';
const COLOR_LOADING = '#ffd166';
const COLOR_DISCONNECTED = '#ff4d4d';
const COLOR_SCANNING = '#5aa9ff';
const SCAN_PREFIX = 'scan_data ';
const MIN_DISTANCE_CM = 1;
const MAX_DISTANCE_CM = 1200;
const POINT_DECAY_PER_SECOND = 0.6;
const IDLE_MAX_RADIUS_M = VIEW_FRAME_RADIUS_M;
const IDLE_MIN_RADIUS_M = 0.5;
const RIBBON_BLOOM_SCALE = 1.8;
const HELIX_SHELL_SCALE = 1.9;
const ROSE_LATTICE_SCALE = 1.7;

const engineStatusLabel = document.getElementById('engine-status');
const espStatusLabel = document.getElementById('esp-status');
const runtimeStatusLabel = document.getElementById('runtime-status');
const portSelect = document.getElementById('serial-port');
const baudInput = document.getElementById('serial-baud');
const toggleDebugButton = document.getElementById('serial-toggle-debug');
const sendButton = document.getElementById('serial-send');
const serialInput = document.getElementById('serial-input');
const serialLog = document.getElementById('serial-log');
const themePrimaryInput = document.getElementById('theme-primary');
const themeSecondaryInput = document.getElementById('theme-secondary');
const idlePatternSelect = document.getElementById('idle-pattern-select');
const idleDensityInput = document.getElementById('idle-density');
const idleDensityValue = document.getElementById('idle-density-value');
const idlePatternSpeedInput = document.getElementById('idle-pattern-speed');
const idlePatternSpeedValue = document.getElementById('idle-pattern-speed-value');
const scanTimeLabel = document.getElementById('scan-time');
const pointCountLabel = document.getElementById('point-count');
const frameRateLabel = document.getElementById('frame-rate');
const resetScanButton = document.getElementById('reset-scan');
const minimizeWindowButton = document.getElementById('window-minimize');
const maximizeWindowButton = document.getElementById('window-maximize');
const closeWindowButton = document.getElementById('window-close');
const titlebar = document.getElementById('titlebar');
let windowIsMaximized = false;

function setMaximizeButtonState(maximized) {
    windowIsMaximized = Boolean(maximized);

    if(!maximizeWindowButton) {
        return;
    }

    if(maximized) {
        maximizeWindowButton.textContent = '[]';
        maximizeWindowButton.title = 'Restore';
    }
    else {
        maximizeWindowButton.textContent = '+';
        maximizeWindowButton.title = 'Maximize';
    }
}

function getCurrentTotalScanMs() {
    if(scanStartedAtMs === null) {
        return accumulatedScanMs;
    }
    return accumulatedScanMs + (performance.now() - scanStartedAtMs);
}

function formatScanTime(ms) {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - (minutes * 60);
    const minuteText = String(minutes).padStart(2, '0');
    const secondText = seconds.toFixed(1).padStart(4, '0');
    return `${minuteText}:${secondText}`;
}

function setRuntimeStatus(nextStatus) {
    if(runtimeStatus === nextStatus) {
        return;
    }

    const now = performance.now();
    if(runtimeStatus === 'scanning' && scanStartedAtMs !== null) {
        accumulatedScanMs += now - scanStartedAtMs;
        scanStartedAtMs = null;
    }

    runtimeStatus = nextStatus;

    if(runtimeStatus === 'scanning' && scanStartedAtMs === null) {
        scanStartedAtMs = now;
    }

    updateTopLeftStatus();
}

function updateBottomLeftStats() {
    if(scanTimeLabel) {
        scanTimeLabel.textContent = formatScanTime(getCurrentTotalScanMs());
    }
    if(pointCountLabel) {
        pointCountLabel.textContent = String(activePointCount);
    }
    if(frameRateLabel) {
        frameRateLabel.textContent = `${currentFps.toFixed(1)} FPS`;
    }
}

function updateIdleDensityUi() {
    if(!idleDensityInput) {
        return;
    }

    const densityParsed = Number(idleDensityInput.value);
    if(Number.isFinite(densityParsed) && densityParsed > 0) {
        idlePointsPerSecond = densityParsed;
    }

    if(idleDensityValue) {
        idleDensityValue.textContent = String(Math.round(idlePointsPerSecond));
    }

    if(idlePatternSpeedInput) {
        const speedParsed = Number(idlePatternSpeedInput.value);
        if(Number.isFinite(speedParsed) && speedParsed > 0) {
            idlePatternSpeed = speedParsed;
        }
    }

    if(idlePatternSpeedValue) {
        idlePatternSpeedValue.textContent = `${idlePatternSpeed.toFixed(1)}x`;
    }
}

function applyIdlePatternPreset(patternId) {
    const preset = IDLE_PATTERN_PRESETS[patternId];
    if(!preset) {
        return;
    }

    if(idleDensityInput) {
        idleDensityInput.value = String(preset.density);
    }

    if(idlePatternSpeedInput) {
        idlePatternSpeedInput.value = String(preset.speed);
    }

    idlePatternPhase = 0;
    idlePatternBranch = 0;
    idleEmissionCarry = 0;
    updateIdleDensityUi();
}

function updateFrameRate(nowMs) {
    fpsFrames += 1;
    const elapsedMs = nowMs - fpsWindowStartMs;
    if(elapsedMs >= 250) {
        currentFps = (fpsFrames * 1000) / elapsedMs;
        fpsFrames = 0;
        fpsWindowStartMs = nowMs;
    }
}

function clearPointCloud() {
    pointWriteIndex = 0;
    pointsInitialized = 0;
    activePointCount = 0;
    pointLives.fill(0);
    pointIdleFlags.fill(0);
    lidarGeometry.setDrawRange(0, 0);
    lidarGeometry.attributes.position.needsUpdate = true;
    lidarGeometry.attributes.color.needsUpdate = true;
}

async function resetScanState() {
    clearPointCloud();
    hasSerialScanData = false;
    accumulatedScanMs = 0;
    scanStartedAtMs = null;
    idleEmissionCarry = 0;
    setRuntimeStatus('idle');
    updateBottomLeftStats();

    if(window.serial && serialConnected) {
        try {
            await window.serial.write('stop\n');
            appendLog('TX stop');
            await window.serial.write('status\n');
            appendLog('TX status');
        }
        catch(error) {
            appendLog(`Error: ${error.message}`);
        }
    }
}

function hexToRgbString(hexColor) {
    const sanitized = hexColor.replace('#', '');
    if(sanitized.length !== 6) {
        return '5, 5, 5';
    }

    const r = parseInt(sanitized.substring(0, 2), 16);
    const g = parseInt(sanitized.substring(2, 4), 16);
    const b = parseInt(sanitized.substring(4, 6), 16);
    return `${r}, ${g}, ${b}`;
}

function updateThemePrimaryNormalized() {
    const sanitized = themePrimary.replace('#', '');
    if(sanitized.length !== 6) {
        themePrimaryR = 0;
        themePrimaryG = 1;
        themePrimaryB = 0.533;
        return;
    }

    themePrimaryR = parseInt(sanitized.substring(0, 2), 16) / 255.0;
    themePrimaryG = parseInt(sanitized.substring(2, 4), 16) / 255.0;
    themePrimaryB = parseInt(sanitized.substring(4, 6), 16) / 255.0;
}

function refreshPointColorsFromLives() {
    for(let idx = 0; idx < pointsInitialized; idx++) {
        const life = pointLives[idx];
        const intensity = Math.pow(life, 1.4);
        const c = idx * 3;
        colors[c] = themePrimaryR * intensity;
        colors[c + 1] = themePrimaryG * intensity;
        colors[c + 2] = themePrimaryB * intensity;
    }

    lidarGeometry.attributes.color.needsUpdate = true;
}

function applyThemeColors() {
    updateThemePrimaryNormalized();
    document.documentElement.style.setProperty('--theme-primary', themePrimary);
    document.documentElement.style.setProperty('--theme-secondary', themeSecondary);
    document.documentElement.style.setProperty('--theme-bg', themeSecondary);
    document.documentElement.style.setProperty('--theme-bg-rgb', hexToRgbString(themeSecondary));
    grid.material.color.set(themePrimary);
    lidarMaterial.color.set(themePrimary);
    scene.background.set(themeSecondary);
    refreshPointColorsFromLives();
    updateTopLeftStatus();
}

function updateTopLeftStatus() {
    if(engineStatusLabel) {
        engineStatusLabel.textContent = appLoaded ? 'Engine: Ready' : 'Engine: Loading';
        engineStatusLabel.style.color = appLoaded ? COLOR_READY : COLOR_LOADING;
    }

    if(espStatusLabel) {
        espStatusLabel.textContent = espConnected ? 'ESP32: Connected' : 'ESP32: Disconnected';
        espStatusLabel.style.color = espConnected ? themePrimary : COLOR_DISCONNECTED;
    }

    if(runtimeStatusLabel) {
        const normalized = runtimeStatus.charAt(0).toUpperCase() + runtimeStatus.slice(1);
        runtimeStatusLabel.textContent = `Status: ${normalized}`;

        if(runtimeStatus === 'idle') {
            runtimeStatusLabel.style.color = COLOR_READY;
        }
        else if(runtimeStatus === 'homing') {
            runtimeStatusLabel.style.color = COLOR_LOADING;
        }
        else if(runtimeStatus === 'scanning') {
            runtimeStatusLabel.style.color = COLOR_SCANNING;
        }
        else {
            runtimeStatusLabel.style.color = COLOR_READY;
        }
    }
}

function addLidarPointFromRadians(dist, t, p, idlePoint) {
    const idx = pointWriteIndex;
    const i = idx * 3;

    positions[i] = dist * Math.cos(p) * Math.sin(t);
    positions[i + 1] = dist * Math.sin(p);
    positions[i + 2] = dist * Math.cos(p) * Math.cos(t);

    pointLives[idx] = 1.0;
    pointIdleFlags[idx] = idlePoint ? 1 : 0;
    colors[i] = themePrimaryR;
    colors[i + 1] = themePrimaryG;
    colors[i + 2] = themePrimaryB;

    pointWriteIndex = (pointWriteIndex + 1) % MAX_POINTS;
    if(pointsInitialized < MAX_POINTS) {
        pointsInitialized++;
    }

    lidarGeometry.setDrawRange(0, pointsInitialized);
    lidarGeometry.attributes.position.needsUpdate = true;
    lidarGeometry.attributes.color.needsUpdate = true;
}

function decayPointCloud(dtSec) {
    let liveCount = 0;

    for(let idx = 0; idx < pointsInitialized; idx++) {
        let life = pointLives[idx];
        if(pointIdleFlags[idx] === 1) {
            life -= POINT_DECAY_PER_SECOND * dtSec;
        }
        if(life < 0) {
            life = 0;
        }

        pointLives[idx] = life;
        if(life > 0.01) {
            liveCount++;
        }

        const intensity = Math.pow(life, 1.4);
        const c = idx * 3;
        colors[c] = themePrimaryR * intensity;
        colors[c + 1] = themePrimaryG * intensity;
        colors[c + 2] = themePrimaryB * intensity;
    }

    activePointCount = liveCount;
    lidarGeometry.attributes.color.needsUpdate = true;
}

function emitIdlePatternPoint() {
    idlePatternPhase += 0.011 * idlePatternSpeed;
    const t = idlePatternPhase;

    if(selectedIdlePattern === 'helix-shell') {
        const p = 3.0;
        const q = 5.0;
        const u = t * 0.9;
        const torusRing = 3.4 + (0.55 * Math.cos(q * u));
        const radius = (torusRing + (0.28 * Math.sin((q + p) * u))) * HELIX_SHELL_SCALE;
        const thetaFlow = (p * u) + (0.45 * Math.sin(q * u + (idlePatternBranch * Math.PI)));
        const elevationWave = 0.52 * Math.sin(q * u) * Math.cos(0.6 * u);
        const bounded = Math.min(IDLE_MAX_RADIUS_M, Math.max(IDLE_MIN_RADIUS_M, radius));
        addLidarPointFromRadians(bounded, thetaFlow, elevationWave, true);
        idlePatternBranch = 1 - idlePatternBranch;
        return;
    }

    if(selectedIdlePattern === 'rose-lattice') {
        const golden = 2.399963229728653;
        const n = (t * 26.0) + (idlePatternBranch * 0.5);
        const petalBand = 0.34 * Math.sin(0.09 * n);
        const bloom = (1.4 + (0.085 * Math.sqrt(n % 900.0)) + (0.75 * Math.abs(Math.sin(0.035 * n)))) * ROSE_LATTICE_SCALE;
        const thetaFlow = (n * golden) + (0.9 * Math.sin(0.021 * n));
        const elevationWave = (0.72 * Math.sin(0.13 * n)) + petalBand;
        const bounded = Math.min(IDLE_MAX_RADIUS_M, Math.max(IDLE_MIN_RADIUS_M, bloom));
        addLidarPointFromRadians(bounded, thetaFlow, elevationWave, true);
        idlePatternBranch = 1 - idlePatternBranch;
        return;
    }

    const bloom = (3.1 + (0.75 * Math.sin(t * 3.1)) + (0.32 * Math.sin(t * 8.7))) * RIBBON_BLOOM_SCALE;
    const thetaFlow = (t * 1.7) + (0.62 * Math.sin(t * 4.4));
    const elevationWave = (0.55 * Math.sin(t * 2.0)) + (0.2 * Math.sin(t * 7.1));
    const ribbonOffset = (0.26 * Math.sin(t * 11.0)) * RIBBON_BLOOM_SCALE;

    if(idlePatternBranch === 0) {
        const bounded = Math.min(IDLE_MAX_RADIUS_M, Math.max(IDLE_MIN_RADIUS_M, bloom + ribbonOffset));
        addLidarPointFromRadians(bounded, thetaFlow, elevationWave, true);
    }
    else {
        const bounded = Math.min(IDLE_MAX_RADIUS_M, Math.max(IDLE_MIN_RADIUS_M, bloom - (ribbonOffset * 0.85)));
        addLidarPointFromRadians(bounded, thetaFlow + Math.PI, -elevationWave * 0.9, true);
    }

    idlePatternBranch = 1 - idlePatternBranch;
}

function appendLog(line) {
    appendLogEntry(line, false);
}

function isDebugLine(line) {
    return /^debug:\s/i.test(line);
}

function appendLogEntry(line, debugLine) {
    const now = new Date().toLocaleTimeString();
    logEntries.push({
        time: now,
        text: line,
        debug: Boolean(debugLine)
    });

    if(logEntries.length > 400) {
        logEntries.shift();
    }

    renderLog();
}

function renderLog() {
    const rendered = [];

    for(const entry of logEntries) {
        if(!showDebugLines && entry.debug) {
            continue;
        }
        rendered.push(`[${entry.time}] ${entry.text}`);
    }

    serialLog.textContent = rendered.join('\n');

    serialLog.scrollTop = serialLog.scrollHeight;
}

function toFloat(value) {
    const parsed = Number(value);
    if(Number.isFinite(parsed)) {
        return parsed;
    }
    return null;
}

function handleScanLine(line) {
    if(!line.startsWith(SCAN_PREFIX)) {
        return false;
    }

    const parts = line.split(/\s+/);
    if(parts.length !== 4) {
        return false;
    }

    const distanceCm = toFloat(parts[1]);
    const azimuthDeg = toFloat(parts[2]);
    const elevationDeg = toFloat(parts[3]);

    if(distanceCm === null || azimuthDeg === null || elevationDeg === null) {
        return false;
    }

    if(distanceCm < MIN_DISTANCE_CM || distanceCm > MAX_DISTANCE_CM) {
        return true;
    }

    const distanceM = distanceCm / 100.0;
    const thetaRad = azimuthDeg * (Math.PI / 180.0);
    const phiRad = elevationDeg * (Math.PI / 180.0);
    addLidarPointFromRadians(distanceM, thetaRad, phiRad, false);
    hasSerialScanData = true;
    return true;
}

function handleProtocolLine(line) {
    if(line === 'esp_connect') {
        espConnected = true;
        updateTopLeftStatus();
        window.serial.write('laptop_connect\n').then(() => {
            appendLog('TX laptop_connect');
        }).catch((error) => {
            appendLog(`Error: ${error.message}`);
        });
        window.serial.write('status\n').then(() => {
            appendLog('TX status');
        }).catch((error) => {
            appendLog(`Error: ${error.message}`);
        });
        return true;
    }

    if(line === 'connection_ack') {
        espConnected = true;
        updateTopLeftStatus();
        return true;
    }

    if(line.startsWith('status_')) {
        const parsed = line.substring(7).trim().toLowerCase();
        if(parsed) {
            setRuntimeStatus(parsed);
        }
        return true;
    }

    return false;
}

function handleIncomingLine(line) {
    const protocolHandled = handleProtocolLine(line);
    if(protocolHandled) {
        appendLogEntry(`RX ${line}`, false);
        return;
    }

    const handled = handleScanLine(line);
    if(!handled) {
        appendLogEntry(`RX ${line}`, isDebugLine(line));
    }
}

async function refreshPorts() {
    if(!window.serial) {
        return;
    }

    const previous = portSelect.value;
    const ports = await window.serial.listPorts();
    portSelect.innerHTML = '';

    const disconnectedOption = document.createElement('option');
    disconnectedOption.value = '';
    disconnectedOption.textContent = 'Disconnected';
    portSelect.appendChild(disconnectedOption);

    if(ports.length === 0) {
        return;
    }

    for(const port of ports) {
        const option = document.createElement('option');
        option.value = port.path;
        option.textContent = port.path;
        portSelect.appendChild(option);
    }

    if(previous) {
        portSelect.value = previous;
    }
}

async function connectToSelectedPort() {
    if(!window.serial) {
        appendLog('Serial bridge not available');
        return;
    }

    try {
        const path = portSelect.value;
        const baudRate = Number(baudInput.value) || 115200;

        if(!path) {
            if(serialConnected) {
                await window.serial.disconnect();
                appendLog('Disconnected');
            }
            return;
        }

        if(serialConnected) {
            await window.serial.disconnect();
        }

        await window.serial.connect({ path, baudRate });
        appendLog(`Connected to ${path} @ ${baudRate}`);
    }
    catch(error) {
        appendLog(`Error: ${error.message}`);
    }
}

async function sendLine() {
    if(!window.serial) {
        appendLog('Serial bridge not available');
        return;
    }

    const text = serialInput.value.trim();
    if(!text) {
        return;
    }

    serialInput.value = '';

    try {
        await window.serial.write(`${text}\n`);
        appendLog(`TX ${text}`);
    }
    catch(error) {
        appendLog(`Error: ${error.message}`);
    }
}

if(portSelect) {
    portSelect.addEventListener('focus', () => {
        refreshPorts().catch((error) => appendLog(`Error: ${error.message}`));
    });

    portSelect.addEventListener('change', () => {
        connectToSelectedPort().catch((error) => appendLog(`Error: ${error.message}`));
    });
}

if(baudInput) {
    baudInput.addEventListener('change', () => {
        if(portSelect.value) {
            connectToSelectedPort().catch((error) => appendLog(`Error: ${error.message}`));
        }
    });
}

if(toggleDebugButton) {
    toggleDebugButton.addEventListener('click', () => {
        showDebugLines = !showDebugLines;
        toggleDebugButton.textContent = showDebugLines ? 'Hide Debug' : 'Show Debug';
        renderLog();
    });
}

if(themePrimaryInput) {
    themePrimaryInput.addEventListener('input', () => {
        themePrimary = themePrimaryInput.value;
        applyThemeColors();
    });
}

if(themeSecondaryInput) {
    themeSecondaryInput.addEventListener('input', () => {
        themeSecondary = themeSecondaryInput.value;
        applyThemeColors();
    });
}

if(idleDensityInput) {
    idleDensityInput.addEventListener('input', () => {
        updateIdleDensityUi();
    });
}

if(idlePatternSpeedInput) {
    idlePatternSpeedInput.addEventListener('input', () => {
        updateIdleDensityUi();
    });
}

if(idlePatternSelect) {
    idlePatternSelect.addEventListener('change', () => {
        selectedIdlePattern = idlePatternSelect.value;
        applyIdlePatternPreset(selectedIdlePattern);
    });
}

if(sendButton) {
    sendButton.addEventListener('click', () => {
        sendLine().catch((error) => appendLog(`Error: ${error.message}`));
    });
}

if(resetScanButton) {
    resetScanButton.addEventListener('click', () => {
        resetScanState().catch((error) => appendLog(`Error: ${error.message}`));
    });
}

if(minimizeWindowButton && window.windowControls) {
    minimizeWindowButton.addEventListener('click', () => {
        window.windowControls.minimize().catch((error) => appendLog(`Error: ${error.message}`));
    });
}

if(maximizeWindowButton && window.windowControls) {
    maximizeWindowButton.addEventListener('click', () => {
        window.windowControls.toggleMaximize().then((result) => {
            setMaximizeButtonState(Boolean(result?.maximized));
        }).catch((error) => appendLog(`Error: ${error.message}`));
    });
}

if(closeWindowButton && window.windowControls) {
    closeWindowButton.addEventListener('click', () => {
        window.windowControls.close().catch((error) => appendLog(`Error: ${error.message}`));
    });
}

if(titlebar && window.windowControls) {
    titlebar.addEventListener('mousedown', (event) => {
        if(event.button !== 0) {
            return;
        }

        if(!windowIsMaximized) {
            return;
        }

        const targetElement = event.target;
        if(targetElement instanceof HTMLElement && targetElement.closest('#titlebar-buttons')) {
            return;
        }

        const titlebarRect = titlebar.getBoundingClientRect();
        try {
            window.windowControls.prepareDragFromMaximizedSync({
                screenX: event.screenX,
                screenY: event.screenY,
                offsetX: event.clientX - titlebarRect.left,
                titlebarWidth: titlebarRect.width,
                titlebarHeight: titlebarRect.height
            });
        }
        catch(error) {
            appendLog(`Error: ${error.message}`);
        }
    });
}

if(window.windowControls) {
    window.windowControls.onState((payload) => {
        setMaximizeButtonState(Boolean(payload?.maximized));
    });

    window.windowControls.getState().then((state) => {
        setMaximizeButtonState(Boolean(state?.maximized));
    }).catch((error) => appendLog(`Error: ${error.message}`));
}

if(serialInput) {
    serialInput.addEventListener('keydown', (event) => {
        if(event.key === 'Enter') {
            sendLine().catch((error) => appendLog(`Error: ${error.message}`));
        }
    });
}

if(window.serial) {
    window.serial.onStatus((payload) => {
        serialConnected = Boolean(payload?.connected);

        if(!serialConnected) {
            espConnected = false;
            setRuntimeStatus('idle');
            portSelect.value = '';
        }
        else if(runtimeStatus !== 'scanning' && runtimeStatus !== 'homing') {
            setRuntimeStatus('idle');
        }

        updateTopLeftStatus();
    });

    window.serial.onError((payload) => {
        appendLog(`Error: ${payload?.message || 'Unknown serial error'}`);
    });

    window.serial.onData((payload) => {
        serialBuffer += payload?.text || '';

        while(true) {
            const nl = serialBuffer.indexOf('\n');
            if(nl < 0) {
                break;
            }
            const line = serialBuffer.slice(0, nl).trim();
            serialBuffer = serialBuffer.slice(nl + 1);
            if(line) {
                handleIncomingLine(line);
            }
        }
    });

    refreshPorts().catch((error) => appendLog(`Error: ${error.message}`));
}

window.addEventListener('load', () => {
    appLoaded = true;
    if(themePrimaryInput && themePrimaryInput.value) {
        themePrimary = themePrimaryInput.value;
    }
    if(themeSecondaryInput && themeSecondaryInput.value) {
        themeSecondary = themeSecondaryInput.value;
    }

    if(idlePatternSelect && idlePatternSelect.value) {
        selectedIdlePattern = idlePatternSelect.value;
    }

    applyIdlePatternPreset(selectedIdlePattern);
    applyThemeColors();
    updateTopLeftStatus();
    updateBottomLeftStats();
});

function animate(nowMs) {
    requestAnimationFrame(animate);
    updateFrameRate(nowMs);

    const dtSec = Math.min(0.08, Math.max(0.001, (nowMs - lastAnimationMs) / 1000.0));
    lastAnimationMs = nowMs;

    if(runtimeStatus === 'idle' && !hasSerialScanData) {
        idleEmissionCarry += idlePointsPerSecond * dtSec;
        const pointsToEmit = Math.min(3000, Math.floor(idleEmissionCarry));
        idleEmissionCarry -= pointsToEmit;

        for(let j = 0; j < pointsToEmit; j++) {
            emitIdlePatternPoint();
        }
    }

    decayPointCloud(dtSec);
    lidarGeometry.setDrawRange(0, pointsInitialized);
    lidarGeometry.attributes.position.needsUpdate = true;
    updateBottomLeftStats();

    controls.update();
    renderer.render(scene, camera);
}
requestAnimationFrame(animate);

window.addEventListener('resize', () => {
    camera.aspect = getViewportWidth() / getViewportHeight();
    camera.updateProjectionMatrix();
    renderer.setSize(getViewportWidth(), getViewportHeight());
});