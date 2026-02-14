import { LitElement, html, css } from '../../assets/lit-all-2.7.4.min.js';
const { ipcRenderer } = require('electron');

const BUBBLE_SIZE = 80;
const MENU_WIDTH = 300;
const MENU_HEIGHT = 480;

class BubbleApp extends LitElement {
    static properties = {
        menuOpen: { type: Boolean },
        micActive: { type: Boolean },
        aiSpeaking: { type: Boolean },
        muted: { type: Boolean },
        talking: { type: Boolean },
        selectedLanguage: { type: String },
        statusText: { type: String },
        settingsOpen: { type: Boolean },
        textInput: { type: String },
    };

    static styles = css`
        :host {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            overflow: hidden;
            user-select: none;
        }

        /* === BUBBLE === */
        .bubble {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, #6366f1, #4f46e5);
            border: 2px solid rgba(255, 255, 255, 0.15);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 24px rgba(99, 102, 241, 0.4), 0 0 0 0 rgba(99, 102, 241, 0);
            transition: transform 0.2s ease, box-shadow 0.3s ease, background 0.3s ease;
            position: relative;
            flex-shrink: 0;
            -webkit-app-region: drag;
        }

        .bubble:hover {
            transform: scale(1.08);
            box-shadow: 0 6px 32px rgba(99, 102, 241, 0.6), 0 0 0 0 rgba(99, 102, 241, 0);
        }

        .bubble:active {
            transform: scale(0.95);
        }

        /* Mic active - green breathing glow */
        .bubble.mic-active {
            background: linear-gradient(135deg, #22c55e, #16a34a);
            border-color: rgba(34, 197, 94, 0.3);
            box-shadow: 0 4px 24px rgba(34, 197, 94, 0.4);
            animation: breathe-green 3s ease-in-out infinite;
        }

        /* User is talking - red pulse */
        .bubble.talking {
            background: linear-gradient(135deg, #ef4444, #dc2626);
            border-color: rgba(239, 68, 68, 0.3);
            animation: pulse-red 0.8s ease-in-out infinite;
        }

        /* AI speaking - blue wave pulse */
        .bubble.ai-speaking {
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            border-color: rgba(59, 130, 246, 0.3);
            animation: wave-blue 1.5s ease-in-out infinite;
        }

        .bubble.muted {
            opacity: 0.5;
            filter: grayscale(0.5);
        }

        .bubble-icon {
            width: 26px;
            height: 26px;
            fill: white;
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
            -webkit-app-region: no-drag;
            pointer-events: none;
        }

        .mute-indicator {
            position: absolute;
            top: -4px;
            right: -4px;
            width: 20px;
            height: 20px;
            background: #ef4444;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: white;
            font-weight: 700;
            border: 2px solid #1e1e1e;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }

        /* Ripple ring when talking */
        .bubble.talking::before,
        .bubble.talking::after {
            content: '';
            position: absolute;
            inset: -6px;
            border-radius: 50%;
            border: 2px solid rgba(239, 68, 68, 0.4);
            animation: ripple 1.5s ease-out infinite;
        }
        .bubble.talking::after {
            animation-delay: 0.5s;
        }

        /* Audio wave rings when AI speaks */
        .bubble.ai-speaking::before,
        .bubble.ai-speaking::after {
            content: '';
            position: absolute;
            inset: -8px;
            border-radius: 50%;
            border: 2px solid rgba(59, 130, 246, 0.3);
            animation: ripple 2s ease-out infinite;
        }
        .bubble.ai-speaking::after {
            animation-delay: 0.7s;
        }

        /* === MENU === */
        .menu {
            background: rgba(30, 30, 30, 0.95);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 18px;
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            width: 100%;
            flex: 1;
            overflow-y: auto;
            border: 1px solid rgba(255, 255, 255, 0.08);
            animation: menu-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            margin-bottom: 10px;
            box-shadow: 0 8px 40px rgba(0,0,0,0.4);
        }

        .menu::-webkit-scrollbar { width: 4px; }
        .menu::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }

        .menu-btn {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 11px 14px;
            border: none;
            border-radius: 12px;
            background: transparent;
            color: #e5e5e7;
            font-size: 13.5px;
            cursor: pointer;
            transition: background 0.15s, transform 0.1s;
            font-weight: 500;
        }

        .menu-btn:hover {
            background: rgba(255, 255, 255, 0.08);
        }

        .menu-btn:active {
            transform: scale(0.98);
        }

        .menu-btn.active {
            background: rgba(99, 102, 241, 0.15);
            color: #818cf8;
        }

        .menu-btn.mic-active {
            background: rgba(34, 197, 94, 0.12);
            color: #4ade80;
        }

        .menu-btn.danger {
            color: #f87171;
        }

        .menu-btn.danger:hover {
            background: rgba(248, 113, 113, 0.1);
        }

        .menu-icon {
            width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 17px;
        }

        .menu-divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.06);
            margin: 6px 0;
        }

        .status-bar {
            padding: 8px 14px;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.35);
            text-align: center;
            letter-spacing: 0.3px;
        }

        /* === TALK BUTTON === */
        .talk-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 14px;
            border: none;
            border-radius: 14px;
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: white;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            width: 100%;
            box-sizing: border-box;
            box-shadow: 0 4px 16px rgba(239, 68, 68, 0.3);
            letter-spacing: 0.3px;
        }

        .talk-btn:hover {
            transform: scale(1.02);
            box-shadow: 0 6px 24px rgba(239, 68, 68, 0.4);
        }

        .talk-btn.active {
            background: linear-gradient(135deg, #22c55e, #16a34a);
            box-shadow: 0 4px 16px rgba(34, 197, 94, 0.3);
            animation: breathe-green 2s ease-in-out infinite;
        }

        .talk-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        .shortcut-hint {
            font-size: 10px;
            color: rgba(255,255,255,0.3);
            text-align: center;
            margin-top: -1px;
            letter-spacing: 0.5px;
        }

        /* === TEXT INPUT === */
        .text-input-row {
            display: flex;
            gap: 6px;
            padding: 4px 0;
        }

        .text-input {
            flex: 1;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            color: #e5e5e7;
            padding: 10px 14px;
            font-size: 13px;
            outline: none;
            transition: border-color 0.2s;
        }

        .text-input::placeholder {
            color: rgba(255, 255, 255, 0.25);
        }

        .text-input:focus {
            border-color: rgba(99, 102, 241, 0.5);
            background: rgba(255, 255, 255, 0.08);
        }

        .send-btn {
            background: linear-gradient(135deg, #6366f1, #4f46e5);
            border: none;
            border-radius: 12px;
            color: white;
            padding: 10px 16px;
            font-size: 13px;
            cursor: pointer;
            font-weight: 600;
            transition: opacity 0.15s, transform 0.1s;
        }

        .send-btn:hover { opacity: 0.9; }
        .send-btn:active { transform: scale(0.96); }
        .send-btn:disabled { opacity: 0.3; cursor: not-allowed; }

        /* === SETTINGS === */
        .language-select {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            color: #e5e5e7;
            padding: 10px 12px;
            font-size: 13px;
            cursor: pointer;
            width: 100%;
            transition: border-color 0.2s;
        }

        .language-select:focus { border-color: rgba(99, 102, 241, 0.5); outline: none; }
        .language-select option { background: #1e1e1e; color: #e5e5e7; }

        .settings-section {
            padding: 8px 4px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .settings-label {
            font-size: 10px;
            color: rgba(255, 255, 255, 0.4);
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
            padding: 0 6px;
        }

        .api-key-input {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            color: #e5e5e7;
            padding: 10px 12px;
            font-size: 13px;
            width: 100%;
            box-sizing: border-box;
            outline: none;
        }
        .api-key-input:focus { border-color: rgba(99, 102, 241, 0.5); }
        .api-key-input::placeholder { color: rgba(255, 255, 255, 0.25); }

        /* === ANIMATIONS === */
        @keyframes breathe-green {
            0%, 100% { box-shadow: 0 4px 24px rgba(34, 197, 94, 0.3); }
            50% { box-shadow: 0 4px 40px rgba(34, 197, 94, 0.6); }
        }

        @keyframes pulse-red {
            0%, 100% { transform: scale(1); box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4); }
            50% { transform: scale(1.06); box-shadow: 0 4px 32px rgba(239, 68, 68, 0.7); }
        }

        @keyframes wave-blue {
            0%, 100% { transform: scale(1); box-shadow: 0 4px 20px rgba(59, 130, 246, 0.3); }
            50% { transform: scale(1.05); box-shadow: 0 4px 32px rgba(59, 130, 246, 0.6); }
        }

        @keyframes ripple {
            0% { inset: -4px; opacity: 1; }
            100% { inset: -20px; opacity: 0; }
        }

        @keyframes menu-in {
            from { opacity: 0; transform: translateY(10px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
    `;

    constructor() {
        super();
        this.menuOpen = false;
        this.micActive = false;
        this.aiSpeaking = false;
        this.muted = false;
        this.talking = false;
        this.selectedLanguage = localStorage.getItem('selectedLanguage') || 'en-US';
        this.statusText = 'Ready';
        this.settingsOpen = false;
        this.textInput = '';
    }

    render() {
        const bubbleClass = `bubble ${this.micActive ? 'mic-active' : ''} ${this.aiSpeaking ? 'ai-speaking' : ''} ${this.talking ? 'talking' : ''} ${this.muted ? 'muted' : ''}`;

        if (!this.menuOpen) {
            return html`
                <button class="${bubbleClass}" @click="${this._toggleMenu}" @contextmenu="${this._openMenu}">
                    <svg class="bubble-icon" viewBox="0 0 24 24">
                        ${this.talking
                            ? html`<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>`
                            : this.aiSpeaking
                                ? html`<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`
                                : this.micActive
                                    ? html`<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>`
                                    : html`<circle cx="12" cy="12" r="3"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>`
                        }
                    </svg>
                    ${this.muted ? html`<div class="mute-indicator">M</div>` : ''}
                </button>
            `;
        }

        return html`
            <div class="menu">
                ${this.settingsOpen ? this._renderSettings() : this._renderMainMenu()}
            </div>
            <button class="${bubbleClass}" @click="${this._toggleMenu}">
                <svg class="bubble-icon" viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
            </button>
        `;
    }

    _renderMainMenu() {
        return html`
            <button class="menu-btn ${this.micActive ? 'mic-active' : ''}" @click="${this._toggleMic}">
                <span class="menu-icon">${this.micActive ? '🟢' : '🎤'}</span>
                ${this.micActive ? 'End Session' : 'Start Session'}
            </button>

            ${this.micActive ? html`
                <button
                    class="talk-btn ${this.talking ? 'active' : ''}"
                    @click="${this._toggleTalk}"
                >
                    ${this.talking ? '🎙️ Recording... (tap to stop)' : '🎤 Hold to Talk'}
                </button>
                <div class="shortcut-hint">or press Ctrl+Shift+A</div>
            ` : ''}

            <button class="menu-btn ${this.muted ? 'active' : ''}" @click="${this._toggleMute}">
                <span class="menu-icon">${this.muted ? '🔇' : '🔊'}</span>
                ${this.muted ? 'Unmute AI' : 'Mute AI'}
            </button>

            <div class="menu-divider"></div>

            <div class="text-input-row">
                <input
                    class="text-input"
                    type="text"
                    placeholder="${this.micActive ? 'Type a message...' : 'Start session first'}"
                    .value="${this.textInput}"
                    @input="${e => { this.textInput = e.target.value; }}"
                    @keydown="${this._onTextKeydown}"
                    ?disabled="${!this.micActive}"
                />
                <button
                    class="send-btn"
                    @click="${this._sendTextMessage}"
                    ?disabled="${!this.micActive || !this.textInput.trim()}"
                >Send</button>
            </div>

            <div class="menu-divider"></div>

            <button class="menu-btn" @click="${() => { this.settingsOpen = true; }}">
                <span class="menu-icon">⚙️</span>
                Settings
            </button>

            <button class="menu-btn danger" @click="${this._quit}">
                <span class="menu-icon">✕</span>
                Quit
            </button>

            <div class="status-bar">${this.statusText}</div>
        `;
    }

    _renderSettings() {
        return html`
            <button class="menu-btn" @click="${() => { this.settingsOpen = false; }}">
                <span class="menu-icon">←</span>
                Back
            </button>

            <div class="menu-divider"></div>

            <div class="settings-section">
                <div class="settings-label">API Key</div>
                <input
                    class="api-key-input"
                    type="password"
                    placeholder="Gemini API Key"
                    .value="${localStorage.getItem('apiKey') || ''}"
                    @change="${this._onApiKeyChange}"
                />
            </div>

            <div class="settings-section">
                <div class="settings-label">Language</div>
                <select class="language-select" @change="${this._onLanguageChange}" .value="${this.selectedLanguage}">
                    <option value="en-US">🇺🇸 English</option>
                    <option value="hi-IN">🇮🇳 Hindi</option>
                    <option value="bn-IN">🇮🇳 Bengali</option>
                    <option value="ta-IN">🇮🇳 Tamil</option>
                    <option value="te-IN">🇮🇳 Telugu</option>
                    <option value="mr-IN">🇮🇳 Marathi</option>
                    <option value="gu-IN">🇮🇳 Gujarati</option>
                    <option value="kn-IN">🇮🇳 Kannada</option>
                    <option value="ml-IN">🇮🇳 Malayalam</option>
                    <option value="pa-IN">🇮🇳 Punjabi</option>
                    <option value="es-ES">🇪🇸 Spanish</option>
                    <option value="fr-FR">🇫🇷 French</option>
                    <option value="de-DE">🇩🇪 German</option>
                    <option value="pt-BR">🇧🇷 Portuguese</option>
                    <option value="it-IT">🇮🇹 Italian</option>
                    <option value="ru-RU">🇷🇺 Russian</option>
                    <option value="ja-JP">🇯🇵 Japanese</option>
                    <option value="ko-KR">🇰🇷 Korean</option>
                    <option value="zh-CN">🇨🇳 Chinese</option>
                    <option value="ar-SA">🇸🇦 Arabic</option>
                    <option value="th-TH">🇹🇭 Thai</option>
                    <option value="vi-VN">🇻🇳 Vietnamese</option>
                    <option value="id-ID">🇮🇩 Indonesian</option>
                    <option value="tr-TR">🇹🇷 Turkish</option>
                    <option value="nl-NL">🇳🇱 Dutch</option>
                    <option value="pl-PL">🇵🇱 Polish</option>
                    <option value="uk-UA">🇺🇦 Ukrainian</option>
                    <option value="sv-SE">🇸🇪 Swedish</option>
                </select>
            </div>

            <div class="menu-divider"></div>

            <button class="menu-btn" @click="${this._testOverlay}">
                <span class="menu-icon">🔲</span>
                Test Overlay
            </button>
        `;
    }

    _toggleMenu() {
        if (this.micActive && !this.menuOpen) {
            this._toggleTalk();
            return;
        }
        this.menuOpen = !this.menuOpen;
        if (!this.menuOpen) {
            this.settingsOpen = false;
        }
        this._resizeWindow();
    }

    _resizeWindow() {
        if (this.menuOpen) {
            ipcRenderer.invoke('resize-bubble-window', MENU_WIDTH, MENU_HEIGHT);
        } else {
            ipcRenderer.invoke('resize-bubble-window', BUBBLE_SIZE, BUBBLE_SIZE);
        }
    }

    async _toggleMic() {
        if (this.micActive) {
            this.micActive = false;
            this.talking = false;
            this.statusText = 'Stopped';
            if (window.cheddar) {
                window.cheddar.stopCapture();
                await ipcRenderer.invoke('close-session');
            }
        } else {
            this.micActive = true;
            this.statusText = 'Connecting...';
            if (window.cheddar) {
                await window.cheddar.initializeGemini(this.selectedLanguage);
                window.cheddar.startCapture();
            }
        }
        this.menuOpen = false;
        this._resizeWindow();
    }

    _openMenu(e) {
        e.preventDefault();
        this.menuOpen = true;
        this._resizeWindow();
    }

    _toggleTalk() {
        if (window.cheddar) {
            window.cheddar.togglePushToTalk();
        }
    }

    _toggleMute() {
        this.muted = !this.muted;
        if (window.audioPlaybackManager) {
            window.audioPlaybackManager.setMuted(this.muted);
        }
    }

    _onTextKeydown(e) {
        if (e.key === 'Enter' && this.textInput.trim() && this.micActive) {
            this._sendTextMessage();
        }
    }

    async _sendTextMessage() {
        const text = this.textInput.trim();
        if (!text || !this.micActive) return;

        console.log(`[UI] Sending text message: "${text}"`);
        this.statusText = `Sent: "${text}"`;
        this.textInput = '';

        const result = await ipcRenderer.invoke('send-text-message', text);
        if (!result.success) {
            console.error('[UI] Text send failed:', result.error);
            this.statusText = 'Send failed: ' + result.error;
        }
    }

    _onApiKeyChange(e) {
        localStorage.setItem('apiKey', e.target.value.trim());
        this.statusText = 'API key saved';
    }

    async _onLanguageChange(e) {
        this.selectedLanguage = e.target.value;
        localStorage.setItem('selectedLanguage', this.selectedLanguage);
        if (this.micActive) {
            this.statusText = 'Restarting with new language...';
            await ipcRenderer.invoke('close-session');
            if (window.cheddar) {
                await window.cheddar.initializeGemini(this.selectedLanguage);
            }
            this.statusText = 'Connected';
        }
    }

    async _testOverlay() {
        console.log('[Test] Sending test highlight');
        await ipcRenderer.invoke('highlight-area', {
            x: 100, y: 100, width: 300, height: 200, label: 'Test Highlight!'
        });
        this.statusText = 'Test highlight sent!';
    }

    async _quit() {
        await ipcRenderer.invoke('quit-application');
    }

    setStatus(text) {
        this.statusText = text;
        if (text === 'Live' || text === 'Live session connected') {
            this.statusText = 'Connected';
        }
    }

    setAiSpeaking(speaking) {
        this.aiSpeaking = speaking;
    }

    setTalking(talking) {
        this.talking = talking;
    }
}

customElements.define('bubble-app', BubbleApp);
