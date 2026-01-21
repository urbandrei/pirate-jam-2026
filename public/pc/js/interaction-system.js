/**
 * PC Client Interaction System
 *
 * Handles:
 * - Raycasting from camera to find interactable objects
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

        // Raycaster for interaction detection
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = INTERACTION_RANGE;

        // Current target state
        this.currentTarget = null;
        this.currentInteraction = null;

        // Interactable objects registry
        // Map of mesh.uuid -> { mesh, type, id, interactions }
        this.interactables = new Map();

        // Outline effect material
        this.outlineMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            side: THREE.BackSide,
            transparent: true,
            opacity: 0.5
        });

        // Track outline meshes for cleanup
        this.outlineMeshes = new Map(); // original.uuid -> outlineMesh

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
     * Register an object as interactable
     * @param {THREE.Mesh} mesh - The mesh to make interactable
     * @param {string} type - Interactable type (from INTERACTABLE_TYPES)
     * @param {string} id - Unique identifier
     * @param {Array<{type: string, prompt: string}>} interactions - Available interactions
     */
    registerInteractable(mesh, type, id, interactions) {
        this.interactables.set(mesh.uuid, {
            mesh,
            type,
            id,
            interactions
        });

        // Mark mesh for raycasting
        mesh.userData.interactable = true;
        mesh.userData.interactableId = id;
    }

    /**
     * Unregister an interactable object
     * @param {THREE.Mesh} mesh - The mesh to remove
     */
    unregisterInteractable(mesh) {
        this.interactables.delete(mesh.uuid);
        this._removeOutline(mesh);
    }

    /**
     * Update the interaction prompts for an existing interactable
     * @param {THREE.Mesh} mesh - The mesh to update
     * @param {Array<{type: string, prompt: string}>} interactions - New interactions
     */
    updateInteractablePrompt(mesh, interactions) {
        const data = this.interactables.get(mesh.uuid);
        if (data) {
            data.interactions = interactions;
            // If this is the current target, update the prompt display
            if (this.currentTarget === mesh && interactions.length > 0) {
                this.currentInteraction = interactions[0];
                this._showPrompt(this.currentInteraction.prompt);
            }
        }
    }

    /**
     * Clear all registered interactables
     */
    clearInteractables() {
        for (const [uuid, data] of this.interactables) {
            this._removeOutline(data.mesh);
        }
        this.interactables.clear();
        this._clearTarget();
    }

    /**
     * Update interaction system (call each frame)
     */
    update() {
        // Cast ray from camera center (crosshair)
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

        // Get all interactable meshes
        const interactableMeshes = [];
        for (const [uuid, data] of this.interactables) {
            interactableMeshes.push(data.mesh);
        }

        if (interactableMeshes.length === 0) {
            this._clearTarget();
            return;
        }

        // Find intersections (recursive to handle groups)
        const intersects = this.raycaster.intersectObjects(interactableMeshes, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            // Find the registered interactable (could be the object itself or a parent group)
            let mesh = hit.object;
            let data = this.interactables.get(mesh.uuid);

            // If not found, check parent objects (for plant groups)
            while (!data && mesh.parent) {
                mesh = mesh.parent;
                data = this.interactables.get(mesh.uuid);
            }

            if (data && hit.distance <= INTERACTION_RANGE) {
                this._setTarget(mesh, data, hit.point);
            } else {
                this._clearTarget();
            }
        } else {
            this._clearTarget();
        }

        // Update outline positions for moving objects
        this._updateOutlinePositions();
    }

    /**
     * Handle left-click interaction
     * @returns {boolean} True if interaction was triggered
     */
    handleClick() {
        if (this.currentTarget && this.currentInteraction) {
            const data = this.interactables.get(this.currentTarget.uuid);
            if (data && this.onInteract) {
                // Get world position of target
                const targetPosition = new THREE.Vector3();
                this.currentTarget.getWorldPosition(targetPosition);

                this.onInteract(
                    this.currentInteraction.type,
                    data.id,
                    { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z }
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
        return this.currentTarget !== null;
    }

    /**
     * Get current target info
     * @returns {{ mesh: THREE.Mesh, type: string, id: string, interaction: Object } | null}
     */
    getCurrentTarget() {
        if (!this.currentTarget) return null;
        const data = this.interactables.get(this.currentTarget.uuid);
        return data ? {
            mesh: data.mesh,
            type: data.type,
            id: data.id,
            interaction: this.currentInteraction
        } : null;
    }

    /**
     * Set the current interaction target
     * @private
     */
    _setTarget(mesh, data, hitPoint) {
        // If same target, skip
        if (this.currentTarget === mesh) return;

        // Clear previous target
        this._clearTarget();

        this.currentTarget = mesh;
        this.currentInteraction = data.interactions[0]; // Default to first interaction

        // Add outline highlight
        this._addOutline(mesh);

        // Show prompt
        this._showPrompt(this.currentInteraction.prompt);
    }

    /**
     * Clear the current target
     * @private
     */
    _clearTarget() {
        if (this.currentTarget) {
            this._removeOutline(this.currentTarget);
            this.currentTarget = null;
            this.currentInteraction = null;
            this._hidePrompt();
        }
    }

    /**
     * Add outline highlight to a mesh or group
     * @private
     */
    _addOutline(mesh) {
        if (this.outlineMeshes.has(mesh.uuid)) return;

        // Handle groups (like stations) by creating a bounding box outline
        if (mesh.isGroup || !mesh.geometry) {
            // Create outline from bounding box
            const box = new THREE.Box3().setFromObject(mesh);
            const size = new THREE.Vector3();
            box.getSize(size);

            const geometry = new THREE.BoxGeometry(size.x * 1.05, size.y * 1.05, size.z * 1.05);
            const outlineMesh = new THREE.Mesh(geometry, this.outlineMaterial);

            // Position at center of bounding box
            const center = new THREE.Vector3();
            box.getCenter(center);
            outlineMesh.position.copy(center);

            outlineMesh.userData.sourceUuid = mesh.uuid;
            outlineMesh.userData.isGroupOutline = true;

            this.scene.scene.add(outlineMesh);
            this.outlineMeshes.set(mesh.uuid, outlineMesh);
            return;
        }

        // Clone geometry for outline (regular mesh)
        const geometry = mesh.geometry.clone();
        const outlineMesh = new THREE.Mesh(geometry, this.outlineMaterial);

        // Scale up slightly for outline effect
        outlineMesh.scale.copy(mesh.scale).multiplyScalar(1.05);

        // Copy transform
        outlineMesh.position.copy(mesh.position);
        outlineMesh.rotation.copy(mesh.rotation);
        outlineMesh.quaternion.copy(mesh.quaternion);

        // Store reference to source for position updates
        outlineMesh.userData.sourceUuid = mesh.uuid;

        // Add to scene
        this.scene.scene.add(outlineMesh);
        this.outlineMeshes.set(mesh.uuid, outlineMesh);
    }

    /**
     * Remove outline highlight from a mesh
     * @private
     */
    _removeOutline(mesh) {
        const outlineMesh = this.outlineMeshes.get(mesh.uuid);
        if (outlineMesh) {
            this.scene.scene.remove(outlineMesh);
            outlineMesh.geometry.dispose();
            this.outlineMeshes.delete(mesh.uuid);
        }
    }

    /**
     * Update outline mesh positions to follow their source meshes
     * @private
     */
    _updateOutlinePositions() {
        for (const [uuid, outlineMesh] of this.outlineMeshes) {
            const data = this.interactables.get(uuid);
            if (data) {
                outlineMesh.position.copy(data.mesh.position);
                outlineMesh.rotation.copy(data.mesh.rotation);
                outlineMesh.quaternion.copy(data.mesh.quaternion);
            }
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
     * @private
     */
    _showPrompt(text) {
        this.promptElement.textContent = `Click to ${text}`;
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
        // Remove all outlines
        for (const [uuid, outlineMesh] of this.outlineMeshes) {
            this.scene.scene.remove(outlineMesh);
            outlineMesh.geometry.dispose();
        }
        this.outlineMeshes.clear();
        this.interactables.clear();

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

        this.currentTarget = null;
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
        // Get target position from current target if available
        let targetPosition = null;
        if (this.currentTarget) {
            const pos = new THREE.Vector3();
            this.currentTarget.getWorldPosition(pos);
            targetPosition = { x: pos.x, y: pos.y, z: pos.z };
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
}
