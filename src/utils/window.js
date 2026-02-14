const { BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('node:path');

let overlayWindow = null;

function createWindow(sendToRenderer) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    const mainWindow = new BrowserWindow({
        width: 80,
        height: 80,
        x: screenWidth - 120,
        y: screenHeight - 120,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        show: false,
        hasShadow: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false,
            enableBlinkFeatures: 'GetDisplayMedia',
            webSecurity: true,
        },
        backgroundColor: '#1e1e1e',
    });

    // Setup display media handler for screen capture
    const { session, desktopCapturer } = require('electron');
    session.defaultSession.setDisplayMediaRequestHandler(
        (request, callback) => {
            desktopCapturer.getSources({ types: ['screen'] }).then(sources => {
                callback({ video: sources[0], audio: 'loopback' });
            });
        },
        { useSystemPicker: true }
    );

    if (process.platform === 'win32') {
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    } else {
        mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    mainWindow.loadFile(path.join(__dirname, '../index.html'));

    // Open devtools for debugging (remove for production)
    mainWindow.webContents.openDevTools({ mode: 'detach' });

    // Register emergency close shortcut
    mainWindow.webContents.once('dom-ready', () => {
        const isMac = process.platform === 'darwin';
        const emergencyKey = isMac ? 'Cmd+Shift+E' : 'Ctrl+Shift+E';
        try {
            globalShortcut.register(emergencyKey, () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.hide();
                    if (overlayWindow && !overlayWindow.isDestroyed()) {
                        overlayWindow.hide();
                    }
                    const { app } = require('electron');
                    app.quit();
                }
            });
        } catch (e) {
            console.error('Failed to register emergency shortcut:', e);
        }
    });

    setupWindowIpcHandlers(mainWindow);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    return mainWindow;
}

function createOverlayWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    const isWindows = process.platform === 'win32';

    overlayWindow = new BrowserWindow({
        width,
        height,
        x: 0,
        y: 0,
        frame: false,
        transparent: true,
        hasShadow: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hiddenInMissionControl: true,
        resizable: false,
        focusable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        backgroundColor: '#00000000',
    });

    overlayWindow.setIgnoreMouseEvents(true, { forward: true });

    if (isWindows) {
        overlayWindow.setAlwaysOnTop(true, 'screen-saver', 0);
    } else {
        overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    overlayWindow.loadFile(path.join(__dirname, '../overlay.html'));
    overlayWindow.show();
    console.log(`[Overlay] Window created: ${width}x${height}`);
}

function getOverlayWindow() {
    return overlayWindow;
}

function setupWindowIpcHandlers(mainWindow) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    ipcMain.handle('window-minimize', () => {
        if (!mainWindow.isDestroyed()) mainWindow.minimize();
    });

    ipcMain.handle('toggle-window-visibility', async () => {
        if (mainWindow.isDestroyed()) return { success: false };
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow.showInactive();
        }
        return { success: true };
    });

    ipcMain.handle('resize-bubble-window', async (event, width, height) => {
        if (mainWindow.isDestroyed()) return { success: false };
        const newX = screenWidth - width - 40;
        const newY = screenHeight - height - 40;
        mainWindow.setBounds({ x: newX, y: newY, width, height }, true);
        return { success: true };
    });
}

module.exports = {
    createWindow,
    createOverlayWindow,
    getOverlayWindow,
};
