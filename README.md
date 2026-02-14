# Screen Agent

A desktop AI assistant with a floating bubble UI, voice-in/voice-out interaction, continuous screen watching, and semi-autonomous agent actions (highlight, click, type, scroll).

Powered by Google Gemini 2.0 Flash Live API.

## Key Features

- **Floating Bubble UI**: Minimal 60px draggable bubble that expands to a popup menu
- **Voice Interaction**: Speak naturally and get voice responses from the AI
- **Screen Watching**: Captures screenshots every 5 seconds for visual context
- **Visual Overlay Highlights**: AI draws pulsing highlights on your screen to guide you
- **Agent Actions**: AI can click, type, and scroll on your behalf (with confirmation)
- **Multi-Language**: English, Hindi, Spanish, French, German, Japanese, Korean, Chinese
- **Cross-Platform**: Windows, macOS, Linux

## Setup

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the app:
   ```bash
   npm start
   ```

## Usage

1. Click the floating bubble to open the menu
2. Go to **Settings** and enter your Gemini API key
3. Click **Start Session** to begin
4. Grant screen capture and microphone permissions when prompted
5. Speak to the AI - it sees your screen and responds with voice
6. The AI can highlight areas, click buttons, type text, and scroll for you

## Architecture

```
Main Process (index.js)
  ├── Window Manager (window.js) - Bubble + Overlay windows
  ├── Gemini Integration (gemini.js) - Live API + tool calling
  ├── Agent Actions (agentActions.js) - nut-js click/type/scroll
  └── Config (config.js) - Persistent settings

Renderer Process (renderer.js)
  ├── BubbleApp (BubbleApp.js) - Lit Web Component UI
  ├── Audio Playback (audioPlayback.js) - AI voice output
  └── Screen/Audio Capture - Screenshots + mic/system audio

Overlay Window (overlay.html)
  └── Overlay Manager (overlayManager.js) - Visual highlights
```

## Emergency Close

- **Windows/Linux**: `Ctrl+Shift+E`
- **macOS**: `Cmd+Shift+E`

## Audio Capture

- **macOS**: SystemAudioDump binary for system audio
- **Windows**: Loopback audio capture via getDisplayMedia
- **Linux**: Microphone input (system audio via getDisplayMedia when available)

## Requirements

- Node.js 18+
- Gemini API key
- Screen recording permissions
- Microphone permissions
