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

        // Callbacks
        this.onInteract = null; // (interactionType, targetId, targetPosition) => void
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
     * Add outline highlight to a mesh
     * @private
     */
    _addOutline(mesh) {
        if (this.outlineMeshes.has(mesh.uuid)) return;

        // Clone geometry for outline
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

        // Dispose outline material
        this.outlineMaterial.dispose();

        this.currentTarget = null;
        this.currentInteraction = null;
    }
}
