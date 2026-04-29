import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let mainWin: BrowserWindow | null
let overlayWin: BrowserWindow | null

type OverlayPanelState = 'compact' | 'input' | 'expanded'

const OVERLAY_WIDTH = 720
const OVERLAY_HEIGHT_BY_STATE: Record<OverlayPanelState, number> = {
  compact: 140,
  input: 240,
  expanded: 640,
}

function setOverlayBounds(panelState: OverlayPanelState) {
  if (!overlayWin) return

  const display = screen.getPrimaryDisplay()
  const workArea = display.workArea

  const width = OVERLAY_WIDTH
  const height = OVERLAY_HEIGHT_BY_STATE[panelState]

  const current = overlayWin.getBounds()
  const nextX = Math.max(workArea.x, Math.min(current.x, workArea.x + workArea.width - width))
  const nextY = Math.max(workArea.y, Math.min(current.y, workArea.y + workArea.height - height))

  overlayWin.setBounds({ x: nextX, y: nextY, width, height })
}

function toggleOverlay() {
  if (!overlayWin) return
  if (overlayWin.isVisible()) {
    overlayWin.hide()
    return
  }
  overlayWin.show()
  overlayWin.focus()
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    width: 1120,
    height: 720,
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  if (VITE_DEV_SERVER_URL) {
    mainWin.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWin.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function createOverlayWindow() {
  overlayWin = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    show: false,
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT_BY_STATE.compact,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  overlayWin.setAlwaysOnTop(true, 'screen-saver')
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Start in a sensible position (top center of the active display).
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const workArea = display.workArea
  const x = Math.round(workArea.x + (workArea.width - OVERLAY_WIDTH) / 2)
  const y = Math.round(workArea.y + 72)
  overlayWin.setPosition(x, y)

  if (VITE_DEV_SERVER_URL) {
    overlayWin.loadURL(`${VITE_DEV_SERVER_URL}#overlay`)
  } else {
    overlayWin.loadFile(path.join(RENDERER_DIST, 'index.html'), { hash: 'overlay' })
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    mainWin = null
    overlayWin = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (!mainWin) createMainWindow()
})

app.whenReady().then(() => {
  createMainWindow()
  createOverlayWindow()

  mainWin?.show()

  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    toggleOverlay()
  })

  ipcMain.handle('overlay:toggle', () => {
    toggleOverlay()
  })

  ipcMain.handle('overlay:hide', () => {
    overlayWin?.hide()
  })

  ipcMain.handle('overlay:show', () => {
    if (!overlayWin) return
    overlayWin.show()
    overlayWin.focus()
  })

  ipcMain.handle('overlay:set-panel', (_event, panelState: OverlayPanelState) => {
    if (!overlayWin) return
    setOverlayBounds(panelState)
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
