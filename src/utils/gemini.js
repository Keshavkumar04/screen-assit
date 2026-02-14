const { GoogleGenAI } = require('@google/genai');
const { BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const { getAgentSystemPrompt } = require('./agentPrompt');

let isInitializingSession = false;
let sessionAlive = false; // Track if session is actually open
let systemAudioProc = null;
let messageBuffer = '';
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

// Catch unhandled EPIPE errors from writing to closed WebSocket
process.on('uncaughtException', (err) => {
    if (err.code === 'EPIPE' || err.message?.includes('broken pipe')) {
        console.warn('[MAIN] Caught EPIPE error (writing to closed connection) - ignoring');
        return;
    }
    console.error('[MAIN] Uncaught exception:', err);
});

// Logging counters (main process side)
let micChunksReceived = 0;
let sysAudioChunksReceived = 0;
let imagesReceived = 0;
let audioChunksSentToRenderer = 0;
let textResponsesReceived = 0;
let toolCallsReceived = 0;
let turnCompleteCount = 0;
let errorsCount = 0;

// Log summary every 5 seconds
setInterval(() => {
    if (micChunksReceived > 0 || sysAudioChunksReceived > 0 || imagesReceived > 0 ||
        audioChunksSentToRenderer > 0 || textResponsesReceived > 0 || toolCallsReceived > 0 ||
        turnCompleteCount > 0 || errorsCount > 0) {
        console.log(`[MAIN Stats] Mic→Gemini: ${micChunksReceived} | SysAudio→Gemini: ${sysAudioChunksReceived} | Images→Gemini: ${imagesReceived} | AI audio→Renderer: ${audioChunksSentToRenderer} | Text responses: ${textResponsesReceived} | Tool calls: ${toolCallsReceived} | Turn completes: ${turnCompleteCount} | Errors: ${errorsCount}`);
        micChunksReceived = 0;
        sysAudioChunksReceived = 0;
        imagesReceived = 0;
        audioChunksSentToRenderer = 0;
        textResponsesReceived = 0;
        toolCallsReceived = 0;
        turnCompleteCount = 0;
        errorsCount = 0;
    }
}, 5000);

function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
        try {
            win.webContents.send(channel, data);
        } catch (e) {}
    }
}

// Tool/function declarations for agent actions
const toolDeclarations = [
    {
        functionDeclarations: [
            {
                name: 'highlight_area',
                description: 'Draw a visual highlight overlay on the screen to point out a specific area. Use generous sizing - highlight the entire region/panel, not just tiny text. For example, to highlight a terminal panel, highlight the whole panel area (e.g. 800x300), not just the tab header.',
                parameters: {
                    type: 'object',
                    properties: {
                        x: { type: 'number', description: 'X coordinate of the top-left corner of the highlight area' },
                        y: { type: 'number', description: 'Y coordinate of the top-left corner of the highlight area' },
                        width: { type: 'number', description: 'Width of the highlight area in pixels' },
                        height: { type: 'number', description: 'Height of the highlight area in pixels' },
                        label: { type: 'string', description: 'Optional label text to show above the highlight' },
                    },
                    required: ['x', 'y', 'width', 'height'],
                },
            },
            {
                name: 'click_at',
                description: 'Click the mouse at specific screen coordinates. Only use after getting user confirmation.',
                parameters: {
                    type: 'object',
                    properties: {
                        x: { type: 'number', description: 'X coordinate to click at' },
                        y: { type: 'number', description: 'Y coordinate to click at' },
                    },
                    required: ['x', 'y'],
                },
            },
            {
                name: 'type_text',
                description: 'Type text using the keyboard. Only use after getting user confirmation.',
                parameters: {
                    type: 'object',
                    properties: {
                        text: { type: 'string', description: 'The text to type' },
                    },
                    required: ['text'],
                },
            },
            {
                name: 'scroll_page',
                description: 'Scroll the page up or down.',
                parameters: {
                    type: 'object',
                    properties: {
                        direction: { type: 'string', description: 'Direction to scroll: "up" or "down"', enum: ['up', 'down'] },
                        amount: { type: 'number', description: 'Number of scroll steps (default 3)' },
                    },
                    required: ['direction'],
                },
            },
        ],
    },
];

async function handleToolCall(functionCall, geminiSessionRef, callId) {
    const { name, args } = functionCall;
    console.log(`[MAIN Tool] Executing tool: ${name} (id: ${callId})`, JSON.stringify(args));
    toolCallsReceived++;
    let result = { success: true };

    try {
        switch (name) {
            case 'highlight_area':
                // Route to overlay window via IPC
                sendToRenderer('execute-highlight', {
                    x: args.x,
                    y: args.y,
                    width: args.width,
                    height: args.height,
                    label: args.label || '',
                });
                // Also tell main process to route to overlay window
                const { ipcMain: ipc } = require('electron');
                const windows = BrowserWindow.getAllWindows();
                // Find overlay window (it has no frame and is full-screen)
                for (const win of windows) {
                    try {
                        win.webContents.send('draw-highlight', {
                            x: args.x, y: args.y,
                            width: args.width, height: args.height,
                            label: args.label || '',
                        });
                    } catch (e) {}
                }
                result.message = `Highlighted area at (${args.x}, ${args.y}) with size ${args.width}x${args.height}`;
                break;

            case 'click_at':
                // Execute click via main process agent actions
                try {
                    const { executeClick } = require('./agentActions');
                    await executeClick(args.x, args.y);
                    result.message = `Clicked at (${args.x}, ${args.y})`;
                } catch (err) {
                    result = { success: false, error: err.message };
                }
                break;

            case 'type_text':
                try {
                    const { executeTypeText } = require('./agentActions');
                    await executeTypeText(args.text);
                    result.message = `Typed: "${args.text}"`;
                } catch (err) {
                    result = { success: false, error: err.message };
                }
                break;

            case 'scroll_page':
                try {
                    const { executeScroll } = require('./agentActions');
                    await executeScroll(args.direction, args.amount || 3);
                    result.message = `Scrolled ${args.direction}`;
                } catch (err) {
                    result = { success: false, error: err.message };
                }
                break;

            default:
                result = { success: false, error: `Unknown tool: ${name}` };
        }
    } catch (error) {
        result = { success: false, error: error.message };
    }

    console.log(`[MAIN Tool] Result for ${name}:`, JSON.stringify(result));

    // Send tool response back to Gemini
    if (geminiSessionRef.current && callId) {
        try {
            console.log(`[MAIN Tool] Sending tool response back to Gemini for: ${name} (id: ${callId})`);
            await geminiSessionRef.current.sendToolResponse({
                functionResponses: [{
                    id: callId,
                    name: name,
                    response: result,
                }],
            });
            console.log(`[MAIN Tool] Tool response sent successfully for: ${name}`);
        } catch (err) {
            console.error('[MAIN Tool] Error sending tool response:', err.message);
            errorsCount++;
        }
    } else if (!callId) {
        console.warn('[MAIN Tool] No call ID available, skipping tool response');
    }
}

async function initializeGeminiSession(apiKey, language = 'en-US') {
    if (isInitializingSession) {
        console.log('[MAIN Gemini] Session initialization already in progress');
        return false;
    }

    isInitializingSession = true;
    console.log(`[MAIN Gemini] Initializing session with language: ${language}, API key: ${apiKey.substring(0, 10)}...`);
    sendToRenderer('update-status', 'Connecting...');

    const client = new GoogleGenAI({
        vertexai: false,
        apiKey: apiKey,
    });

    const systemPrompt = getAgentSystemPrompt();
    console.log(`[MAIN Gemini] System prompt length: ${systemPrompt.length} chars`);

    try {
        console.log('[MAIN Gemini] Calling client.live.connect()...');
        const session = await client.live.connect({
            model: 'gemini-2.5-flash-native-audio-latest',
            callbacks: {
                onopen: function () {
                    console.log('[MAIN Gemini] ✓ WebSocket OPEN - Live session connected!');
                    sessionAlive = true;
                    sendToRenderer('update-status', 'Live session connected');
                },
                onmessage: function (message) {
                    // Log the raw message structure (keys only to avoid huge logs)
                    const msgKeys = Object.keys(message || {});
                    const hasServerContent = !!message.serverContent;
                    const hasToolCall = !!message.toolCall;
                    const hasModelTurn = !!message.serverContent?.modelTurn;
                    const hasParts = !!message.serverContent?.modelTurn?.parts;
                    const isTurnComplete = !!message.serverContent?.turnComplete;
                    const isGenComplete = !!message.serverContent?.generationComplete;
                    const hasInputTranscript = !!message.serverContent?.inputTranscript;

                    // Log input transcription (what Gemini heard from mic)
                    if (message.serverContent?.inputTranscript) {
                        console.log(`[MAIN Gemini] 🎤 INPUT TRANSCRIPT: "${message.serverContent.inputTranscript}"`);
                    }

                    // Handle AI model response - audio output
                    if (message.serverContent?.modelTurn?.parts) {
                        const parts = message.serverContent.modelTurn.parts;
                        for (const part of parts) {
                            // Handle audio output from Gemini
                            if (part.inlineData && part.inlineData.mimeType?.startsWith('audio/')) {
                                audioChunksSentToRenderer++;
                                sendToRenderer('play-audio', {
                                    data: part.inlineData.data,
                                    mimeType: part.inlineData.mimeType,
                                });
                            }

                            // Handle text output (fallback)
                            if (part.text) {
                                textResponsesReceived++;
                                messageBuffer += part.text;
                                console.log(`[MAIN Gemini] 📝 TEXT: "${part.text}"`);
                                sendToRenderer('update-response', messageBuffer);
                            }

                            // Handle output audio transcription
                            if (part.outputTranscription) {
                                console.log(`[MAIN Gemini] 🔊 OUTPUT TRANSCRIPT: "${part.outputTranscription}"`);
                            }

                            // Handle function/tool calls
                            if (part.functionCall) {
                                console.log(`[MAIN Gemini] 🔧 TOOL CALL: ${part.functionCall.name} (id: ${part.functionCall.id})`, JSON.stringify(part.functionCall.args));
                                handleToolCall(part.functionCall, global.geminiSessionRef, part.functionCall.id);
                            }
                        }
                    }

                    if (message.serverContent?.generationComplete) {
                        console.log('[MAIN Gemini] ✓ Generation complete');
                        if (messageBuffer) {
                            sendToRenderer('update-response', messageBuffer);
                            messageBuffer = '';
                        }
                    }

                    if (message.serverContent?.turnComplete) {
                        turnCompleteCount++;
                        console.log('[MAIN Gemini] ✓ Turn complete - now listening');
                        sendToRenderer('update-status', 'Listening...');
                        messageBuffer = '';
                    }

                    // Handle interrupted
                    if (message.serverContent?.interrupted) {
                        console.log('[MAIN Gemini] ⚠ Turn INTERRUPTED by user');
                    }

                    // Handle tool call responses at top level too
                    if (message.toolCall) {
                        for (const fc of (message.toolCall.functionCalls || [])) {
                            console.log(`[MAIN Gemini] 🔧 TOP-LEVEL TOOL CALL: ${fc.name} (id: ${fc.id})`, JSON.stringify(fc.args));
                            handleToolCall(fc, global.geminiSessionRef, fc.id);
                        }
                    }

                    // Log any unexpected message types
                    if (!hasServerContent && !hasToolCall) {
                        console.log('[MAIN Gemini] ❓ Unknown message type, keys:', msgKeys);
                    }
                },
                onerror: function (e) {
                    errorsCount++;
                    console.error('[MAIN Gemini] ❌ ERROR:', e.message || e);
                    const isApiKeyError = e.message && (
                        e.message.includes('API key not valid') ||
                        e.message.includes('invalid API key') ||
                        e.message.includes('unauthorized')
                    );
                    sendToRenderer('update-status', isApiKeyError ? 'Error: Invalid API key' : 'Error: ' + e.message);
                },
                onclose: function (e) {
                    const code = e?.code || 'N/A';
                    const reason = e?.reason || 'unknown';
                    console.log(`[MAIN Gemini] 🔴 Session CLOSED. Reason: ${reason} Code: ${code}`);
                    console.log(`[MAIN Gemini] Full close event:`, JSON.stringify(e, null, 2));

                    sessionAlive = false;

                    // Auto-reconnect on unexpected closes (not user-initiated close code 1000)
                    if (code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        reconnectAttempts++;
                        const delay = reconnectAttempts * 2000;
                        console.log(`[MAIN Gemini] 🔄 Auto-reconnecting in ${delay/1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                        sendToRenderer('update-status', `Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                        setTimeout(async () => {
                            try {
                                const newSession = await initializeGeminiSession(apiKey, language);
                                if (newSession && global.geminiSessionRef) {
                                    global.geminiSessionRef.current = newSession;
                                    reconnectAttempts = 0;
                                    console.log('[MAIN Gemini] ✓ Auto-reconnected!');
                                }
                            } catch (err) {
                                console.error('[MAIN Gemini] Auto-reconnect failed:', err.message);
                                sendToRenderer('update-status', 'Disconnected');
                            }
                        }, delay);
                    } else {
                        sendToRenderer('update-status', `Disconnected (code: ${code})`);
                    }
                },
            },
            config: {
                responseModalities: ['AUDIO'],
                tools: toolDeclarations,
                inputAudioTranscription: { enabled: true },
                outputAudioTranscription: { enabled: true },
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                    languageCode: language,
                },
                systemInstruction: {
                    parts: [{ text: systemPrompt }],
                },
            },
        });

        console.log('[MAIN Gemini] ✓ Session object created successfully');
        isInitializingSession = false;
        return session;
    } catch (error) {
        errorsCount++;
        console.error('[MAIN Gemini] ❌ Failed to initialize session:', error);
        isInitializingSession = false;
        sendToRenderer('update-status', 'Connection failed');
        return null;
    }
}

// macOS audio capture functions (kept from original)
function killExistingSystemAudioDump() {
    return new Promise(resolve => {
        const killProc = spawn('pkill', ['-f', 'SystemAudioDump'], { stdio: 'ignore' });
        killProc.on('close', () => resolve());
        killProc.on('error', () => resolve());
        setTimeout(() => { killProc.kill(); resolve(); }, 2000);
    });
}

async function startMacOSAudioCapture(geminiSessionRef) {
    if (process.platform !== 'darwin') return false;
    await killExistingSystemAudioDump();

    const { app } = require('electron');
    const path = require('path');

    let systemAudioPath;
    if (app.isPackaged) {
        systemAudioPath = path.join(process.resourcesPath, 'SystemAudioDump');
    } else {
        systemAudioPath = path.join(__dirname, '../assets', 'SystemAudioDump');
    }

    systemAudioProc = spawn(systemAudioPath, [], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
    });

    if (!systemAudioProc.pid) return false;

    const CHUNK_DURATION = 0.1;
    const SAMPLE_RATE = 16000;
    const BYTES_PER_SAMPLE = 2;
    const CHANNELS = 2;
    const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * CHUNK_DURATION;
    let audioBuffer = Buffer.alloc(0);

    systemAudioProc.stdout.on('data', data => {
        audioBuffer = Buffer.concat([audioBuffer, data]);
        while (audioBuffer.length >= CHUNK_SIZE) {
            const chunk = audioBuffer.slice(0, CHUNK_SIZE);
            audioBuffer = audioBuffer.slice(CHUNK_SIZE);
            const monoChunk = convertStereoToMono(chunk);
            sendAudioToGemini(monoChunk.toString('base64'), geminiSessionRef);
        }
        const maxBufferSize = SAMPLE_RATE * BYTES_PER_SAMPLE;
        if (audioBuffer.length > maxBufferSize) {
            audioBuffer = audioBuffer.slice(-maxBufferSize);
        }
    });

    systemAudioProc.on('close', () => { systemAudioProc = null; });
    systemAudioProc.on('error', () => { systemAudioProc = null; });

    return true;
}

function convertStereoToMono(stereoBuffer) {
    const samples = stereoBuffer.length / 4;
    const monoBuffer = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
        monoBuffer.writeInt16LE(stereoBuffer.readInt16LE(i * 4), i * 2);
    }
    return monoBuffer;
}

function stopMacOSAudioCapture() {
    if (systemAudioProc) {
        systemAudioProc.kill('SIGTERM');
        systemAudioProc = null;
    }
}

async function sendAudioToGemini(base64Data, geminiSessionRef) {
    if (!geminiSessionRef.current || !sessionAlive) return;
    try {
        await geminiSessionRef.current.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' },
        });
    } catch (error) {
        console.error('Error sending audio to Gemini:', error);
    }
}

function setupGeminiIpcHandlers(geminiSessionRef) {
    global.geminiSessionRef = geminiSessionRef;

    ipcMain.handle('initialize-gemini', async (event, apiKey, language = 'en-US') => {
        console.log(`[MAIN IPC] initialize-gemini called, language: ${language}`);
        reconnectAttempts = 0; // Reset on manual init
        const session = await initializeGeminiSession(apiKey, language);
        if (session) {
            geminiSessionRef.current = session;
            console.log('[MAIN IPC] ✓ Gemini session stored in ref');
            return true;
        }
        console.log('[MAIN IPC] ✗ Gemini session failed');
        return false;
    });

    ipcMain.handle('send-audio-content', async (event, { data, mimeType }) => {
        if (!geminiSessionRef.current || !sessionAlive) {
            return { success: false, error: 'No active session' };
        }
        try {
            sysAudioChunksReceived++;
            await geminiSessionRef.current.sendRealtimeInput({
                audio: { data, mimeType },
            });
            return { success: true };
        } catch (error) {
            console.error('[MAIN IPC] send-audio-content error:', error.message);
            errorsCount++;
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-mic-audio-content', async (event, { data, mimeType }) => {
        if (!geminiSessionRef.current || !sessionAlive) {
            return { success: false, error: 'No active session' };
        }
        try {
            micChunksReceived++;
            await geminiSessionRef.current.sendRealtimeInput({
                audio: { data, mimeType },
            });
            return { success: true };
        } catch (error) {
            console.error('[MAIN IPC] send-mic-audio-content error:', error.message);
            errorsCount++;
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-image-content', async (event, { data }) => {
        if (!geminiSessionRef.current || !sessionAlive) {
            return { success: false, error: 'No active session' };
        }
        try {
            if (!data || typeof data !== 'string') return { success: false, error: 'Invalid image data' };
            const buffer = Buffer.from(data, 'base64');
            if (buffer.length < 1000) {
                console.warn(`[MAIN IPC] send-image-content: Image too small (${buffer.length} bytes)`);
                return { success: false, error: 'Image buffer too small' };
            }

            imagesReceived++;
            console.log(`[MAIN IPC] Sending image to Gemini: ${Math.round(buffer.length / 1024)}KB`);
            await geminiSessionRef.current.sendRealtimeInput({
                media: { data, mimeType: 'image/jpeg' },
            });
            return { success: true };
        } catch (error) {
            console.error('[MAIN IPC] send-image-content error:', error.message);
            errorsCount++;
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-text-message', async (event, text) => {
        if (!geminiSessionRef.current || !sessionAlive) return { success: false, error: 'No active session' };
        try {
            if (!text || text.trim().length === 0) return { success: false, error: 'Empty message' };
            console.log(`[MAIN IPC] Sending text to Gemini: "${text.trim()}"`);
            await geminiSessionRef.current.sendRealtimeInput({ text: text.trim() });
            return { success: true };
        } catch (error) {
            console.error('[MAIN IPC] send-text-message error:', error.message);
            errorsCount++;
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('start-macos-audio', async () => {
        if (process.platform !== 'darwin') return { success: false, error: 'macOS only' };
        const success = await startMacOSAudioCapture(geminiSessionRef);
        return { success };
    });

    ipcMain.handle('stop-macos-audio', async () => {
        stopMacOSAudioCapture();
        return { success: true };
    });

    ipcMain.handle('close-session', async () => {
        console.log('[MAIN IPC] close-session called');
        stopMacOSAudioCapture();
        if (geminiSessionRef.current) {
            console.log('[MAIN IPC] Closing active Gemini session...');
            await geminiSessionRef.current.close();
            geminiSessionRef.current = null;
            console.log('[MAIN IPC] ✓ Session closed');
        }
        return { success: true };
    });
}

module.exports = {
    initializeGeminiSession,
    sendToRenderer,
    stopMacOSAudioCapture,
    setupGeminiIpcHandlers,
};
