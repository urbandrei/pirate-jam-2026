/**
 * HUD - Heads Up Display for PC client
 * Displays player needs (hunger, thirst, rest) and other status info
 */

import { NEED_CRITICAL, NEED_LOW, ITEMS } from '../shared/constants.js';

export class HUD {
    constructor() {
        // Cache DOM references for needs
        this.hungerBar = document.getElementById('hunger-bar');
        this.thirstBar = document.getElementById('thirst-bar');
        this.restBar = document.getElementById('rest-bar');

        this.hungerFill = document.getElementById('hunger-fill');
        this.thirstFill = document.getElementById('thirst-fill');
        this.restFill = document.getElementById('rest-fill');

        // Cache DOM references for held item
        this.heldItemHud = document.getElementById('held-item-hud');
        this.heldItemIcon = document.getElementById('held-item-icon');
        this.heldItemName = document.getElementById('held-item-name');
        this.heldItemCount = document.getElementById('held-item-count');
        this.heldItemHint = document.getElementById('held-item-hint');

        // Track last values to avoid unnecessary DOM updates
        this._lastNeeds = { hunger: -1, thirst: -1, rest: -1 };
        this._lastHeldItem = null;
    }

    /**
     * Update the needs display
     * @param {Object} needs - { hunger, thirst, rest } values 0-100
     */
    updateNeeds(needs) {
        if (!needs) return;

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
     * Update the held item display
     * @param {Object|null} heldItem - The item the player is holding, or null
     */
    updateHeldItem(heldItem) {
        // Skip if item hasn't changed (compare by id and stackCount)
        const itemId = heldItem ? `${heldItem.type}-${heldItem.stackCount || 1}` : null;
        if (itemId === this._lastHeldItem) return;
        this._lastHeldItem = itemId;

        if (!heldItem) {
            // Show empty state
            this.heldItemHud.classList.add('empty');
            this.heldItemIcon.style.backgroundColor = '#333';
            this.heldItemName.textContent = 'Empty';
            this.heldItemCount.textContent = '';
            this.heldItemHint.textContent = '';
            return;
        }

        // Get item definition
        const itemDef = ITEMS[heldItem.type];
        if (!itemDef) {
            // Unknown item type
            this.heldItemHud.classList.remove('empty');
            this.heldItemIcon.style.backgroundColor = '#888';
            this.heldItemName.textContent = heldItem.type;
            this.heldItemCount.textContent = heldItem.stackCount > 1 ? `x${heldItem.stackCount}` : '';
            this.heldItemHint.textContent = 'Click to drop';
            return;
        }

        // Update display with item info
        this.heldItemHud.classList.remove('empty');

        // Convert hex color to CSS
        const colorHex = '#' + itemDef.color.toString(16).padStart(6, '0');
        this.heldItemIcon.style.backgroundColor = colorHex;

        this.heldItemName.textContent = itemDef.name;
        this.heldItemCount.textContent = heldItem.stackCount > 1 ? `x${heldItem.stackCount}` : '';

        // Show hint based on item type
        if (itemDef.hunger) {
            this.heldItemHint.textContent = 'Click to eat';
        } else if (itemDef.rest && heldItem.type === 'coffee') {
            this.heldItemHint.textContent = 'Click to drink';
        } else if (itemDef.thirst && heldItem.type === 'water_container') {
            this.heldItemHint.textContent = 'Click to drink';
        } else {
            this.heldItemHint.textContent = 'Click to drop';
        }
    }

    /**
     * Show death overlay with revive button
     * @param {Function} onReviveClick - Callback when revive button is clicked
     */
    showDeathOverlay(onReviveClick) {
        // Create overlay if it doesn't exist
        if (!this.deathOverlay) {
            this.deathOverlay = document.createElement('div');
            this.deathOverlay.id = 'death-overlay';
            this.deathOverlay.innerHTML = `
                <div id="death-text">You died</div>
                <button id="revive-button">Revive</button>
            `;
            document.getElementById('ui-overlay').appendChild(this.deathOverlay);
        }

        // Show the overlay
        this.deathOverlay.style.display = 'flex';

        // Wire up revive button
        const reviveButton = document.getElementById('revive-button');
        reviveButton.onclick = () => {
            if (onReviveClick) onReviveClick();
        };
    }

    /**
     * Hide death overlay
     */
    hideDeathOverlay() {
        if (this.deathOverlay) {
            this.deathOverlay.style.display = 'none';
        }
    }
}
