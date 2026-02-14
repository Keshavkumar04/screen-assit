// renderer.js - Screen Agent renderer process
const { ipcRenderer } = require('electron');

let mediaStream = null;
let screenshotInterval = null;
let audioContext = null;
let audioProcessor = null;
let micAudioProcessor = null;
const SAMPLE_RATE = 16000; // Gemini Live API requires 16kHz input audio
const AUDIO_CHUNK_DURATION = 0.1;
const BUFFER_SIZE = 4096;

let hiddenVideo = null;
let offscreenCanvas = null;
let offscreenContext = null;

const isLinux = process.platform === 'linux';
const isMacOS = process.platform === 'darwin';

// Track AI speaking state to mute mic during playback (prevent feedback)
let aiIsSpeaking = false;

// Push-to-talk: only send mic/sys audio when user is actively talking
let pushToTalkActive = false;

// Logging counters (avoid console spam)
let micChunksSent = 0;
let sysAudioChunksSent = 0;
let screenshotsSent = 0;
let audioChunksReceived = 0;

// Log summary every 5 seconds
setInterval(() => {
    if (micChunksSent > 0 || sysAudioChunksSent > 0 || screenshotsSent > 0 || audioChunksReceived > 0) {
        console.log(`[Stats] Mic chunks: ${micChunksSent} | Sys audio: ${sysAudioChunksSent} | Screenshots: ${screenshotsSent} | AI audio received: ${audioChunksReceived}`);
        micChunksSent = 0;
        sysAudioChunksSent = 0;
        screenshotsSent = 0;
        audioChunksReceived = 0;
    }
}, 5000);

// --- Audio Playback Manager ---
const audioPlaybackScript = document.createElement('script');
audioPlaybackScript.src = 'utils/audioPlayback.js';
document.head.appendChild(audioPlaybackScript);

let audioPlaybackManager = null;
audioPlaybackScript.onload = () => {
    audioPlaybackManager = new AudioPlaybackManager();
    window.audioPlaybackManager = audioPlaybackManager;
    console.log('[Audio] Playback manager initialized');
};

// --- Audio conversion utilities ---
function convertFloat32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// --- Gemini initialization ---
const HARDCODED_API_KEY = 'AIzaSyDdNa_6D3WKoGrdj9UpuR7K0i6dS5YVIqI';

async function initializeGemini(language = 'en-US') {
    const apiKey = localStorage.getItem('apiKey')?.trim() || HARDCODED_API_KEY;
    console.log('[Gemini] Initializing with language:', language);
    const success = await ipcRenderer.invoke('initialize-gemini', apiKey, language);
    if (success) {
        console.log('[Gemini] Connected successfully!');
        cheddar.setStatus('Live');
    } else {
        console.error('[Gemini] Connection FAILED');
        cheddar.setStatus('Connection failed');
    }
}

// --- IPC Listeners ---
ipcRenderer.on('update-status', (event, status) => {
    console.log('[Status]', status);
    cheddar.setStatus(status);
});

ipcRenderer.on('update-response', (event, response) => {
    console.log('[Gemini TEXT response]:', response);
});

// Handle audio playback from Gemini
ipcRenderer.on('play-audio', (event, { data, mimeType }) => {
    audioChunksReceived++;
    if (audioPlaybackManager) {
        audioPlaybackManager.enqueue(data, mimeType);
    } else {
        console.warn('[Audio] Playback manager not ready!');
    }
});

// Handle AI speaking state for bubble animation + mic muting
window.addEventListener('ai-started-speaking', () => {
    aiIsSpeaking = true;
    const bubble = document.querySelector('bubble-app');
    if (bubble) bubble.setAiSpeaking(true);
});

window.addEventListener('ai-stopped-speaking', () => {
    aiIsSpeaking = false;
    const bubble = document.querySelector('bubble-app');
    if (bubble) bubble.setAiSpeaking(false);
});

// Push-to-talk toggle via global shortcut (Ctrl+Space)
ipcRenderer.on('toggle-push-to-talk', () => {
    pushToTalkActive = !pushToTalkActive;
    console.log(`[PTT] Push-to-talk: ${pushToTalkActive ? 'ON - recording' : 'OFF - stopped'}`);
    const bubble = document.querySelector('bubble-app');
    if (bubble) bubble.setTalking(pushToTalkActive);
});

// --- Screen Capture ---
async function startCapture() {
    console.log('[Capture] Starting screen + audio capture...');
    try {
        if (isMacOS) {
            console.log('[Capture] macOS mode');
            const audioResult = await ipcRenderer.invoke('start-macos-audio');
            if (!audioResult.success) {
                console.warn('[Capture] macOS audio capture failed:', audioResult.error);
            }
            mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 1, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false,
            });
        } else if (isLinux) {
            console.log('[Capture] Linux mode');
            try {
                mediaStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { frameRate: 1, width: { ideal: 1920 }, height: { ideal: 1080 } },
                    audio: { sampleRate: SAMPLE_RATE, channelCount: 1 },
                });
                setupSystemAudioProcessing();
            } catch (e) {
                mediaStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { frameRate: 1, width: { ideal: 1920 }, height: { ideal: 1080 } },
                    audio: false,
                });
            }
        } else {
            console.log('[Capture] Windows mode');
            mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 1, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true },
            });
            const audioTracks = mediaStream.getAudioTracks();
            const videoTracks = mediaStream.getVideoTracks();
            console.log(`[Capture] Got ${videoTracks.length} video tracks, ${audioTracks.length} audio tracks`);
            if (audioTracks.length > 0) {
                console.log('[Capture] System audio track:', audioTracks[0].label);
                setupSystemAudioProcessing();
            } else {
                console.warn('[Capture] No system audio track!');
            }
        }

        // Always get microphone for voice input
        try {
            console.log('[Capture] Requesting microphone...');
            const micStream = await navigator.mediaDevices.getUserMedia({
                audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: false,
            });
            console.log('[Capture] Microphone granted:', micStream.getAudioTracks()[0].label);
            setupMicProcessing(micStream);
        } catch (micErr) {
            console.error('[Capture] Microphone DENIED:', micErr.message);
        }

        // Start screenshot interval - fixed 10 seconds
        console.log('[Capture] Starting screenshot interval (10s)');
        screenshotInterval = setInterval(() => captureScreenshot(), 10000);
        setTimeout(() => captureScreenshot(), 1000);

    } catch (err) {
        console.error('[Capture] ERROR starting capture:', err);
        cheddar.setStatus('Capture failed');
    }
}

function setupSystemAudioProcessing() {
    if (!mediaStream.getAudioTracks().length) {
        console.warn('[SysAudio] No audio tracks to process');
        return;
    }

    console.log('[SysAudio] Setting up system audio processing');
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioContext.createMediaStreamSource(mediaStream);
    audioProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    let buffer = [];
    const samplesPerChunk = SAMPLE_RATE * AUDIO_CHUNK_DURATION;

    audioProcessor.onaudioprocess = async e => {
        const inputData = e.inputBuffer.getChannelData(0);
        if (!pushToTalkActive || aiIsSpeaking) return; // Only send when push-to-talk active & AI not speaking
        buffer.push(...inputData);
        while (buffer.length >= samplesPerChunk) {
            const chunk = buffer.splice(0, samplesPerChunk);
            const pcmData16 = convertFloat32ToInt16(chunk);
            const base64Data = arrayBufferToBase64(pcmData16.buffer);
            sysAudioChunksSent++;
            await ipcRenderer.invoke('send-audio-content', {
                data: base64Data,
                mimeType: 'audio/pcm;rate=16000',
            });
        }
    };

    source.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);
    console.log('[SysAudio] Processing started');
}

function setupMicProcessing(micStream) {
    console.log('[Mic] Setting up microphone processing');
    const micAudioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const micSource = micAudioContext.createMediaStreamSource(micStream);
    const micProcessor = micAudioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    let buffer = [];
    const samplesPerChunk = SAMPLE_RATE * AUDIO_CHUNK_DURATION;

    micProcessor.onaudioprocess = async e => {
        const inputData = e.inputBuffer.getChannelData(0);
        if (!pushToTalkActive || aiIsSpeaking) return; // Only send when push-to-talk active & AI not speaking
        buffer.push(...inputData);
        while (buffer.length >= samplesPerChunk) {
            const chunk = buffer.splice(0, samplesPerChunk);
            const pcmData16 = convertFloat32ToInt16(chunk);
            const base64Data = arrayBufferToBase64(pcmData16.buffer);
            micChunksSent++;
            await ipcRenderer.invoke('send-mic-audio-content', {
                data: base64Data,
                mimeType: 'audio/pcm;rate=16000',
            });
        }
    };

    micSource.connect(micProcessor);
    micProcessor.connect(micAudioContext.destination);
    micAudioProcessor = micProcessor;
    console.log('[Mic] Processing started');
}

async function captureScreenshot() {
    if (!mediaStream) return;

    if (!hiddenVideo) {
        hiddenVideo = document.createElement('video');
        hiddenVideo.srcObject = mediaStream;
        hiddenVideo.muted = true;
        hiddenVideo.playsInline = true;
        await hiddenVideo.play();
        await new Promise(resolve => {
            if (hiddenVideo.readyState >= 2) return resolve();
            hiddenVideo.onloadedmetadata = () => resolve();
        });
        offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = hiddenVideo.videoWidth;
        offscreenCanvas.height = hiddenVideo.videoHeight;
        offscreenContext = offscreenCanvas.getContext('2d');
        console.log(`[Screenshot] Canvas ready: ${offscreenCanvas.width}x${offscreenCanvas.height}`);
    }

    if (hiddenVideo.readyState < 2) return;

    offscreenContext.drawImage(hiddenVideo, 0, 0, offscreenCanvas.width, offscreenCanvas.height);

    // Add coordinate grid markers to help AI estimate positions accurately
    const ctx = offscreenContext;
    const w = offscreenCanvas.width;
    const h = offscreenCanvas.height;
    ctx.font = '16px monospace';
    ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.lineWidth = 1;

    // Draw tick marks and labels along top edge every 200px
    for (let x = 0; x <= w; x += 200) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 15);
        ctx.stroke();
        if (x > 0) ctx.fillText(String(x), x + 2, 14);
    }
    // Draw tick marks and labels along left edge every 200px
    for (let y = 0; y <= h; y += 200) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(15, y);
        ctx.stroke();
        if (y > 0) ctx.fillText(String(y), 2, y - 2);
    }

    offscreenCanvas.toBlob(
        async blob => {
            if (!blob) return;
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64data = reader.result.split(',')[1];
                if (!base64data || base64data.length < 100) return;
                screenshotsSent++;
                console.log(`[Screenshot] Sending: ${Math.round(base64data.length / 1024)}KB`);
                const result = await ipcRenderer.invoke('send-image-content', { data: base64data });
                if (!result.success) {
                    console.error('[Screenshot] Send failed:', result.error);
                }
            };
            reader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.7
    );
}

function stopCapture() {
    console.log('[Capture] Stopping all capture');
    if (screenshotInterval) {
        clearInterval(screenshotInterval);
        screenshotInterval = null;
    }
    if (audioProcessor) { audioProcessor.disconnect(); audioProcessor = null; }
    if (micAudioProcessor) { micAudioProcessor.disconnect(); micAudioProcessor = null; }
    if (audioContext) { audioContext.close(); audioContext = null; }
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    if (isMacOS) { ipcRenderer.invoke('stop-macos-audio').catch(() => {}); }
    if (hiddenVideo) { hiddenVideo.pause(); hiddenVideo.srcObject = null; hiddenVideo = null; }
    offscreenCanvas = null;
    offscreenContext = null;

    if (audioPlaybackManager) audioPlaybackManager.stop();
}

// --- Cheddar global object ---
const bubbleApp = document.querySelector('bubble-app');

const cheddar = {
    element: () => bubbleApp,
    e: () => bubbleApp,
    setStatus: text => { if (bubbleApp) bubbleApp.setStatus(text); },
    initializeGemini,
    startCapture,
    stopCapture,
    togglePushToTalk: () => {
        pushToTalkActive = !pushToTalkActive;
        console.log(`[PTT] Push-to-talk: ${pushToTalkActive ? 'ON' : 'OFF'}`);
        if (bubbleApp) bubbleApp.setTalking(pushToTalkActive);
    },
    isLinux,
    isMacOS,
};

window.cheddar = cheddar;
