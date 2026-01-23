/**
 * Settings UI for PC client
 * Modal for configuring keybindings
 */

export class SettingsUI {
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
        this.visible = false;
        this.listeningAction = null; // Which action is currently waiting for a key press

        // Callbacks
        this.onClose = null;

        // Cache DOM references
        this.modal = document.getElementById('settings-modal');
        this.closeBtn = document.getElementById('settings-close');
        this.resetBtn = document.getElementById('settings-reset');

        // Get all keybind buttons
        this.keybindButtons = {};
        const buttons = this.modal.querySelectorAll('.keybind-btn');
        buttons.forEach(btn => {
            const action = btn.dataset.action;
            this.keybindButtons[action] = btn;
        });

        this.setupEventListeners();
        this.updateButtonLabels();
    }

    setupEventListeners() {
        // Close button
        this.closeBtn.addEventListener('click', () => {
            this.hide();
        });

        // Escape key to close settings (when not listening for a keybind)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.visible && !this.listeningAction) {
                e.preventDefault();
                this.hide();
            }
        });

        // Reset button
        this.resetBtn.addEventListener('click', () => {
            this.settingsManager.reset();
            this.updateButtonLabels();
        });

        // Keybind buttons - click to start listening
        for (const [action, btn] of Object.entries(this.keybindButtons)) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.startListening(action);
            });
        }

        // Global keydown for capturing new keybinds
        document.addEventListener('keydown', (e) => {
            if (!this.visible || !this.listeningAction) return;

            e.preventDefault();
            e.stopPropagation();

            // Don't allow Escape as a keybind (reserved for closing settings)
            if (e.code === 'Escape') {
                this.stopListening();
                return;
            }

            // Don't allow Enter as a keybind (reserved for chat)
            if (e.code === 'Enter') {
                return;
            }

            // Set the new keybinding
            this.settingsManager.setKeybinding(this.listeningAction, e.code);
            this.stopListening();
            this.updateButtonLabels();
        });

        // Click outside button stops listening
        this.modal.addEventListener('click', () => {
            if (this.listeningAction) {
                this.stopListening();
            }
        });
    }

    /**
     * Start listening for a new key for the given action
     * @param {string} action - The action to rebind
     */
    startListening(action) {
        // Stop any previous listening
        if (this.listeningAction) {
            this.stopListening();
        }

        this.listeningAction = action;
        const btn = this.keybindButtons[action];
        btn.classList.add('listening');
        btn.textContent = 'Press a key...';
    }

    /**
     * Stop listening for key input
     */
    stopListening() {
        if (!this.listeningAction) return;

        const btn = this.keybindButtons[this.listeningAction];
        btn.classList.remove('listening');

        // Restore the current keybinding display
        const keyCode = this.settingsManager.getKeyForAction(this.listeningAction);
        btn.textContent = this.settingsManager.getKeyDisplayName(keyCode);

        this.listeningAction = null;
    }

    /**
     * Update all button labels to show current keybindings
     */
    updateButtonLabels() {
        for (const [action, btn] of Object.entries(this.keybindButtons)) {
            const keyCode = this.settingsManager.getKeyForAction(action);
            btn.textContent = this.settingsManager.getKeyDisplayName(keyCode);
        }
    }

    /**
     * Show the settings modal
     */
    show() {
        this.visible = true;
        this.modal.style.display = 'block';
        this.updateButtonLabels();
    }

    /**
     * Hide the settings modal
     */
    hide() {
        this.visible = false;
        this.modal.style.display = 'none';
        this.stopListening();

        if (this.onClose) {
            this.onClose();
        }
    }

    /**
     * Check if the modal is visible
     * @returns {boolean}
     */
    isVisible() {
        return this.visible;
    }
}
