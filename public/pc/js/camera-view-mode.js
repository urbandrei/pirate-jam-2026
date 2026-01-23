/**
 * Camera View Mode - Full-screen camera-through view
 *
 * When active, the player sees through the camera they're placing or adjusting.
 * Mouse input adjusts camera pitch/yaw, WASD is disabled.
 * Left-click confirms placement, Escape exits.
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { CAMERA_DEFAULTS } from '../shared/constants.js';

export class CameraViewMode {
    constructor(scene, renderer, controls) {
        this.scene = scene;
        this.renderer = renderer;
        this.controls = controls;

        // State
        this.isActive = false;
        this.mode = null;  // 'placing' or 'adjusting'
        this.cameraId = null;  // For adjusting mode

        // Camera for the view
        this.viewCamera = new THREE.PerspectiveCamera(
            CAMERA_DEFAULTS.FOV,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );

        // Camera position and rotation
        this.position = new THREE.Vector3();
        this.rotation = { pitch: 0, yaw: 0, roll: 0 };

        // Callbacks
        this.onPlaceConfirmed = null;  // (position, rotation) => void
        this.onAdjustConfirmed = null; // (cameraId, rotation) => void
        this.onExit = null;            // () => void

        // Sensitivity for mouse look
        this.sensitivity = 0.002;

        // HUD overlay
        this.overlay = null;
        this.createOverlay();

        // Bind event handlers
        this._onMouseMove = this._handleMouseMove.bind(this);
        this._onMouseDown = this._handleMouseDown.bind(this);
        this._onKeyDown = this._handleKeyDown.bind(this);
    }

    /**
     * Create the HUD overlay for camera view mode
     */
    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'camera-view-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            display: none;
            z-index: 100;
        `;

        // Border to indicate camera view
        const border = document.createElement('div');
        border.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border: 4px solid #00ff00;
            box-sizing: border-box;
        `;
        this.overlay.appendChild(border);

        // Info text at top
        this.infoText = document.createElement('div');
        this.infoText.style.cssText = `
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.7);
            color: #00ff00;
            padding: 10px 20px;
            font-family: monospace;
            font-size: 14px;
            border-radius: 4px;
        `;
        this.overlay.appendChild(this.infoText);

        // Controls hint at bottom
        const hint = document.createElement('div');
        hint.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 10px 20px;
            font-family: monospace;
            font-size: 12px;
            border-radius: 4px;
        `;
        hint.textContent = 'Mouse: Aim | Left-Click: Confirm | Escape: Cancel';
        this.overlay.appendChild(hint);

        // Crosshair
        const crosshair = document.createElement('div');
        crosshair.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            width: 20px;
            height: 20px;
            transform: translate(-50%, -50%);
            border: 2px solid #00ff00;
            border-radius: 50%;
        `;
        this.overlay.appendChild(crosshair);

        document.body.appendChild(this.overlay);
    }

    /**
     * Enter camera view mode for placing a new camera
     * @param {THREE.Vector3} position - Initial camera position
     * @param {Object} rotation - Initial rotation {pitch, yaw, roll}
     */
    enterPlacementMode(position, rotation = { pitch: 0, yaw: 0, roll: 0 }) {
        this.isActive = true;
        this.mode = 'placing';
        this.cameraId = null;

        this.position.copy(position);
        this.rotation = { ...rotation };

        this._updateViewCamera();
        this._showOverlay('PLACING CAMERA');
        this._enableInputCapture();

        // Notify controls to disable player movement
        if (this.controls.setCameraViewMode) {
            this.controls.setCameraViewMode(true);
        }

        console.log('[CameraViewMode] Entered placement mode');
    }

    /**
     * Enter camera view mode for adjusting an existing camera
     * @param {string} cameraId - Camera ID being adjusted
     * @param {THREE.Vector3} position - Camera position
     * @param {Object} rotation - Current rotation {pitch, yaw, roll}
     */
    enterAdjustmentMode(cameraId, position, rotation) {
        this.isActive = true;
        this.mode = 'adjusting';
        this.cameraId = cameraId;

        this.position.copy(position);
        this.rotation = { ...rotation };

        this._updateViewCamera();
        this._showOverlay('ADJUSTING CAMERA');
        this._enableInputCapture();

        // Notify controls to disable player movement
        if (this.controls.setCameraViewMode) {
            this.controls.setCameraViewMode(true);
        }

        console.log(`[CameraViewMode] Entered adjustment mode for camera: ${cameraId}`);
    }

    /**
     * Exit camera view mode
     * @param {boolean} confirmed - Whether the action was confirmed
     */
    exit(confirmed = false) {
        if (!this.isActive) return;

        this.isActive = false;
        this._hideOverlay();
        this._disableInputCapture();

        // Notify controls to re-enable player movement
        if (this.controls.setCameraViewMode) {
            this.controls.setCameraViewMode(false);
        }

        if (confirmed) {
            if (this.mode === 'placing' && this.onPlaceConfirmed) {
                this.onPlaceConfirmed(
                    { x: this.position.x, y: this.position.y, z: this.position.z },
                    { ...this.rotation }
                );
            } else if (this.mode === 'adjusting' && this.onAdjustConfirmed) {
                this.onAdjustConfirmed(this.cameraId, { ...this.rotation });
            }
        } else if (this.onExit) {
            this.onExit();
        }

        this.mode = null;
        this.cameraId = null;

        console.log(`[CameraViewMode] Exited (confirmed: ${confirmed})`);
    }

    /**
     * Update the view camera position and rotation
     */
    _updateViewCamera() {
        this.viewCamera.position.copy(this.position);

        // Apply rotation (YXZ order: yaw first, then pitch)
        this.viewCamera.rotation.order = 'YXZ';
        this.viewCamera.rotation.y = this.rotation.yaw;
        this.viewCamera.rotation.x = this.rotation.pitch;
        this.viewCamera.rotation.z = this.rotation.roll;
    }

    /**
     * Render the scene from the camera's perspective
     * @param {THREE.Scene} scene - The scene to render
     */
    render(scene) {
        if (!this.isActive) return;

        this.renderer.render(scene, this.viewCamera);
    }

    /**
     * Check if camera view mode is active
     * @returns {boolean}
     */
    isInCameraView() {
        return this.isActive;
    }

    /**
     * Get current rotation
     * @returns {Object} {pitch, yaw, roll}
     */
    getRotation() {
        return { ...this.rotation };
    }

    /**
     * Get current position
     * @returns {Object} {x, y, z}
     */
    getPosition() {
        return { x: this.position.x, y: this.position.y, z: this.position.z };
    }

    // ==================== Private Methods ====================

    _showOverlay(text) {
        this.infoText.textContent = text;
        this.overlay.style.display = 'block';
    }

    _hideOverlay() {
        this.overlay.style.display = 'none';
    }

    _enableInputCapture() {
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mousedown', this._onMouseDown);
        document.addEventListener('keydown', this._onKeyDown);
    }

    _disableInputCapture() {
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mousedown', this._onMouseDown);
        document.removeEventListener('keydown', this._onKeyDown);
    }

    _handleMouseMove(event) {
        if (!this.isActive) return;

        // Only capture mouse movement when pointer is locked
        if (document.pointerLockElement) {
            const deltaX = event.movementX || 0;
            const deltaY = event.movementY || 0;

            // Update yaw (horizontal look)
            this.rotation.yaw -= deltaX * this.sensitivity;

            // Update pitch (vertical look) with clamping
            this.rotation.pitch -= deltaY * this.sensitivity;
            this.rotation.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.rotation.pitch));

            this._updateViewCamera();
        }
    }

    _handleMouseDown(event) {
        if (!this.isActive) return;

        // Left-click confirms
        if (event.button === 0) {
            this.exit(true);
        }
    }

    _handleKeyDown(event) {
        if (!this.isActive) return;

        // Escape cancels
        if (event.code === 'Escape') {
            event.preventDefault();
            this.exit(false);
        }
    }

    /**
     * Handle window resize
     */
    onResize() {
        this.viewCamera.aspect = window.innerWidth / window.innerHeight;
        this.viewCamera.updateProjectionMatrix();
    }

    /**
     * Dispose resources
     */
    dispose() {
        this._disableInputCapture();

        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }

        this.overlay = null;
        this.viewCamera = null;
    }
}
