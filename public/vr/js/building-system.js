/**
 * VR Building System
 * Manages miniature replica, block palette, and placement interaction
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import {
    GIANT_SCALE, SMALL_ROOM_SIZE, ROOM_TYPES, DEFAULT_ROOM_TYPE, ITEMS
} from '../../pc/shared/constants.js';
import { createPlaceBlockMessage, createConvertRoomMessage } from '../../pc/shared/protocol.js';

export class BuildingSystem {
    constructor(scene, hands, network) {
        this.scene = scene;
        this.hands = hands;
        this.network = network;

        // Miniature scale: world is already at 1/GIANT_SCALE in VR
        // Additional 1/20 scale for quarter-size tabletop (0.5cm per 10m cell)
        this.miniatureScale = 1 / GIANT_SCALE / 20; // = 0.005

        // Grid cell size in miniature space
        this.gridCellSize = SMALL_ROOM_SIZE * this.miniatureScale;

        // Pedestal height (table height in VR)
        this.pedestalHeight = 0.7;

        // Currently grabbed block
        this.grabbedBlock = null;
        this.grabbedHand = null;

        // Rotation state for 1x2 blocks
        // 0 = east-west (X-axis), 1 = north-south (Z-axis)
        this.currentRotation = 0;

        // Room type selection
        this.selectedRoomType = 'generic';
        this.roomTypePaletteGroup = null;
        this.roomTypeSwatches = [];

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

        // World items in miniature
        this.worldItemMeshes = new Map(); // itemId -> mesh

        // Materials (reused)
        this.wallMaterial = null;
        this.floorMaterial = null;

        this.init();
    }

    init() {
        this.createMaterials();
        this.createPedestal();
        this.createPalette();
        this.createRoomTypePalette();
        this.createGhostBlock();
    }

    createMaterials() {
        // Translucent blue for room blocks
        this.roomMaterial = new THREE.MeshBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.4
        });

        // Red material for doorway indicators
        this.doorwayMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.8
        });

        // Floor material for grid reference
        this.floorMaterial = new THREE.MeshBasicMaterial({
            color: 0x555555,
            transparent: true,
            opacity: 0.3
        });
    }

    createPedestal() {
        this.pedestalGroup = new THREE.Group();
        this.pedestalGroup.position.set(0, 0, 0); // Center of VR space

        // NO pedestal base or stem - replica floats at table height

        // Replica container (floats at table height)
        this.replicaGroup = new THREE.Group();
        this.replicaGroup.position.y = this.pedestalHeight;
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

        // Position palette to the right of pedestal, floating at table height
        this.paletteGroup.position.set(0.25, this.pedestalHeight + 0.05, 0);

        // Backing plate for visibility (smaller to match new scale)
        const backingGeom = new THREE.BoxGeometry(0.1, 0.08, 0.01);
        const backingMat = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.8,
            transparent: true,
            opacity: 0.7
        });
        const backing = new THREE.Mesh(backingGeom, backingMat);
        backing.position.z = 0.008;
        this.paletteGroup.add(backing);

        // 1x1 block template (80% scale for gap consistency)
        const block1x1Geom = new THREE.BoxGeometry(
            this.gridCellSize * 0.8,
            this.gridCellSize * 0.5,
            this.gridCellSize * 0.8
        );
        const block1x1Mat = new THREE.MeshBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.6
        });
        const block1x1 = new THREE.Mesh(block1x1Geom, block1x1Mat);
        block1x1.userData = { blockType: '1x1', isTemplate: true };
        block1x1.position.set(-0.025, 0.015, 0);
        this.paletteGroup.add(block1x1);

        // 1x2 block template (~80% of 2 cells)
        const block1x2Geom = new THREE.BoxGeometry(
            this.gridCellSize * 1.8,
            this.gridCellSize * 0.5,
            this.gridCellSize * 0.8
        );
        const block1x2Mat = new THREE.MeshBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.6
        });
        const block1x2 = new THREE.Mesh(block1x2Geom, block1x2Mat);
        block1x2.userData = { blockType: '1x2', isTemplate: true };
        block1x2.position.set(0.025, -0.015, 0);
        this.paletteGroup.add(block1x2);

        this.scene.add(this.paletteGroup);
    }

    /**
     * Create the room type selection palette (left of pedestal)
     */
    createRoomTypePalette() {
        this.roomTypePaletteGroup = new THREE.Group();

        // Position to the left of pedestal
        this.roomTypePaletteGroup.position.set(-0.25, this.pedestalHeight + 0.05, 0);

        // Backing plate
        const backingGeom = new THREE.BoxGeometry(0.12, 0.18, 0.01);
        const backingMat = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.8,
            transparent: true,
            opacity: 0.7
        });
        const backing = new THREE.Mesh(backingGeom, backingMat);
        backing.position.z = 0.008;
        this.roomTypePaletteGroup.add(backing);

        // Create swatches for each room type
        const roomTypes = ['generic', 'farming', 'processing', 'cafeteria', 'dorm', 'security'];
        const swatchSize = 0.025;
        const padding = 0.005;
        const startY = (roomTypes.length - 1) * (swatchSize + padding) / 2;

        roomTypes.forEach((type, index) => {
            const config = ROOM_TYPES[type];
            const geom = new THREE.BoxGeometry(swatchSize, swatchSize, 0.008);
            const mat = new THREE.MeshBasicMaterial({ color: config.color });
            const swatch = new THREE.Mesh(geom, mat);

            swatch.position.set(0, startY - index * (swatchSize + padding), 0.01);
            swatch.userData = { roomType: type, isSwatch: true };

            this.roomTypePaletteGroup.add(swatch);
            this.roomTypeSwatches.push(swatch);
        });

        this.scene.add(this.roomTypePaletteGroup);
        this.updateSwatchHighlight();
    }

    /**
     * Update visual highlight on selected room type swatch
     */
    updateSwatchHighlight() {
        for (const swatch of this.roomTypeSwatches) {
            const isSelected = swatch.userData.roomType === this.selectedRoomType;
            swatch.scale.set(isSelected ? 1.4 : 1.0, isSelected ? 1.4 : 1.0, 1.0);
        }
    }

    createGhostBlock() {
        // Semi-transparent preview of where block will be placed
        const geom = new THREE.BoxGeometry(
            this.gridCellSize * 0.8,
            this.gridCellSize * 0.5,
            this.gridCellSize * 0.8
        );
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5,
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
            width = this.gridCellSize * 1.8;
            depth = this.gridCellSize * 0.8;
        } else {
            // North-South
            width = this.gridCellSize * 0.8;
            depth = this.gridCellSize * 1.8;
        }

        // Dispose old geometry and create new
        this.grabbedBlock.geometry.dispose();
        this.grabbedBlock.geometry = new THREE.BoxGeometry(
            width,
            this.gridCellSize * 0.5,
            depth
        );

        // Update userData
        this.grabbedBlock.userData.rotation = rotation;
    }

    /**
     * Handle pinch start - check if grabbing a palette block or selecting room type
     */
    handlePinchStart(hand) {
        // Debug: confirm building system is being called
        this.network.send({ type: 'DEBUG_LOG', source: 'BuildingSystem', message: `handlePinchStart(${hand}) called` });

        const pinchPoint = this.hands.getPinchPointPosition(hand);
        if (!pinchPoint) return false;

        // Convert world-scale pinch point to VR local space
        const pinchVR = new THREE.Vector3(
            pinchPoint.x / GIANT_SCALE,
            pinchPoint.y / GIANT_SCALE,
            pinchPoint.z / GIANT_SCALE
        );

        // Check if pinching a room type swatch
        const selectedType = this.checkRoomTypePaletteHit(pinchVR);
        if (selectedType) {
            this.selectedRoomType = selectedType;
            this.updateSwatchHighlight();
            this.network.send({ type: 'DEBUG_LOG', source: 'BuildingSystem', message: `Selected room type: ${selectedType}, returning true` });
            return true;
        }

        // Check if pinching a palette block (for new placement)
        const blockType = this.checkPaletteHit(pinchVR);
        if (blockType) {
            this.network.send({ type: 'DEBUG_LOG', source: 'BuildingSystem', message: `Grabbed block type: ${blockType}, returning true` });
            this.grabBlockFromPalette(blockType, hand);
            return true;
        }

        // Check if pinching an existing room in replica (for conversion)
        const hitCell = this.checkReplicaRoomHit(pinchVR);
        if (hitCell && this.selectedRoomType !== 'generic') {
            this.network.send({ type: 'DEBUG_LOG', source: 'BuildingSystem', message: `Converting room at (${hitCell.x}, ${hitCell.z}), returning true` });
            this.requestRoomConversion(hitCell.x, hitCell.z);
            return true;
        }

        this.network.send({ type: 'DEBUG_LOG', source: 'BuildingSystem', message: 'No hit, returning false' });
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
     * Check if a point is near any room type swatch
     */
    checkRoomTypePaletteHit(point) {
        for (const swatch of this.roomTypeSwatches) {
            const worldPos = new THREE.Vector3();
            swatch.getWorldPosition(worldPos);

            if (point.distanceTo(worldPos) < 0.04) { // 4cm grab radius
                return swatch.userData.roomType;
            }
        }
        return null;
    }

    /**
     * Check if a point is hitting an existing room in the miniature replica
     */
    checkReplicaRoomHit(point) {
        if (!this.worldState) return null;

        // Get replica group world position
        const replicaWorldPos = new THREE.Vector3();
        this.replicaGroup.getWorldPosition(replicaWorldPos);

        // Calculate relative position
        const relX = point.x - replicaWorldPos.x;
        const relZ = point.z - replicaWorldPos.z;
        const relY = point.y - replicaWorldPos.y;

        // Check if within replica height
        if (relY < 0 || relY > this.gridCellSize * 0.6) return null;

        // Convert to grid coordinates
        const gridX = Math.round(relX / this.gridCellSize);
        const gridZ = Math.round(relZ / this.gridCellSize);

        // Check if this cell exists
        const cell = this.worldState.grid.find(c => c.x === gridX && c.z === gridZ);
        return cell || null;
    }

    /**
     * Request room type conversion from server
     */
    requestRoomConversion(gridX, gridZ) {
        this.network.send(createConvertRoomMessage(gridX, gridZ, this.selectedRoomType));
    }

    /**
     * Create a grabbed block instance
     */
    grabBlockFromPalette(blockType, hand) {
        let width, depth;

        if (blockType === '1x2') {
            if (this.currentRotation === 0) {
                // East-West
                width = this.gridCellSize * 1.8;
                depth = this.gridCellSize * 0.8;
            } else {
                // North-South
                width = this.gridCellSize * 0.8;
                depth = this.gridCellSize * 1.8;
            }
        } else {
            width = this.gridCellSize * 0.8;
            depth = this.gridCellSize * 0.8;
        }

        const geom = new THREE.BoxGeometry(
            width,
            this.gridCellSize * 0.5,
            depth
        );

        const mat = new THREE.MeshBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.7
        });

        this.grabbedBlock = new THREE.Mesh(geom, mat);
        this.grabbedBlock.userData = {
            blockType: blockType,
            rotation: this.currentRotation
        };
        this.grabbedHand = hand;
        this.scene.add(this.grabbedBlock);
    }

    /**
     * Attempt to place the grabbed block
     */
    attemptPlacement() {
        if (!this.grabbedBlock) return;

        const gridCoords = this.getGrabbedBlockGridPosition();
        if (!gridCoords) {
            return;
        }

        const blockType = this.grabbedBlock.userData.blockType;
        const rotation = this.grabbedBlock.userData.rotation || 0;

        // Check if placement is valid
        if (!this.canPlace(gridCoords.x, gridCoords.z, blockType, rotation)) {
            return;
        }

        // Send placement request to server
        this.network.send(createPlaceBlockMessage(gridCoords.x, gridCoords.z, blockType, rotation, this.selectedRoomType));
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
            this.gridCellSize * 0.25,
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
                width = this.gridCellSize * 1.8;
                depth = this.gridCellSize * 0.8;
            } else {
                width = this.gridCellSize * 0.8;
                depth = this.gridCellSize * 1.8;
            }
        } else {
            width = this.gridCellSize * 0.8;
            depth = this.gridCellSize * 0.8;
        }

        this.ghostBlock.geometry.dispose();
        this.ghostBlock.geometry = new THREE.BoxGeometry(
            width, this.gridCellSize * 0.5, depth
        );
    }

    /**
     * Handle world state update from server
     */
    onWorldStateUpdate(worldState) {
        if (!worldState) return;

        // Skip if version hasn't changed
        if (worldState.version === this.lastWorldVersion) return;

        this.worldState = worldState;
        this.lastWorldVersion = worldState.version;

        this.rebuildReplica();
    }

    /**
     * Rebuild the miniature replica from world state
     * Groups cells by mergeGroup and creates one translucent block per group
     */
    rebuildReplica() {
        // Clear existing meshes
        for (const mesh of this.wallMeshes) {
            this.replicaGroup.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
        }
        this.wallMeshes = [];

        if (!this.worldState) return;

        // Group cells by mergeGroup
        const roomGroups = new Map();
        for (const cell of this.worldState.grid) {
            const group = cell.mergeGroup;
            if (!roomGroups.has(group)) {
                roomGroups.set(group, []);
            }
            roomGroups.get(group).push(cell);
        }

        // Create one block per mergeGroup
        for (const [mergeGroup, cells] of roomGroups) {
            this.createRoomBlock(cells);
        }

        // Create doorway indicators (red rods)
        if (this.worldState.doorways) {
            for (const doorway of this.worldState.doorways) {
                this.createDoorwayIndicator(doorway);
            }
        }
    }

    /**
     * Create a horizontal red rod between two rooms to indicate a doorway
     */
    createDoorwayIndicator(doorway) {
        const x1 = doorway.cell1.x * this.gridCellSize;
        const z1 = doorway.cell1.z * this.gridCellSize;
        const x2 = doorway.cell2.x * this.gridCellSize;
        const z2 = doorway.cell2.z * this.gridCellSize;

        const centerX = (x1 + x2) / 2;
        const centerZ = (z1 + z2) / 2;

        // Determine rod orientation based on wall direction
        const isHorizontal = doorway.wall === 'east' || doorway.wall === 'west';
        const rodLength = this.gridCellSize * 0.3; // Short rod
        const rodRadius = this.gridCellSize * 0.05; // Thin

        const geom = new THREE.CylinderGeometry(rodRadius, rodRadius, rodLength, 8);
        const rod = new THREE.Mesh(geom, this.doorwayMaterial);

        // Rotate to lie flat and orient correctly
        rod.rotation.x = Math.PI / 2; // Lay flat
        if (isHorizontal) {
            rod.rotation.z = Math.PI / 2; // Point along X-axis
        }

        rod.position.set(centerX, this.gridCellSize * 0.25, centerZ);

        this.replicaGroup.add(rod);
        this.wallMeshes.push(rod);
    }

    /**
     * Create a translucent block for a room (group of cells with same mergeGroup)
     * Uses room type color and 80% scale factor to create 20% gaps between separate rooms
     */
    createRoomBlock(cells) {
        // Get room type from first cell (all cells in same mergeGroup have same type)
        const roomType = cells[0].roomType || DEFAULT_ROOM_TYPE;
        const roomConfig = ROOM_TYPES[roomType] || ROOM_TYPES[DEFAULT_ROOM_TYPE];

        // Find bounding box of all cells in this room
        const minX = Math.min(...cells.map(c => c.x));
        const maxX = Math.max(...cells.map(c => c.x));
        const minZ = Math.min(...cells.map(c => c.z));
        const maxZ = Math.max(...cells.map(c => c.z));

        // Calculate dimensions (with 20% gap = 80% of full size)
        const gapFactor = 0.8;
        const width = (maxX - minX + 1) * this.gridCellSize * gapFactor;
        const depth = (maxZ - minZ + 1) * this.gridCellSize * gapFactor;
        const height = this.gridCellSize * 0.5; // Half-height blocks

        // Calculate center position
        const centerX = ((minX + maxX) / 2) * this.gridCellSize;
        const centerZ = ((minZ + maxZ) / 2) * this.gridCellSize;

        // Create material with room type color
        const material = new THREE.MeshBasicMaterial({
            color: roomConfig.color,
            transparent: true,
            opacity: 0.5
        });

        // Create block
        const geom = new THREE.BoxGeometry(width, height, depth);
        const mesh = new THREE.Mesh(geom, material);
        mesh.position.set(centerX, height / 2, centerZ);

        this.replicaGroup.add(mesh);
        this.wallMeshes.push(mesh);
    }

    /**
     * Update world items in the miniature replica
     * @param {Array} worldObjects - Array of world items from server state
     */
    updateWorldItems(worldObjects) {
        if (!worldObjects) return;

        // Filter out plants and stations - they're handled separately or not shown in miniature
        const items = worldObjects.filter(obj => obj.objectType !== 'plant' && obj.objectType !== 'station');

        // Track which items we've seen this update
        const seenIds = new Set();

        for (const item of items) {
            seenIds.add(item.id);

            if (this.worldItemMeshes.has(item.id)) {
                // Update existing mesh position
                const mesh = this.worldItemMeshes.get(item.id);
                mesh.position.set(
                    item.position.x * this.miniatureScale,
                    item.position.y * this.miniatureScale,
                    item.position.z * this.miniatureScale
                );
            } else {
                // Create new mesh
                const mesh = this.createMiniatureItemMesh(item);
                this.worldItemMeshes.set(item.id, mesh);
                this.replicaGroup.add(mesh);
            }
        }

        // Remove meshes for items that no longer exist
        for (const [id, mesh] of this.worldItemMeshes) {
            if (!seenIds.has(id)) {
                this.replicaGroup.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
                this.worldItemMeshes.delete(id);
            }
        }
    }

    /**
     * Create a miniature mesh for a world item
     * @param {Object} item - Item data from server
     * @returns {THREE.Mesh}
     */
    createMiniatureItemMesh(item) {
        const itemDef = ITEMS[item.type];
        const color = itemDef ? itemDef.color : 0xffff00;

        // Scale world size to miniature (with minimum visibility threshold)
        const stackCount = item.stackCount || 1;
        const worldSize = 0.4 + (stackCount > 1 ? Math.min((stackCount - 1) * 0.05, 0.2) : 0);
        const miniSize = Math.max(worldSize * this.miniatureScale, 0.004); // Min 4mm for visibility

        const geometry = new THREE.BoxGeometry(miniSize, miniSize, miniSize);
        const material = new THREE.MeshBasicMaterial({ color });
        const mesh = new THREE.Mesh(geometry, material);

        // Position in miniature space
        mesh.position.set(
            item.position.x * this.miniatureScale,
            item.position.y * this.miniatureScale,
            item.position.z * this.miniatureScale
        );

        return mesh;
    }

    /**
     * Cleanup resources
     */
    dispose() {
        // Release any grabbed block
        this.releaseBlock();

        // Clear wall meshes
        for (const mesh of this.wallMeshes) {
            this.replicaGroup.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
        }
        this.wallMeshes = [];

        // Clear world item meshes
        for (const mesh of this.worldItemMeshes.values()) {
            this.replicaGroup.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        }
        this.worldItemMeshes.clear();

        // Dispose materials
        if (this.roomMaterial) this.roomMaterial.dispose();
        if (this.doorwayMaterial) this.doorwayMaterial.dispose();
        if (this.floorMaterial) this.floorMaterial.dispose();

        // Remove groups from scene
        if (this.pedestalGroup) {
            this.scene.remove(this.pedestalGroup);
        }
        if (this.paletteGroup) {
            this.scene.remove(this.paletteGroup);
        }
        if (this.roomTypePaletteGroup) {
            this.scene.remove(this.roomTypePaletteGroup);
        }

        // Clear room type swatches
        this.roomTypeSwatches = [];
    }
}
