// AudioPlaybackManager - handles Gemini audio output playback in the renderer process
// Receives base64 PCM audio, decodes, and plays through speakers

class AudioPlaybackManager {
    constructor() {
        this.audioContext = null;
        this.queue = [];
        this.isPlaying = false;
        this.muted = false;
        this.currentSource = null;
        this.sampleRate = 24000; // Gemini outputs 24kHz PCM
        this._wasSpeaking = false; // Track actual speaking state
        this._stopDebounce = null; // Debounce stop event
    }

    _ensureContext() {
        if (!this.audioContext) {
            this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    // Add audio data to playback queue
    enqueue(base64Data, mimeType) {
        if (this.muted) return;

        this._ensureContext();

        try {
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Convert PCM16 to Float32
            const int16Array = new Int16Array(bytes.buffer);
            const float32Array = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) {
                float32Array[i] = int16Array[i] / 32768.0;
            }

            // Create AudioBuffer
            const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, this.sampleRate);
            audioBuffer.getChannelData(0).set(float32Array);

            this.queue.push(audioBuffer);

            // Cancel any pending stop event since we have more audio
            if (this._stopDebounce) {
                clearTimeout(this._stopDebounce);
                this._stopDebounce = null;
            }

            // Fire started-speaking only once at the beginning
            if (!this._wasSpeaking) {
                this._wasSpeaking = true;
                this._dispatchEvent('ai-started-speaking');
            }

            if (!this.isPlaying) {
                this._playNext();
            }
        } catch (error) {
            console.error('Error processing audio data:', error);
        }
    }

    _playNext() {
        if (this.queue.length === 0) {
            this.isPlaying = false;
            // Debounce the stop event - wait 500ms to see if more audio arrives
            // This prevents the mic from unmuting between chunks
            if (this._stopDebounce) clearTimeout(this._stopDebounce);
            this._stopDebounce = setTimeout(() => {
                if (!this.isPlaying && this.queue.length === 0) {
                    this._wasSpeaking = false;
                    this._dispatchEvent('ai-stopped-speaking');
                }
            }, 500);
            return;
        }

        this.isPlaying = true;

        const audioBuffer = this.queue.shift();
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        this.currentSource = source;

        source.onended = () => {
            this.currentSource = null;
            this._playNext();
        };

        source.start();
    }

    setMuted(muted) {
        this.muted = muted;
        if (muted) {
            this.stop();
        }
    }

    stop() {
        this.queue = [];
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) {}
            this.currentSource = null;
        }
        this.isPlaying = false;
        this._wasSpeaking = false;
        if (this._stopDebounce) {
            clearTimeout(this._stopDebounce);
            this._stopDebounce = null;
        }
        this._dispatchEvent('ai-stopped-speaking');
    }

    _dispatchEvent(name) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(name));
        }
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.AudioPlaybackManager = AudioPlaybackManager;
}
