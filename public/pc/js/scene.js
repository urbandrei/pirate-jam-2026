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
     * Create walls for a single grid cell
     */
    createCellWalls(cell, worldState) {
        const cellSize = SMALL_ROOM_SIZE;
        const half = cellSize / 2;
        const wallHeight = cellSize;
        const x = cell.x * cellSize;
        const z = cell.z * cellSize;

        // Check which neighbors exist
        const neighbors = {
            north: worldState.grid.some(c => c.x === cell.x && c.z === cell.z - 1),
            south: worldState.grid.some(c => c.x === cell.x && c.z === cell.z + 1),
            east: worldState.grid.some(c => c.x === cell.x + 1 && c.z === cell.z),
            west: worldState.grid.some(c => c.x === cell.x - 1 && c.z === cell.z)
        };

        // Create walls based on neighbors
        // Outer walls (no neighbor) = solid wall
        // Inner walls (has neighbor) = wall with doorway
        if (!neighbors.north) {
            this.addDynamicSolidWall(x, z - half, cellSize, wallHeight, WALL_THICKNESS, 'z');
        } else {
            this.addDynamicWallWithDoorway(x, z - half, cellSize, wallHeight, WALL_THICKNESS, 'z');
        }

        if (!neighbors.south) {
            this.addDynamicSolidWall(x, z + half, cellSize, wallHeight, WALL_THICKNESS, 'z');
        } else {
            this.addDynamicWallWithDoorway(x, z + half, cellSize, wallHeight, WALL_THICKNESS, 'z');
        }

        if (!neighbors.east) {
            this.addDynamicSolidWall(x + half, z, cellSize, wallHeight, WALL_THICKNESS, 'x');
        } else {
            this.addDynamicWallWithDoorway(x + half, z, cellSize, wallHeight, WALL_THICKNESS, 'x');
        }

        if (!neighbors.west) {
            this.addDynamicSolidWall(x - half, z, cellSize, wallHeight, WALL_THICKNESS, 'x');
        } else {
            this.addDynamicWallWithDoorway(x - half, z, cellSize, wallHeight, WALL_THICKNESS, 'x');
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
