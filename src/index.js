if (require('electron-squirrel-startup')) {
    process.exit(0);
}

const { app, BrowserWindow, shell, ipcMain, globalShortcut } = require('electron');
const { createWindow, createOverlayWindow, getOverlayWindow } = require('./utils/window');
const { setupGeminiIpcHandlers, stopMacOSAudioCapture, sendToRenderer } = require('./utils/gemini');
const { getLocalConfig, writeConfig } = require('./config');
const { executeAgentAction } = require('./utils/agentActions');

const geminiSessionRef = { current: null };
let mainWindow = null;

function createMainWindow() {
    mainWindow = createWindow(sendToRenderer);
    return mainWindow;
}

app.whenReady().then(async () => {
    createMainWindow();
    createOverlayWindow();
    setupGeminiIpcHandlers(geminiSessionRef);
    setupGeneralIpcHandlers();

    // Global push-to-talk shortcut: Ctrl+Shift+A to toggle (single-fire, no repeat issues)
    globalShortcut.register('CommandOrControl+Shift+A', () => {
        sendToRenderer('toggle-push-to-talk');
    });
});

app.on('window-all-closed', () => {
    globalShortcut.unregisterAll();
    stopMacOSAudioCapture();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopMacOSAudioCapture();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

function setupGeneralIpcHandlers() {
    ipcMain.handle('get-config', async () => {
        try {
            return { success: true, config: getLocalConfig() };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('quit-application', async () => {
        stopMacOSAudioCapture();
        app.quit();
        return { success: true };
    });

    ipcMain.handle('open-external', async (event, url) => {
        await shell.openExternal(url);
        return { success: true };
    });

    // Highlight area - route to overlay window
    ipcMain.handle('highlight-area', async (event, { x, y, width, height, label }) => {
        const overlay = getOverlayWindow();
        if (overlay && !overlay.isDestroyed()) {
            overlay.webContents.send('draw-highlight', { x, y, width, height, label });
        }
        return { success: true };
    });

    // Agent actions
    ipcMain.handle('execute-agent-action', async (event, action) => {
        try {
            await executeAgentAction(action);
            return { success: true };
        } catch (error) {
            console.error('Agent action failed:', error);
            return { success: false, error: error.message };
        }
    });

    // Restart gemini with new language
    ipcMain.handle('restart-gemini-with-language', async (event, language) => {
        try {
            if (geminiSessionRef.current) {
                await geminiSessionRef.current.close();
                geminiSessionRef.current = null;
            }
            // Re-initialize will be triggered by renderer
            sendToRenderer('update-status', 'Restarting with ' + language);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}
