import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  screen,
  nativeImage,
} from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let mainWin: BrowserWindow | null;
let overlayWin: BrowserWindow | null;

type OverlayPanelState = "compact" | "input" | "expanded";

const OVERLAY_WIDTH = 520;
const OVERLAY_MARGIN = 20;
const OVERLAY_HEIGHT_BY_STATE: Record<OverlayPanelState, number> = {
  compact: 450,
  input: 460,
  expanded: 920,
};

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function setOverlayBounds(panelState: OverlayPanelState) {
  if (!overlayWin) return;

  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;

  const width = OVERLAY_WIDTH;
  const height = Math.min(
    OVERLAY_HEIGHT_BY_STATE[panelState],
    Math.max(320, workArea.height - OVERLAY_MARGIN * 2),
  );

  const nextX = Math.round(
    workArea.x + workArea.width - width - OVERLAY_MARGIN,
  );
  const nextY = Math.round(workArea.y + OVERLAY_MARGIN);

  overlayWin.setBounds({ x: nextX, y: nextY, width, height });
}

function toggleOverlay() {
  if (!overlayWin) return;
  if (overlayWin.isVisible()) {
    overlayWin.hide();
    return;
  }
  overlayWin.show();
  overlayWin.focus();
}

function createMainWindow() {
  // Open DevTools automatically
  mainWin = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    width: 1120,
    height: 720,
    backgroundColor: "#0b1220",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  if (VITE_DEV_SERVER_URL) {
    mainWin.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWin.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

function createOverlayWindow() {
  overlayWin = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    show: false,
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT_BY_STATE.compact,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  overlayWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Start at top-right of the active display.
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const workArea = display.workArea;
  const x = Math.round(
    workArea.x + workArea.width - OVERLAY_WIDTH - OVERLAY_MARGIN,
  );
  const y = Math.round(workArea.y + OVERLAY_MARGIN);
  overlayWin.setPosition(x, y);

  if (VITE_DEV_SERVER_URL) {
    overlayWin.loadURL(`${VITE_DEV_SERVER_URL}#overlay`);
  } else {
    overlayWin.loadFile(path.join(RENDERER_DIST, "index.html"), {
      hash: "overlay",
    });
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    mainWin = null;
    overlayWin = null;
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (!mainWin) createMainWindow();
});

app.whenReady().then(() => {
  createMainWindow();
  createOverlayWindow();

  mainWin?.show();

  // globalShortcut.register("CommandOrControl+Shift+Space", () => {
  //   toggleOverlay();
  // });
  globalShortcut.register("Shift+Space", () => {
    if (!overlayWin) return;

    if (!overlayWin.isVisible()) {
      overlayWin.show();
      overlayWin.focus();
    }

    // Tell the renderer to toggle recording
    overlayWin.webContents.send("overlay:start-recording");
  });

  ipcMain.handle("overlay:toggle", () => {
    toggleOverlay();
  });

  ipcMain.handle("overlay:hide", () => {
    overlayWin?.hide();
  });

  ipcMain.handle("overlay:show", () => {
    if (!overlayWin) return;
    overlayWin.show();
    overlayWin.focus();
  });

  ipcMain.handle(
    "overlay:set-panel",
    (_event, panelState: OverlayPanelState) => {
      if (!overlayWin) return;
      setOverlayBounds(panelState);
    },
  );

  ipcMain.handle("overlay:get-clipboard-text", () => {
    return clipboard.readText();
  });

  ipcMain.handle("overlay:set-clipboard-text", (_event, text: string) => {
    clipboard.writeText(String(text || ""));
  });

  ipcMain.handle("overlay:set-clipboard-image-base64", (_event, imageBase64: string) => {
    const raw = String(imageBase64 || "").trim();
    const b64 = raw.startsWith("data:") ? raw.split(",", 2)[1] || "" : raw;
    if (!b64) return;
    const image = nativeImage.createFromBuffer(Buffer.from(b64, "base64"));
    clipboard.writeImage(image);
  });

  ipcMain.handle("overlay:capture-screenshot", async () => {
    const wasVisible = Boolean(overlayWin?.isVisible());
    const wasFocused = Boolean(overlayWin?.isFocused());

    if (wasVisible) {
      overlayWin?.hide();
      await delay(120);
    }

    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1280, height: 720 },
        fetchWindowIcons: false,
      });
      if (!sources.length) return null;
      const png = sources[0].thumbnail.toPNG();
      return png.toString("base64");
    } finally {
      if (wasVisible) {
        overlayWin?.showInactive();
        if (wasFocused) {
          overlayWin?.focus();
        }
      }
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
