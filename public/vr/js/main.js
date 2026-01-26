/**
 * VR Client Main Entry Point
 *
 * COORDINATE SYSTEM:
 * - VR player is at real-world scale (WebXR 1:1 tracking)
 * - Sends head/hand positions multiplied by GIANT_SCALE to server
 * - This maps VR positions to world units where PC players exist
 * - Result: VR hand at 0.8m height reaches PC player at 8m world height
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { VRScene } from './scene.js';
import { Hands } from './hands.js';
import { Network } from './network.js';
import { RemotePlayers } from './remote-players.js';
import { BuildingSystem } from './building-system.js';
import { StatsPanel } from './stats-panel.js';
import { ChatPanel } from './chat-panel.js';
import { StreamCameraSystem } from './stream-camera-system.js';
import { VoiceCapture } from './voice-capture.js';
import { NETWORK_RATE, GIANT_SCALE } from '../../pc/shared/constants.js';

class VRGame {
    constructor() {
        this.scene = null;
        this.hands = null;
        this.network = null;
        this.remotePlayers = null;
        this.buildingSystem = null;
        this.streamCameraSystem = null;
        this.statsPanel = null;
        this.chatPanel = null;
        this.voiceCapture = null;
        this.disposed = false;

        // Password protection
        this.vrPassword = null;
        this.passwordRequired = false;

        // Player count HUD
        this.playerCountSprite = null;
        this.playerCountCanvas = null;
        this.playerCountCtx = null;
        this._lastPlayerCount = -1;

        // HUD container group (parent for all HUD elements to prevent parallax)
        this.hudGroup = null;

        this.lastNetworkTime = 0;
        this.networkInterval = 1000 / NETWORK_RATE;
        this.currentFrame = null;

        // Reusable objects for sendPose() and HUD positioning
        this._headPosition = new THREE.Vector3();
        this._headQuaternion = new THREE.Quaternion();
        this._hudOffset = new THREE.Vector3();
        this._hudDirection = new THREE.Vector3();
        this._hudRight = new THREE.Vector3();

        // Pre-allocated head data structure to avoid per-frame allocation
        this._headData = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 }
        };

        this.init();
    }

    async init() {
        // Check if VR password is required
        await this.checkPasswordRequired();

        if (this.passwordRequired) {
            // Show password UI and wait for submission
            this.showPasswordUI();
            return; // Will continue initialization after password is submitted
        }

        // Continue with normal initialization
        await this.initializeGame();
    }

    async checkPasswordRequired() {
        try {
            // Determine game server URL
            let serverUrl = window.GAME_SERVER_URL || '';
            const port = parseInt(window.location.port) || 80;
            if (!serverUrl && port !== 3000 && port !== 80 && port !== 443) {
                serverUrl = `${window.location.protocol}//${window.location.hostname}:3000`;
            }

            const response = await fetch(`${serverUrl}/vr-auth-required`);
            const data = await response.json();
            this.passwordRequired = data.required;
        } catch (err) {
            console.warn('Could not check VR auth requirement:', err);
            this.passwordRequired = false;
        }
    }

    showPasswordUI() {
        const container = document.getElementById('password-container');
        const input = document.getElementById('password-input');
        const submitBtn = document.getElementById('password-submit');
        const errorEl = document.getElementById('password-error');
        const statusEl = document.getElementById('status');

        container.style.display = 'block';
        statusEl.textContent = 'Enter VR password to continue';

        const handleSubmit = async () => {
            const password = input.value.trim();
            if (!password) {
                errorEl.textContent = 'Please enter a password';
                return;
            }

            errorEl.textContent = '';
            submitBtn.disabled = true;
            submitBtn.textContent = 'Connecting...';

            this.vrPassword = password;
            container.style.display = 'none';

            // Continue with game initialization
            await this.initializeGame();
        };

        submitBtn.addEventListener('click', handleSubmit);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSubmit();
        });

        input.focus();
    }

    async initializeGame() {
        // Setup Three.js + WebXR scene
        const container = document.getElementById('game-container');
        this.scene = new VRScene(container);

        // Setup player count HUD
        this.setupPlayerCountHUD();

        // Setup stats panel (population needs overview)
        this.statsPanel = new StatsPanel(this.scene.scene);

        // Add stats panel to hudGroup at lower position (local coordinates)
        if (this.statsPanel && this.statsPanel.sprite) {
            this.statsPanel.sprite.position.set(0, -0.05, 0);
            this.hudGroup.add(this.statsPanel.sprite);
        }

        // Setup chat panel (bottom-left in HUD, smaller and further out)
        this.chatPanel = new ChatPanel();
        this.chatPanel.sprite.position.set(-0.2, -0.18, 0);
        this.hudGroup.add(this.chatPanel.sprite);

        // Setup hands
        this.hands = new Hands(this.scene.scene, this.scene.renderer);

        // Setup remote players renderer
        this.remotePlayers = new RemotePlayers(this.scene.scene);

        // Setup network
        this.network = new Network();
        this.setupNetworkCallbacks();

        // Handle rejection (wrong password)
        this.network.onRejected = (reason) => {
            // Show password UI again with error
            const container = document.getElementById('password-container');
            const errorEl = document.getElementById('password-error');
            const submitBtn = document.getElementById('password-submit');

            container.style.display = 'block';
            errorEl.textContent = reason;
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit';
        };

        // Setup building system (after network is ready)
        this.buildingSystem = new BuildingSystem(this.scene.scene, this.hands, this.network);
        this.setupBuildingCallbacks();

        // Setup stream camera system (VR camera placement)
        this.streamCameraSystem = new StreamCameraSystem(this.scene.scene, this.hands, this.network);
        this.setupCameraCallbacks();

        // Hook cleanup to VR session end
        this.scene.onSessionEnd = () => {
            this.dispose();
        };

        // Connect to server (with password if required)
        try {
            await this.network.connect(this.vrPassword);
        } catch (err) {
            console.error('Failed to connect:', err);
        }

        // Setup voice capture (always-on mic for VR player)
        this.voiceCapture = new VoiceCapture();
        const voiceInitialized = await this.voiceCapture.init();
        if (voiceInitialized) {
            // Wire up audio chunks to network
            this.voiceCapture.onChunk = (audioData) => {
                if (this.network && this.network.isConnected) {
                    this.network.sendVoice(audioData);
                }
            };
            // Start capturing immediately (always-on)
            this.voiceCapture.start();
        }

        // Start render loop
        this.scene.setAnimationLoop((time, frame) => this.gameLoop(time, frame));
    }

    setupNetworkCallbacks() {
        this.network.onStateUpdate = (state) => {
            // Update remote players
            this.remotePlayers.updatePlayers(state, this.network.playerId);

            // Update player count HUD
            const playerCount = Object.keys(state.players).length;
            this.updatePlayerCountHUD(playerCount);

            // Update stats panel with population needs
            if (this.statsPanel) {
                this.statsPanel.update(state);
            }

            // Update building system with world state (miniature replica)
            if (state.world && this.buildingSystem) {
                this.buildingSystem.onWorldStateUpdate(state.world);
            }

            // Update world items in miniature
            if (state.worldObjects && this.buildingSystem) {
                this.buildingSystem.updateWorldItems(state.worldObjects);
            }

            // Update world items in scene (full-scale in tiny world)
            if (state.worldObjects && this.scene) {
                this.scene.updateWorldItems(state.worldObjects);
            }

            // Update VR scene world geometry (full-size walls)
            if (state.world && this.scene) {
                this.scene.rebuildFromWorldState(state.world);
            }
        };

        this.network.onPlayerLeft = (playerId) => {
            this.remotePlayers.removePlayer(playerId);
        };

        this.network.onChatReceived = (senderId, senderName, text) => {
            if (this.chatPanel) {
                this.chatPanel.addMessage(senderId, senderName, text);
            }
        };

        // Stream chat callback (Twitch, etc.)
        this.network.onStreamChatReceived = (message) => {
            if (this.chatPanel) {
                this.chatPanel.addMessage(
                    message.senderId,
                    message.senderName,
                    message.text,
                    message.platform,
                    message.color
                );
            }
        };
    }

    setupBuildingCallbacks() {
        // Hook into hands for pinch events
        const originalOnPinchStart = this.hands.onPinchStart;
        const originalOnPinchEnd = this.hands.onPinchEnd;

        this.hands.onPinchStart = (hand) => {
            // Try stream camera system first (it's further from building palette)
            if (this.streamCameraSystem && this.streamCameraSystem.handlePinchStart(hand)) {
                return; // Stream camera system handled it
            }
            // Try building system
            if (this.buildingSystem && this.buildingSystem.handlePinchStart(hand)) {
                return; // Building system handled it
            }
            // Otherwise, call original handler if exists
            if (originalOnPinchStart) {
                originalOnPinchStart(hand);
            }
        };

        this.hands.onPinchEnd = (hand) => {
            // Try stream camera system first
            if (this.streamCameraSystem && this.streamCameraSystem.handlePinchEnd(hand)) {
                return; // Stream camera system handled it
            }
            // Try building system
            if (this.buildingSystem && this.buildingSystem.handlePinchEnd(hand)) {
                return; // Building system handled it
            }
            // Otherwise, call original handler if exists
            if (originalOnPinchEnd) {
                originalOnPinchEnd(hand);
            }
        };
    }

    setupCameraCallbacks() {
        // Handle camera placement confirmations
        this.network.onCameraPlaced = (camera) => {
            if (this.streamCameraSystem) {
                this.streamCameraSystem.onCameraPlaced(camera);
            }
        };

        this.network.onCameraPickedUp = (cameraId) => {
            if (this.streamCameraSystem) {
                this.streamCameraSystem.onCameraRemoved(cameraId);
            }
        };

        this.network.onCameraLimitsUpdated = (limits) => {
            if (this.streamCameraSystem) {
                this.streamCameraSystem.updateLimits(limits);
            }
        };

        // Handle cameras in state updates
        this.network.onCamerasUpdate = (cameras) => {
            if (this.streamCameraSystem) {
                this.streamCameraSystem.updateFromState(cameras);
            }
        };
    }

    setupPlayerCountHUD() {
        // Create HUD container group (positions all HUD elements together)
        this.hudGroup = new THREE.Group();
        this.scene.scene.add(this.hudGroup);

        // Create canvas for text rendering
        this.playerCountCanvas = document.createElement('canvas');
        this.playerCountCanvas.width = 256;
        this.playerCountCanvas.height = 64;
        this.playerCountCtx = this.playerCountCanvas.getContext('2d');

        // Create texture and sprite
        const texture = new THREE.CanvasTexture(this.playerCountCanvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });
        this.playerCountSprite = new THREE.Sprite(material);
        this.playerCountSprite.scale.set(0.2, 0.05, 1);

        // Add to hudGroup at upper position (local coordinates)
        this.playerCountSprite.position.set(0, 0.05, 0);
        this.hudGroup.add(this.playerCountSprite);

        // Initial render
        this.updatePlayerCountHUD(0);
    }

    updatePlayerCountHUD(count) {
        // Skip update if count hasn't changed (reduces GPU texture uploads)
        if (this._lastPlayerCount === count) return;
        this._lastPlayerCount = count;

        const ctx = this.playerCountCtx;
        ctx.clearRect(0, 0, 256, 64);

        // Semi-transparent background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.roundRect(0, 0, 256, 64, 10);
        ctx.fill();

        // Text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Players: ${count}`, 128, 32);

        // Update texture
        this.playerCountSprite.material.map.needsUpdate = true;
    }

    gameLoop(time, frame) {
        // Guard: Stop if XR session ended
        if (!this.scene.renderer.xr.isPresenting) {
            return;
        }

        // Store frame reference for sendPose
        this.currentFrame = frame;

        try {
            // Update hands (only when we have a valid XR frame and are in VR)
            if (frame && this.scene.isInVR()) {
                try {
                    const referenceSpace = this.scene.renderer.xr.getReferenceSpace();
                    if (referenceSpace && this.hands) {
                        this.hands.update(frame, referenceSpace);
                    }
                } catch (handError) {
                    // Don't crash - hands may not be ready yet
                }
            }

            // Update HUD positions to follow XR camera
            this.updateHUDPositions();

            // Update building system
            if (this.buildingSystem) {
                this.buildingSystem.update();
            }

            // Update stream camera system (moves grabbed camera with hand)
            if (this.streamCameraSystem) {
                this.streamCameraSystem.update();
            }

            // Send pose to server at fixed rate
            if (time - this.lastNetworkTime >= this.networkInterval) {
                if (this.network && this.network.isConnected && this.scene.isInVR()) {
                    try {
                        this.sendPose();
                    } catch (poseError) {
                        console.warn('Failed to send pose:', poseError.message);
                    }
                }
                this.lastNetworkTime = time;
            }
        } catch (error) {
            // Catch-all to prevent VR session from hanging on any error
            console.error('Game loop error:', error);
        }

        // Render scene - required even with WebXR
        this.scene.render();
    }

    /**
     * Update HUD group position to float in front of the XR camera
     * All HUD elements are children of hudGroup, so they move together
     */
    updateHUDPositions() {
        if (!this.scene.isInVR()) return;
        if (!this.hudGroup) return;

        const camera = this.scene.renderer.xr.getCamera();
        if (!camera) return;

        // Get camera world position and direction
        camera.getWorldPosition(this._headPosition);
        camera.getWorldQuaternion(this._headQuaternion);

        // Calculate forward direction from camera
        this._hudDirection.set(0, 0, -1).applyQuaternion(this._headQuaternion);

        // Calculate right direction (reuse pre-allocated vector)
        this._hudRight.set(1, 0, 0).applyQuaternion(this._headQuaternion);

        // Position hudGroup: 0.5m in front, slightly up and right
        this._hudOffset.copy(this._hudDirection).multiplyScalar(0.5);
        this._hudOffset.addScaledVector(this._hudRight, 0.15);
        this._hudOffset.y += 0.07; // Centered vertically between both HUD elements

        this.hudGroup.position.copy(this._headPosition).add(this._hudOffset);
    }

    sendPose() {
        // Get head position and rotation from XR frame viewer pose
        const frame = this.currentFrame;
        const referenceSpace = this.scene.renderer.xr.getReferenceSpace();

        let hasHead = false;

        if (frame && referenceSpace) {
            try {
                const viewerPose = frame.getViewerPose(referenceSpace);
                if (viewerPose) {
                    const pos = viewerPose.transform.position;
                    const rot = viewerPose.transform.orientation;
                    // Scale head position by GIANT_SCALE to convert VR meters to world units
                    // VR head at 1.6m -> 16m in world units (giant's eye height)
                    // Update pre-allocated structure in place to avoid GC pressure
                    this._headData.position.x = pos.x * GIANT_SCALE;
                    this._headData.position.y = pos.y * GIANT_SCALE;
                    this._headData.position.z = pos.z * GIANT_SCALE;
                    this._headData.rotation.x = rot.x;
                    this._headData.rotation.y = rot.y;
                    this._headData.rotation.z = rot.z;
                    this._headData.rotation.w = rot.w;
                    hasHead = true;
                }
            } catch (e) {
                // Could not get viewer pose
            }
        }

        // Fallback to camera if viewer pose unavailable
        if (!hasHead) {
            const camera = this.scene.renderer.xr.getCamera();

            // Reuse cached objects to avoid allocation each frame
            camera.getWorldPosition(this._headPosition);
            camera.getWorldQuaternion(this._headQuaternion);

            // Scale head position by GIANT_SCALE - update in place
            this._headData.position.x = this._headPosition.x * GIANT_SCALE;
            this._headData.position.y = this._headPosition.y * GIANT_SCALE;
            this._headData.position.z = this._headPosition.z * GIANT_SCALE;
            this._headData.rotation.x = this._headQuaternion.x;
            this._headData.rotation.y = this._headQuaternion.y;
            this._headData.rotation.z = this._headQuaternion.z;
            this._headData.rotation.w = this._headQuaternion.w;
        }

        // Get hand data (already scaled by GIANT_SCALE in hands.js)
        const handData = this.hands.getHandData();

        this.network.sendPose(this._headData, handData.leftHand, handData.rightHand);
    }

    /**
     * Cleanup all resources to prevent memory leaks
     * Called when VR session ends
     */
    dispose() {
        // Guard against double disposal
        if (this.disposed) {
            console.warn('[VRGame] Already disposed, skipping');
            return;
        }
        this.disposed = true;

        // Stop animation loop FIRST to prevent further updates
        if (this.scene && this.scene.renderer) {
            this.scene.renderer.setAnimationLoop(null);
        }

        // Dispose subsystems
        if (this.hands) {
            try {
                this.hands.dispose();
                this.hands = null;
            } catch (err) {
                console.warn('[VRGame] Error disposing hands:', err);
            }
        }

        if (this.network) {
            try {
                this.network.disconnect();
                this.network = null;
            } catch (err) {
                console.warn('[VRGame] Error disconnecting network:', err);
            }
        }

        if (this.remotePlayers) {
            try {
                this.remotePlayers.dispose();
                this.remotePlayers = null;
            } catch (err) {
                console.warn('[VRGame] Error disposing remote players:', err);
            }
        }

        if (this.buildingSystem) {
            try {
                this.buildingSystem.dispose();
                this.buildingSystem = null;
            } catch (err) {
                console.warn('[VRGame] Error disposing building system:', err);
            }
        }

        if (this.streamCameraSystem) {
            try {
                this.streamCameraSystem.dispose();
                this.streamCameraSystem = null;
            } catch (err) {
                console.warn('[VRGame] Error disposing stream camera system:', err);
            }
        }

        if (this.statsPanel) {
            try {
                this.statsPanel.dispose();
                this.statsPanel = null;
            } catch (err) {
                console.warn('[VRGame] Error disposing stats panel:', err);
            }
        }

        if (this.chatPanel) {
            try {
                this.chatPanel.dispose();
                this.chatPanel = null;
            } catch (err) {
                console.warn('[VRGame] Error disposing chat panel:', err);
            }
        }

        if (this.voiceCapture) {
            try {
                this.voiceCapture.dispose();
                this.voiceCapture = null;
            } catch (err) {
                console.warn('[VRGame] Error disposing voice capture:', err);
            }
        }

        // Dispose HUD resources
        if (this.playerCountSprite) {
            try {
                if (this.playerCountSprite.material && this.playerCountSprite.material.map) {
                    this.playerCountSprite.material.map.dispose();
                }
                if (this.playerCountSprite.material) {
                    this.playerCountSprite.material.dispose();
                }
                if (this.playerCountSprite.geometry) {
                    this.playerCountSprite.geometry.dispose();
                }
                this.playerCountSprite = null;
            } catch (err) {
                console.warn('[VRGame] Error disposing HUD:', err);
            }
        }

        // Remove hudGroup from scene
        if (this.hudGroup && this.scene && this.scene.scene) {
            try {
                this.scene.scene.remove(this.hudGroup);
                this.hudGroup = null;
            } catch (err) {
                console.warn('[VRGame] Error removing hudGroup:', err);
            }
        }

        this.playerCountCanvas = null;
        this.playerCountCtx = null;

        // Dispose scene last (includes renderer cleanup)
        if (this.scene) {
            try {
                this.scene.dispose();
                this.scene = null;
            } catch (err) {
                console.warn('[VRGame] Error disposing scene:', err);
            }
        }

        // Clear frame reference
        this.currentFrame = null;
    }
}

// Start the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.game = new VRGame();
});
