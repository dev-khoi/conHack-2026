import { ipcRenderer, contextBridge } from 'electron'

type OverlayPanelState = 'compact' | 'input' | 'expanded'

contextBridge.exposeInMainWorld('overlay', {
  toggle() {
    return ipcRenderer.invoke('overlay:toggle')
  },
  show() {
    return ipcRenderer.invoke('overlay:show')
  },
  hide() {
    return ipcRenderer.invoke('overlay:hide')
  },
  setPanelState(panelState: OverlayPanelState) {
    return ipcRenderer.invoke('overlay:set-panel', panelState)
  },
  getClipboardText() {
    return ipcRenderer.invoke('overlay:get-clipboard-text') as Promise<string>
  },
  getClipboardImageBase64() {
    return ipcRenderer.invoke('overlay:get-clipboard-image-base64') as Promise<string | null>
  },
  setClipboardText(text: string) {
    return ipcRenderer.invoke('overlay:set-clipboard-text', text) as Promise<void>
  },
  setClipboardImageBase64(imageBase64: string) {
    return ipcRenderer.invoke('overlay:set-clipboard-image-base64', imageBase64) as Promise<void>
  },
  captureScreenshotBase64() {
    return ipcRenderer.invoke('overlay:capture-screenshot') as Promise<string | null>
  },
  onStartRecording(callback: () => void) {
    const listener = () => callback()
    ipcRenderer.on('overlay:start-recording', listener)
    return () => ipcRenderer.removeListener('overlay:start-recording', listener)
  },
})
