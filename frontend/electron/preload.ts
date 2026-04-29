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
})
