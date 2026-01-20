/**
 * Three.js + WebXR scene setup for VR client
 *
 * COORDINATE SYSTEM (VR VIEW - "Tiny World"):
 * - VR player is at real-world scale (WebXR provides 1:1 tracking)
 * - World geometry is rendered at 1/GIANT_SCALE
 * - A 100m world becomes 10m visual (tabletop sized)
 * - PC players appear as tiny 18cm figures (1.8m / 10)
 * - VR player at ~1.6m eye height towers over the tiny world
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { COLORS, WORLD_SIZE, GIANT_SCALE, SMALL_ROOM_SIZE, WALL_THICKNESS, DOORWAY_HEIGHT, DOORWAY_WIDTH, ROOM_TYPES, DEFAULT_ROOM_TYPE } from '../../pc/shared/constants.js';

export class VRScene {
    constructor(container) {
        try {
            this.container = container;
            this.xrSession = null;

            // Session state callbacks
            this.onSessionStart = null;
            this.onSessionEnd = null;

            // Dynamic wall meshes for cleanup
            this.dynamicWalls = [];
            this.dynamicFloors = [];
            this.lastWorldVersion = -1;

            // VR scale factor
            this.scale = 1 / GIANT_SCALE;

            // Wall material (shared)
            this.wallMaterial = null;

            // Create renderer with WebXR support
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.shadowMap.enabled = false; // Disabled for VR performance
            this.renderer.xr.enabled = true;
            container.insertBefore(this.renderer.domElement, container.firstChild);

            // Create scene
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(COLORS.SKY);

            // Create camera (controlled by XR)
            this.camera = new THREE.PerspectiveCamera(
                75,
                window.innerWidth / window.innerHeight,
                0.01,
                1000
            );

            // Camera rig for VR (allows us to move the user)
            this.cameraRig = new THREE.Group();
            this.cameraRig.add(this.camera);
            this.scene.add(this.cameraRig);

            // Setup scene at VR scale
            this.setupLighting();
            this.setupGround();
            this.setupWallMaterial();
            // Don't setup static rooms - wait for world state from server

            // Setup VR button
            this.setupVRButton();

            // Handle window resize (store reference for cleanup)
            this.onResizeHandler = () => this.onResize();
            window.addEventListener('resize', this.onResizeHandler);
        } catch (err) {
            console.error('[VRScene] Failed to initialize:', err);
            throw err;
        }
    }

    setupWallMaterial() {
        this.wallMaterial = new THREE.MeshStandardMaterial({
            map: this.createConcreteTexture(),
            roughness: 0.95,
            metalness: 0.05
        });
    }

    setupLighting() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        // Directional light (sun) - positioned for tiny world
        // World is 10m visual, so light at reasonable VR-scale height
        const sun = new THREE.DirectionalLight(0xffffff, 1);
        sun.position.set(5, 10, 5);
        this.scene.add(sun);

        // Hemisphere light
        const hemi = new THREE.HemisphereLight(0x000000, 0x3d5c3d, 0.3);
        this.scene.add(hemi);
    }

    /**
     * Create procedural rough concrete texture
     */
    createConcreteTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Base gray
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, 256, 256);

        // Add noise for rough texture
        const imageData = ctx.getImageData(0, 0, 256, 256);
        for (let i = 0; i < imageData.data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 40;
            imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
            imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
            imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
        }
        ctx.putImageData(imageData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        return texture;
    }

    setupGround() {
        // Ground plane at 1/GIANT_SCALE (tiny world)
        // 100m world / 10 = 10m visual (tabletop-sized)
        const groundSize = WORLD_SIZE / GIANT_SCALE;
        const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);

        // Concrete material for ground
        const groundMaterial = new THREE.MeshStandardMaterial({
            map: this.createConcreteTexture(),
            roughness: 0.95,
            metalness: 0.05
        });
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.scene.add(this.ground);

        // Grid helper - 10m with 10 divisions = 1m cells (reduced for VR performance)
        const grid = new THREE.GridHelper(groundSize, 10, 0x000000, 0x444444);
        grid.position.y = 0.001; // Slight offset to prevent z-fighting
        grid.material.opacity = 0.2;
        grid.material.transparent = true;
        this.scene.add(grid);
    }

    /**
     * Rebuild world geometry from server world state
     * All dimensions scaled by 1/GIANT_SCALE for VR "tiny world" view
     * @param {Object} worldState - World state from server
     */
    rebuildFromWorldState(worldState) {
        if (!worldState) return;

        // Skip if version hasn't changed
        if (worldState.version === this.lastWorldVersion) return;

        console.log(`[VRScene] Rebuilding walls from world state, version=${worldState.version}`);
        this.lastWorldVersion = worldState.version;

        // Clear existing dynamic elements
        this.clearDynamicWalls();
        this.clearDynamicFloors();

        // Build walls and floors for each cell in the grid
        for (const cell of worldState.grid) {
            this.createCellWalls(cell, worldState);
            this.createCellFloor(cell);
        }
    }

    /**
     * Clear all dynamic wall meshes
     */
    clearDynamicWalls() {
        for (const mesh of this.dynamicWalls) {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
        }
        this.dynamicWalls = [];
    }

    /**
     * Clear all dynamic floor meshes
     */
    clearDynamicFloors() {
        for (const mesh of this.dynamicFloors) {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        }
        this.dynamicFloors = [];
    }

    /**
     * Create a colored floor for a single cell based on room type (VR scale)
     */
    createCellFloor(cell) {
        const cellSize = SMALL_ROOM_SIZE * this.scale;
        const x = cell.x * cellSize;
        const z = cell.z * cellSize;

        const roomType = cell.roomType || DEFAULT_ROOM_TYPE;
        const roomConfig = ROOM_TYPES[roomType] || ROOM_TYPES[DEFAULT_ROOM_TYPE];

        const geometry = new THREE.PlaneGeometry(cellSize * 0.95, cellSize * 0.95);
        const material = new THREE.MeshBasicMaterial({
            color: roomConfig.color,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });

        const floor = new THREE.Mesh(geometry, material);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(x, 0.002, z); // Scaled y offset

        this.scene.add(floor);
        this.dynamicFloors.push(floor);
    }

    /**
     * Create walls for a single grid cell (in VR scale)
     * Uses mergeGroup to determine if walls should be skipped (same room)
     * Uses doorways list from server to determine which walls get doorways (MST)
     */
    createCellWalls(cell, worldState) {
        const cellSize = SMALL_ROOM_SIZE * this.scale;
        const half = cellSize / 2;

        // Main room (spawn) gets 3x wall height
        const isMainRoom = cell.mergeGroup === 'spawn';
        const wallHeight = isMainRoom ? cellSize * 3 : cellSize;

        const x = cell.x * cellSize;
        const z = cell.z * cellSize;
        const thickness = WALL_THICKNESS * this.scale;

        // Helper to check if there's a doorway between this cell and neighbor
        const hasDoorwayTo = (nx, nz) => {
            if (!worldState.doorways) return false;
            return worldState.doorways.some(d =>
                (d.cell1.x === cell.x && d.cell1.z === cell.z && d.cell2.x === nx && d.cell2.z === nz) ||
                (d.cell2.x === cell.x && d.cell2.z === cell.z && d.cell1.x === nx && d.cell1.z === nz)
            );
        };

        // Helper to check neighbor and merge status
        const checkNeighbor = (dx, dz) => {
            const nx = cell.x + dx;
            const nz = cell.z + dz;
            const neighbor = worldState.grid.find(c => c.x === nx && c.z === nz);
            if (!neighbor) return { exists: false, merged: false, hasDoorway: false };
            // Same mergeGroup means no wall between them (open space)
            const merged = neighbor.mergeGroup === cell.mergeGroup;
            const doorway = hasDoorwayTo(nx, nz);
            return { exists: true, merged, hasDoorway: doorway };
        };

        const neighbors = {
            north: checkNeighbor(0, -1),
            south: checkNeighbor(0, 1),
            east: checkNeighbor(1, 0),
            west: checkNeighbor(-1, 0)
        };

        // Wall logic:
        // - No neighbor → solid wall
        // - Neighbor with same mergeGroup → no wall (open space)
        // - Neighbor with different mergeGroup AND doorway → wall with doorway
        // - Neighbor with different mergeGroup AND no doorway → solid wall

        // North wall
        if (!neighbors.north.exists) {
            this.addDynamicSolidWall(x, z - half, cellSize, wallHeight, thickness, 'z');
        } else if (!neighbors.north.merged) {
            if (neighbors.north.hasDoorway) {
                this.addDynamicWallWithDoorway(x, z - half, cellSize, wallHeight, thickness, 'z');
            } else {
                this.addDynamicSolidWall(x, z - half, cellSize, wallHeight, thickness, 'z');
            }
        }
        // If merged, skip wall (open space)

        // South wall
        if (!neighbors.south.exists) {
            this.addDynamicSolidWall(x, z + half, cellSize, wallHeight, thickness, 'z');
        } else if (!neighbors.south.merged) {
            if (neighbors.south.hasDoorway) {
                this.addDynamicWallWithDoorway(x, z + half, cellSize, wallHeight, thickness, 'z');
            } else {
                this.addDynamicSolidWall(x, z + half, cellSize, wallHeight, thickness, 'z');
            }
        }

        // East wall
        if (!neighbors.east.exists) {
            this.addDynamicSolidWall(x + half, z, cellSize, wallHeight, thickness, 'x');
        } else if (!neighbors.east.merged) {
            if (neighbors.east.hasDoorway) {
                this.addDynamicWallWithDoorway(x + half, z, cellSize, wallHeight, thickness, 'x');
            } else {
                this.addDynamicSolidWall(x + half, z, cellSize, wallHeight, thickness, 'x');
            }
        }

        // West wall
        if (!neighbors.west.exists) {
            this.addDynamicSolidWall(x - half, z, cellSize, wallHeight, thickness, 'x');
        } else if (!neighbors.west.merged) {
            if (neighbors.west.hasDoorway) {
                this.addDynamicWallWithDoorway(x - half, z, cellSize, wallHeight, thickness, 'x');
            } else {
                this.addDynamicSolidWall(x - half, z, cellSize, wallHeight, thickness, 'x');
            }
        }
    }

    /**
     * Add a solid wall (no doorway) and track for cleanup
     */
    addDynamicSolidWall(x, z, length, height, thickness, axis) {
        let geometry;
        if (axis === 'z') {
            geometry = new THREE.BoxGeometry(length, height, thickness);
        } else {
            geometry = new THREE.BoxGeometry(thickness, height, length);
        }

        const wall = new THREE.Mesh(geometry, this.wallMaterial);
        wall.position.set(x, height / 2, z);
        this.scene.add(wall);
        this.dynamicWalls.push(wall);
    }

    /**
     * Add a wall with doorway and track for cleanup
     */
    addDynamicWallWithDoorway(x, z, length, height, thickness, axis) {
        const doorwayWidth = DOORWAY_WIDTH * this.scale;
        const doorwayHeight = DOORWAY_HEIGHT * this.scale;
        const sideWidth = (length - doorwayWidth) / 2;
        const aboveHeight = height - doorwayHeight;
        const halfDoorway = doorwayWidth / 2;
        const sideOffset = halfDoorway + sideWidth / 2;

        if (axis === 'z') {
            // Wall along X-axis
            // Left segment
            const leftGeom = new THREE.BoxGeometry(sideWidth, height, thickness);
            const leftWall = new THREE.Mesh(leftGeom, this.wallMaterial);
            leftWall.position.set(x - sideOffset, height / 2, z);
            this.scene.add(leftWall);
            this.dynamicWalls.push(leftWall);

            // Right segment
            const rightGeom = new THREE.BoxGeometry(sideWidth, height, thickness);
            const rightWall = new THREE.Mesh(rightGeom, this.wallMaterial);
            rightWall.position.set(x + sideOffset, height / 2, z);
            this.scene.add(rightWall);
            this.dynamicWalls.push(rightWall);

            // Above doorway
            if (aboveHeight > 0) {
                const aboveGeom = new THREE.BoxGeometry(doorwayWidth, aboveHeight, thickness);
                const aboveWall = new THREE.Mesh(aboveGeom, this.wallMaterial);
                aboveWall.position.set(x, doorwayHeight + aboveHeight / 2, z);
                this.scene.add(aboveWall);
                this.dynamicWalls.push(aboveWall);
            }
        } else {
            // Wall along Z-axis
            // Left segment
            const leftGeom = new THREE.BoxGeometry(thickness, height, sideWidth);
            const leftWall = new THREE.Mesh(leftGeom, this.wallMaterial);
            leftWall.position.set(x, height / 2, z - sideOffset);
            this.scene.add(leftWall);
            this.dynamicWalls.push(leftWall);

            // Right segment
            const rightGeom = new THREE.BoxGeometry(thickness, height, sideWidth);
            const rightWall = new THREE.Mesh(rightGeom, this.wallMaterial);
            rightWall.position.set(x, height / 2, z + sideOffset);
            this.scene.add(rightWall);
            this.dynamicWalls.push(rightWall);

            // Above doorway
            if (aboveHeight > 0) {
                const aboveGeom = new THREE.BoxGeometry(thickness, aboveHeight, doorwayWidth);
                const aboveWall = new THREE.Mesh(aboveGeom, this.wallMaterial);
                aboveWall.position.set(x, doorwayHeight + aboveHeight / 2, z);
                this.scene.add(aboveWall);
                this.dynamicWalls.push(aboveWall);
            }
        }
    }

    async setupVRButton() {
        const button = document.getElementById('vr-button');
        const status = document.getElementById('status');

        if (!navigator.xr) {
            console.warn('[VRScene] WebXR not available');
            button.textContent = 'WebXR Not Supported';
            status.textContent = 'WebXR is not available in this browser';
            return;
        }

        let isSupported = false;
        try {
            isSupported = await navigator.xr.isSessionSupported('immersive-vr');
        } catch (err) {
            console.error('[VRScene] Error checking XR support:', err);
            button.textContent = 'VR Check Failed';
            status.textContent = 'Error checking VR support: ' + err.message;
            return;
        }

        if (!isSupported) {
            console.warn('[VRScene] Immersive VR not supported');
            button.textContent = 'VR Not Available';
            status.textContent = 'No VR headset detected';
            return;
        }

        console.log('[VRScene] VR is supported, ready to start');
        button.textContent = 'Enter VR';
        button.disabled = false;
        status.textContent = 'Ready - Click to enter VR';

        button.addEventListener('click', async () => {
            try {
                if (this.xrSession) {
                    console.log('[VRScene] Ending existing XR session');
                    await this.xrSession.end();
                    return;
                }

                console.log('[VRScene] Requesting immersive-vr session...');
                status.textContent = 'Starting VR session...';

                this.xrSession = await navigator.xr.requestSession('immersive-vr', {
                    optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
                });

                console.log('[VRScene] XR session created, setting up renderer...');

                // Set up the session with the renderer
                try {
                    await this.renderer.xr.setSession(this.xrSession);
                    console.log('[VRScene] Renderer XR session set successfully');
                } catch (sessionErr) {
                    console.error('[VRScene] Failed to set XR session on renderer:', sessionErr);
                    status.textContent = 'Failed to initialize VR renderer: ' + sessionErr.message;
                    this.xrSession = null;
                    return;
                }

                button.textContent = 'Exit VR';
                status.textContent = 'In VR - Pinch to grab tiny players';

                // Notify listeners that session started
                console.log('[VRScene] XR session started successfully');
                if (this.onSessionStart) {
                    try {
                        this.onSessionStart(this.xrSession);
                    } catch (callbackErr) {
                        console.warn('[VRScene] onSessionStart callback error:', callbackErr);
                    }
                }

                // Use { once: true } to prevent listener accumulation across sessions
                this.xrSession.addEventListener('end', () => {
                    console.log('[VRScene] XR session ended');
                    this.xrSession = null;
                    button.textContent = 'Enter VR';
                    status.textContent = 'VR session ended';

                    // Notify listeners that session ended
                    if (this.onSessionEnd) {
                        try {
                            this.onSessionEnd();
                        } catch (callbackErr) {
                            console.warn('[VRScene] onSessionEnd callback error:', callbackErr);
                        }
                    }
                }, { once: true });
            } catch (err) {
                console.error('[VRScene] Failed to start XR session:', err);
                status.textContent = 'Failed to start VR: ' + err.message;
                this.xrSession = null;
            }
        });
    }

    onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    setAnimationLoop(callback) {
        this.renderer.setAnimationLoop(callback);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    add(object) {
        this.scene.add(object);
    }

    remove(object) {
        this.scene.remove(object);
    }

    getXRSession() {
        return this.xrSession;
    }

    isInVR() {
        return this.renderer.xr.isPresenting;
    }

    /**
     * Cleanup all resources to prevent memory leaks
     * Must be called when VR session ends or scene is no longer needed
     */
    dispose() {
        console.log('[VRScene] Disposing all resources...');

        // Remove event listeners
        if (this.onResizeHandler) {
            window.removeEventListener('resize', this.onResizeHandler);
            this.onResizeHandler = null;
        }

        // Dispose ground
        if (this.ground) {
            if (this.ground.geometry) this.ground.geometry.dispose();
            if (this.ground.material) this.ground.material.dispose();
            this.ground = null;
        }

        // Traverse scene and dispose all geometries and materials
        this.scene.traverse((obj) => {
            if (obj.geometry) {
                obj.geometry.dispose();
            }
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => {
                        if (m.map) m.map.dispose();
                        m.dispose();
                    });
                } else {
                    if (obj.material.map) obj.material.map.dispose();
                    obj.material.dispose();
                }
            }
        });

        // Dispose renderer
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement && this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
            this.renderer = null;
        }

        // Clear scene
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }

        console.log('[VRScene] All resources disposed');
    }
}
