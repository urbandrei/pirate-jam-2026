/**
 * Three.js scene setup for PC client
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { COLORS, WORLD_SIZE, SMALL_ROOM_SIZE, WALL_THICKNESS, DOORWAY_HEIGHT, DOORWAY_WIDTH } from '../shared/constants.js';

export class Scene {
    constructor(container) {
        this.container = container;

        // Dynamic wall meshes for cleanup
        this.dynamicWalls = [];
        this.lastWorldVersion = -1;

        // Wall material (shared)
        this.wallMaterial = null;

        // Miniature replica (same as VR players see)
        this.miniatureGroup = null;
        this.miniatureMeshes = [];
        this.miniatureScale = 0.02; // 2cm per 10m cell (larger than VR since viewing from distance)

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.insertBefore(this.renderer.domElement, container.firstChild);

        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(COLORS.SKY);
        this.scene.fog = new THREE.Fog(COLORS.SKY, 50, 200);

        // Create camera (first person)
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 1.6, 0); // Eye height

        // Setup scene elements
        this.setupLighting();
        this.setupGround();
        this.setupWallMaterial();
        this.setupMiniature();
        // Don't setup static rooms - wait for world state from server

        // Handle window resize
        window.addEventListener('resize', () => this.onResize());
    }

    setupWallMaterial() {
        this.wallMaterial = new THREE.MeshStandardMaterial({
            map: this.createConcreteTexture(),
            roughness: 0.95,
            metalness: 0.05
        });
    }

    /**
     * Setup the floating miniature replica (same as VR players see)
     */
    setupMiniature() {
        this.miniatureGroup = new THREE.Group();
        // Position floating in spawn room at eye level
        this.miniatureGroup.position.set(0, 1.2, 0);
        this.scene.add(this.miniatureGroup);

        // Materials for miniature
        this.miniRoomMaterial = new THREE.MeshBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.4
        });
        this.miniDoorwayMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.8
        });
    }

    setupLighting() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        // Directional light (sun)
        const sun = new THREE.DirectionalLight(0xffffff, 1);
        sun.position.set(50, 100, 50);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 300;
        sun.shadow.camera.left = -100;
        sun.shadow.camera.right = 100;
        sun.shadow.camera.top = 100;
        sun.shadow.camera.bottom = -100;
        this.scene.add(sun);

        // Hemisphere light for better ambient
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
        texture.repeat.set(4, 4); // More tiling for larger PC ground
        return texture;
    }

    setupGround() {
        // Ground plane with concrete texture
        const groundGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
        const groundMaterial = new THREE.MeshStandardMaterial({
            map: this.createConcreteTexture(),
            roughness: 0.95,
            metalness: 0.05
        });
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);

        // Grid helper for reference
        const grid = new THREE.GridHelper(WORLD_SIZE, 50, 0x000000, 0x444444);
        grid.position.y = 0.01;
        grid.material.opacity = 0.2;
        grid.material.transparent = true;
        this.scene.add(grid);
    }

    /**
     * Rebuild world geometry from server world state
     * @param {Object} worldState - World state from server
     */
    rebuildFromWorldState(worldState) {
        if (!worldState) return;

        // Skip if version hasn't changed
        if (worldState.version === this.lastWorldVersion) return;

        console.log(`[Scene] Rebuilding walls from world state, version=${worldState.version}`);
        this.lastWorldVersion = worldState.version;

        // Clear existing dynamic walls
        this.clearDynamicWalls();

        // Build walls for each cell in the grid
        for (const cell of worldState.grid) {
            this.createCellWalls(cell, worldState);
        }

        // Rebuild miniature replica
        this.rebuildMiniature(worldState);
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
     * Rebuild the floating miniature replica from world state
     * @param {Object} worldState - World state from server
     */
    rebuildMiniature(worldState) {
        // Clear existing miniature meshes
        for (const mesh of this.miniatureMeshes) {
            this.miniatureGroup.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
        }
        this.miniatureMeshes = [];

        if (!worldState || !worldState.grid) return;

        // Group cells by mergeGroup (rooms)
        const roomGroups = new Map();
        for (const cell of worldState.grid) {
            const group = cell.mergeGroup;
            if (!roomGroups.has(group)) roomGroups.set(group, []);
            roomGroups.get(group).push(cell);
        }

        const gridCellSize = SMALL_ROOM_SIZE * this.miniatureScale;
        const gapFactor = 0.8; // Slight gap between blocks

        // Create room blocks
        for (const [mergeGroup, cells] of roomGroups) {
            this.createMiniRoomBlock(cells, gridCellSize, gapFactor);
        }

        // Create doorway indicators (red rods)
        if (worldState.doorways) {
            for (const doorway of worldState.doorways) {
                this.createMiniDoorwayIndicator(doorway, gridCellSize);
            }
        }
    }

    /**
     * Create a room block in the miniature
     */
    createMiniRoomBlock(cells, gridCellSize, gapFactor) {
        // Find bounding box of this room
        const minX = Math.min(...cells.map(c => c.x));
        const maxX = Math.max(...cells.map(c => c.x));
        const minZ = Math.min(...cells.map(c => c.z));
        const maxZ = Math.max(...cells.map(c => c.z));

        const width = (maxX - minX + 1) * gridCellSize * gapFactor;
        const depth = (maxZ - minZ + 1) * gridCellSize * gapFactor;
        const height = gridCellSize * 0.5;

        const centerX = ((minX + maxX) / 2) * gridCellSize;
        const centerZ = ((minZ + maxZ) / 2) * gridCellSize;

        const geometry = new THREE.BoxGeometry(width, height, depth);
        const mesh = new THREE.Mesh(geometry, this.miniRoomMaterial);
        mesh.position.set(centerX, height / 2, centerZ);
        this.miniatureGroup.add(mesh);
        this.miniatureMeshes.push(mesh);
    }

    /**
     * Create a doorway indicator (red rod) in the miniature
     */
    createMiniDoorwayIndicator(doorway, gridCellSize) {
        // Calculate positions of the two cells
        const x1 = doorway.cell1.x * gridCellSize;
        const z1 = doorway.cell1.z * gridCellSize;
        const x2 = doorway.cell2.x * gridCellSize;
        const z2 = doorway.cell2.z * gridCellSize;

        // Midpoint between cells
        const midX = (x1 + x2) / 2;
        const midZ = (z1 + z2) / 2;

        // Create horizontal rod
        const rodLength = gridCellSize * 0.6;
        const rodRadius = gridCellSize * 0.05;
        const geometry = new THREE.CylinderGeometry(rodRadius, rodRadius, rodLength, 8);

        const mesh = new THREE.Mesh(geometry, this.miniDoorwayMaterial);

        // Position at midpoint, slightly elevated
        const height = gridCellSize * 0.25;
        mesh.position.set(midX, height, midZ);

        // Rotate to be horizontal and point toward the connection
        if (doorway.cell1.x !== doorway.cell2.x) {
            // East-West connection
            mesh.rotation.z = Math.PI / 2;
        } else {
            // North-South connection
            mesh.rotation.x = Math.PI / 2;
        }

        this.miniatureGroup.add(mesh);
        this.miniatureMeshes.push(mesh);
    }

    /**
     * Create walls for a single grid cell
     * Uses mergeGroup to determine if walls should be skipped (same room)
     * Uses doorways list from server to determine which walls get doorways (MST)
     */
    createCellWalls(cell, worldState) {
        const cellSize = SMALL_ROOM_SIZE;
        const half = cellSize / 2;

        // Main room (spawn) gets 3x wall height
        const isMainRoom = cell.mergeGroup === 'spawn';
        const wallHeight = isMainRoom ? cellSize * 3 : cellSize;

        const x = cell.x * cellSize;
        const z = cell.z * cellSize;

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
            this.addDynamicSolidWall(x, z - half, cellSize, wallHeight, WALL_THICKNESS, 'z');
        } else if (!neighbors.north.merged) {
            if (neighbors.north.hasDoorway) {
                this.addDynamicWallWithDoorway(x, z - half, cellSize, wallHeight, WALL_THICKNESS, 'z');
            } else {
                this.addDynamicSolidWall(x, z - half, cellSize, wallHeight, WALL_THICKNESS, 'z');
            }
        }
        // If merged, skip wall (open space)

        // South wall
        if (!neighbors.south.exists) {
            this.addDynamicSolidWall(x, z + half, cellSize, wallHeight, WALL_THICKNESS, 'z');
        } else if (!neighbors.south.merged) {
            if (neighbors.south.hasDoorway) {
                this.addDynamicWallWithDoorway(x, z + half, cellSize, wallHeight, WALL_THICKNESS, 'z');
            } else {
                this.addDynamicSolidWall(x, z + half, cellSize, wallHeight, WALL_THICKNESS, 'z');
            }
        }

        // East wall
        if (!neighbors.east.exists) {
            this.addDynamicSolidWall(x + half, z, cellSize, wallHeight, WALL_THICKNESS, 'x');
        } else if (!neighbors.east.merged) {
            if (neighbors.east.hasDoorway) {
                this.addDynamicWallWithDoorway(x + half, z, cellSize, wallHeight, WALL_THICKNESS, 'x');
            } else {
                this.addDynamicSolidWall(x + half, z, cellSize, wallHeight, WALL_THICKNESS, 'x');
            }
        }

        // West wall
        if (!neighbors.west.exists) {
            this.addDynamicSolidWall(x - half, z, cellSize, wallHeight, WALL_THICKNESS, 'x');
        } else if (!neighbors.west.merged) {
            if (neighbors.west.hasDoorway) {
                this.addDynamicWallWithDoorway(x - half, z, cellSize, wallHeight, WALL_THICKNESS, 'x');
            } else {
                this.addDynamicSolidWall(x - half, z, cellSize, wallHeight, WALL_THICKNESS, 'x');
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
        wall.castShadow = true;
        wall.receiveShadow = true;
        this.scene.add(wall);
        this.dynamicWalls.push(wall);
    }

    /**
     * Add a wall with doorway and track for cleanup
     */
    addDynamicWallWithDoorway(x, z, length, height, thickness, axis) {
        const doorwayWidth = DOORWAY_WIDTH;
        const doorwayHeight = DOORWAY_HEIGHT;
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
            leftWall.castShadow = true;
            leftWall.receiveShadow = true;
            this.scene.add(leftWall);
            this.dynamicWalls.push(leftWall);

            // Right segment
            const rightGeom = new THREE.BoxGeometry(sideWidth, height, thickness);
            const rightWall = new THREE.Mesh(rightGeom, this.wallMaterial);
            rightWall.position.set(x + sideOffset, height / 2, z);
            rightWall.castShadow = true;
            rightWall.receiveShadow = true;
            this.scene.add(rightWall);
            this.dynamicWalls.push(rightWall);

            // Above doorway
            if (aboveHeight > 0) {
                const aboveGeom = new THREE.BoxGeometry(doorwayWidth, aboveHeight, thickness);
                const aboveWall = new THREE.Mesh(aboveGeom, this.wallMaterial);
                aboveWall.position.set(x, doorwayHeight + aboveHeight / 2, z);
                aboveWall.castShadow = true;
                aboveWall.receiveShadow = true;
                this.scene.add(aboveWall);
                this.dynamicWalls.push(aboveWall);
            }
        } else {
            // Wall along Z-axis
            // Left segment
            const leftGeom = new THREE.BoxGeometry(thickness, height, sideWidth);
            const leftWall = new THREE.Mesh(leftGeom, this.wallMaterial);
            leftWall.position.set(x, height / 2, z - sideOffset);
            leftWall.castShadow = true;
            leftWall.receiveShadow = true;
            this.scene.add(leftWall);
            this.dynamicWalls.push(leftWall);

            // Right segment
            const rightGeom = new THREE.BoxGeometry(thickness, height, sideWidth);
            const rightWall = new THREE.Mesh(rightGeom, this.wallMaterial);
            rightWall.position.set(x, height / 2, z + sideOffset);
            rightWall.castShadow = true;
            rightWall.receiveShadow = true;
            this.scene.add(rightWall);
            this.dynamicWalls.push(rightWall);

            // Above doorway
            if (aboveHeight > 0) {
                const aboveGeom = new THREE.BoxGeometry(thickness, aboveHeight, doorwayWidth);
                const aboveWall = new THREE.Mesh(aboveGeom, this.wallMaterial);
                aboveWall.position.set(x, doorwayHeight + aboveHeight / 2, z);
                aboveWall.castShadow = true;
                aboveWall.receiveShadow = true;
                this.scene.add(aboveWall);
                this.dynamicWalls.push(aboveWall);
            }
        }
    }

    onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
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
}
