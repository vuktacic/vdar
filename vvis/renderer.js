import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 5, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 1;
controls.maxDistance = 50;

const grid = new THREE.GridHelper(10, 10, 0x00ff88, 0x222222);
scene.add(grid);

const MAX_POINTS = 100000;
const lidarGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(MAX_POINTS * 3);
lidarGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

const lidarMaterial = new THREE.PointsMaterial({ 
    size: 0.03, 
    color: 0x00ff88, 
    transparent: true, 
    opacity: 0.8,
    blending: THREE.AdditiveBlending 
});

const pointCloud = new THREE.Points(lidarGeometry, lidarMaterial);
scene.add(pointCloud);

let pointCount = 0;
let theta = 0;
let phi = -Math.PI / 6;
let phiDir = 1;
let serialConnected = false;
let appLoaded = false;
let espConnected = false;
let runtimeStatus = 'idle';
let serialBuffer = '';
let showDebugLines = true;
const logEntries = [];
let themePrimary = '#00ff88';
let themeSecondary = '#5aa9ff';

const COLOR_READY = '#00ff88';
const COLOR_LOADING = '#ffd166';
const COLOR_DISCONNECTED = '#ff4d4d';
const COLOR_SCANNING = '#5aa9ff';

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

function applyThemeColors() {
    document.documentElement.style.setProperty('--theme-primary', themePrimary);
    document.documentElement.style.setProperty('--theme-secondary', themeSecondary);
    document.documentElement.style.setProperty('--theme-bg', themeSecondary);
    document.documentElement.style.setProperty('--theme-bg-rgb', hexToRgbString(themeSecondary));
    grid.material.color.set(themePrimary);
    lidarMaterial.color.set(themePrimary);
    scene.background.set(themeSecondary);
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

function addLidarPointFromRadians(dist, t, p) {
    if(pointCount >= MAX_POINTS) {
        pointCount = 0;
    }

    const i = pointCount * 3;

    positions[i] = dist * Math.cos(p) * Math.sin(t);
    positions[i + 1] = dist * Math.sin(p);
    positions[i + 2] = dist * Math.cos(p) * Math.cos(t);

    pointCount++;
    lidarGeometry.setDrawRange(0, pointCount);
    lidarGeometry.attributes.position.needsUpdate = true;
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
    if(!line.startsWith('scan_data ')) {
        return false;
    }

    const parts = line.split(/\s+/);
    if(parts.length < 4) {
        return false;
    }

    const distanceCm = toFloat(parts[1]);
    const azimuthDeg = toFloat(parts[2]);
    const elevationDeg = toFloat(parts[3]);

    if(distanceCm === null || azimuthDeg === null || elevationDeg === null) {
        return false;
    }

    const distanceM = distanceCm / 100.0;
    const thetaRad = azimuthDeg * (Math.PI / 180.0);
    const phiRad = elevationDeg * (Math.PI / 180.0);
    addLidarPointFromRadians(distanceM, thetaRad, phiRad);
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
            runtimeStatus = parsed;
            updateTopLeftStatus();
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

if(sendButton) {
    sendButton.addEventListener('click', () => {
        sendLine().catch((error) => appendLog(`Error: ${error.message}`));
    });
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
            runtimeStatus = 'idle';
            portSelect.value = '';
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
    applyThemeColors();
    updateTopLeftStatus();
});

function animate() {
    requestAnimationFrame(animate);

    if(!serialConnected) {
        for(let j = 0; j < 250; j++) {
            theta += 0.03;
            phi += 0.005 * phiDir;

            if(Math.abs(phi) > Math.PI / 4) {
                phiDir *= -1;
            }

            const simulatedDist = 4 + (Math.random() * 0.1);
            addLidarPointFromRadians(simulatedDist, theta, phi);
        }
    }

    lidarGeometry.setDrawRange(0, pointCount);
    lidarGeometry.attributes.position.needsUpdate = true;

    controls.update();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});