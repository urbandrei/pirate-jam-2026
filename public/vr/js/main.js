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
import { GrabController } from './grab-controller.js';
import { NETWORK_RATE, GIANT_SCALE } from '../../pc/shared/constants.js';

class VRGame {
    constructor() {
        this.scene = null;
        this.hands = null;
        this.network = null;
        this.remotePlayers = null;
        this.grabController = null;

        // Player count HUD
        this.playerCountSprite = null;
        this.playerCountCanvas = null;
        this.playerCountCtx = null;

        this.lastNetworkTime = 0;
        this.networkInterval = 1000 / NETWORK_RATE;
        this.currentFrame = null;

        // Reusable objects for sendPose() to avoid allocation each frame
        this._headPosition = new THREE.Vector3();
        this._headQuaternion = new THREE.Quaternion();

        // Pre-allocated head data structure to avoid per-frame allocation
        this._headData = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 }
        };

        this.init();
    }

    async init() {
        console.log('Initializing VR client...');

        // Setup Three.js + WebXR scene
        const container = document.getElementById('game-container');
        this.scene = new VRScene(container);

        // Setup player count HUD
        this.setupPlayerCountHUD();

        // Setup hands
        this.hands = new Hands(this.scene.scene, this.scene.renderer);

        // Setup remote players renderer
        this.remotePlayers = new RemotePlayers(this.scene.scene);

        // Setup network
        this.network = new Network();
        this.setupNetworkCallbacks();

        // Setup grab controller
        this.grabController = new GrabController(this.hands, this.network);

        // Connect to server
        try {
            await this.network.connect();
            console.log('Connected to game server');
        } catch (err) {
            console.error('Failed to connect:', err);
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
        };

        this.network.onGrabSuccess = (playerId) => {
            this.grabController.onGrabSuccess(playerId);
        };

        this.network.onReleaseSuccess = (playerId) => {
            this.grabController.onReleaseSuccess(playerId);
        };

        this.network.onPlayerLeft = (playerId) => {
            this.remotePlayers.removePlayer(playerId);
        };
    }

    setupPlayerCountHUD() {
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

        // Position in upper-right of view (VR scale: ~0.5m in front of eyes)
        this.playerCountSprite.position.set(0.3, 0.2, -0.5);
        this.playerCountSprite.scale.set(0.2, 0.05, 1);

        // Attach to camera rig so it follows the head
        this.scene.cameraRig.add(this.playerCountSprite);

        // Initial render
        this.updatePlayerCountHUD(0);
    }

    updatePlayerCountHUD(count) {
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
                    // Log but don't crash - hands may not be ready yet
                    console.debug('Hand update skipped:', handError.message);
                }
            }

            // Update grab controller (with safety check)
            if (this.grabController) {
                try {
                    this.grabController.update();
                } catch (grabError) {
                    console.warn('Grab controller update error:', grabError.message);
                }
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
                console.debug('Could not get viewer pose:', e.message);
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
}

// Start the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.game = new VRGame();
});
