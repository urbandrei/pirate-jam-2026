/**
 * First-person shooter controls
 * WASD movement + mouse look + jumping
 */

import { MOVE_SPEED, PLAYER_EYE_HEIGHT } from '../shared/constants.js';

export class Controls {
    constructor(camera, domElement, settingsManager) {
        this.camera = camera;
        this.domElement = domElement;
        this.settingsManager = settingsManager;

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
        this.isSleeping = false;
        this.isDead = false;
        this.isSettingsOpen = false;

        // Callbacks
        this.onLeftClick = null;  // Callback for left-click interaction

        // Elements
        this.homePage = document.getElementById('home-page');
        this.crosshair = document.getElementById('crosshair');
        this.grabbedOverlay = document.getElementById('grabbed-overlay');

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Pointer lock change handler
        document.addEventListener('pointerlockchange', () => {
            this.isLocked = document.pointerLockElement === this.domElement;
            this.crosshair.style.display = this.isLocked ? 'block' : 'none';
        });

        // Mouse movement
        document.addEventListener('mousemove', (e) => {
            if (!this.isLocked) return;
            // Block camera rotation when sleeping or dead
            if (this.isSleeping || this.isDead) return;

            this.yaw -= e.movementX * this.sensitivity;
            this.pitch -= e.movementY * this.sensitivity;

            // Clamp pitch to prevent flipping
            this.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.pitch));
        });

        // Keyboard input
        document.addEventListener('keydown', (e) => {
            if (!this.isLocked) return;
            // Block movement input when sleeping, dead, or settings open
            if (this.isSleeping || this.isDead || this.isSettingsOpen) return;
            // Block when typing in chat or other inputs
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
            this.handleKeyDown(e.code);
        });

        document.addEventListener('keyup', (e) => {
            this.handleKeyUp(e.code);
        });

        // Left-click for interaction (only when pointer-locked)
        document.addEventListener('mousedown', (e) => {
            if (!this.isLocked) return;
            if (e.button === 0 && this.onLeftClick) {
                this.onLeftClick();
            }
        });
    }

    handleKeyDown(code) {
        // Use dynamic key lookup from settings manager
        const action = this.settingsManager.getActionForKey(code);
        if (action && this.input.hasOwnProperty(action)) {
            this.input[action] = true;
        }
    }

    handleKeyUp(code) {
        // Use dynamic key lookup from settings manager
        const action = this.settingsManager.getActionForKey(code);
        if (action && this.input.hasOwnProperty(action)) {
            this.input[action] = false;
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

    setSleeping(sleeping) {
        this.isSleeping = sleeping;

        if (sleeping) {
            // Clear all movement input
            this.input.forward = false;
            this.input.backward = false;
            this.input.left = false;
            this.input.right = false;
            this.input.jump = false;
            // Lock camera looking straight up (lying in bed)
            this.pitch = -Math.PI / 2 + 0.1;
        }
    }

    setDead(dead) {
        this.isDead = dead;

        if (dead) {
            // Clear all movement input
            this.input.forward = false;
            this.input.backward = false;
            this.input.left = false;
            this.input.right = false;
            this.input.jump = false;
        }
    }

    setSettingsOpen(open) {
        this.isSettingsOpen = open;

        if (open) {
            // Clear all movement input when opening settings
            this.input.forward = false;
            this.input.backward = false;
            this.input.left = false;
            this.input.right = false;
            this.input.jump = false;
        }
    }

    getInput() {
        // If grabbed, sleeping, dead, or settings open - no movement
        if (this.isGrabbed || this.isSleeping || this.isDead || this.isSettingsOpen) {
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
