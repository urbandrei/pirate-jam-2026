/**
 * First-person shooter controls
 * WASD movement + mouse look + jumping
 */

import { MOVE_SPEED, PLAYER_EYE_HEIGHT } from '../shared/constants.js';

export class Controls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        // Input state
        this.input = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false
        };

        // Look rotation (pitch, yaw)
        this.pitch = 0;
        this.yaw = 0;
        this.sensitivity = 0.002;

        // State
        this.isLocked = false;
        this.isGrabbed = false;

        // Elements
        this.clickToPlay = document.getElementById('click-to-play');
        this.crosshair = document.getElementById('crosshair');
        this.grabbedOverlay = document.getElementById('grabbed-overlay');

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Pointer lock
        this.clickToPlay.addEventListener('click', () => {
            this.domElement.requestPointerLock();
        });

        document.addEventListener('pointerlockchange', () => {
            this.isLocked = document.pointerLockElement === this.domElement;
            this.clickToPlay.style.display = this.isLocked ? 'none' : 'block';
            this.crosshair.style.display = this.isLocked ? 'block' : 'none';
        });

        // Mouse movement
        document.addEventListener('mousemove', (e) => {
            if (!this.isLocked) return;

            this.yaw -= e.movementX * this.sensitivity;
            this.pitch -= e.movementY * this.sensitivity;

            // Clamp pitch to prevent flipping
            this.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.pitch));
        });

        // Keyboard input
        document.addEventListener('keydown', (e) => {
            if (!this.isLocked) return;
            this.handleKeyDown(e.code);
        });

        document.addEventListener('keyup', (e) => {
            this.handleKeyUp(e.code);
        });
    }

    handleKeyDown(code) {
        switch (code) {
            case 'KeyW':
            case 'ArrowUp':
                this.input.forward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.input.backward = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.input.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.input.right = true;
                break;
            case 'Space':
                this.input.jump = true;
                break;
        }
    }

    handleKeyUp(code) {
        switch (code) {
            case 'KeyW':
            case 'ArrowUp':
                this.input.forward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.input.backward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.input.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.input.right = false;
                break;
            case 'Space':
                this.input.jump = false;
                break;
        }
    }

    setGrabbed(grabbed) {
        this.isGrabbed = grabbed;
        this.grabbedOverlay.classList.toggle('active', grabbed);

        if (grabbed) {
            // Clear movement input when grabbed
            this.input.forward = false;
            this.input.backward = false;
            this.input.left = false;
            this.input.right = false;
            this.input.jump = false;
        }
    }

    getInput() {
        // If grabbed, only allow looking (no movement)
        if (this.isGrabbed) {
            return {
                forward: false,
                backward: false,
                left: false,
                right: false,
                jump: false,
                lookRotation: { x: this.pitch, y: this.yaw }
            };
        }

        return {
            ...this.input,
            lookRotation: { x: this.pitch, y: this.yaw }
        };
    }

    update(playerPosition) {
        // Update camera rotation based on look direction
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;

        // Update camera position to player's eye level
        this.camera.position.x = playerPosition.x;
        this.camera.position.y = playerPosition.y + (PLAYER_EYE_HEIGHT - 0.9); // Offset from capsule center
        this.camera.position.z = playerPosition.z;
    }

    // Clear the jump input after it's been processed
    clearJump() {
        this.input.jump = false;
    }
}
