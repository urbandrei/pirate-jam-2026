/**
 * PC Client Main Entry Point
 */

import { Scene } from './scene.js';
import { Controls } from './controls.js';
import { MobileControls } from './mobile-controls.js';
import { Network } from './network.js';
import { Player } from './player.js';
import { RemotePlayers } from './remote-players.js';
import { HUD } from './hud.js';
import { InteractionSystem } from './interaction-system.js';
import { SleepMinigame } from './sleep-minigame.js';
import { ChatUI } from './chat.js';
import { SettingsManager } from './settings-manager.js';
import { SettingsUI } from './settings-ui.js';
import { CameraFeedSystem } from './camera-feed-system.js';
import { SecurityRoomRenderer } from './security-room-renderer.js';
import { CameraPlacementSystem } from './camera-placement-system.js';
import { CameraViewMode } from './camera-view-mode.js';
import { INPUT_RATE, ITEMS } from '../shared/constants.js';
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

class Game {
    constructor() {
        this.scene = null;
        this.controls = null;
        this.network = null;
        this.player = null;
        this.remotePlayers = null;
        this.hud = null;
        this.interactionSystem = null;
        this.sleepMinigame = null;
        this.chatUI = null;
        this.settingsManager = null;
        this.settingsUI = null;
        this.mobileControls = null;

        // Camera systems
        this.cameraFeedSystem = null;
        this.securityRoomRenderer = null;
        this.cameras = new Map();  // Track camera entities from server
        this.targetedCamera = null;  // Currently targeted camera (for interaction)
        this._targetedMonitor = null; // Currently targeted security monitor

        // Camera view state (viewing through a camera)
        this.isInCameraView = false;
        this.viewingCameraId = null;
        this.savedCameraState = null;  // { position, rotation } before entering camera view

        // Camera placement state
        this.cameraPlacementSystem = null;
        this.cameraViewMode = null;
        this.pendingCameraPlacement = false;  // True when waiting for server to confirm our placement
        this._lastHeldItemType = null;  // Track held item type for auto-enter placement mode
        this.adjustingCameraId = null;  // Camera ID currently being adjusted by local player
        this.camerasBeingAdjusted = new Set();  // Camera IDs being adjusted by any player

        // Monitor viewing state
        this.viewingMonitorId = null;  // Monitor ID currently being viewed
        this.monitorConfigs = new Map();  // Server-provided monitor configs

        this.lastTime = performance.now();
        this.lastInputTime = 0;
        this.inputInterval = 1000 / INPUT_RATE;

        this.isGrabbed = false;
        this.isSleeping = false;
        this.isDead = false;
        this.isInQueue = false;
        this.isInWaitingRoom = false;
        this.isInGame = false;

        // Home page elements
        this.homePage = null;
        this.usernameInput = null;
        this.joinButton = null;
        this.queueInfo = null;
        this.homeError = null;
        this.playerName = 'Player';

        this.init();
    }

    async init() {
        console.log('Initializing PC client...');

        // Setup Three.js scene
        const container = document.getElementById('game-container');
        this.scene = new Scene(container);

        // Setup settings manager (before controls, as controls needs it)
        this.settingsManager = new SettingsManager();

        // Setup controls (pass settings manager for dynamic keybindings)
        this.controls = new Controls(this.scene.camera, this.scene.renderer.domElement, this.settingsManager);

        // Setup mobile controls (touch joysticks for mobile/tablet)
        this.mobileControls = new MobileControls(this.controls);

        // Setup player (pass camera for held item display)
        this.player = new Player(this.scene, this.scene.camera);

        // Setup remote players renderer
        this.remotePlayers = new RemotePlayers(this.scene);

        // Setup HUD
        this.hud = new HUD();

        // Setup interaction system
        this.interactionSystem = new InteractionSystem(this.scene, this.scene.camera);

        // Setup camera systems
        // Pass getter for camera meshes so cameras don't see themselves in their own feed
        this.cameraFeedSystem = new CameraFeedSystem(
            this.scene.renderer,
            this.scene.scene,
            () => this.scene.cameraMeshes
        );

        // Set up camera feed callbacks for player visibility in feeds
        this.cameraFeedSystem.getLocalPlayerMesh = () => this.player.mesh;
        this.cameraFeedSystem.getLocalPlayerPosition = () => this.player.getPosition();
        this.cameraFeedSystem.getRemotePlayers = () => this.remotePlayers;
        this.cameraFeedSystem.getCameraData = (cameraId) => this.cameras.get(cameraId);

        this.securityRoomRenderer = new SecurityRoomRenderer(this.scene.scene);
        this.scene.setSecurityRoomRenderer(this.securityRoomRenderer);

        // Camera placement system (wall-mounted security cameras)
        // Pass a getter function since dynamicWalls array is replaced when world rebuilds
        this.cameraPlacementSystem = new CameraPlacementSystem(
            this.scene.scene,
            this.scene.camera,
            () => this.scene.dynamicWalls,
            this.scene.renderer
        );

        // Set up camera placement callbacks for player visibility in preview
        this.cameraPlacementSystem.getPlayerMesh = () => this.player.mesh;
        this.cameraPlacementSystem.getPlayerPosition = () => this.player.getPosition();

        // Camera view mode (for adjusting camera aim)
        this.cameraViewMode = new CameraViewMode(
            this.scene.scene,
            this.scene.renderer,
            this.controls
        );

        // Set up camera view mode callbacks for player/camera visibility
        this.cameraViewMode.getCameraMeshes = () => this.scene.cameraMeshes;
        this.cameraViewMode.getPlayerMesh = () => this.player.mesh;
        this.cameraViewMode.getHeldItemMesh = () => this.player.heldItemMesh;
        this.cameraViewMode.getPlayerPosition = () => this.player.getPosition();
        this.cameraViewMode.getRemotePlayers = () => this.remotePlayers;
        this.cameraViewMode.getCameraData = (cameraId) => this.cameras.get(cameraId);

        // Wire camera placement callback
        this.cameraPlacementSystem.onPlaced = (position, rotation) => {
            this.pendingCameraPlacement = true;
            this.network.sendPlaceCamera('security', position, rotation);
        };

        // Wire camera adjustment callback (final confirmation)
        this.cameraViewMode.onAdjustConfirmed = (cameraId, rotation) => {
            this.network.sendAdjustCamera(cameraId, rotation);
            // Also release the adjustment lock (onExit is not called when confirmed=true)
            if (this.adjustingCameraId) {
                this.network.sendStopAdjustCamera(this.adjustingCameraId);
                this.adjustingCameraId = null;
            }
        };

        // Wire exit callback to stop adjusting lock
        this.cameraViewMode.onExit = () => {
            // If we were adjusting a camera, release the lock
            if (this.adjustingCameraId) {
                this.network.sendStopAdjustCamera(this.adjustingCameraId);
                this.adjustingCameraId = null;
            }
        };

        // Wire real-time rotation updates during adjustment
        this.cameraViewMode.onRotationUpdate = (cameraId, rotation) => {
            this.network.sendUpdateCamera(cameraId, null, rotation);
        };

        // Wire monitor navigation callback
        this.cameraViewMode.onMonitorCameraChange = (monitorId, cameraId) => {
            console.log(`[Game] Changing monitor ${monitorId} to camera ${cameraId}`);
            this.network.sendChangeMonitorCamera(monitorId, cameraId);
        };

        // Wire monitor exit callback
        this.cameraViewMode.onMonitorExit = (monitorId) => {
            console.log(`[Game] Exiting monitor view: ${monitorId}`);
            this.network.sendStopMonitorView(monitorId);
            this.viewingMonitorId = null;

            // Re-lock pointer for normal gameplay
            if (this.isInGame && !this.isSleeping) {
                this.scene.renderer.domElement.requestPointerLock().catch(() => {});
            }
        };

        // Setup home page elements
        this.homePage = document.getElementById('home-page');
        this.usernameInput = document.getElementById('username-input');
        this.joinButton = document.getElementById('join-button');
        this.queueInfo = document.getElementById('queue-info');
        this.homeError = document.getElementById('home-error');

        // Setup home page event listeners
        this.setupHomePage();

        // Wire up click handler from controls
        this.controls.onLeftClick = () => {
            // Check for camera placement first
            if (this.cameraPlacementSystem.isActive) {
                if (this.cameraPlacementSystem.confirmPlacement()) {
                    return; // Placement handled
                }
            }

            // Check for waiting room door interaction first
            if (this.isInWaitingRoom) {
                const doorInteraction = this.scene.getWaitingRoomDoorInteraction();
                if (doorInteraction) {
                    // Local distance check before sending to server
                    const playerPos = this.player.getPosition();
                    const doorPos = doorInteraction.position;
                    const dx = playerPos.x - doorPos.x;
                    const dz = playerPos.z - doorPos.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);

                    const INTERACTION_RANGE = 2.0;
                    if (distance <= INTERACTION_RANGE) {
                        this.network.sendInteract(doorInteraction.type, doorInteraction.targetId, doorInteraction.position);
                    }
                    // If too far, simply don't send - no need for error message
                    return;
                }
            }

            // Check for monitor click (security room cameras)
            if (this._targetedMonitor) {
                // Request to view this monitor (server will lock it for us)
                const monitorId = this._targetedMonitor.monitor.monitorId;
                if (monitorId) {
                    console.log('[Game] Requesting to view monitor:', monitorId);
                    this.network.sendStartMonitorView(monitorId);
                    return;
                }
            }

            // First, check if we're targeting an interactable (prioritize interaction over drop)
            if (this.interactionSystem.hasTarget()) {
                // We have a valid target - try to interact
                this.interactionSystem.handleClick();
            } else if (this.player.isHoldingItem()) {
                // No target but holding an item - check if consumable, otherwise drop
                const heldItem = this.player.getHeldItem();
                const itemDef = heldItem ? ITEMS[heldItem.type] : null;

                if (itemDef && itemDef.hunger) {
                    // Food item - eat it
                    this.handleConsume('eat', heldItem);
                } else if (itemDef && itemDef.rest && heldItem.type === 'coffee') {
                    // Coffee - drink it
                    this.handleConsume('drink_coffee', heldItem);
                } else if (itemDef && itemDef.thirst && heldItem.type === 'water_container') {
                    // Water container - drink from it
                    this.handleConsume('drink_container', heldItem);
                } else {
                    // Non-consumable item - drop it
                    this.handleDrop();
                }
            }
            // If neither, do nothing
        };

        // Wire up mobile controls to use the same click handler
        this.mobileControls.onLeftClick = this.controls.onLeftClick;

        // Wire up F key (camera placement OR adjust wall camera)
        this.controls.onPickupCamera = () => {
            const heldItem = this.player.getHeldItem();
            console.log('[Game] F key pressed, held item:', heldItem?.type);

            if (heldItem?.type === 'security_camera') {
                // Holding camera - try to place
                if (this.cameraPlacementSystem.isActive) {
                    this.cameraPlacementSystem.confirmPlacement();
                } else {
                    this.cameraPlacementSystem.activate();
                }
            } else if (!heldItem) {
                // Not holding anything - try to adjust targeted wall camera
                // Use targeted camera if available, otherwise find nearest
                const camera = this.targetedCamera || this.findNearestCamera('security');
                if (camera) {
                    // Only adjust wall cameras (not floor cameras)
                    const isWallCamera = camera.ownerId && !camera.ownerId.startsWith('held_') && camera.ownerId !== 'floor_item';
                    // Skip if camera is being adjusted by someone else
                    if (isWallCamera && !this.camerasBeingAdjusted.has(camera.id)) {
                        console.log('[Game] Adjusting wall camera:', camera.id);
                        // Lock the camera for adjustment
                        this.adjustingCameraId = camera.id;
                        this.network.sendStartAdjustCamera(camera.id);
                        const pos = new THREE.Vector3(
                            camera.position.x,
                            camera.position.y,
                            camera.position.z
                        );
                        this.cameraViewMode.enterAdjustmentMode(
                            camera.id,
                            pos,
                            camera.rotation
                        );
                    }
                }
            }
        };

        // Wire up E key (adjust nearby camera - same as F for compatibility)
        this.controls.onAdjustCamera = () => {
            const heldItem = this.player.getHeldItem();
            if (!heldItem) {
                const camera = this.targetedCamera || this.findNearestCamera('security');
                if (camera) {
                    const isWallCamera = camera.ownerId && !camera.ownerId.startsWith('held_') && camera.ownerId !== 'floor_item';
                    // Skip if camera is being adjusted by someone else
                    if (isWallCamera && !this.camerasBeingAdjusted.has(camera.id)) {
                        // Lock the camera for adjustment
                        this.adjustingCameraId = camera.id;
                        this.network.sendStartAdjustCamera(camera.id);
                        const pos = new THREE.Vector3(
                            camera.position.x,
                            camera.position.y,
                            camera.position.z
                        );
                        this.cameraViewMode.enterAdjustmentMode(
                            camera.id,
                            pos,
                            camera.rotation
                        );
                    }
                }
            }
        };

        // Wire up interaction callback to network
        this.interactionSystem.onInteract = (interactionType, targetId, targetPosition) => {
            if (this.network && this.network.isConnected) {
                // Route wash/cut to timed interaction flow
                if (interactionType === 'wash' || interactionType === 'cut') {
                    this.network.sendTimedInteractStart(interactionType, targetId, targetPosition);
                } else if (interactionType === 'sleep') {
                    // Sleep interaction - send to server and start minigame on success
                    this.network.sendInteract(interactionType, targetId, targetPosition);
                    // Minigame will start when we receive INTERACT_SUCCESS for sleep
                } else if (interactionType === 'pickup_camera') {
                    // Camera pickup - check if it's a wall camera or floor camera
                    const camera = this.cameras.get(targetId);
                    if (camera) {
                        if (camera.ownerId === 'floor_item') {
                            // Floor camera - pickup via linked item
                            // Find the floor item with this linkedCameraId
                            // The item ID is stored on the camera, or we need to search
                            // For now, send PICKUP_CAMERA which the server can handle
                            this.network.sendPickupCamera(targetId);
                        } else {
                            // Wall camera - pickup directly
                            this.network.sendPickupCamera(targetId);
                        }
                    }
                } else {
                    this.network.sendInteract(interactionType, targetId, targetPosition);
                }
            }
        };

        // Wire up timed interaction cancel callback
        this.interactionSystem.onTimedInteractCancel = () => {
            if (this.network && this.network.isConnected) {
                this.network.sendTimedInteractCancel();
            }
        };

        // Setup network
        this.network = new Network();

        // Setup ChatUI (needs network reference)
        this.chatUI = new ChatUI(this.network);

        // Setup SettingsUI
        this.settingsUI = new SettingsUI(this.settingsManager);

        // Wire settings close callback
        this.settingsUI.onClose = () => {
            this.controls.setSettingsOpen(false);
            if (this.isInGame && !this.isSleeping) {
                this.scene.renderer.domElement.requestPointerLock().catch(() => {});
            }
        };

        // Wire quality change callback
        this.settingsUI.onQualityChanged = (quality) => {
            if (this.cameraFeedSystem) {
                this.cameraFeedSystem.setQuality(quality);
            }
        };

        // Apply initial quality setting
        const initialQuality = this.settingsManager.getVideoSetting('cameraFeedQuality');
        if (this.cameraFeedSystem && initialQuality) {
            this.cameraFeedSystem.setQuality(initialQuality);
        }

        // Wire chat return-to-game callback
        this.chatUI.onReturnToGame = () => {
            if (this.isInGame && !this.isSleeping) {
                // Catch security error if browser cooldown is active
                this.scene.renderer.domElement.requestPointerLock().catch(() => {});
            }
        };

        // Click anywhere to return to game (either from chat, settings, or after Escape)
        // Use mousedown instead of click for immediate response
        document.addEventListener('mousedown', (e) => {
            if (this.isInGame && !this.isSleeping) {
                const chatContainer = document.getElementById('chat-container');
                const settingsModal = document.getElementById('settings-modal');

                // Check if settings is open and click is outside the modal
                if (this.settingsUI.isVisible()) {
                    if (!settingsModal.contains(e.target)) {
                        this.settingsUI.hide();
                        // Check if they clicked on chat
                        if (chatContainer.contains(e.target)) {
                            this.chatUI.focus();
                        }
                        // onClose callback handles pointer lock
                    }
                    return;
                }

                if (this.chatUI.isFocused()) {
                    // In chat mode - check if click is outside chat input
                    if (e.target !== this.chatUI.inputEl) {
                        this.chatUI.blur();
                        // Catch security error if user just exited pointer lock
                        this.scene.renderer.domElement.requestPointerLock().catch(() => {});
                    }
                } else if (!document.pointerLockElement && !this.cameraViewMode?.isActive) {
                    // Not in chat, pointer not locked, not in camera/monitor view - re-lock on click
                    // Catch security error if user just exited pointer lock
                    this.scene.renderer.domElement.requestPointerLock().catch(() => {});
                }
            }
        });

        // Track intentional pointer lock exits (for chat)
        this.intentionalPointerExit = false;

        // Enter key to open chat when playing
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && this.isInGame && !this.chatUI.isFocused() && !this.isSleeping && !this.settingsUI.isVisible()) {
                e.preventDefault();
                // Mark as intentional so we don't open settings
                this.intentionalPointerExit = true;
                document.exitPointerLock();
                this.chatUI.focus();
            }
        });

        // Escape key to close settings when visible, or exit camera view
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // First check if in camera view
                if (this.isInCameraView) {
                    e.preventDefault();
                    this.exitCameraView();
                    return;
                }
                // Then check settings
                if (this.settingsUI.isVisible()) {
                    e.preventDefault();
                    this.settingsUI.hide();
                }
            }
        });

        // Detect pointer lock exit (Escape pressed while playing) to open settings
        document.addEventListener('pointerlockchange', () => {
            // Check if pointer lock was just lost (not gained)
            if (!document.pointerLockElement) {
                // If it was intentional (chat), reset flag and don't show settings
                if (this.intentionalPointerExit) {
                    this.intentionalPointerExit = false;
                    return;
                }
                // Don't open settings when in camera view mode (includes monitor viewing)
                if (this.cameraViewMode?.isActive) {
                    return;
                }
                // If we're in game, not sleeping, and settings not already visible, show settings
                if (this.isInGame && !this.isSleeping && !this.settingsUI.isVisible() && !this.chatUI.isFocused()) {
                    this.controls.setSettingsOpen(true);
                    this.settingsUI.show();
                }
            }
        });

        // Set camera reference for speech bubble billboarding
        this.remotePlayers.setCamera(this.scene.camera);

        this.setupNetworkCallbacks();

        // Connect to server
        try {
            await this.network.connect();
            console.log('Connected to game server');
            // Enable join button once connected
            this.joinButton.disabled = false;
            this.joinButton.textContent = 'Join Game';
        } catch (err) {
            console.error('Failed to connect:', err);
            this.joinButton.textContent = 'Connection Failed';
        }

        // Start game loop
        this.gameLoop();
    }

    /**
     * Setup home page event listeners
     */
    setupHomePage() {
        // Join button click
        this.joinButton.addEventListener('click', () => {
            this.handleJoinClick();
        });

        // Enter key in username input
        this.usernameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleJoinClick();
            }
        });

        // Clear error on input
        this.usernameInput.addEventListener('input', () => {
            this.homeError.textContent = '';
        });
    }

    /**
     * Handle join button click
     */
    handleJoinClick() {
        if (!this.network.isConnected) {
            this.homeError.textContent = 'Not connected to server';
            return;
        }

        // Validate and get name
        let name = this.usernameInput.value.trim();

        // Use default if empty
        if (!name) {
            name = 'Player';
        }

        // Validate: 1-20 chars, alphanumeric + spaces
        if (name.length > 20) {
            this.homeError.textContent = 'Name must be 20 characters or less';
            return;
        }

        if (!/^[a-zA-Z0-9 ]+$/.test(name)) {
            this.homeError.textContent = 'Name can only contain letters, numbers, and spaces';
            return;
        }

        this.playerName = name;
        this.chatUI.setLocalPlayerName(name);

        // Disable button while joining
        this.joinButton.disabled = true;
        this.joinButton.textContent = 'Joining...';

        // Send SET_NAME first so server can apply it when JOIN is processed
        this.network.sendSetName(name);
        this.network.sendJoin();
    }

    /**
     * Transition from home page to game
     */
    enterGame() {
        this.isInGame = true;

        // Hide home page
        this.homePage.style.display = 'none';

        // Show chat
        this.chatUI.show();

        // Request pointer lock to start game
        this.scene.renderer.domElement.requestPointerLock();

        // Set local player ID for chat
        this.chatUI.setLocalPlayerId(this.network.playerId);
    }

    /**
     * Handle dropping the currently held item
     */
    handleDrop() {
        if (!this.player.isHoldingItem()) return;

        const heldItem = this.player.getHeldItem();

        // Calculate drop position: 1.5m in front of player at ground level
        const pos = this.player.getPosition();
        const lookRotation = this.controls.getInput().lookRotation;
        const yaw = lookRotation.y;

        // Direction player is facing (from yaw angle)
        const dropDistance = 1.5;
        const dropPosition = {
            x: pos.x - Math.sin(yaw) * dropDistance,
            y: 0.25, // Just above ground
            z: pos.z - Math.cos(yaw) * dropDistance
        };

        // Send drop interaction to server
        if (this.network && this.network.isConnected) {
            this.network.sendInteract('drop_item', heldItem.id, dropPosition);
        }
    }

    /**
     * Handle consuming a held item (eating/drinking)
     * @param {string} interactionType - 'eat', 'drink_coffee', or 'drink_container'
     * @param {Object} item - The item being consumed
     */
    handleConsume(interactionType, item) {
        if (!item) return;

        const pos = this.player.getPosition();

        // Send consume interaction to server
        if (this.network && this.network.isConnected) {
            this.network.sendInteract(interactionType, item.id, pos);
        }
    }

    /**
     * Find the nearest camera of a specific type within range
     * @param {string} type - Camera type ('security' or 'stream')
     * @param {boolean} wallOnly - If true, only find wall-mounted cameras
     * @returns {Object|null} Nearest camera data or null
     */
    findNearestCamera(type, wallOnly = false) {
        const playerPos = this.player.getPosition();
        const FLOOR_CAMERA_RANGE = 2.0;
        const WALL_CAMERA_RANGE = 4.0;
        let nearest = null;
        let nearestDist = Infinity;

        for (const camera of this.cameras.values()) {
            if (camera.type !== type) continue;

            // Determine camera type
            const isWallCamera = camera.ownerId && !camera.ownerId.startsWith('held_') && camera.ownerId !== 'floor_item';

            // Skip floor cameras if wallOnly
            if (wallOnly && !isWallCamera) continue;

            // Skip held cameras
            if (camera.ownerId && camera.ownerId.startsWith('held_')) continue;

            // Skip cameras being adjusted
            if (this.camerasBeingAdjusted.has(camera.id)) continue;
            if (this.adjustingCameraId === camera.id) continue;

            const range = isWallCamera ? WALL_CAMERA_RANGE : FLOOR_CAMERA_RANGE;

            const dx = camera.position.x - playerPos.x;
            const dz = camera.position.z - playerPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < range && dist < nearestDist) {
                nearestDist = dist;
                nearest = camera;
            }
        }
        return nearest;
    }

    /**
     * Check if player is looking at a camera and update interaction prompt
     * Also stores the target camera for click handling
     */
    checkCameraHover() {
        // Don't show camera interactions while in placement or adjustment mode
        if (this.cameraPlacementSystem?.isActive || this.cameraViewMode?.isActive) {
            this.targetedCamera = null;
            return;
        }

        const playerPos = this.player.getPosition();
        const FLOOR_CAMERA_RANGE = 2.0;
        const WALL_CAMERA_RANGE = 4.0;  // Larger range for wall-mounted cameras
        this.targetedCamera = null;

        // Check all cameras in range
        for (const camera of this.cameras.values()) {
            // Skip held cameras
            if (camera.ownerId && camera.ownerId.startsWith('held_')) continue;

            // Skip cameras being adjusted by any player (including local player)
            if (this.camerasBeingAdjusted.has(camera.id)) continue;
            if (this.adjustingCameraId === camera.id) continue;

            // Determine if wall camera or floor camera
            const isFloorCamera = camera.ownerId === 'floor_item';
            const isWallCamera = camera.ownerId && !camera.ownerId.startsWith('held_') && camera.ownerId !== 'floor_item';
            const range = isWallCamera ? WALL_CAMERA_RANGE : FLOOR_CAMERA_RANGE;

            const dx = camera.position.x - playerPos.x;
            const dy = camera.position.y - playerPos.y;
            const dz = camera.position.z - playerPos.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist > range) continue;

            // Check if player is looking at this camera (raycast)
            const cameraMesh = this.scene.cameraMeshes.get(camera.id);
            if (!cameraMesh) continue;

            // Simple raycast from camera center in look direction
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera({ x: 0, y: 0 }, this.scene.camera);
            raycaster.far = range;

            const intersects = raycaster.intersectObject(cameraMesh, true);
            if (intersects.length > 0) {
                this.targetedCamera = camera;

                // Only show interaction if not holding anything
                const heldItem = this.player.getHeldItem();
                if (heldItem) {
                    // Holding something - can't interact with camera
                    return;
                }

                // Create interaction based on camera type
                if (isWallCamera) {
                    // Wall camera: Click to pickup, F to adjust
                    this.interactionSystem.setAvailableInteraction({
                        targetId: camera.id,
                        targetType: 'camera',
                        interactions: [
                            { type: 'pickup_camera', prompt: 'Pickup' }
                        ],
                        position: camera.position
                    });
                    // Override prompt with multi-action format
                    this.interactionSystem._showPrompt([
                        { key: 'Click', prompt: 'Pickup' },
                        { key: 'F', prompt: 'Adjust' }
                    ]);
                } else if (isFloorCamera) {
                    // Floor camera: Click to pickup only
                    this.interactionSystem.setAvailableInteraction({
                        targetId: camera.id,
                        targetType: 'camera',
                        interactions: [
                            { type: 'pickup_camera', prompt: 'Pickup Camera' }
                        ],
                        position: camera.position
                    });
                }
                return; // Found a targeted camera, don't check more
            }
        }
    }

    /**
     * Check if player is near a security room monitor
     * @returns {Object|null} { monitor, index, cameraId } or null
     */
    checkMonitorHover() {
        // Don't show monitor interactions while in placement, adjustment, or view mode
        if (this.cameraPlacementSystem?.isActive || this.cameraViewMode?.isActive) {
            this._targetedMonitor = null;
            return;
        }

        // Don't show if already targeting a camera
        if (this.targetedCamera) {
            this._targetedMonitor = null;
            return;
        }

        if (!this.securityRoomRenderer) {
            this._targetedMonitor = null;
            return;
        }

        const playerPos = this.player.getPosition();
        const nearestResult = this.securityRoomRenderer.findNearestMonitor(playerPos, 3.0);

        if (!nearestResult) {
            this._targetedMonitor = null;
            return;
        }

        const monitor = nearestResult.monitor;

        // Check if looking at the monitor (simple raycast)
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera({ x: 0, y: 0 }, this.scene.camera);
        raycaster.far = 3.0;

        // Check both frame and screen mesh
        const intersects = raycaster.intersectObjects([monitor.mesh, monitor.screenMesh], false);
        if (intersects.length === 0) {
            this._targetedMonitor = null;
            return;
        }

        // Targeting this monitor
        this._targetedMonitor = {
            monitor: monitor,
            index: nearestResult.index,
            cameraId: monitor.cameraId
        };

        // Show interaction prompt
        const promptText = monitor.cameraId ? 'View Camera Feed' : 'Configure Monitor';
        this.interactionSystem._showPrompt(promptText);
    }

    setupNetworkCallbacks() {
        // Handle successful join (including from queue)
        this.network.onJoined = () => {
            // Name was sent before JOIN, server applies it before broadcasting PLAYER_JOINED

            if (this.isInQueue) {
                this.handleJoinedFromQueue();
            } else {
                // First time joining - transition from home page
                this.enterGame();
            }
        };

        // Chat callbacks
        this.network.onChatReceived = (message) => {
            const isLocal = message.senderId === this.network.playerId;
            this.chatUI.addMessage(message.senderName, message.text, isLocal, message.senderId);

            // Show speech bubble above sender (for all players including local - visible to others)
            if (!isLocal) {
                this.remotePlayers.showSpeechBubble(message.senderId, message.text);
            }
        };

        this.network.onChatFailed = (reason) => {
            this.chatUI.addSystemMessage(`Message failed: ${reason}`);
        };

        this.network.onNameUpdated = (name) => {
            this.playerName = name;
            this.chatUI.setLocalPlayerName(name);
            // Update status display with player name
            this.network.updateStatus(`Playing as ${name}`);
        };

        this.network.onPlayerJoined = (player) => {
            if (this.isInGame) {
                const name = player.displayName || player.id.slice(0, 8);
                this.chatUI.addSystemMessage(`${name} joined the game`);
            }
        };

        this.network.onPlayerMuted = (playerId, duration) => {
            this.chatUI.addSystemMessage(`A player has been muted`);
        };

        this.network.onPlayerKicked = (playerId) => {
            this.chatUI.addSystemMessage(`A player has been kicked`);
        };

        // Stream chat callback (Twitch, etc.) - no speech bubbles for stream messages
        this.network.onStreamChatReceived = (message) => {
            this.chatUI.addStreamMessage(message.platform, message.senderName, message.text, message.color);
        };

        this.network.onStateUpdate = (state) => {
            // Skip all state updates while in waiting room (local-only experience)
            // Waiting room players don't receive STATE_UPDATE from server anyway,
            // but this is a defensive check
            if (this.isInWaitingRoom) {
                return;
            }

            // Update local player from authoritative server state
            const myState = state.players[this.network.playerId];
            if (myState) {
                this.player.updateFromServer(myState);

                // Update HUD with player needs
                if (myState.needs) {
                    this.hud.updateNeeds(myState.needs);
                }

                // Update held item display (both 3D and HUD)
                this.player.updateHeldItem(myState.heldItem);
                this.hud.updateHeldItem(myState.heldItem);

                // Auto-enter placement mode when picking up a security camera
                const newItemType = myState.heldItem?.type || null;
                if (newItemType === 'security_camera' && this._lastHeldItemType !== 'security_camera') {
                    // Just picked up a camera - auto-enter placement mode
                    console.log('[Game] Security camera picked up - auto-entering placement mode');
                    this.cameraPlacementSystem.activate();
                }
                this._lastHeldItemType = newItemType;

                // Check if we're grabbed
                if (myState.isGrabbed && !this.isGrabbed) {
                    this.isGrabbed = true;
                    this.controls.setGrabbed(true);
                } else if (!myState.isGrabbed && this.isGrabbed) {
                    this.isGrabbed = false;
                    this.controls.setGrabbed(false);
                }

                // Update available interaction from server
                this.interactionSystem.setAvailableInteraction(myState.availableInteraction);
            }

            // Update remote players
            this.remotePlayers.updatePlayers(state, this.network.playerId);

            // Update world geometry from server state
            if (state.world) {
                this.scene.rebuildFromWorldState(state.world);
            }

            // Update world objects (pickable items, plants, appliances, beds, etc.)
            if (state.worldObjects) {
                const heldItem = myState ? myState.heldItem : null;
                this.scene.updateWorldObjects(state.worldObjects, this.interactionSystem, myState, heldItem);
                // Note: Soil plot interactions now handled by server via availableInteraction
            }
        };

        this.network.onGrabbed = (grabbedBy) => {
            this.isGrabbed = true;
            this.controls.setGrabbed(true);
        };

        this.network.onReleased = () => {
            this.isGrabbed = false;
            this.controls.setGrabbed(false);
        };

        this.network.onPlayerLeft = (playerId) => {
            this.remotePlayers.removePlayer(playerId);
            if (this.isInGame) {
                this.chatUI.addSystemMessage(`A player left the game`);
            }
        };

        // Interaction response callbacks
        this.network.onInteractSuccess = (interactionType, targetId, result) => {
            console.log(`Interaction ${interactionType} on ${targetId} succeeded`, result);

            // Handle sleep interaction success - start minigame
            if (interactionType === 'sleep') {
                this.startSleepMinigame();
            } else if (interactionType === 'wake') {
                this.handleWakeUp();
            }
        };

        this.network.onInteractFail = (interactionType, targetId, reason) => {
            console.log(`Interaction ${interactionType} on ${targetId} failed: ${reason}`);
            // Future: could show error message briefly on HUD
        };

        // Sleep minigame result callback
        this.network.onSleepMinigameResult = (score, multiplier) => {
            console.log(`Sleep minigame result received: score=${score}%, multiplier=${multiplier}`);
        };

        // Death and revive callbacks
        this.network.onPlayerDied = (deathPosition, cause, waitingRoomPosition) => {
            this.handleDeath(deathPosition, cause, waitingRoomPosition);
        };

        this.network.onPlayerRevived = (position, needs) => {
            this.handleRevive(position, needs);
        };

        // Waiting room state callback
        this.network.onWaitingRoomState = (state) => {
            this.scene.updateWaitingRoomState(state);
        };

        // Door timeout callback
        this.network.onDoorTimeout = () => {
            console.log('[Game] Took too long - moved to back of queue');
            // Could show a brief message to the player
        };

        // Queue callbacks (for new players joining full game)
        this.network.onJoinQueued = (position, total, playerLimit, waitingRoomPosition) => {
            // Game was full when we tried to join - teleport to waiting room
            console.log(`[Game] Game full (${playerLimit} players). Queued at position ${position}/${total}`);
            this.isInQueue = true;
            this.isInWaitingRoom = true;

            // Hide home page since we're now in the waiting room
            this.homePage.style.display = 'none';
            this.chatUI.show();
            this.chatUI.setLocalPlayerId(this.network.playerId);
            this.chatUI.addSystemMessage(`Game is full. You are #${position} in queue.`);

            // Initialize player position to waiting room (critical for camera placement)
            if (waitingRoomPosition) {
                this.player.setPosition(waitingRoomPosition);
            }

            this.scene.showWaitingRoom();

            // Initialize queue state immediately (before WAITING_ROOM_STATE arrives from server)
            this.scene.updateWaitingRoomState({
                cooldownRemaining: 0,  // No cooldown for new players joining full game
                queuePosition: position,
                queueTotal: total,
                doorOpen: false,  // Door only opens when game has space
                joinTimeRemaining: null
            });

            // Request pointer lock for waiting room movement
            this.scene.renderer.domElement.requestPointerLock();
        };

        this.network.onQueueJoined = (position, total) => {
            // Dead player successfully joined queue after cooldown
            console.log(`[Game] Joined queue at position ${position}/${total}`);
            this.isInQueue = true;
        };

        this.network.onQueueUpdate = (position, total) => {
            // Queue position updated - handled by WAITING_ROOM_STATE
            console.log(`[Game] Queue position: ${position}/${total}`);
        };

        this.network.onQueueReady = () => {
            // Slot available - door should now be open (green)
            // Player needs to walk through door to join
            console.log('[Game] Slot available! Walk through the door to join.');
        };

        this.network.onJoinFromQueueFailed = (reason) => {
            // Failed to join from queue
            console.log('[Game] Failed to join from queue:', reason);
        };

        // Timed interaction callbacks
        this.network.onTimedInteractProgress = (interactionType, targetId, duration) => {
            // Server confirmed timed interaction started - show progress bar
            this.interactionSystem.startTimedInteraction(interactionType, targetId, duration);
        };

        this.network.onTimedInteractComplete = (interactionType, stationId, result) => {
            // Server confirmed timed interaction completed
            this.interactionSystem.completeTimedInteraction();
            console.log(`Timed interaction ${interactionType} completed at ${stationId}`, result);
        };

        this.network.onTimedInteractCancelled = (reason) => {
            // Server cancelled the timed interaction
            this.interactionSystem.completeTimedInteraction(); // Hide progress bar
            console.log(`Timed interaction cancelled: ${reason}`);
        };

        // Camera callbacks
        this.network.onCameraPlaced = (camera) => {
            this.handleCameraPlaced(camera);
        };

        this.network.onCameraPickedUp = (cameraId) => {
            this.handleCameraPickedUp(cameraId);
        };

        this.network.onCameraAdjusted = (cameraId, rotation) => {
            this.handleCameraAdjusted(cameraId, rotation);
        };

        this.network.onCameraAdjustStarted = (cameraId, playerId) => {
            this.camerasBeingAdjusted.add(cameraId);
            console.log(`[Game] Camera ${cameraId} is now being adjusted by ${playerId}`);
        };

        this.network.onCameraAdjustStopped = (cameraId) => {
            this.camerasBeingAdjusted.delete(cameraId);
            console.log(`[Game] Camera ${cameraId} is no longer being adjusted`);
        };

        this.network.onCamerasUpdate = (cameras) => {
            this.updateCamerasFromState(cameras);
        };

        // Monitor callbacks
        this.network.onMonitorViewStarted = (monitorId, cameraId, cameraIds, currentIndex) => {
            console.log(`[Game] Monitor view started: ${monitorId}, camera: ${cameraId}`);
            this.viewingMonitorId = monitorId;

            // Build camera data map (including ownerId for visibility check)
            const cameraData = {};
            for (const camId of cameraIds) {
                const cam = this.cameras.get(camId);
                if (cam) {
                    cameraData[camId] = {
                        position: cam.position,
                        rotation: cam.rotation,
                        ownerId: cam.ownerId
                    };
                }
            }

            // Enter monitor view mode (pass local player ID for visibility check)
            this.cameraViewMode.enterMonitorViewMode(monitorId, cameraId, cameraIds, cameraData, this.network.playerId);
        };

        this.network.onMonitorViewDenied = (monitorId, reason) => {
            console.log(`[Game] Monitor view denied: ${monitorId}, reason: ${reason}`);
            // Could show a notification to user here
        };

        this.network.onMonitorViewerLocked = (monitorId, viewerId) => {
            // Another player is viewing this monitor
            const config = this.monitorConfigs.get(monitorId);
            if (config) {
                config.viewerId = viewerId;
            }
        };

        this.network.onMonitorViewerReleased = (monitorId) => {
            const config = this.monitorConfigs.get(monitorId);
            if (config) {
                config.viewerId = null;
            }
        };

        this.network.onMonitorCameraChanged = (monitorId, cameraId) => {
            console.log(`[Game] Monitor camera changed: ${monitorId} -> ${cameraId}`);

            // Update local config
            const config = this.monitorConfigs.get(monitorId);
            if (config) {
                config.cameraId = cameraId;
            }

            // Update security room renderer
            if (this.securityRoomRenderer) {
                this.securityRoomRenderer.updateMonitorCamera(monitorId, cameraId, this.cameraFeedSystem);
            }

            // If we're viewing this monitor, update the view
            if (this.viewingMonitorId === monitorId && this.cameraViewMode.mode === 'monitor') {
                const camera = this.cameras.get(cameraId);
                if (camera) {
                    this.cameraViewMode.updateMonitorCamera(cameraId, {
                        position: camera.position,
                        rotation: camera.rotation
                    });
                }
            }
        };

        this.network.onMonitorsUpdate = (monitors) => {
            this.updateMonitorsFromState(monitors);
        };
    }

    gameLoop() {
        requestAnimationFrame(() => this.gameLoop());

        const now = performance.now();
        const deltaTime = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // Update player position (interpolation)
        this.player.update(deltaTime);

        // Local movement for waiting room (no server updates come back)
        if (this.isInWaitingRoom) {
            this.updateLocalWaitingRoomMovement(deltaTime);
        }

        // Update mobile controls (touch input)
        this.mobileControls.update();

        // Update camera based on player position
        this.controls.update(this.player.getPosition());

        // Update remote players (speech bubble animations)
        this.remotePlayers.update(deltaTime);

        // Update interaction system (raycasting and highlighting)
        this.interactionSystem.update();

        // Check camera hover (for interaction text on cameras)
        this.checkCameraHover();

        // Check monitor hover (for viewing camera feeds)
        this.checkMonitorHover();

        // Update timed interaction progress (if active)
        if (this.interactionSystem.isInTimedInteraction()) {
            this.interactionSystem.updateTimedInteraction();
        }

        // Render camera feeds for monitors (throttled at 15fps internally)
        if (this.cameraFeedSystem && this.cameras.size > 0) {
            this.cameraFeedSystem.renderAllFeeds();
            this.securityRoomRenderer.update(this.cameraFeedSystem);
        }

        // Update camera placement preview (if active)
        if (this.cameraPlacementSystem.isActive) {
            this.cameraPlacementSystem.update();
        }

        // Send input to server at fixed rate
        if (now - this.lastInputTime >= this.inputInterval) {
            if (this.network.isConnected) {
                const input = this.controls.getInput();
                this.network.sendInput(input, input.lookRotation);

                // Clear jump after sending
                if (input.jump) {
                    this.controls.clearJump();
                }
            }
            this.lastInputTime = now;
        }

        // Update camera view mode from current camera state (for held cameras)
        if (this.cameraViewMode && this.cameraViewMode.isActive && this.cameraViewMode.cameraId) {
            const currentCamera = this.cameras.get(this.cameraViewMode.cameraId);
            if (currentCamera) {
                this.cameraViewMode.updateFromCameraState(currentCamera, this.network.playerId);
            }
        }

        // Render (camera view mode or normal scene)
        if (this.cameraViewMode && this.cameraViewMode.isInCameraView()) {
            this.cameraViewMode.render(this.scene.scene);
        } else {
            this.scene.render();
        }
    }

    /**
     * Start the sleep minigame
     */
    startSleepMinigame() {
        if (this.isSleeping) return;

        this.isSleeping = true;
        this.controls.setSleeping(true);  // Disable movement and lock camera up while sleeping

        // Release pointer lock so user can click on minigame squares
        document.exitPointerLock();

        // Create and start the minigame
        this.sleepMinigame = new SleepMinigame((score, multiplier) => {
            // Minigame completed - send result to server
            if (this.network && this.network.isConnected) {
                this.network.sendSleepMinigameComplete(score, multiplier);

                // Immediately wake up after minigame - no waiting
                this.network.sendInteract('wake', null, this.player.getPosition());
            }

            console.log(`Sleep minigame completed: score=${score}%, multiplier=${multiplier.toFixed(1)}x`);
        });

        this.sleepMinigame.start();
    }

    /**
     * Handle waking up from sleep (called when server confirms wake)
     */
    handleWakeUp() {
        this.isSleeping = false;
        this.controls.setSleeping(false);  // Re-enable movement and camera

        if (this.sleepMinigame) {
            this.sleepMinigame.stop();
            this.sleepMinigame = null;
        }

        // Re-lock pointer after minigame ends
        this.scene.renderer.domElement.requestPointerLock();

        console.log('Player woke up');
    }

    /**
     * Handle player death - teleported to physical waiting room
     */
    handleDeath(deathPosition, cause = 'unknown', waitingRoomPosition) {
        if (this.isDead) return;

        this.isDead = true;
        this.isInWaitingRoom = true;

        // Don't disable controls - player can walk around waiting room
        this.controls.setDead(false);

        // Show physical waiting room
        this.scene.showWaitingRoom();

        // Show death message in chat
        const causeText = cause === 'hunger' ? 'starvation' :
                         cause === 'thirst' ? 'dehydration' :
                         cause === 'exhaustion' ? 'exhaustion' : cause;
        this.chatUI.addSystemMessage(`You died from ${causeText}. Wait to rejoin.`);

        console.log('[Game] Player died at', deathPosition, 'cause:', cause, '- teleported to waiting room');
    }

    /**
     * Handle player revive (joining game from queue)
     */
    handleRevive(position) {
        this.isDead = false;
        this.isInQueue = false;
        this.isInWaitingRoom = false;
        this.controls.setDead(false);

        // Hide physical waiting room
        this.scene.hideWaitingRoom();

        // Re-lock pointer
        this.scene.renderer.domElement.requestPointerLock();

        console.log('[Game] Player respawned at', position);
    }

    /**
     * Handle successful join from queue (JOINED message after queue)
     */
    handleJoinedFromQueue() {
        this.isDead = false;
        this.isInQueue = false;
        this.isInWaitingRoom = false;
        this.controls.setDead(false);

        // Hide physical waiting room
        this.scene.hideWaitingRoom();

        // Re-lock pointer
        this.scene.renderer.domElement.requestPointerLock();

        console.log('[Game] Joined game from queue');
    }

    /**
     * Handle local movement in waiting room (no server updates)
     * @param {number} deltaTime - Time since last frame in seconds
     */
    updateLocalWaitingRoomMovement(deltaTime) {
        const input = this.controls.getInput();
        const MOVE_SPEED = 5.0;  // Same as server
        const lookYaw = input.lookRotation.y;

        let moveX = 0;
        let moveZ = 0;

        if (input.forward) {
            moveX -= Math.sin(lookYaw);
            moveZ -= Math.cos(lookYaw);
        }
        if (input.backward) {
            moveX += Math.sin(lookYaw);
            moveZ += Math.cos(lookYaw);
        }
        if (input.left) {
            moveX -= Math.cos(lookYaw);
            moveZ += Math.sin(lookYaw);
        }
        if (input.right) {
            moveX += Math.cos(lookYaw);
            moveZ -= Math.sin(lookYaw);
        }

        // Normalize diagonal movement
        const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (moveLen > 0) {
            moveX = (moveX / moveLen) * MOVE_SPEED;
            moveZ = (moveZ / moveLen) * MOVE_SPEED;
        }

        // Apply movement
        const pos = this.player.getPosition();
        pos.x += moveX * deltaTime;
        pos.z += moveZ * deltaTime;

        // Clamp to waiting room bounds (10x10m room centered at 500, 500)
        const CENTER_X = 500, CENTER_Z = 500;
        const HALF_SIZE = 5, RADIUS = 0.3;
        pos.x = Math.max(CENTER_X - HALF_SIZE + RADIUS, Math.min(CENTER_X + HALF_SIZE - RADIUS, pos.x));
        pos.z = Math.max(CENTER_Z - HALF_SIZE + RADIUS, Math.min(CENTER_Z + HALF_SIZE - RADIUS, pos.z));

        this.player.setPosition(pos);
    }

    /**
     * Enter camera view mode - move player's view to a camera's position
     * @param {string} cameraId - ID of the camera to view through
     */
    enterCameraView(cameraId) {
        const camera = this.cameras.get(cameraId);
        if (!camera) {
            console.warn(`[Game] Cannot enter camera view: camera ${cameraId} not found`);
            return;
        }

        if (this.isInCameraView) {
            this.exitCameraView();
        }

        // Save current camera state
        this.savedCameraState = {
            position: this.scene.camera.position.clone(),
            pitch: this.controls.pitch,
            yaw: this.controls.yaw
        };

        // Move camera to the camera entity's position
        this.scene.camera.position.set(camera.position.x, camera.position.y, camera.position.z);

        // Lock controls to camera's rotation
        this.controls.pitch = camera.rotation.pitch || 0;
        this.controls.yaw = camera.rotation.yaw || 0;

        // Disable player movement
        this.controls.setCameraViewMode(true);

        this.isInCameraView = true;
        this.viewingCameraId = cameraId;

        // Notify server
        if (this.network && this.network.isConnected) {
            this.network.sendEnterCameraView(cameraId);
        }

        console.log(`[Game] Entered camera view: ${cameraId}`);
    }

    /**
     * Exit camera view mode - return player's view to their body
     */
    exitCameraView() {
        if (!this.isInCameraView || !this.savedCameraState) {
            return;
        }

        // Restore camera position and rotation
        this.scene.camera.position.copy(this.savedCameraState.position);
        this.controls.pitch = this.savedCameraState.pitch;
        this.controls.yaw = this.savedCameraState.yaw;

        // Re-enable player movement
        this.controls.setCameraViewMode(false);

        this.isInCameraView = false;
        const exitedCameraId = this.viewingCameraId;
        this.viewingCameraId = null;
        this.savedCameraState = null;

        // Notify server
        if (this.network && this.network.isConnected) {
            this.network.sendExitCameraView();
        }

        console.log(`[Game] Exited camera view: ${exitedCameraId}`);
    }

    /**
     * Auto-assign cameras to security room monitors
     * Called when cameras change or security rooms are created
     */
    updateMonitorCameraAssignments() {
        if (!this.securityRoomRenderer) return;

        // Get all security cameras (including floor items and held cameras)
        // This matches web viewer behavior - all cameras are visible
        const allCameras = [];
        for (const camera of this.cameras.values()) {
            if (camera.type === 'security') {
                allCameras.push(camera);
            }
        }

        // Sort by ID for consistent ordering
        allCameras.sort((a, b) => a.id.localeCompare(b.id));

        // Assign to monitors in order
        const monitors = this.securityRoomRenderer.getAllMonitors();
        for (let i = 0; i < monitors.length; i++) {
            if (i < allCameras.length) {
                this.securityRoomRenderer.assignCamera(i, allCameras[i].id);
            } else {
                // No camera for this monitor - will show "NO SIGNAL"
                this.securityRoomRenderer.assignCamera(i, null);
            }
        }
    }

    /**
     * Handle camera placed event from server
     * @param {Object} camera - Camera entity data
     */
    handleCameraPlaced(camera) {
        this.cameras.set(camera.id, camera);

        // Create feed for render-to-texture (for monitors)
        this.cameraFeedSystem.createFeed(camera.id, camera.position, camera.rotation);

        // If we just placed this camera, enter adjustment mode
        if (this.pendingCameraPlacement) {
            this.pendingCameraPlacement = false;
            const pos = new THREE.Vector3(
                camera.position.x,
                camera.position.y,
                camera.position.z
            );
            this.cameraViewMode.enterAdjustmentMode(camera.id, pos, camera.rotation);
        }

        // Update monitor assignments
        this.updateMonitorCameraAssignments();

        console.log(`[Game] Camera placed: ${camera.id}`);
    }

    /**
     * Handle camera picked up event from server
     * @param {string} cameraId - ID of the camera that was picked up
     */
    handleCameraPickedUp(cameraId) {
        // If we're viewing this camera, exit view
        if (this.viewingCameraId === cameraId) {
            this.exitCameraView();
        }

        this.cameras.delete(cameraId);
        this.cameraFeedSystem.disposeFeed(cameraId);

        // Update monitor assignments
        this.updateMonitorCameraAssignments();

        console.log(`[Game] Camera picked up: ${cameraId}`);
    }

    /**
     * Handle camera adjusted event from server
     * @param {string} cameraId - Camera ID
     * @param {Object} rotation - New rotation {pitch, yaw, roll}
     */
    handleCameraAdjusted(cameraId, rotation) {
        const camera = this.cameras.get(cameraId);
        if (camera) {
            camera.rotation = rotation;
            this.cameraFeedSystem.updateFeedPosition(cameraId, camera.position, rotation);
        }

        // If we're viewing this camera, update our view
        if (this.viewingCameraId === cameraId) {
            this.controls.pitch = rotation.pitch || 0;
            this.controls.yaw = rotation.yaw || 0;
        }

        console.log(`[Game] Camera adjusted: ${cameraId}`);
    }

    /**
     * Update cameras from state update
     * @param {Array} cameras - Array of camera entities from server
     */
    updateCamerasFromState(cameras) {
        if (!cameras) return;

        // Update existing cameras and add new ones
        for (const camera of cameras) {
            const existing = this.cameras.get(camera.id);
            if (!existing) {
                this.handleCameraPlaced(camera);
            } else {
                // Update position/rotation/ownership
                existing.position = camera.position;
                existing.rotation = camera.rotation;
                existing.ownerId = camera.ownerId;
                this.cameraFeedSystem.updateFeedPosition(camera.id, camera.position, camera.rotation);
            }
        }

        // Remove cameras that no longer exist
        const serverCameraIds = new Set(cameras.map(c => c.id));
        for (const [id] of this.cameras) {
            if (!serverCameraIds.has(id)) {
                this.handleCameraPickedUp(id);
            }
        }

        // Update scene camera meshes (pass local player ID to skip rendering held camera mesh)
        this.scene.updateCameras(cameras, this.network.playerId);
    }

    updateMonitorsFromState(monitors) {
        if (!monitors) return;

        // Update local monitor configs
        for (const monitor of monitors) {
            this.monitorConfigs.set(monitor.monitorId, {
                cameraId: monitor.cameraId,
                roomCell: monitor.roomCell,
                index: monitor.index,
                viewerId: monitor.viewerId
            });

            // Update security room renderer with camera assignments
            if (this.securityRoomRenderer) {
                this.securityRoomRenderer.updateMonitorCamera(
                    monitor.monitorId,
                    monitor.cameraId,
                    this.cameraFeedSystem
                );
            }
        }
    }
}

// Start the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
