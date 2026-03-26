const { app, BrowserWindow, ipcMain, screen } = require('electron')
const path = require('node:path')
const { SerialPort } = require('serialport')

let mainWindow = null
let activePort = null
let pseudoMaximized = false
let lastNormalBounds = null
const RESTORE_PRESET_WIDTH = 1280
const RESTORE_PRESET_HEIGHT = 820

function sendToRenderer(channel, payload) {
    if(mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload)
    }
}

function getWindowStatePayload() {
    if(!mainWindow || mainWindow.isDestroyed()) {
        return { maximized: false }
    }

    return { maximized: Boolean(mainWindow.isMaximized() || pseudoMaximized) }
}

function clamp(value, min, max) {
    if(value < min) {
        return min
    }
    if(value > max) {
        return max
    }
    return value
}

function getDisplayForWindow(preferredPoint) {
    if(preferredPoint && Number.isFinite(preferredPoint.x) && Number.isFinite(preferredPoint.y)) {
        return screen.getDisplayNearestPoint(preferredPoint)
    }

    const bounds = mainWindow.getBounds()
    const center = {
        x: Math.round(bounds.x + (bounds.width / 2)),
        y: Math.round(bounds.y + (bounds.height / 2))
    }

    return screen.getDisplayNearestPoint(center)
}

function getDefaultNormalBounds(display) {
    const workArea = display.workArea
    const width = clamp(RESTORE_PRESET_WIDTH, 640, workArea.width)
    const height = clamp(RESTORE_PRESET_HEIGHT, 480, workArea.height)
    const x = Math.round(workArea.x + ((workArea.width - width) / 2))
    const y = Math.round(workArea.y + ((workArea.height - height) / 2))
    return { x, y, width, height }
}

function normalizeBoundsToDisplay(bounds, display) {
    const workArea = display.workArea
    const width = clamp(bounds.width, 640, workArea.width)
    const height = clamp(bounds.height, 480, workArea.height)
    const x = clamp(bounds.x, workArea.x, workArea.x + workArea.width - width)
    const y = clamp(bounds.y, workArea.y, workArea.y + workArea.height - height)
    return { x, y, width, height }
}

function getLastNormalBounds(display) {
    if(lastNormalBounds) {
        return normalizeBoundsToDisplay(lastNormalBounds, display)
    }

    return getDefaultNormalBounds(display)
}

function trackLastNormalBounds() {
    if(!mainWindow || mainWindow.isDestroyed()) {
        return
    }

    if(pseudoMaximized || mainWindow.isMaximized()) {
        return
    }

    lastNormalBounds = mainWindow.getBounds()
}

function applyPseudoMaximize(preferredPoint) {
    if(!mainWindow || mainWindow.isDestroyed()) {
        return
    }

    if(mainWindow.isMaximized()) {
        mainWindow.unmaximize()
    }

    if(!pseudoMaximized) {
        trackLastNormalBounds()
    }

    const targetDisplay = getDisplayForWindow(preferredPoint)
    const displayBounds = targetDisplay.bounds
    mainWindow.setBounds(displayBounds)
    pseudoMaximized = true
    sendToRenderer('window:state', getWindowStatePayload())
}

function restoreFromPseudoMaximize() {
    if(!mainWindow || mainWindow.isDestroyed()) {
        return
    }

    if(!pseudoMaximized) {
        return
    }

    const targetDisplay = getDisplayForWindow()
    const restored = getDefaultNormalBounds(targetDisplay)
    mainWindow.setBounds(restored)
    lastNormalBounds = restored

    pseudoMaximized = false
    sendToRenderer('window:state', getWindowStatePayload())
}

function restoreForDragFromMaximized(payload) {
    if(!mainWindow || mainWindow.isDestroyed()) {
        return { ok: false, maximized: false }
    }

    const wasMaximized = Boolean(mainWindow.isMaximized() || pseudoMaximized)
    if(!wasMaximized) {
        return { ok: true, maximized: false }
    }

    const cursorPoint = {
        x: Math.round(Number(payload?.screenX) || 0),
        y: Math.round(Number(payload?.screenY) || 0)
    }

    const display = getDisplayForWindow(cursorPoint)
    const workArea = display.workArea
    const targetBounds = getDefaultNormalBounds(display)
    const titlebarWidth = Math.max(1, Math.round(Number(payload?.titlebarWidth) || targetBounds.width))
    const offsetX = clamp(Number(payload?.offsetX) || Math.floor(titlebarWidth / 2), 0, titlebarWidth)
    const pointerRatio = clamp(offsetX / titlebarWidth, 0.1, 0.9)
    const targetX = clamp(
        Math.round(cursorPoint.x - (targetBounds.width * pointerRatio)),
        workArea.x,
        workArea.x + workArea.width - targetBounds.width
    )
    const titlebarHeight = Math.max(24, Math.round(Number(payload?.titlebarHeight) || 38))
    const targetY = clamp(
        Math.round(cursorPoint.y - Math.floor(titlebarHeight / 2)),
        workArea.y,
        workArea.y + workArea.height - targetBounds.height
    )

    if(mainWindow.isMaximized()) {
        mainWindow.unmaximize()
    }

    pseudoMaximized = false
    const nextBounds = {
        x: targetX,
        y: targetY,
        width: targetBounds.width,
        height: targetBounds.height
    }
    mainWindow.setBounds(nextBounds)
    lastNormalBounds = nextBounds

    pseudoMaximized = false
    sendToRenderer('window:state', getWindowStatePayload())
    return { ok: true, maximized: false }
}

async function closeActivePort() {
    if(!activePort) {
        return
    }

    const portToClose = activePort
    activePort = null

    await new Promise((resolve, reject) => {
        if(!portToClose.isOpen) {
            resolve()
            return
        }

        portToClose.close((error) => {
            if(error) {
                reject(error)
                return
            }
            resolve()
        })
    })
}

ipcMain.handle('serial:listPorts', async() => {
    const ports = await SerialPort.list()
    return ports.map((port) => ({
        path: port.path,
        manufacturer: port.manufacturer || '',
        serialNumber: port.serialNumber || '',
        vendorId: port.vendorId || '',
        productId: port.productId || ''
    }))
})

ipcMain.handle('serial:connect', async(_event, options) => {
    const portPath = options?.path
    const baudRate = Number(options?.baudRate) || 115200

    if(!portPath) {
        throw new Error('Port path is required')
    }

    await closeActivePort()

    const port = new SerialPort({
        path: portPath,
        baudRate,
        autoOpen: false
    })

    await new Promise((resolve, reject) => {
        port.open((error) => {
            if(error) {
                reject(error)
                return
            }
            resolve()
        })
    })

    activePort = port

    port.on('data', (chunk) => {
        sendToRenderer('serial:data', { text: chunk.toString('utf8') })
    })

    port.on('error', (error) => {
        sendToRenderer('serial:error', { message: error.message })
    })

    port.on('close', () => {
        sendToRenderer('serial:status', { connected: false, path: portPath })
    })

    sendToRenderer('serial:status', { connected: true, path: portPath, baudRate })
    return { ok: true }
})

ipcMain.handle('serial:disconnect', async() => {
    const wasConnectedPath = activePort?.path || ''
    await closeActivePort()
    sendToRenderer('serial:status', { connected: false, path: wasConnectedPath })
    return { ok: true }
})

ipcMain.handle('serial:write', async(_event, text) => {
    if(!activePort || !activePort.isOpen) {
        throw new Error('No open serial port')
    }

    const payload = typeof text === 'string' ? text : String(text)

    await new Promise((resolve, reject) => {
        activePort.write(payload, (error) => {
            if(error) {
                reject(error)
                return
            }
            resolve()
        })
    })

    return { ok: true, bytes: Buffer.byteLength(payload) }
})

ipcMain.handle('window:minimize', () => {
    if(mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.minimize()
    }
    return { ok: true }
})

ipcMain.handle('window:toggleMaximize', () => {
    if(!mainWindow || mainWindow.isDestroyed()) {
        return { ok: false, maximized: false }
    }

    if(mainWindow.isMaximized()) {
        mainWindow.unmaximize()
        pseudoMaximized = false
        const display = getDisplayForWindow()
        const restored = getDefaultNormalBounds(display)
        mainWindow.setBounds(restored)
        lastNormalBounds = restored
        sendToRenderer('window:state', getWindowStatePayload())
    }
    else if(pseudoMaximized) {
        restoreFromPseudoMaximize()
    }
    else {
        applyPseudoMaximize()
    }

    return { ok: true, maximized: Boolean(mainWindow.isMaximized() || pseudoMaximized) }
})

ipcMain.handle('window:close', () => {
    if(mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close()
    }
    return { ok: true }
})

ipcMain.handle('window:getState', () => {
    return getWindowStatePayload()
})

ipcMain.on('window:prepareDragFromMaximizedSync', (event, payload) => {
    event.returnValue = restoreForDragFromMaximized(payload)
})

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('enable-webgl2-compute-context');
app.commandLine.appendSwitch('disable-vulkan'); 

const createWindow = () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        frame: false,
        show: false,
        hasShadow: false,
        backgroundColor: '#050505',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    })

    win.on('maximize', () => {
        pseudoMaximized = false
        sendToRenderer('window:state', getWindowStatePayload())
    })

    win.on('unmaximize', () => {
        trackLastNormalBounds()
        sendToRenderer('window:state', getWindowStatePayload())
    })

    win.on('move', () => {
        trackLastNormalBounds()
    })

    win.on('resize', () => {
        trackLastNormalBounds()
    })

    win.once('ready-to-show', () => {
        applyPseudoMaximize()
        win.show()
    })

    win.loadFile('index.html')
    mainWindow = win
}

app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})