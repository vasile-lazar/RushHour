import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'

function createWindow(): void {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        backgroundColor: '#0b0f14',
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            sandbox: true
        }
    })

    // In dev, electron-vite serves the renderer from a local dev server
    if (process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        win.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

app.whenReady().then(() => {
    registerIpc()
    createWindow()
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})