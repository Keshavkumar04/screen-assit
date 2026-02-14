const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_CONFIG = {
    language: 'en-US',
    apiKey: '',
};

function getConfigDir() {
    const platform = os.platform();
    if (platform === 'win32') {
        return path.join(os.homedir(), 'AppData', 'Roaming', 'screen-agent-config');
    } else if (platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'screen-agent-config');
    }
    return path.join(os.homedir(), '.config', 'screen-agent-config');
}

function getConfigFilePath() {
    return path.join(getConfigDir(), 'config.json');
}

function ensureConfigDir() {
    const configDir = getConfigDir();
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
}

function getLocalConfig() {
    try {
        ensureConfigDir();
        const configFilePath = getConfigFilePath();
        let existing = {};
        try {
            if (fs.existsSync(configFilePath)) {
                existing = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
            }
        } catch (e) {}
        return { ...DEFAULT_CONFIG, ...existing };
    } catch (error) {
        return { ...DEFAULT_CONFIG };
    }
}

function writeConfig(config) {
    ensureConfigDir();
    fs.writeFileSync(getConfigFilePath(), JSON.stringify(config, null, 2), 'utf8');
}

module.exports = { getLocalConfig, writeConfig };
