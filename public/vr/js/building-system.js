/**
 * VR Building System
 * Manages miniature replica, block palette, and placement interaction
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import {
    GIANT_SCALE, SMALL_ROOM_SIZE, WALL_THICKNESS,
    DOORWAY_HEIGHT, DOORWAY_WIDTH, COLORS
} from '../../pc/shared/constants.js';
import { createPlaceBlockMessage } from '../../pc/shared/protocol.js';

export class BuildingSystem {
    constructor(scene, hands, network) {
        this.scene = scene;
        this.hands = hands;
        this.network = network;

        // Miniature scale: world is already at 1/GIANT_SCALE in VR
        // Additional 1/5 scale for comfortable tabletop manipulation
        this.miniatureScale = 1 / GIANT_SCALE / 5; // = 0.02

        // Grid cell size in miniature space
        this.gridCellSize = SMALL_ROOM_SIZE * this.miniatureScale;

        // Pedestal height (chest height in VR)
        this.pedestalHeight = 1.0;

        // Currently grabbed block
        this.grabbedBlock = null;
        this.grabbedHand = null;

        // Rotation state for 1x2 blocks
        // 0 = east-west (X-axis), 1 = north-south (Z-axis)
        this.currentRotation = 0;

        // World state cache
        this.worldState = null;
        this.lastWorldVersion = -1;

        // Three.js groups
        this.pedestalGroup = null;
        this.replicaGroup = null;
        this.paletteGroup = null;
        this.ghostBlock = null;

        // Wall meshes for cleanup
        this.wallMeshes = [];

        // Materials (reused)
        this.wallMaterial = null;
        this.floorMaterial = null;

        this.init();
    }

    init() {
        this.createMaterials();
        this.createPedestal();
        this.createPalette();
        this.createGhostBlock();

        console.log('[BuildingSystem] Initialized');
    }

    createMaterials() {
        this.wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.9,
            metalness: 0.1
        });

        this.floorMaterial = new THREE.MeshBasicMaterial({
            color: 0x555555,
            transparent: true,
            opacity: 0.5
        });
    }

    createPedestal() {
        this.pedestalGroup = new THREE.Group();
        this.pedestalGroup.position.set(0, 0, 0); // Center of VR space

        // Pedestal base (circular platform)
        const pedestalGeom = new THREE.CylinderGeometry(0.3, 0.35, 0.03, 32);
        const pedestalMat = new THREE.MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.3,
            metalness: 0.7
        });
        const pedestal = new THREE.Mesh(pedestalGeom, pedestalMat);
        pedestal.position.y = this.pedestalHeight;
        this.pedestalGroup.add(pedestal);

        // Pedestal stem
        const stemGeom = new THREE.CylinderGeometry(0.05, 0.08, this.pedestalHeight - 0.03, 16);
        const stem = new THREE.Mesh(stemGeom, pedestalMat);
        stem.position.y = this.pedestalHeight / 2;
        this.pedestalGroup.add(stem);

        // Replica container (sits on top of pedestal)
        this.replicaGroup = new THREE.Group();
        this.replicaGroup.position.y = this.pedestalHeight + 0.02;
        this.pedestalGroup.add(this.replicaGroup);

        // Grid reference lines
        this.createGridLines();

        this.scene.add(this.pedestalGroup);
    }

    createGridLines() {
        // Create a simple grid on the pedestal surface for reference
        const gridSize = this.gridCellSize * 7; // 7x7 visible grid (larger for 3x3 spawn)
        const gridHelper = new THREE.GridHelper(gridSize, 7, 0x666666, 0x444444);
        gridHelper.position.y = 0.001;
        this.replicaGroup.add(gridHelper);
    }

    createPalette() {
        this.paletteGroup = new THREE.Group();

        // Position palette to the right of pedestal, floating at chest height
        this.paletteGroup.position.set(0.4, this.pedestalHeight + 0.1, 0);

        // Backing plate for visibility
        const backingGeom = new THREE.BoxGeometry(0.2, 0.15, 0.02);
        const backingMat = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.8,
            transparent: true,
            opacity: 0.7
        });
        const backing = new THREE.Mesh(backingGeom, backingMat);
        backing.position.z = 0.015;
        this.paletteGroup.add(backing);

        // 1x1 block template
        const block1x1Geom = new THREE.BoxGeometry(
            this.gridCellSize * 0.9,
            this.gridCellSize * 0.4,
            this.gridCellSize * 0.9
        );
        const block1x1Mat = new THREE.MeshStandardMaterial({
            color: COLORS.BLOCK_BLUE,
            roughness: 0.5,
            metalness: 0.2
        });
        const block1x1 = new THREE.Mesh(block1x1Geom, block1x1Mat);
        block1x1.userData = { blockType: '1x1', isTemplate: true };
        block1x1.position.set(-0.05, 0.03, 0);
        this.paletteGroup.add(block1x1);

        // 1x2 block template
        const block1x2Geom = new THREE.BoxGeometry(
            this.gridCellSize * 1.9,
            this.gridCellSize * 0.4,
            this.gridCellSize * 0.9
        );
        const block1x2Mat = new THREE.MeshStandardMaterial({
            color: COLORS.BLOCK_GREEN,
            roughness: 0.5,
            metalness: 0.2
        });
        const block1x2 = new THREE.Mesh(block1x2Geom, block1x2Mat);
        block1x2.userData = { blockType: '1x2', isTemplate: true };
        block1x2.position.set(0.05, -0.03, 0);
        this.paletteGroup.add(block1x2);

        this.scene.add(this.paletteGroup);
    }

    createGhostBlock() {
        // Semi-transparent preview of where block will be placed
        const geom = new THREE.BoxGeometry(
            this.gridCellSize * 0.95,
            this.gridCellSize * 0.3,
            this.gridCellSize * 0.95
        );
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.4,
            wireframe: true
        });
        this.ghostBlock = new THREE.Mesh(geom, mat);
        this.ghostBlock.visible = false;
        this.replicaGroup.add(this.ghostBlock);
    }

    /**
     * Toggle rotation for 1x2 blocks
     * Called when user wants to rotate the block
     */
    toggleRotation() {
        this.currentRotation = this.currentRotation === 0 ? 1 : 0;
        console.log(`[BuildingSystem] Rotation: ${this.currentRotation === 0 ? 'East-West' : 'North-South'}`);

        // Update grabbed block geometry if holding a 1x2
        if (this.grabbedBlock && this.grabbedBlock.userData.blockType === '1x2') {
            this.updateGrabbedBlockGeometry();
        }
    }

    /**
     * Update grabbed block geometry based on current rotation
     */
    updateGrabbedBlockGeometry() {
        if (!this.grabbedBlock || this.grabbedBlock.userData.blockType !== '1x2') return;

        const rotation = this.currentRotation;
        let width, depth;

        if (rotation === 0) {
            // East-West
            width = this.gridCellSize * 1.9;
            depth = this.gridCellSize * 0.9;
        } else {
            // North-South
            width = this.gridCellSize * 0.9;
            depth = this.gridCellSize * 1.9;
        }

        // Dispose old geometry and create new
        this.grabbedBlock.geometry.dispose();
        this.grabbedBlock.geometry = new THREE.BoxGeometry(
            width,
            this.gridCellSize * 0.4,
            depth
        );

        // Update userData
        this.grabbedBlock.userData.rotation = rotation;
    }

    /**
     * Handle pinch start - check if grabbing a palette block
     */
    handlePinchStart(hand) {
        const pinchPoint = this.hands.getPinchPointPosition(hand);
        if (!pinchPoint) return false;

        // Convert world-scale pinch point to VR local space
        const pinchVR = new THREE.Vector3(
            pinchPoint.x / GIANT_SCALE,
            pinchPoint.y / GIANT_SCALE,
            pinchPoint.z / GIANT_SCALE
        );

        // Check if pinching a palette block
        const blockType = this.checkPaletteHit(pinchVR);
        if (blockType) {
            this.grabBlockFromPalette(blockType, hand);
            return true;
        }

        return false;
    }

    /**
     * Handle pinch end - attempt placement if holding a block
     */
    handlePinchEnd(hand) {
        if (this.grabbedBlock && this.grabbedHand === hand) {
            this.attemptPlacement();
            this.releaseBlock();
            return true;
        }
        return false;
    }

    /**
     * Check if a point is near any palette block
     */
    checkPaletteHit(point) {
        for (const child of this.paletteGroup.children) {
            if (child.userData && child.userData.isTemplate) {
                // Get world position of the template block
                const worldPos = new THREE.Vector3();
                child.getWorldPosition(worldPos);

                // Check distance
                const distance = point.distanceTo(worldPos);
                if (distance < 0.08) { // 8cm grab radius
                    return child.userData.blockType;
                }
            }
        }
        return null;
    }

    /**
     * Create a grabbed block instance
     */
    grabBlockFromPalette(blockType, hand) {
        let width, depth;

        if (blockType === '1x2') {
            if (this.currentRotation === 0) {
                // East-West
                width = this.gridCellSize * 1.9;
                depth = this.gridCellSize * 0.9;
            } else {
                // North-South
                width = this.gridCellSize * 0.9;
                depth = this.gridCellSize * 1.9;
            }
        } else {
            width = this.gridCellSize * 0.9;
            depth = this.gridCellSize * 0.9;
        }

        const geom = new THREE.BoxGeometry(
            width,
            this.gridCellSize * 0.4,
            depth
        );

        const mat = new THREE.MeshStandardMaterial({
            color: blockType === '1x2' ? COLORS.BLOCK_GREEN : COLORS.BLOCK_BLUE,
            roughness: 0.5,
            metalness: 0.2,
            transparent: true,
            opacity: 0.9
        });

        this.grabbedBlock = new THREE.Mesh(geom, mat);
        this.grabbedBlock.userData = {
            blockType: blockType,
            rotation: this.currentRotation
        };
        this.grabbedHand = hand;
        this.scene.add(this.grabbedBlock);

        console.log(`[BuildingSystem] Grabbed ${blockType} block, rotation=${this.currentRotation}`);
    }

    /**
     * Attempt to place the grabbed block
     */
    attemptPlacement() {
        if (!this.grabbedBlock) return;

        const gridCoords = this.getGrabbedBlockGridPosition();
        if (!gridCoords) {
            console.log('[BuildingSystem] Block not over replica');
            return;
        }

        const blockType = this.grabbedBlock.userData.blockType;
        const rotation = this.grabbedBlock.userData.rotation || 0;

        // Check if placement is valid
        if (!this.canPlace(gridCoords.x, gridCoords.z, blockType, rotation)) {
            console.log(`[BuildingSystem] Cannot place at (${gridCoords.x}, ${gridCoords.z})`);
            return;
        }

        // Send placement request to server
        console.log(`[BuildingSystem] Requesting placement at (${gridCoords.x}, ${gridCoords.z}), type=${blockType}, rotation=${rotation}`);
        this.network.send(createPlaceBlockMessage(gridCoords.x, gridCoords.z, blockType, rotation));
    }

    /**
     * Get the grid position where the grabbed block would be placed
     */
    getGrabbedBlockGridPosition() {
        if (!this.grabbedBlock) return null;

        // Get grabbed block world position
        const blockWorldPos = new THREE.Vector3();
        this.grabbedBlock.getWorldPosition(blockWorldPos);

        // Get replica group world position
        const replicaWorldPos = new THREE.Vector3();
        this.replicaGroup.getWorldPosition(replicaWorldPos);

        // Calculate relative position
        const relX = blockWorldPos.x - replicaWorldPos.x;
        const relZ = blockWorldPos.z - replicaWorldPos.z;

        // Convert to grid coordinates
        const gridX = Math.round(relX / this.gridCellSize);
        const gridZ = Math.round(relZ / this.gridCellSize);

        return { x: gridX, z: gridZ };
    }

    /**
     * Get all cells that a block would occupy
     */
    getBlockCells(gridX, gridZ, blockType, rotation = 0) {
        if (blockType === '1x2') {
            if (rotation === 0) {
                // East-West (X-axis)
                return [
                    { x: gridX, z: gridZ },
                    { x: gridX + 1, z: gridZ }
                ];
            } else {
                // North-South (Z-axis)
                return [
                    { x: gridX, z: gridZ },
                    { x: gridX, z: gridZ + 1 }
                ];
            }
        }
        return [{ x: gridX, z: gridZ }];
    }

    /**
     * Check if a block can be placed at the given grid position
     */
    canPlace(gridX, gridZ, blockType, rotation = 0) {
        if (!this.worldState) return true;

        const cells = this.getBlockCells(gridX, gridZ, blockType, rotation);

        // Check if all cells are empty
        for (const cell of cells) {
            const isOccupied = this.worldState.grid.some(c =>
                c.x === cell.x && c.z === cell.z
            );
            if (isOccupied) return false;
        }

        // Check adjacency to existing cells
        for (const cell of cells) {
            const neighbors = [
                { x: cell.x, z: cell.z - 1 },
                { x: cell.x, z: cell.z + 1 },
                { x: cell.x + 1, z: cell.z },
                { x: cell.x - 1, z: cell.z }
            ];

            for (const neighbor of neighbors) {
                const hasNeighbor = this.worldState.grid.some(c =>
                    c.x === neighbor.x && c.z === neighbor.z
                );
                if (hasNeighbor) return true;
            }
        }

        return false;
    }

    /**
     * Release the currently grabbed block
     */
    releaseBlock() {
        if (this.grabbedBlock) {
            this.scene.remove(this.grabbedBlock);
            this.grabbedBlock.geometry.dispose();
            this.grabbedBlock.material.dispose();
            this.grabbedBlock = null;
            this.grabbedHand = null;
            this.ghostBlock.visible = false;
        }
    }

    /**
     * Update called each frame
     */
    update() {
        if (this.grabbedBlock && this.grabbedHand) {
            // Update grabbed block position to follow hand
            const pinchPoint = this.hands.getPinchPointPosition(this.grabbedHand);
            if (pinchPoint) {
                this.grabbedBlock.position.set(
                    pinchPoint.x / GIANT_SCALE,
                    pinchPoint.y / GIANT_SCALE,
                    pinchPoint.z / GIANT_SCALE
                );

                // Update ghost block position
                this.updateGhostBlock();
            }
        }
    }

    /**
     * Update ghost block to show placement preview
     */
    updateGhostBlock() {
        if (!this.grabbedBlock) {
            this.ghostBlock.visible = false;
            return;
        }

        const gridCoords = this.getGrabbedBlockGridPosition();
        if (!gridCoords) {
            this.ghostBlock.visible = false;
            return;
        }

        const blockType = this.grabbedBlock.userData.blockType;
        const rotation = this.grabbedBlock.userData.rotation || 0;
        const canPlace = this.canPlace(gridCoords.x, gridCoords.z, blockType, rotation);

        // Calculate position offset based on block type and rotation
        let offsetX = 0, offsetZ = 0;
        if (blockType === '1x2') {
            if (rotation === 0) {
                offsetX = this.gridCellSize / 2;
            } else {
                offsetZ = this.gridCellSize / 2;
            }
        }

        this.ghostBlock.position.set(
            gridCoords.x * this.gridCellSize + offsetX,
            this.gridCellSize * 0.15,
            gridCoords.z * this.gridCellSize + offsetZ
        );

        // Update ghost block geometry to match rotation
        this.updateGhostBlockGeometry(blockType, rotation);

        // Color based on validity
        this.ghostBlock.material.color.setHex(canPlace ? 0x00ff00 : 0xff0000);
        this.ghostBlock.visible = true;
    }

    /**
     * Update ghost block geometry for current block type and rotation
     */
    updateGhostBlockGeometry(blockType, rotation) {
        let width, depth;

        if (blockType === '1x2') {
            if (rotation === 0) {
                width = this.gridCellSize * 1.95;
                depth = this.gridCellSize * 0.95;
            } else {
                width = this.gridCellSize * 0.95;
                depth = this.gridCellSize * 1.95;
            }
        } else {
            width = this.gridCellSize * 0.95;
            depth = this.gridCellSize * 0.95;
        }

        this.ghostBlock.geometry.dispose();
        this.ghostBlock.geometry = new THREE.BoxGeometry(
            width, this.gridCellSize * 0.3, depth
        );
    }

    /**
     * Handle world state update from server
     */
    onWorldStateUpdate(worldState) {
        if (!worldState) return;

        // Skip if version hasn't changed
        if (worldState.version === this.lastWorldVersion) return;

        console.log(`[BuildingSystem] World state updated, version=${worldState.version}`);
        this.worldState = worldState;
        this.lastWorldVersion = worldState.version;

        this.rebuildReplica();
    }

    /**
     * Rebuild the miniature replica from world state
     */
    rebuildReplica() {
        // Clear existing walls
        for (const mesh of this.wallMeshes) {
            this.replicaGroup.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
        }
        this.wallMeshes = [];

        if (!this.worldState) return;

        const wallHeight = this.gridCellSize * 0.8;
        const wallThickness = WALL_THICKNESS * this.miniatureScale;

        // Create floor and walls for each cell
        for (const cell of this.worldState.grid) {
            this.createCellVisuals(cell, wallHeight, wallThickness);
        }
    }

    /**
     * Create visual representation for a grid cell
     * Uses mergeGroup to determine if walls should be skipped
     */
    createCellVisuals(cell, wallHeight, wallThickness) {
        const x = cell.x * this.gridCellSize;
        const z = cell.z * this.gridCellSize;
        const half = this.gridCellSize / 2;

        // Floor indicator
        const floorGeom = new THREE.BoxGeometry(
            this.gridCellSize * 0.95,
            0.002,
            this.gridCellSize * 0.95
        );
        const floor = new THREE.Mesh(floorGeom, this.floorMaterial);
        floor.position.set(x, 0.001, z);
        this.replicaGroup.add(floor);
        this.wallMeshes.push(floor);

        // Helper to check neighbor and merge status
        const checkNeighbor = (dx, dz) => {
            const neighbor = this.worldState.grid.find(c => c.x === cell.x + dx && c.z === cell.z + dz);
            if (!neighbor) return { exists: false, merged: false };
            // Same mergeGroup means no wall between them (open space)
            const merged = neighbor.mergeGroup === cell.mergeGroup;
            return { exists: true, merged };
        };

        const neighbors = {
            north: checkNeighbor(0, -1),
            south: checkNeighbor(0, 1),
            east: checkNeighbor(1, 0),
            west: checkNeighbor(-1, 0)
        };

        // Wall logic:
        // - No neighbor → solid wall
        // - Neighbor with different mergeGroup → wall with doorway
        // - Neighbor with same mergeGroup → no wall (skip)

        // North wall
        if (!neighbors.north.exists) {
            this.createMiniWall(x, z - half, this.gridCellSize, wallHeight, wallThickness, 'z', false);
        } else if (!neighbors.north.merged) {
            this.createMiniWall(x, z - half, this.gridCellSize, wallHeight, wallThickness, 'z', true);
        }

        // South wall
        if (!neighbors.south.exists) {
            this.createMiniWall(x, z + half, this.gridCellSize, wallHeight, wallThickness, 'z', false);
        } else if (!neighbors.south.merged) {
            this.createMiniWall(x, z + half, this.gridCellSize, wallHeight, wallThickness, 'z', true);
        }

        // East wall
        if (!neighbors.east.exists) {
            this.createMiniWall(x + half, z, this.gridCellSize, wallHeight, wallThickness, 'x', false);
        } else if (!neighbors.east.merged) {
            this.createMiniWall(x + half, z, this.gridCellSize, wallHeight, wallThickness, 'x', true);
        }

        // West wall
        if (!neighbors.west.exists) {
            this.createMiniWall(x - half, z, this.gridCellSize, wallHeight, wallThickness, 'x', false);
        } else if (!neighbors.west.merged) {
            this.createMiniWall(x - half, z, this.gridCellSize, wallHeight, wallThickness, 'x', true);
        }
    }

    /**
     * Create a miniature wall segment
     */
    createMiniWall(x, z, length, height, thickness, axis, hasDoorway) {
        if (hasDoorway) {
            // Wall with doorway - create 3 segments
            const doorwayWidth = DOORWAY_WIDTH * this.miniatureScale;
            const doorwayHeight = DOORWAY_HEIGHT * this.miniatureScale;
            const sideWidth = (length - doorwayWidth) / 2;
            const aboveHeight = height - doorwayHeight;

            if (axis === 'z') {
                // Wall along X-axis
                // Left segment
                const leftGeom = new THREE.BoxGeometry(sideWidth, height, thickness);
                const leftWall = new THREE.Mesh(leftGeom, this.wallMaterial);
                leftWall.position.set(x - doorwayWidth / 2 - sideWidth / 2, height / 2, z);
                this.replicaGroup.add(leftWall);
                this.wallMeshes.push(leftWall);

                // Right segment
                const rightGeom = new THREE.BoxGeometry(sideWidth, height, thickness);
                const rightWall = new THREE.Mesh(rightGeom, this.wallMaterial);
                rightWall.position.set(x + doorwayWidth / 2 + sideWidth / 2, height / 2, z);
                this.replicaGroup.add(rightWall);
                this.wallMeshes.push(rightWall);

                // Above doorway
                if (aboveHeight > 0) {
                    const aboveGeom = new THREE.BoxGeometry(doorwayWidth, aboveHeight, thickness);
                    const aboveWall = new THREE.Mesh(aboveGeom, this.wallMaterial);
                    aboveWall.position.set(x, doorwayHeight + aboveHeight / 2, z);
                    this.replicaGroup.add(aboveWall);
                    this.wallMeshes.push(aboveWall);
                }
            } else {
                // Wall along Z-axis
                // Left segment
                const leftGeom = new THREE.BoxGeometry(thickness, height, sideWidth);
                const leftWall = new THREE.Mesh(leftGeom, this.wallMaterial);
                leftWall.position.set(x, height / 2, z - doorwayWidth / 2 - sideWidth / 2);
                this.replicaGroup.add(leftWall);
                this.wallMeshes.push(leftWall);

                // Right segment
                const rightGeom = new THREE.BoxGeometry(thickness, height, sideWidth);
                const rightWall = new THREE.Mesh(rightGeom, this.wallMaterial);
                rightWall.position.set(x, height / 2, z + doorwayWidth / 2 + sideWidth / 2);
                this.replicaGroup.add(rightWall);
                this.wallMeshes.push(rightWall);

                // Above doorway
                if (aboveHeight > 0) {
                    const aboveGeom = new THREE.BoxGeometry(thickness, aboveHeight, doorwayWidth);
                    const aboveWall = new THREE.Mesh(aboveGeom, this.wallMaterial);
                    aboveWall.position.set(x, doorwayHeight + aboveHeight / 2, z);
                    this.replicaGroup.add(aboveWall);
                    this.wallMeshes.push(aboveWall);
                }
            }
        } else {
            // Solid wall
            let geom;
            if (axis === 'z') {
                geom = new THREE.BoxGeometry(length, height, thickness);
            } else {
                geom = new THREE.BoxGeometry(thickness, height, length);
            }

            const wall = new THREE.Mesh(geom, this.wallMaterial);
            wall.position.set(x, height / 2, z);
            this.replicaGroup.add(wall);
            this.wallMeshes.push(wall);
        }
    }

    /**
     * Cleanup resources
     */
    dispose() {
        console.log('[BuildingSystem] Disposing...');

        // Release any grabbed block
        this.releaseBlock();

        // Clear wall meshes
        for (const mesh of this.wallMeshes) {
            this.replicaGroup.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
        }
        this.wallMeshes = [];

        // Dispose materials
        if (this.wallMaterial) this.wallMaterial.dispose();
        if (this.floorMaterial) this.floorMaterial.dispose();

        // Remove groups from scene
        if (this.pedestalGroup) {
            this.scene.remove(this.pedestalGroup);
        }
        if (this.paletteGroup) {
            this.scene.remove(this.paletteGroup);
        }

        console.log('[BuildingSystem] Disposed');
    }
}
