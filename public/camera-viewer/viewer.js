/**
 * Camera Viewer - Uses PC client rendering to show camera view
 *
 * Imports the PC client's Scene and RemotePlayers modules
 * to render an identical view from the camera's perspective.
 */

import { Scene } from '/pc/js/scene.js';
import { RemotePlayers } from '/pc/js/remote-players.js';

// Parse camera info from URL
const pathParts = window.location.pathname.split('/');
const cameraType = pathParts[1] === 'sec-cam' ? 'security' : 'stream';
const cameraNumber = parseInt(pathParts[2], 10);
const cameraId = `cam_${cameraNumber}`;

// DOM elements
const containerEl = document.getElementById('container');
const errorEl = document.getElementById('error');

// Update page title
document.title = `${cameraType === 'security' ? 'Security' : 'Stream'} Camera ${cameraNumber}`;

class CameraViewer {
    constructor() {
        this.cameraId = cameraId;
        this.socket = null;
        this.isConnected = false;
        this.hasReceivedState = false;
        this.worldStateReceived = false;

        // Camera data
        this.cameras = new Map();

        // PC client modules
        this.scene = null;
        this.remotePlayers = null;

        this.init();
    }

    init() {
        this.setupScene();
        this.setupSocket();
        this.animate();
    }

    setupScene() {
        // Create a wrapper div for the PC Scene class
        const gameContainer = document.createElement('div');
        gameContainer.id = 'game-container';
        gameContainer.style.width = '100%';
        gameContainer.style.height = '100%';
        gameContainer.style.position = 'absolute';
        gameContainer.style.top = '0';
        gameContainer.style.left = '0';
        containerEl.insertBefore(gameContainer, containerEl.firstChild);

        // Use the PC client's Scene class
        this.scene = new Scene(gameContainer);

        // Create remote players renderer
        this.remotePlayers = new RemotePlayers(this.scene);
        this.remotePlayers.setCamera(this.scene.camera);

        // Set camera rotation order for proper pitch/yaw
        this.scene.camera.rotation.order = 'YXZ';

        // Handle resize
        window.addEventListener('resize', () => {
            this.scene.onResize();
        });
    }

    setupSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('[CameraViewer] Connected to server');
            this.isConnected = true;

            // Join as viewer
            this.socket.emit('message', {
                type: 'JOIN',
                playerType: 'viewer',
                cameraId: this.cameraId
            });
        });

        this.socket.on('disconnect', () => {
            console.log('[CameraViewer] Disconnected from server');
            this.isConnected = false;
            this.hasReceivedState = false;
        });

        this.socket.on('message', (msg) => {
            this.handleMessage(msg);
        });
    }

    handleMessage(msg) {
        switch (msg.type) {
            case 'JOINED':
                console.log('[CameraViewer] Joined as viewer');
                // Initial cameras data
                if (msg.cameras) {
                    this.updateCameras(msg.cameras);
                }
                // Initial world state (state.world contains the world geometry)
                if (msg.state && msg.state.world) {
                    this.scene.rebuildFromWorldState(msg.state.world);
                    this.worldStateReceived = true;
                    this.lastWorldVersion = msg.state.world.version;
                }
                break;

            case 'STATE_UPDATE':
                this.updateGameState(msg.state, msg.cameras);
                break;

            case 'CAMERA_NOT_FOUND':
                this.showError(`Camera ${msg.cameraId} not found. It may not exist yet.`);
                break;

            case 'CAMERA_PLACED':
                this.cameras.set(msg.camera.id, msg.camera);
                break;

            case 'CAMERA_PICKED_UP':
                this.cameras.delete(msg.cameraId);
                if (msg.cameraId === this.cameraId) {
                    this.showError('Camera was picked up');
                }
                break;

            case 'CAMERA_ADJUSTED':
                const cam = this.cameras.get(msg.cameraId);
                if (cam) {
                    cam.rotation = msg.rotation;
                }
                break;
        }
    }

    updateGameState(state, cameras) {
        // Update world state if version changed (state.world contains the world geometry)
        if (state.world && (!this.worldStateReceived || state.world.version !== this.lastWorldVersion)) {
            this.scene.rebuildFromWorldState(state.world);
            this.worldStateReceived = true;
            this.lastWorldVersion = state.world.version;
        }

        // Update cameras
        if (cameras) {
            this.updateCameras(cameras);
        }

        // Update world objects (items, plants, etc.) - pass null for interactionSystem and player
        if (state.worldObjects) {
            this.scene.updateWorldObjects(state.worldObjects, null, null, null);
        }

        // Update remote players (pass empty string as localPlayerId so all players render)
        this.remotePlayers.updatePlayers(state, '');

        // Find our camera and position the view
        const myCam = this.cameras.get(this.cameraId);
        if (myCam) {
            // Update camera position/rotation
            this.scene.camera.position.set(
                myCam.position.x,
                myCam.position.y,
                myCam.position.z
            );
            this.scene.camera.rotation.y = myCam.rotation.yaw || 0;
            this.scene.camera.rotation.x = myCam.rotation.pitch || 0;

            if (!this.hasReceivedState) {
                this.hasReceivedState = true;
                errorEl.style.display = 'none';
            }
        }
    }

    updateCameras(cameras) {
        // Clear and rebuild camera map
        const newCamIds = new Set();

        for (const cam of cameras) {
            newCamIds.add(cam.id);
            this.cameras.set(cam.id, cam);
        }

        // Remove cameras that no longer exist
        for (const [id] of this.cameras) {
            if (!newCamIds.has(id)) {
                this.cameras.delete(id);
            }
        }
    }

    showError(message) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Update remote players (for speech bubbles, name labels)
        if (this.remotePlayers) {
            this.remotePlayers.update(1/60);
        }

        // Render
        this.scene.render();
    }
}

// Validate camera number
if (!cameraNumber || isNaN(cameraNumber)) {
    errorEl.textContent = 'Invalid camera number';
    errorEl.style.display = 'block';
} else {
    // Start the viewer
    new CameraViewer();
}
