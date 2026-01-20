/**
 * HUD - Heads Up Display for PC client
 * Displays player needs (hunger, thirst, rest) and other status info
 */

import { NEED_CRITICAL, NEED_LOW } from '../shared/constants.js';

export class HUD {
    constructor() {
        // Cache DOM references
        this.hungerBar = document.getElementById('hunger-bar');
        this.thirstBar = document.getElementById('thirst-bar');
        this.restBar = document.getElementById('rest-bar');

        this.hungerFill = document.getElementById('hunger-fill');
        this.thirstFill = document.getElementById('thirst-fill');
        this.restFill = document.getElementById('rest-fill');

        // Debug: verify DOM elements exist
        console.log('[HUD] Constructor - hungerFill:', this.hungerFill);
        console.log('[HUD] Constructor - thirstFill:', this.thirstFill);
        console.log('[HUD] Constructor - restFill:', this.restFill);

        // Track last values to avoid unnecessary DOM updates
        this._lastNeeds = { hunger: -1, thirst: -1, rest: -1 };
    }

    /**
     * Update the needs display
     * @param {Object} needs - { hunger, thirst, rest } values 0-100
     */
    updateNeeds(needs) {
        if (!needs) return;

        console.log('[HUD] Updating needs:', JSON.stringify(needs));

        // Update hunger
        if (needs.hunger !== this._lastNeeds.hunger) {
            this._updateBar(this.hungerBar, this.hungerFill, needs.hunger);
            this._lastNeeds.hunger = needs.hunger;
        }

        // Update thirst
        if (needs.thirst !== this._lastNeeds.thirst) {
            this._updateBar(this.thirstBar, this.thirstFill, needs.thirst);
            this._lastNeeds.thirst = needs.thirst;
        }

        // Update rest
        if (needs.rest !== this._lastNeeds.rest) {
            this._updateBar(this.restBar, this.restFill, needs.rest);
            this._lastNeeds.rest = needs.rest;
        }
    }

    /**
     * Update a single need bar
     * @param {HTMLElement} barElement - The container element
     * @param {HTMLElement} fillElement - The fill element
     * @param {number} value - The need value 0-100
     */
    _updateBar(barElement, fillElement, value) {
        // Clamp value to 0-100
        const clampedValue = Math.max(0, Math.min(100, value));

        // Update width
        fillElement.style.width = `${clampedValue}%`;

        // Update critical state
        if (clampedValue <= NEED_CRITICAL) {
            barElement.classList.add('critical');
        } else {
            barElement.classList.remove('critical');
        }
    }

    /**
     * Show or hide the HUD
     * @param {boolean} visible
     */
    setVisible(visible) {
        const hud = document.getElementById('needs-hud');
        if (hud) {
            hud.style.display = visible ? 'flex' : 'none';
        }
    }

    /**
     * Show death overlay (to be expanded later)
     */
    showDeathOverlay() {
        // TODO: Implement death overlay when waiting room is added
        console.log('[HUD] Player died - death overlay not yet implemented');
    }
}
