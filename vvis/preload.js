const { contextBridge, ipcRenderer } = require('electron')

function subscribe(channel, callback) {
	const handler = (_event, payload) => {
		callback(payload)
	}
	ipcRenderer.on(channel, handler)
	return () => {
		ipcRenderer.removeListener(channel, handler)
	}
}

contextBridge.exposeInMainWorld('serial', {
	listPorts: () => ipcRenderer.invoke('serial:listPorts'),
	connect: (options) => ipcRenderer.invoke('serial:connect', options),
	disconnect: () => ipcRenderer.invoke('serial:disconnect'),
	write: (text) => ipcRenderer.invoke('serial:write', text),
	onData: (callback) => subscribe('serial:data', callback),
	onStatus: (callback) => subscribe('serial:status', callback),
	onError: (callback) => subscribe('serial:error', callback)
})
