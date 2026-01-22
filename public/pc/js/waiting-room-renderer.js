/**
 * Waiting Room Renderer
 *
 * Physical 3D waiting room that players are teleported to when they die.
 * Features:
 * - Dark/dystopian 10x10m room
 * - Door on south wall with emissive border
 * - Canvas-based text display above door
 * - Door color changes: red (cooldown), yellow (in queue), green (can join)
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { WAITING_ROOM } from '../shared/constants.js';

export class WaitingRoomRenderer {
    constructor(scene) {
        this.threeScene = scene;
        this.group = new THREE.Group();
        this.group.position.set(WAITING_ROOM.CENTER.x, WAITING_ROOM.CENTER.y, WAITING_ROOM.CENTER.z);

        // References for updating
        this.doorFrame = null;
        this.doorEmissive = null;
        this.textCanvas = null;
        this.textContext = null;
        this.textTexture = null;
        this.textMesh = null;

        // Current state
        this.currentState = {
            cooldownRemaining: 0,
            queuePosition: 0,
            queueTotal: 0,
            doorOpen: false,
            joinTimeRemaining: null
        };

        this.createRoom();
        this.createDoor();
        this.createTextDisplay();
        this.createLighting();

        this.threeScene.add(this.group);
    }

    /**
     * Create the room geometry (floor and walls)
     */
    createRoom() {
        const halfSize = WAITING_ROOM.SIZE / 2;
        const wallHeight = 4;
        const wallThickness = 0.2;

        // Floor - dark concrete
        const floorGeometry = new THREE.PlaneGeometry(WAITING_ROOM.SIZE, WAITING_ROOM.SIZE);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            roughness: 0.9,
            metalness: 0.1
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.group.add(floor);

        // Ceiling
        const ceilingGeometry = new THREE.PlaneGeometry(WAITING_ROOM.SIZE, WAITING_ROOM.SIZE);
        const ceilingMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 1.0
        });
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = wallHeight;
        this.group.add(ceiling);

        // Wall material - dark gray dystopian
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.8,
            metalness: 0.2
        });

        // North wall (back, full wall)
        const northWall = new THREE.Mesh(
            new THREE.BoxGeometry(WAITING_ROOM.SIZE, wallHeight, wallThickness),
            wallMaterial
        );
        northWall.position.set(0, wallHeight / 2, halfSize);
        this.group.add(northWall);

        // East wall
        const eastWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, wallHeight, WAITING_ROOM.SIZE),
            wallMaterial
        );
        eastWall.position.set(halfSize, wallHeight / 2, 0);
        this.group.add(eastWall);

        // West wall
        const westWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, wallHeight, WAITING_ROOM.SIZE),
            wallMaterial
        );
        westWall.position.set(-halfSize, wallHeight / 2, 0);
        this.group.add(westWall);

        // South wall with doorway (two segments)
        const doorWidth = 2.0;
        const doorHeight = 2.5;
        const sideWidth = (WAITING_ROOM.SIZE - doorWidth) / 2;

        // Left segment
        const southWallLeft = new THREE.Mesh(
            new THREE.BoxGeometry(sideWidth, wallHeight, wallThickness),
            wallMaterial
        );
        southWallLeft.position.set(-halfSize + sideWidth / 2, wallHeight / 2, -halfSize);
        this.group.add(southWallLeft);

        // Right segment
        const southWallRight = new THREE.Mesh(
            new THREE.BoxGeometry(sideWidth, wallHeight, wallThickness),
            wallMaterial
        );
        southWallRight.position.set(halfSize - sideWidth / 2, wallHeight / 2, -halfSize);
        this.group.add(southWallRight);

        // Top segment (above door)
        const southWallTop = new THREE.Mesh(
            new THREE.BoxGeometry(doorWidth, wallHeight - doorHeight, wallThickness),
            wallMaterial
        );
        southWallTop.position.set(0, doorHeight + (wallHeight - doorHeight) / 2, -halfSize);
        this.group.add(southWallTop);
    }

    /**
     * Create the door frame with emissive border
     */
    createDoor() {
        const halfSize = WAITING_ROOM.SIZE / 2;
        const doorWidth = 2.0;
        const doorHeight = 2.5;
        const frameThickness = 0.15;
        const frameDepth = 0.4;  // Increased depth to extrude from wall
        const wallThickness = 0.2;

        // Position frame so it extrudes inward from the wall
        const frameZ = -halfSize + wallThickness + frameDepth / 2;

        // Door frame material (starts red for cooldown)
        const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0xff3333,
            emissive: 0xff3333,
            emissiveIntensity: 0.5,
            roughness: 0.3,
            metalness: 0.7
        });

        // Left frame
        const leftFrame = new THREE.Mesh(
            new THREE.BoxGeometry(frameThickness, doorHeight, frameDepth),
            frameMaterial
        );
        leftFrame.position.set(-doorWidth / 2 - frameThickness / 2, doorHeight / 2, frameZ);
        this.group.add(leftFrame);

        // Right frame
        const rightFrame = new THREE.Mesh(
            new THREE.BoxGeometry(frameThickness, doorHeight, frameDepth),
            frameMaterial
        );
        rightFrame.position.set(doorWidth / 2 + frameThickness / 2, doorHeight / 2, frameZ);
        this.group.add(rightFrame);

        // Top frame
        const topFrame = new THREE.Mesh(
            new THREE.BoxGeometry(doorWidth + frameThickness * 2, frameThickness, frameDepth),
            frameMaterial
        );
        topFrame.position.set(0, doorHeight + frameThickness / 2, frameZ);
        this.group.add(topFrame);

        // Store reference for color updates
        this.doorEmissive = [leftFrame, rightFrame, topFrame];
    }

    /**
     * Create canvas-based text display above door
     */
    createTextDisplay() {
        const halfSize = WAITING_ROOM.SIZE / 2;
        const canvasWidth = 512;
        const canvasHeight = 128;
        const wallThickness = 0.2;

        // Create canvas
        this.textCanvas = document.createElement('canvas');
        this.textCanvas.width = canvasWidth;
        this.textCanvas.height = canvasHeight;
        this.textContext = this.textCanvas.getContext('2d');

        // Create texture from canvas
        this.textTexture = new THREE.CanvasTexture(this.textCanvas);
        this.textTexture.minFilter = THREE.LinearFilter;

        // Create display mesh
        const displayGeometry = new THREE.PlaneGeometry(3, 0.75);
        const displayMaterial = new THREE.MeshBasicMaterial({
            map: this.textTexture,
            transparent: true,
            side: THREE.DoubleSide  // Visible from both sides
        });

        this.textMesh = new THREE.Mesh(displayGeometry, displayMaterial);
        // Position well in front of wall so it's clearly visible
        this.textMesh.position.set(0, 3.2, -halfSize + wallThickness + 0.5);
        this.group.add(this.textMesh);

        // Initial render
        this.renderText();
    }

    /**
     * Create ambient and point lighting
     */
    createLighting() {
        // Dim ambient light
        const ambient = new THREE.AmbientLight(0x222222);
        this.group.add(ambient);

        // Central point light (dim)
        const pointLight = new THREE.PointLight(0x444466, 0.8, 15);
        pointLight.position.set(0, 3.5, 0);
        this.group.add(pointLight);

        // Door light (color will change with door state)
        this.doorLight = new THREE.PointLight(0xff3333, 0.5, 5);
        this.doorLight.position.set(0, 2, -WAITING_ROOM.SIZE / 2 + 1);
        this.group.add(this.doorLight);
    }

    /**
     * Render text to canvas
     */
    renderText() {
        const ctx = this.textContext;
        const w = this.textCanvas.width;
        const h = this.textCanvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, w, h);

        // Text settings
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const { cooldownRemaining, queuePosition, queueTotal, doorOpen, joinTimeRemaining } = this.currentState;

        if (cooldownRemaining > 0) {
            // Cooldown mode - red
            ctx.fillStyle = '#ff3333';
            ctx.font = 'bold 36px monospace';
            ctx.fillText(`COOLDOWN: ${cooldownRemaining}s`, w / 2, h / 2 - 10);
            ctx.font = '20px monospace';
            ctx.fillStyle = '#888888';
            ctx.fillText('Wait before rejoining...', w / 2, h / 2 + 25);
        } else if (doorOpen && joinTimeRemaining !== null) {
            // Door open - green with countdown
            ctx.fillStyle = '#33ff33';
            ctx.font = 'bold 40px monospace';
            ctx.fillText(`JOIN NOW!`, w / 2, h / 2 - 15);
            ctx.font = 'bold 28px monospace';
            ctx.fillStyle = '#ffff00';
            ctx.fillText(`${joinTimeRemaining}s remaining`, w / 2, h / 2 + 25);
        } else if (queuePosition > 0) {
            // In queue - yellow
            ctx.fillStyle = '#ffaa00';
            ctx.font = 'bold 32px monospace';
            ctx.fillText(`QUEUE: ${queuePosition}/${queueTotal}`, w / 2, h / 2 - 10);
            ctx.font = '20px monospace';
            ctx.fillStyle = '#888888';
            ctx.fillText('Waiting for slot...', w / 2, h / 2 + 25);
        } else {
            // Default waiting message
            ctx.fillStyle = '#888888';
            ctx.font = '28px monospace';
            ctx.fillText('WAITING ROOM', w / 2, h / 2);
        }

        // Update texture
        this.textTexture.needsUpdate = true;
    }

    /**
     * Update door color based on state
     * @param {string} state - 'cooldown', 'queue', or 'open'
     */
    updateDoorColor(state) {
        let color;
        switch (state) {
            case 'cooldown':
                color = 0xff3333;  // Red
                break;
            case 'queue':
                color = 0xffaa00;  // Yellow/orange
                break;
            case 'open':
                color = 0x33ff33;  // Green
                break;
            default:
                color = 0xff3333;
        }

        // Update door frame materials
        if (this.doorEmissive) {
            for (const mesh of this.doorEmissive) {
                mesh.material.color.setHex(color);
                mesh.material.emissive.setHex(color);
            }
        }

        // Update door light
        if (this.doorLight) {
            this.doorLight.color.setHex(color);
        }
    }

    /**
     * Update state from server message
     * @param {Object} state - WAITING_ROOM_STATE message data
     */
    updateState(state) {
        this.currentState = {
            cooldownRemaining: state.cooldownRemaining || 0,
            queuePosition: state.queuePosition || 0,
            queueTotal: state.queueTotal || 0,
            doorOpen: state.doorOpen || false,
            joinTimeRemaining: state.joinTimeRemaining
        };

        // Update door color
        if (this.currentState.cooldownRemaining > 0) {
            this.updateDoorColor('cooldown');
        } else if (this.currentState.doorOpen) {
            this.updateDoorColor('open');
        } else if (this.currentState.queuePosition > 0) {
            this.updateDoorColor('queue');
        } else {
            this.updateDoorColor('cooldown');
        }

        // Update text display
        this.renderText();
    }

    /**
     * Get the door interaction info for the interaction system
     * @returns {Object|null} Interaction info if door can be interacted with
     */
    getDoorInteraction() {
        if (this.currentState.doorOpen) {
            return {
                targetId: 'waiting_room_door',
                type: 'join_game',
                prompt: 'Enter Game',
                position: {
                    x: WAITING_ROOM.CENTER.x,
                    y: 1.25,
                    z: WAITING_ROOM.CENTER.z - WAITING_ROOM.SIZE / 2
                }
            };
        }
        return null;
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        // Remove from scene
        if (this.threeScene && this.group) {
            this.threeScene.remove(this.group);
        }

        // Dispose geometries and materials
        this.group.traverse((child) => {
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });

        // Dispose texture
        if (this.textTexture) {
            this.textTexture.dispose();
        }

        this.doorEmissive = null;
        this.textMesh = null;
        this.textCanvas = null;
        this.textContext = null;
    }
}
