/**
 * Settings Manager for PC client
 * Handles keybinding and video settings storage with localStorage persistence
 */

const STORAGE_KEY = 'pirate-jam-settings';

export class SettingsManager {
    constructor() {
        this.DEFAULT_KEYBINDINGS = {
            forward: 'KeyW',
            backward: 'KeyS',
            left: 'KeyA',
            right: 'KeyD',
            jump: 'Space'
        };

        this.DEFAULT_VIDEO_SETTINGS = {
            cameraFeedQuality: 'high'  // 'low', 'medium', or 'high'
        };

        const loaded = this.load();
        this.keybindings = loaded.keybindings;
        this.videoSettings = loaded.videoSettings;
    }

    /**
     * Load settings from localStorage
     * @returns {Object} { keybindings, videoSettings }
     */
    load() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                // Merge with defaults in case new settings are added
                return {
                    keybindings: { ...this.DEFAULT_KEYBINDINGS, ...parsed.keybindings },
                    videoSettings: { ...this.DEFAULT_VIDEO_SETTINGS, ...parsed.videoSettings }
                };
            }
        } catch (e) {
            console.warn('[SettingsManager] Failed to load settings:', e);
        }
        return {
            keybindings: { ...this.DEFAULT_KEYBINDINGS },
            videoSettings: { ...this.DEFAULT_VIDEO_SETTINGS }
        };
    }

    /**
     * Save current settings to localStorage
     */
    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                keybindings: this.keybindings,
                videoSettings: this.videoSettings
            }));
        } catch (e) {
            console.warn('[SettingsManager] Failed to save settings:', e);
        }
    }

    /**
     * Get the action for a given key code
     * @param {string} keyCode - The keyboard event code (e.g., 'KeyW')
     * @returns {string|null} The action name or null if not bound
     */
    getActionForKey(keyCode) {
        for (const [action, key] of Object.entries(this.keybindings)) {
            if (key === keyCode) {
                return action;
            }
        }
        return null;
    }

    /**
     * Get the key bound to an action
     * @param {string} action - The action name (e.g., 'forward')
     * @returns {string} The key code
     */
    getKeyForAction(action) {
        return this.keybindings[action] || this.DEFAULT_KEYBINDINGS[action];
    }

    /**
     * Set a keybinding for an action
     * @param {string} action - The action name
     * @param {string} keyCode - The new key code
     */
    setKeybinding(action, keyCode) {
        // Remove this key from any other action first (prevent duplicates)
        for (const [otherAction, key] of Object.entries(this.keybindings)) {
            if (key === keyCode && otherAction !== action) {
                // Swap: give the other action our old key
                this.keybindings[otherAction] = this.keybindings[action];
            }
        }
        this.keybindings[action] = keyCode;
        this.save();
    }

    /**
     * Reset all keybindings to defaults
     */
    reset() {
        this.keybindings = { ...this.DEFAULT_KEYBINDINGS };
        this.save();
    }

    /**
     * Get a video setting
     * @param {string} key - Setting key (e.g., 'cameraFeedQuality')
     * @returns {*} Setting value
     */
    getVideoSetting(key) {
        return this.videoSettings[key] ?? this.DEFAULT_VIDEO_SETTINGS[key];
    }

    /**
     * Set a video setting
     * @param {string} key - Setting key
     * @param {*} value - Setting value
     */
    setVideoSetting(key, value) {
        this.videoSettings[key] = value;
        this.save();
    }

    /**
     * Reset video settings to defaults
     */
    resetVideoSettings() {
        this.videoSettings = { ...this.DEFAULT_VIDEO_SETTINGS };
        this.save();
    }

    /**
     * Get display name for a key code
     * @param {string} keyCode - The keyboard event code
     * @returns {string} Human-readable key name
     */
    getKeyDisplayName(keyCode) {
        // Handle common key codes
        if (keyCode.startsWith('Key')) {
            return keyCode.slice(3); // KeyW -> W
        }
        if (keyCode.startsWith('Digit')) {
            return keyCode.slice(5); // Digit1 -> 1
        }

        const displayNames = {
            'Space': 'Space',
            'ShiftLeft': 'L Shift',
            'ShiftRight': 'R Shift',
            'ControlLeft': 'L Ctrl',
            'ControlRight': 'R Ctrl',
            'AltLeft': 'L Alt',
            'AltRight': 'R Alt',
            'ArrowUp': '↑',
            'ArrowDown': '↓',
            'ArrowLeft': '←',
            'ArrowRight': '→',
            'Tab': 'Tab',
            'CapsLock': 'Caps',
            'Backspace': 'Backspace',
            'Enter': 'Enter',
            'Escape': 'Esc'
        };

        return displayNames[keyCode] || keyCode;
    }
}
