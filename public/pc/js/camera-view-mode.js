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
        this.mode = null;  // 'placing', 'adjusting', 'viewing', or 'monitor'
        this.cameraId = null;  // For adjusting/viewing mode
        this.monitorId = null; // For monitor mode
        this.cameraIds = [];   // All available camera IDs for navigation
        this.currentCameraIndex = -1;  // Current index in cameraIds

        // Camera for the view
        this.viewCamera = new THREE.PerspectiveCamera(
            CAMERA_DEFAULTS.FOV,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );

        // Enable view camera to see both layer 0 (world) and layer 1 (player mesh)
        this.viewCamera.layers.enable(0);
        this.viewCamera.layers.enable(1);

        // Camera position and rotation
        this.position = new THREE.Vector3();
        this.rotation = { pitch: 0, yaw: 0, roll: 0 };

        // Callbacks
        this.onPlaceConfirmed = null;  // (position, rotation) => void
        this.onAdjustConfirmed = null; // (cameraId, rotation) => void
        this.onRotationUpdate = null;  // (cameraId, rotation) => void - real-time updates
        this.onExit = null;            // () => void
        this.onMonitorCameraChange = null;  // (monitorId, cameraId) => void - navigation in monitor mode
        this.onMonitorExit = null;     // (monitorId) => void - exiting monitor mode

        // External references for rendering
        this.getCameraMeshes = null;   // () => Map<cameraId, mesh>
        this.getPlayerMesh = null;     // () => THREE.Group
        this.getHeldItemMesh = null;   // () => THREE.Mesh (local player's held item)
        this.getPlayerPosition = null; // () => {x, y, z}
        this.getRemotePlayers = null;  // () => RemotePlayers instance
        this.getCameraData = null;     // (cameraId) => camera data with ownerId

        // Player mesh visibility state
        this._playerMeshWasInScene = false;

        // Sensitivity for mouse look
        this.sensitivity = 0.002;

        // Throttle for real-time updates (send at most every 50ms)
        this._lastUpdateTime = 0;
        this._updateInterval = 50;

        // HUD overlay
        this.overlay = null;
        this.createOverlay();

        // Monitor overlay
        this.monitorOverlay = null;
        this.cameraCounter = null;
        this.createMonitorOverlay();

        // Touch state for mobile
        this._touchState = {
            active: false,
            startX: 0,
            startY: 0,
            lastX: 0,
            lastY: 0,
            startTime: 0,
            moved: false
        };
        this._touchSensitivity = 0.005;  // Similar to mobile-controls.js

        // Bind event handlers
        this._onMouseMove = this._handleMouseMove.bind(this);
        this._onMouseDown = this._handleMouseDown.bind(this);
        this._onKeyDown = this._handleKeyDown.bind(this);
        this._onMonitorClick = this._handleMonitorClick.bind(this);
        this._onTouchStart = this._handleTouchStart.bind(this);
        this._onTouchMove = this._handleTouchMove.bind(this);
        this._onTouchEnd = this._handleTouchEnd.bind(this);
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
        hint.textContent = 'Drag: Aim | Click/Tap: Confirm | Escape: Cancel';
        this.hintText = hint;  // Store reference for updating
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
     * Create the HUD overlay for monitor viewing mode
     * Different from camera view - has navigation buttons
     */
    createMonitorOverlay() {
        this.monitorOverlay = document.createElement('div');
        this.monitorOverlay.id = 'monitor-view-overlay';
        this.monitorOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: none;
            z-index: 100;
            cursor: default;
        `;

        // Dark border to indicate monitor view
        const border = document.createElement('div');
        border.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border: 4px solid #2196F3;
            box-sizing: border-box;
            pointer-events: none;
        `;
        this.monitorOverlay.appendChild(border);

        // Navigation container (top-right corner)
        const navContainer = document.createElement('div');
        navContainer.id = 'monitor-nav-container';
        navContainer.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
            background: rgba(0, 0, 0, 0.8);
            padding: 10px 15px;
            border-radius: 8px;
            pointer-events: auto;
        `;

        // Previous button
        const prevBtn = document.createElement('button');
        prevBtn.id = 'monitor-prev-btn';
        prevBtn.textContent = '◀';
        prevBtn.style.cssText = `
            background: #2196F3;
            color: white;
            border: none;
            padding: 8px 15px;
            font-size: 16px;
            cursor: pointer;
            border-radius: 4px;
        `;
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._navigateCamera(-1);
        });
        navContainer.appendChild(prevBtn);

        // Camera counter
        this.cameraCounter = document.createElement('span');
        this.cameraCounter.id = 'monitor-camera-counter';
        this.cameraCounter.style.cssText = `
            color: white;
            font-family: monospace;
            font-size: 16px;
            min-width: 50px;
            text-align: center;
        `;
        this.cameraCounter.textContent = '0/0';
        navContainer.appendChild(this.cameraCounter);

        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.id = 'monitor-next-btn';
        nextBtn.textContent = '▶';
        nextBtn.style.cssText = `
            background: #2196F3;
            color: white;
            border: none;
            padding: 8px 15px;
            font-size: 16px;
            cursor: pointer;
            border-radius: 4px;
        `;
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._navigateCamera(1);
        });
        navContainer.appendChild(nextBtn);

        this.monitorOverlay.appendChild(navContainer);

        // Hint at bottom
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
            pointer-events: none;
        `;
        hint.textContent = 'Click outside buttons or press ESC to exit';
        this.monitorOverlay.appendChild(hint);

        document.body.appendChild(this.monitorOverlay);
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

        // Show player mesh so they can see themselves through the camera
        this._showPlayerMesh();

        // Notify controls to disable player movement
        if (this.controls.setCameraViewMode) {
            this.controls.setCameraViewMode(true);
        }

        console.log(`[CameraViewMode] Entered adjustment mode for camera: ${cameraId}`);
    }

    /**
     * Enter camera view mode for viewing only (no adjustment)
     * Used for security room monitors
     * @param {string} cameraId - Camera ID being viewed
     * @param {THREE.Vector3} position - Camera position
     * @param {Object} rotation - Camera rotation {pitch, yaw, roll}
     */
    enterViewOnlyMode(cameraId, position, rotation) {
        this.isActive = true;
        this.mode = 'viewing';
        this.cameraId = cameraId;

        this.position.copy(position);
        this.rotation = { ...rotation };

        this._updateViewCamera();
        this._showOverlay('VIEWING CAMERA');

        // Only listen for Escape key in view mode, no mouse input
        document.addEventListener('keydown', this._onKeyDown);

        // Show player mesh so they can see themselves through the camera
        this._showPlayerMesh();

        // Notify controls to disable player movement
        if (this.controls.setCameraViewMode) {
            this.controls.setCameraViewMode(true);
        }

        console.log(`[CameraViewMode] Entered view-only mode for camera: ${cameraId}`);
    }

    /**
     * Enter monitor viewing mode with free mouse and navigation
     * @param {string} monitorId - Monitor ID being viewed
     * @param {string} cameraId - Currently assigned camera ID (can be null)
     * @param {Array<string>} cameraIds - All available camera IDs for navigation
     * @param {Object} cameraData - Map of cameraId -> {position, rotation, ownerId}
     * @param {string} localPlayerId - Local player's ID for visibility check
     */
    enterMonitorViewMode(monitorId, cameraId, cameraIds, cameraData, localPlayerId = null) {
        this.isActive = true;
        this.mode = 'monitor';
        this.monitorId = monitorId;
        this.cameraIds = cameraIds || [];
        this.currentCameraIndex = cameraId ? this.cameraIds.indexOf(cameraId) : -1;

        let cameraOwnerId = null;

        // If we have a camera, set up the view
        if (cameraId && cameraData && cameraData[cameraId]) {
            const camData = cameraData[cameraId];
            this.cameraId = cameraId;
            this.position.set(camData.position.x, camData.position.y, camData.position.z);
            this.rotation = {
                pitch: camData.rotation.pitch || 0,
                yaw: camData.rotation.yaw || 0,
                roll: camData.rotation.roll || 0
            };
            cameraOwnerId = camData.ownerId;
        } else {
            // No camera assigned - show static
            this.cameraId = null;
            this.position.set(0, 0, 0);
            this.rotation = { pitch: 0, yaw: 0, roll: 0 };
        }

        this._updateViewCamera();
        this._showMonitorOverlay();

        // Show player mesh only if camera is not held by local player
        const isHeldByLocalPlayer = cameraOwnerId && cameraOwnerId === `held_${localPlayerId}`;
        if (!isHeldByLocalPlayer) {
            this._showPlayerMesh();
        }

        // Release pointer lock for free mouse
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        // Listen for clicks outside buttons and keyboard
        document.addEventListener('keydown', this._onKeyDown);
        this.monitorOverlay.addEventListener('click', this._onMonitorClick);

        // Notify controls to disable player movement but allow mouse
        if (this.controls.setMonitorViewMode) {
            this.controls.setMonitorViewMode(true);
        }

        console.log(`[CameraViewMode] Entered monitor view mode for: ${monitorId}, camera: ${cameraId}`);
    }

    /**
     * Update monitor view camera when camera changes
     * @param {string} cameraId - New camera ID
     * @param {Object} cameraData - Camera data with position and rotation
     */
    updateMonitorCamera(cameraId, cameraData) {
        if (this.mode !== 'monitor') return;

        this.cameraId = cameraId;
        this.currentCameraIndex = this.cameraIds.indexOf(cameraId);

        if (cameraData) {
            this.position.set(cameraData.position.x, cameraData.position.y, cameraData.position.z);
            this.rotation = {
                pitch: cameraData.rotation.pitch || 0,
                yaw: cameraData.rotation.yaw || 0,
                roll: cameraData.rotation.roll || 0
            };
        }

        this._updateViewCamera();
        this._updateCameraCounter();
    }

    /**
     * Update the camera view position from current camera state (called each frame)
     * This ensures the view updates when the camera moves (e.g., held by player)
     * @param {Object} cameraData - Current camera data { position, rotation, ownerId }
     * @param {string} localPlayerId - The local player's ID
     */
    updateFromCameraState(cameraData, localPlayerId) {
        if (!this.isActive || !this.cameraId) return;
        if (this.mode !== 'monitor' && this.mode !== 'viewing') return;

        if (cameraData) {
            // Update position and rotation from current state
            this.position.set(cameraData.position.x, cameraData.position.y, cameraData.position.z);
            this.rotation = {
                pitch: cameraData.rotation.pitch || 0,
                yaw: cameraData.rotation.yaw || 0,
                roll: cameraData.rotation.roll || 0
            };
            this._updateViewCamera();

            // Hide player mesh if camera is held by local player (can't see yourself from your own camera)
            this._updatePlayerMeshVisibility(cameraData.ownerId, localPlayerId);
        }
    }

    /**
     * Update player mesh visibility based on camera ownership
     * Hide if the camera is held by the local player
     * @param {string} cameraOwnerId - The camera's owner ID
     * @param {string} localPlayerId - The local player's ID
     */
    _updatePlayerMeshVisibility(cameraOwnerId, localPlayerId) {
        if (!this.getPlayerMesh) return;
        const playerMesh = this.getPlayerMesh();
        if (!playerMesh) return;

        // Camera is held by local player if ownerId is 'held_<localPlayerId>'
        const isHeldByLocalPlayer = cameraOwnerId === `held_${localPlayerId}`;

        // this.scene IS the THREE.Scene (passed directly from main.js)
        const threeScene = this.scene;

        if (isHeldByLocalPlayer) {
            // Hide player mesh - can't see yourself from camera you're holding
            if (playerMesh.parent === threeScene) {
                this.scene.remove(playerMesh);
            }
            // Also hide held item (attached to player camera)
            if (this.getHeldItemMesh) {
                const heldItemMesh = this.getHeldItemMesh();
                if (heldItemMesh) {
                    heldItemMesh.visible = false;
                }
            }
        } else {
            // Show player mesh - can see yourself from external camera
            if (playerMesh.parent !== threeScene) {
                this.scene.add(playerMesh);
            }
            // Show held item
            if (this.getHeldItemMesh) {
                const heldItemMesh = this.getHeldItemMesh();
                if (heldItemMesh) {
                    heldItemMesh.visible = true;
                }
            }
        }
    }

    /**
     * Exit camera view mode
     * @param {boolean} confirmed - Whether the action was confirmed
     */
    exit(confirmed = false) {
        if (!this.isActive) return;

        const wasMonitorMode = this.mode === 'monitor';
        const exitMonitorId = this.monitorId;

        this.isActive = false;
        this._hideOverlay();
        this._hideMonitorOverlay();
        this._disableInputCapture();

        // Remove monitor-specific listeners
        if (wasMonitorMode) {
            this.monitorOverlay.removeEventListener('click', this._onMonitorClick);
        }

        // Hide player mesh again
        this._hidePlayerMesh();

        // Notify controls to re-enable player movement
        if (wasMonitorMode) {
            if (this.controls.setMonitorViewMode) {
                this.controls.setMonitorViewMode(false);
            }
        } else {
            if (this.controls.setCameraViewMode) {
                this.controls.setCameraViewMode(false);
            }
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
        } else if (wasMonitorMode && this.onMonitorExit) {
            this.onMonitorExit(exitMonitorId);
        } else if (this.onExit) {
            this.onExit();
        }

        this.mode = null;
        this.cameraId = null;
        this.monitorId = null;
        this.cameraIds = [];
        this.currentCameraIndex = -1;

        console.log(`[CameraViewMode] Exited (confirmed: ${confirmed})`);
    }

    /**
     * Update the view camera position and rotation
     */
    _updateViewCamera() {
        this.viewCamera.position.copy(this.position);

        // Update aspect ratio in case of resize/rotation
        const newAspect = window.innerWidth / window.innerHeight;
        if (this.viewCamera.aspect !== newAspect) {
            this.viewCamera.aspect = newAspect;
            this.viewCamera.updateProjectionMatrix();
        }

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

        // In monitor mode with no camera, render a "no signal" screen
        if (this.mode === 'monitor' && !this.cameraId) {
            // Just render black (camera is at origin facing nothing)
            this.renderer.setClearColor(0x111111);
            this.renderer.clear();
            this.renderer.setClearColor(0x000000);
            return;
        }

        // Update player mesh position before rendering
        this._updatePlayerMeshPosition();

        // Hide the camera mesh we're viewing through (camera can't see itself)
        let cameraMesh = null;
        let wasVisible = false;
        if (this.cameraId && this.getCameraMeshes) {
            const cameraMeshes = this.getCameraMeshes();
            if (cameraMeshes) {
                cameraMesh = cameraMeshes.get(this.cameraId);
                if (cameraMesh) {
                    wasVisible = cameraMesh.visible;
                    cameraMesh.visible = false;
                }
            }
        }

        // Hide the camera carrier (player holding the camera) during rendering
        let carrierId = null;
        let carrierVisibility = null;
        if (this.cameraId && this.getCameraData) {
            const cameraData = this.getCameraData(this.cameraId);
            if (cameraData && cameraData.ownerId && cameraData.ownerId.startsWith('held_')) {
                carrierId = cameraData.ownerId.replace('held_', '');
                carrierVisibility = this._hideCarrier(carrierId);
            }
        }

        this.renderer.render(scene, this.viewCamera);

        // Restore carrier visibility
        if (carrierId && carrierVisibility) {
            this._restoreCarrier(carrierId, carrierVisibility);
        }

        // Restore camera mesh visibility
        if (cameraMesh) {
            cameraMesh.visible = wasVisible;
        }
    }

    /**
     * Hide a remote player (carrier) during camera view rendering
     * @param {string} playerId - Player ID to hide
     * @returns {Object|null} Visibility state to restore later
     */
    _hideCarrier(playerId) {
        const remotePlayers = this.getRemotePlayers ? this.getRemotePlayers() : null;
        if (!remotePlayers) return null;

        const playerData = remotePlayers.players.get(playerId);
        const nameLabel = remotePlayers.nameLabels.get(playerId);

        if (!playerData) return null;

        const state = {
            meshVisible: playerData.mesh.visible,
            heldItemVisible: playerData.heldItemMesh ? playerData.heldItemMesh.visible : false,
            nameLabelVisible: nameLabel && nameLabel.sprite ? nameLabel.sprite.visible : false
        };

        // Hide everything
        playerData.mesh.visible = false;
        if (playerData.heldItemMesh) {
            playerData.heldItemMesh.visible = false;
        }
        if (nameLabel && nameLabel.sprite) {
            nameLabel.sprite.visible = false;
        }

        return state;
    }

    /**
     * Restore a remote player's visibility state after rendering
     * @param {string} playerId - Player ID to restore
     * @param {Object} state - Visibility state from _hideCarrier
     */
    _restoreCarrier(playerId, state) {
        const remotePlayers = this.getRemotePlayers ? this.getRemotePlayers() : null;
        if (!remotePlayers || !state) return;

        const playerData = remotePlayers.players.get(playerId);
        const nameLabel = remotePlayers.nameLabels.get(playerId);

        if (!playerData) return;

        playerData.mesh.visible = state.meshVisible;
        if (playerData.heldItemMesh) {
            playerData.heldItemMesh.visible = state.heldItemVisible;
        }
        if (nameLabel && nameLabel.sprite) {
            nameLabel.sprite.visible = state.nameLabelVisible;
        }
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

        // Update hint based on mode
        if (this.hintText) {
            if (this.mode === 'viewing') {
                this.hintText.textContent = 'Escape: Exit';
            } else {
                this.hintText.textContent = 'Drag: Aim | Click/Tap: Confirm | Escape: Cancel';
            }
        }

        this.overlay.style.display = 'block';
    }

    _hideOverlay() {
        this.overlay.style.display = 'none';
    }

    _showMonitorOverlay() {
        this._updateCameraCounter();
        this.monitorOverlay.style.display = 'block';
    }

    _hideMonitorOverlay() {
        this.monitorOverlay.style.display = 'none';
    }

    _updateCameraCounter() {
        if (!this.cameraCounter) return;
        const current = this.currentCameraIndex >= 0 ? this.currentCameraIndex + 1 : 0;
        const total = this.cameraIds.length;
        this.cameraCounter.textContent = `${current}/${total}`;
    }

    /**
     * Navigate to next/previous camera
     * @param {number} direction - 1 for next, -1 for previous
     */
    _navigateCamera(direction) {
        if (this.mode !== 'monitor' || this.cameraIds.length === 0) return;

        // Calculate new index with wrap-around
        let newIndex = this.currentCameraIndex + direction;
        if (newIndex < 0) {
            newIndex = this.cameraIds.length - 1;
        } else if (newIndex >= this.cameraIds.length) {
            newIndex = 0;
        }

        // Get the new camera ID
        const newCameraId = this.cameraIds[newIndex];

        // Notify callback to change the monitor's camera
        if (this.onMonitorCameraChange) {
            this.onMonitorCameraChange(this.monitorId, newCameraId);
        }
    }

    /**
     * Handle click on monitor overlay (exit if not on buttons)
     */
    _handleMonitorClick(event) {
        if (this.mode !== 'monitor') return;

        // Check if click was on a button (buttons have pointer-events: auto)
        // The container has pointer-events, so we check if target is the overlay itself
        if (event.target === this.monitorOverlay) {
            this.exit(false);
        }
    }

    _enableInputCapture() {
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mousedown', this._onMouseDown);
        document.addEventListener('keydown', this._onKeyDown);
        // Touch events for mobile support
        document.addEventListener('touchstart', this._onTouchStart, { passive: false });
        document.addEventListener('touchmove', this._onTouchMove, { passive: false });
        document.addEventListener('touchend', this._onTouchEnd, { passive: false });
    }

    _disableInputCapture() {
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mousedown', this._onMouseDown);
        document.removeEventListener('keydown', this._onKeyDown);
        // Remove touch events
        document.removeEventListener('touchstart', this._onTouchStart);
        document.removeEventListener('touchmove', this._onTouchMove);
        document.removeEventListener('touchend', this._onTouchEnd);
    }

    _handleMouseMove(event) {
        if (!this.isActive) return;
        if (this.mode === 'viewing') return;  // No mouse input in view-only mode

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

            // Send real-time rotation updates (throttled)
            if (this.mode === 'adjusting' && this.onRotationUpdate) {
                const now = performance.now();
                if (now - this._lastUpdateTime >= this._updateInterval) {
                    this._lastUpdateTime = now;
                    this.onRotationUpdate(this.cameraId, { ...this.rotation });
                }
            }
        }
    }

    _handleMouseDown(event) {
        if (!this.isActive) return;
        if (this.mode === 'viewing') return;  // No click confirm in view-only mode

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
     * Handle touch start for mobile camera rotation/confirmation
     */
    _handleTouchStart(event) {
        if (!this.isActive) return;
        if (this.mode === 'viewing' || this.mode === 'monitor') return;

        // Don't handle if touch is on a button
        if (event.target.tagName === 'BUTTON') return;

        event.preventDefault();

        const touch = event.touches[0];
        this._touchState = {
            active: true,
            startX: touch.clientX,
            startY: touch.clientY,
            lastX: touch.clientX,
            lastY: touch.clientY,
            startTime: performance.now(),
            moved: false
        };
    }

    /**
     * Handle touch move for mobile camera rotation
     */
    _handleTouchMove(event) {
        if (!this.isActive || !this._touchState.active) return;
        if (this.mode === 'viewing' || this.mode === 'monitor') return;

        event.preventDefault();

        const touch = event.touches[0];
        const deltaX = touch.clientX - this._touchState.lastX;
        const deltaY = touch.clientY - this._touchState.lastY;

        // Check if the user has moved enough to count as a drag
        const totalMoveX = touch.clientX - this._touchState.startX;
        const totalMoveY = touch.clientY - this._touchState.startY;
        if (Math.abs(totalMoveX) > 10 || Math.abs(totalMoveY) > 10) {
            this._touchState.moved = true;
        }

        // Update rotation (similar to mouse move)
        this.rotation.yaw -= deltaX * this._touchSensitivity;
        this.rotation.pitch -= deltaY * this._touchSensitivity;
        this.rotation.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.rotation.pitch));

        this._updateViewCamera();

        // Send real-time rotation updates (throttled)
        if (this.mode === 'adjusting' && this.onRotationUpdate) {
            const now = performance.now();
            if (now - this._lastUpdateTime >= this._updateInterval) {
                this._lastUpdateTime = now;
                this.onRotationUpdate(this.cameraId, { ...this.rotation });
            }
        }

        // Update last position for next delta
        this._touchState.lastX = touch.clientX;
        this._touchState.lastY = touch.clientY;
    }

    /**
     * Handle touch end for mobile confirmation (tap to confirm)
     */
    _handleTouchEnd(event) {
        if (!this.isActive || !this._touchState.active) return;
        if (this.mode === 'viewing' || this.mode === 'monitor') return;

        event.preventDefault();

        const touchDuration = performance.now() - this._touchState.startTime;

        // If it was a quick tap without much movement, treat as confirmation
        if (!this._touchState.moved && touchDuration < 300) {
            this.exit(true);
        }

        // Reset touch state
        this._touchState.active = false;
    }

    /**
     * Show player mesh in scene so camera can see the player
     */
    _showPlayerMesh() {
        if (!this.getPlayerMesh) return;

        const playerMesh = this.getPlayerMesh();
        if (!playerMesh) return;

        // this.scene IS the THREE.Scene (passed directly from main.js)
        const threeScene = this.scene;

        // Check if already in scene
        this._playerMeshWasInScene = playerMesh.parent === threeScene;

        if (!this._playerMeshWasInScene) {
            this.scene.add(playerMesh);
        }

        // Update position immediately
        this._updatePlayerMeshPosition();
    }

    /**
     * Hide player mesh from scene
     */
    _hidePlayerMesh() {
        if (!this.getPlayerMesh) return;

        const playerMesh = this.getPlayerMesh();
        if (!playerMesh) return;

        // this.scene IS the THREE.Scene (passed directly from main.js)
        const threeScene = this.scene;

        // Only remove if we added it
        if (!this._playerMeshWasInScene && playerMesh.parent === threeScene) {
            this.scene.remove(playerMesh);
        }

        // Always restore held item visibility when hiding player mesh (exiting view mode)
        if (this.getHeldItemMesh) {
            const heldItemMesh = this.getHeldItemMesh();
            if (heldItemMesh) {
                heldItemMesh.visible = true;
            }
        }
    }

    /**
     * Update player mesh position to match current player position
     */
    _updatePlayerMeshPosition() {
        if (!this.getPlayerMesh || !this.getPlayerPosition) return;

        const playerMesh = this.getPlayerMesh();
        const playerPos = this.getPlayerPosition();
        if (!playerMesh || !playerPos) return;

        playerMesh.position.set(playerPos.x, playerPos.y, playerPos.z);
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
        this._hidePlayerMesh();

        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }

        this.overlay = null;
        this.viewCamera = null;
    }
}
