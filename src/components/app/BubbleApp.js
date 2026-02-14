import { LitElement, html, css } from '../../assets/lit-all-2.7.4.min.js';
const { ipcRenderer } = require('electron');

const BUBBLE_SIZE = 80;
const MENU_WIDTH = 280;
const MENU_HEIGHT = 440;

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
        }

        .bubble {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, #4285f4, #1a73e8);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 20px rgba(66, 133, 244, 0.4);
            transition: transform 0.2s, box-shadow 0.2s;
            position: relative;
            flex-shrink: 0;
        }

        .bubble:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 28px rgba(66, 133, 244, 0.6);
        }

        .bubble.mic-active {
            background: linear-gradient(135deg, #34a853, #1e8e3e);
            box-shadow: 0 4px 20px rgba(52, 168, 83, 0.4);
            animation: glow-green 2s ease-in-out infinite;
        }

        .bubble.ai-speaking {
            animation: pulse-speak 1.2s ease-in-out infinite;
        }

        .bubble.talking {
            background: linear-gradient(135deg, #ea4335, #d93025);
            box-shadow: 0 4px 20px rgba(234, 67, 53, 0.5);
            animation: glow-red 1s ease-in-out infinite;
        }

        .bubble.muted {
            opacity: 0.6;
        }

        .bubble-icon {
            width: 28px;
            height: 28px;
            fill: white;
        }

        .mute-indicator {
            position: absolute;
            top: -2px;
            right: -2px;
            width: 18px;
            height: 18px;
            background: #ea4335;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: white;
            font-weight: bold;
        }

        .menu {
            background: #2a2a2a;
            border-radius: 16px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            width: 100%;
            flex: 1;
            overflow-y: auto;
            border: 1px solid rgba(255, 255, 255, 0.1);
            animation: menu-in 0.2s ease-out;
            margin-bottom: 8px;
        }

        .menu-btn {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border: none;
            border-radius: 10px;
            background: transparent;
            color: #e5e5e7;
            font-size: 14px;
            cursor: pointer;
            transition: background 0.15s;
        }

        .menu-btn:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .menu-btn.active {
            background: rgba(66, 133, 244, 0.2);
            color: #4285f4;
        }

        .menu-btn.mic-active {
            background: rgba(52, 168, 83, 0.2);
            color: #34a853;
        }

        .menu-btn.danger {
            color: #ea4335;
        }

        .menu-btn.danger:hover {
            background: rgba(234, 67, 53, 0.15);
        }

        .menu-icon {
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
        }

        .menu-divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.1);
            margin: 4px 0;
        }

        .status-bar {
            padding: 6px 14px;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.5);
            text-align: center;
        }

        .text-input-row {
            display: flex;
            gap: 6px;
            padding: 4px 0;
        }

        .text-input {
            flex: 1;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 10px;
            color: #e5e5e7;
            padding: 10px 12px;
            font-size: 13px;
            outline: none;
        }

        .text-input::placeholder {
            color: rgba(255, 255, 255, 0.3);
        }

        .text-input:focus {
            border-color: #4285f4;
        }

        .send-btn {
            background: linear-gradient(135deg, #4285f4, #1a73e8);
            border: none;
            border-radius: 10px;
            color: white;
            padding: 10px 14px;
            font-size: 13px;
            cursor: pointer;
            font-weight: 600;
            transition: opacity 0.15s;
        }

        .send-btn:hover {
            opacity: 0.9;
        }

        .send-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        .language-select {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 8px;
            color: #e5e5e7;
            padding: 8px 10px;
            font-size: 13px;
            cursor: pointer;
            width: 100%;
        }

        .language-select option {
            background: #1e1e1e;
            color: #e5e5e7;
        }

        .settings-section {
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .settings-label {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.5);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 0 6px;
        }

        .api-key-input {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 8px;
            color: #e5e5e7;
            padding: 8px 10px;
            font-size: 13px;
            width: 100%;
            box-sizing: border-box;
        }

        .api-key-input::placeholder {
            color: rgba(255, 255, 255, 0.3);
        }

        @keyframes glow-green {
            0%, 100% { box-shadow: 0 4px 20px rgba(52, 168, 83, 0.4); }
            50% { box-shadow: 0 4px 35px rgba(52, 168, 83, 0.7); }
        }

        @keyframes glow-red {
            0%, 100% { box-shadow: 0 4px 20px rgba(234, 67, 53, 0.5); }
            50% { box-shadow: 0 4px 35px rgba(234, 67, 53, 0.8); }
        }

        .talk-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 14px;
            border: none;
            border-radius: 12px;
            background: linear-gradient(135deg, #ea4335, #d93025);
            color: white;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            width: 100%;
            box-sizing: border-box;
        }

        .talk-btn:hover {
            opacity: 0.9;
            transform: scale(1.02);
        }

        .talk-btn.active {
            background: linear-gradient(135deg, #34a853, #1e8e3e);
            animation: glow-green 1.5s ease-in-out infinite;
        }

        .talk-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        .shortcut-hint {
            font-size: 10px;
            color: rgba(255,255,255,0.4);
            text-align: center;
            margin-top: -2px;
        }

        @keyframes pulse-speak {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.08); }
        }

        @keyframes menu-in {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
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
                <button class="${bubbleClass}" @click="${this._toggleMenu}" @contextmenu="${this._openMenu}" title="${this.micActive ? (this.talking ? 'Click to stop recording' : 'Click to talk') : 'Click to open menu'}">
                    <svg class="bubble-icon" viewBox="0 0 24 24">
                        ${this.talking
                            ? html`<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>`
                            : this.micActive
                                ? html`<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/><line x1="3" y1="3" x2="21" y2="21" stroke="white" stroke-width="2"/>`
                                : html`<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>`
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
                    ${this.talking ? '🎙️ Recording... (click to stop)' : '🎤 Push to Talk'}
                </button>
                <div class="shortcut-hint">or click bubble / Ctrl+Shift+A</div>
            ` : ''}

            <button class="menu-btn ${this.muted ? 'active' : ''}" @click="${this._toggleMute}">
                <span class="menu-icon">${this.muted ? '🔇' : '🔊'}</span>
                ${this.muted ? 'Unmute' : 'Mute'}
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
                    <option value="en-US">English</option>
                    <option value="hi-IN">Hindi</option>
                    <option value="es-ES">Spanish</option>
                    <option value="fr-FR">French</option>
                    <option value="de-DE">German</option>
                    <option value="ja-JP">Japanese</option>
                    <option value="ko-KR">Korean</option>
                    <option value="zh-CN">Chinese</option>
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
        // If session is active and menu is closed, bubble click = push-to-talk toggle
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
            this.statusText = 'Stopped';
            if (window.cheddar) {
                window.cheddar.stopCapture();
                await ipcRenderer.invoke('close-session');
            }
        } else {
            const apiKey = localStorage.getItem('apiKey')?.trim() || 'AIzaSyAvWEEOK6iobA4B032arOw3OPK9k9I80kQ';
            if (!apiKey) {
                this.settingsOpen = true;
                this.statusText = 'Set API key first';
                return;
            }
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
            this.statusText = 'Restarting...';
            await ipcRenderer.invoke('restart-gemini-with-language', this.selectedLanguage);
            if (window.cheddar) {
                await window.cheddar.initializeGemini(this.selectedLanguage);
            }
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
