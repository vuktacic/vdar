const { app, BrowserWindow, ipcMain } = require('electron/main')
const path = require('node:path')
const { SerialPort } = require('serialport')

let mainWindow = null
let activePort = null

function sendToRenderer(channel, payload) {
    if(mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload)
    }
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

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('enable-webgl2-compute-context');
app.commandLine.appendSwitch('disable-vulkan'); 

const createWindow = () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        backgroundColor: '#050505',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    })

    win.once('maximize', () => {
        win.show()
    })

    win.once('ready-to-show', () => {
        win.maximize()
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