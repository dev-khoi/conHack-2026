/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  overlay: {
    toggle: () => Promise<void>
    show: () => Promise<void>
    hide: () => Promise<void>
    setPanelState: (panelState: 'compact' | 'input' | 'expanded') => Promise<void>
    getClipboardText: () => Promise<string>
    setClipboardText: (text: string) => Promise<void>
    setClipboardImageBase64: (imageBase64: string) => Promise<void>
    captureScreenshotBase64: () => Promise<string | null>
    onStartRecording: (callback: () => void) => () => void
  }
}
