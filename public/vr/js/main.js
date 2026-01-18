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

        this.lastNetworkTime = 0;
        this.networkInterval = 1000 / NETWORK_RATE;
        this.currentFrame = null;

        this.init();
    }

    async init() {
        console.log('Initializing VR client...');

        // Setup Three.js + WebXR scene
        const container = document.getElementById('game-container');
        this.scene = new VRScene(container);

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

        let head = null;

        if (frame && referenceSpace) {
            try {
                const viewerPose = frame.getViewerPose(referenceSpace);
                if (viewerPose) {
                    const pos = viewerPose.transform.position;
                    const rot = viewerPose.transform.orientation;
                    // Scale head position by GIANT_SCALE to convert VR meters to world units
                    // VR head at 1.6m -> 16m in world units (giant's eye height)
                    head = {
                        position: {
                            x: pos.x * GIANT_SCALE,
                            y: pos.y * GIANT_SCALE,
                            z: pos.z * GIANT_SCALE
                        },
                        rotation: { x: rot.x, y: rot.y, z: rot.z, w: rot.w }
                    };
                }
            } catch (e) {
                console.debug('Could not get viewer pose:', e.message);
            }
        }

        // Fallback to camera if viewer pose unavailable
        if (!head) {
            const camera = this.scene.renderer.xr.getCamera();
            const headPosition = new THREE.Vector3();
            const headQuaternion = new THREE.Quaternion();

            camera.getWorldPosition(headPosition);
            camera.getWorldQuaternion(headQuaternion);

            // Scale head position by GIANT_SCALE
            head = {
                position: {
                    x: headPosition.x * GIANT_SCALE,
                    y: headPosition.y * GIANT_SCALE,
                    z: headPosition.z * GIANT_SCALE
                },
                rotation: { x: headQuaternion.x, y: headQuaternion.y, z: headQuaternion.z, w: headQuaternion.w }
            };
        }

        // Get hand data (already scaled by GIANT_SCALE in hands.js)
        const handData = this.hands.getHandData();

        this.network.sendPose(head, handData.leftHand, handData.rightHand);
    }
}

// Start the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.game = new VRGame();
});
