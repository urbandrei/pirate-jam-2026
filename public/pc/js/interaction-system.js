/**
 * PC Client Interaction System
 *
 * Server-authoritative: receives available interaction from server
 * Handles:
 * - Outline highlighting of current target
 * - Interaction prompts
 * - Click handling
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { INTERACTION_RANGE } from '../shared/constants.js';

export class InteractionSystem {
    constructor(scene, camera) {
        this.scene = scene;      // Scene class instance
        this.camera = camera;    // THREE.Camera

        // Current target state (from server)
        this.currentInteraction = null; // { targetId, targetType, interactions[], position }

        // Outline effect material
        this.outlineMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            side: THREE.BackSide,
            transparent: true,
            opacity: 0.5
        });

        // Current outline mesh
        this.outlineMesh = null;
        this.outlineTargetId = null;

        // UI elements
        this.promptElement = this._createPromptElement();
        this.progressBarElement = this._createProgressBarElement();

        // Timed interaction state
        this.timedInteraction = null; // { type, targetId, startTime, duration, targetPosition }

        // Callbacks
        this.onInteract = null; // (interactionType, targetId, targetPosition) => void
        this.onTimedInteractStart = null; // (interactionType, targetId, targetPosition) => void
        this.onTimedInteractCancel = null; // () => void
    }

    /**
     * Set the available interaction from server state
     * @param {Object|null} interaction - { targetId, targetType, interactions[], position } or null
     */
    setAvailableInteraction(interaction) {
        // If same target, just update interactions
        if (interaction && this.currentInteraction &&
            interaction.targetId === this.currentInteraction.targetId) {
            this.currentInteraction = interaction;
            if (interaction.interactions && interaction.interactions.length > 0) {
                this._showPrompt(interaction.interactions[0].prompt);
            }
            return;
        }

        // Clear previous target
        this._clearTarget();

        if (interaction && interaction.interactions && interaction.interactions.length > 0) {
            this.currentInteraction = interaction;

            // Create outline for target
            this._createOutlineForTarget(interaction.targetId, interaction.position);

            // Show prompt
            this._showPrompt(interaction.interactions[0].prompt);
        }
    }

    /**
     * Update interaction system (call each frame)
     * Now just updates outline position if target exists
     */
    update() {
        // Outline position is fixed based on server-provided position
        // No raycasting needed
    }

    /**
     * Handle left-click interaction
     * @returns {boolean} True if interaction was triggered
     */
    handleClick() {
        if (this.currentInteraction && this.currentInteraction.interactions.length > 0) {
            if (this.onInteract) {
                const interaction = this.currentInteraction.interactions[0];
                this.onInteract(
                    interaction.type,
                    this.currentInteraction.targetId,
                    this.currentInteraction.position
                );
                return true;
            }
        }
        return false;
    }

    /**
     * Check if currently targeting something
     * @returns {boolean}
     */
    hasTarget() {
        return this.currentInteraction !== null;
    }

    /**
     * Get current target info
     * @returns {{ targetId: string, targetType: string, interactions: Array, position: Object } | null}
     */
    getCurrentTarget() {
        return this.currentInteraction;
    }

    /**
     * Clear the current target
     * @private
     */
    _clearTarget() {
        this._removeOutline();
        this.currentInteraction = null;
        this._hidePrompt();
    }

    /**
     * Create outline at the target position
     * @private
     */
    _createOutlineForTarget(targetId, position) {
        if (this.outlineTargetId === targetId) return;

        this._removeOutline();

        // Create a simple box outline at the position
        // Size varies by object type - use a default size
        const size = 0.8;
        const geometry = new THREE.BoxGeometry(size, size, size);
        this.outlineMesh = new THREE.Mesh(geometry, this.outlineMaterial);

        this.outlineMesh.position.set(position.x, position.y, position.z);
        this.outlineTargetId = targetId;

        this.scene.scene.add(this.outlineMesh);
    }

    /**
     * Remove current outline
     * @private
     */
    _removeOutline() {
        if (this.outlineMesh) {
            this.scene.scene.remove(this.outlineMesh);
            this.outlineMesh.geometry.dispose();
            this.outlineMesh = null;
            this.outlineTargetId = null;
        }
    }

    /**
     * Create the interaction prompt DOM element
     * @private
     */
    _createPromptElement() {
        const prompt = document.createElement('div');
        prompt.id = 'interaction-prompt';
        prompt.style.cssText = `
            position: absolute;
            top: 55%;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            pointer-events: none;
            display: none;
            z-index: 100;
            white-space: nowrap;
        `;

        // Add to UI overlay or game container
        const overlay = document.getElementById('ui-overlay');
        const container = overlay || document.getElementById('game-container');
        if (container) {
            container.appendChild(prompt);
        }

        return prompt;
    }

    /**
     * Show interaction prompt
     * @param {string|Array} textOrInteractions - Either a simple string or array of {prompt, key} objects
     * @private
     */
    _showPrompt(textOrInteractions) {
        if (Array.isArray(textOrInteractions)) {
            // Multiple interactions with different keys
            const parts = textOrInteractions.map(i => {
                const keyText = i.key || 'Click';
                return `${keyText}: ${i.prompt}`;
            });
            this.promptElement.textContent = parts.join(' | ');
        } else {
            // Simple string - default to "Click to {text}"
            this.promptElement.textContent = `Click to ${textOrInteractions}`;
        }
        this.promptElement.style.display = 'block';
    }

    /**
     * Hide interaction prompt
     * @private
     */
    _hidePrompt() {
        this.promptElement.style.display = 'none';
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        this._removeOutline();

        // Remove prompt element
        if (this.promptElement && this.promptElement.parentNode) {
            this.promptElement.parentNode.removeChild(this.promptElement);
        }

        // Remove progress bar element
        if (this.progressBarElement && this.progressBarElement.parentNode) {
            this.progressBarElement.parentNode.removeChild(this.progressBarElement);
        }

        // Dispose outline material
        this.outlineMaterial.dispose();

        this.currentInteraction = null;
        this.timedInteraction = null;
    }

    // ============================================
    // Timed Interaction Methods
    // ============================================

    /**
     * Start a timed interaction (called when server confirms start)
     * @param {string} type - Interaction type ('wash' or 'cut')
     * @param {string} targetId - Target station ID
     * @param {number} duration - Duration in milliseconds
     */
    startTimedInteraction(type, targetId, duration) {
        // Get target position from current interaction if available
        let targetPosition = null;
        if (this.currentInteraction && this.currentInteraction.position) {
            targetPosition = this.currentInteraction.position;
        }

        this.timedInteraction = {
            type,
            targetId,
            startTime: performance.now(),
            duration,
            targetPosition
        };

        this._showProgressBar();
        console.log(`[InteractionSystem] Started timed interaction: ${type} for ${duration}ms`);
    }

    /**
     * Update timed interaction progress (call each frame)
     * @returns {{ complete: boolean, cancelled: boolean }}
     */
    updateTimedInteraction() {
        if (!this.timedInteraction) {
            return { complete: false, cancelled: false };
        }

        const elapsed = performance.now() - this.timedInteraction.startTime;
        const progress = Math.min(1, elapsed / this.timedInteraction.duration);

        this._updateProgressBar(progress);

        // Check if player moved out of range (client-side check for responsiveness)
        if (this.timedInteraction.targetPosition) {
            const cameraPos = this.camera.position;
            const targetPos = this.timedInteraction.targetPosition;
            const dx = cameraPos.x - targetPos.x;
            const dz = cameraPos.z - targetPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance > INTERACTION_RANGE * 1.5) { // Slightly larger range for tolerance
                console.log('[InteractionSystem] Player moved out of range during timed interaction');
                this.cancelTimedInteraction();
                return { complete: false, cancelled: true };
            }
        }

        // Check if complete (server handles actual completion, this is just for UI)
        if (progress >= 1) {
            // Don't auto-complete - wait for server confirmation
            return { complete: false, cancelled: false };
        }

        return { complete: false, cancelled: false };
    }

    /**
     * Cancel the current timed interaction
     */
    cancelTimedInteraction() {
        if (this.timedInteraction) {
            console.log('[InteractionSystem] Cancelled timed interaction');
            this.timedInteraction = null;
            this._hideProgressBar();

            if (this.onTimedInteractCancel) {
                this.onTimedInteractCancel();
            }
        }
    }

    /**
     * Complete a timed interaction (called when server confirms completion)
     */
    completeTimedInteraction() {
        if (this.timedInteraction) {
            console.log('[InteractionSystem] Completed timed interaction');
            this.timedInteraction = null;
            this._hideProgressBar();
        }
    }

    /**
     * Check if currently in a timed interaction
     * @returns {boolean}
     */
    isInTimedInteraction() {
        return this.timedInteraction !== null;
    }

    /**
     * Get current timed interaction info
     * @returns {Object|null}
     */
    getTimedInteraction() {
        return this.timedInteraction;
    }

    /**
     * Create the progress bar DOM element
     * @private
     */
    _createProgressBarElement() {
        // Container
        const container = document.createElement('div');
        container.id = 'timed-interaction-progress';
        container.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 200px;
            height: 20px;
            background: rgba(0, 0, 0, 0.7);
            border: 2px solid #fff;
            border-radius: 10px;
            overflow: hidden;
            display: none;
            z-index: 150;
        `;

        // Progress fill
        const fill = document.createElement('div');
        fill.id = 'timed-interaction-fill';
        fill.style.cssText = `
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #4CAF50, #8BC34A);
            transition: width 0.1s linear;
        `;
        container.appendChild(fill);

        // Add to UI overlay or game container
        const overlay = document.getElementById('ui-overlay');
        const parentContainer = overlay || document.getElementById('game-container');
        if (parentContainer) {
            parentContainer.appendChild(container);
        }

        return container;
    }

    /**
     * Show the progress bar
     * @private
     */
    _showProgressBar() {
        this.progressBarElement.style.display = 'block';
        const fill = this.progressBarElement.querySelector('#timed-interaction-fill');
        if (fill) {
            fill.style.width = '0%';
        }
    }

    /**
     * Update the progress bar
     * @param {number} progress - Progress 0-1
     * @private
     */
    _updateProgressBar(progress) {
        const fill = this.progressBarElement.querySelector('#timed-interaction-fill');
        if (fill) {
            fill.style.width = `${progress * 100}%`;
        }
    }

    /**
     * Hide the progress bar
     * @private
     */
    _hideProgressBar() {
        this.progressBarElement.style.display = 'none';
    }

    // ============================================
    // Deprecated methods for backward compatibility
    // These are no-ops now that server handles interaction detection
    // ============================================

    registerInteractable(mesh, type, id, interactions) {
        // No-op - server handles interaction detection
    }

    unregisterInteractable(mesh) {
        // No-op - server handles interaction detection
    }

    updateInteractablePrompt(mesh, interactions) {
        // No-op - server handles interaction detection
    }

    clearInteractables() {
        // No-op - server handles interaction detection
    }
}
