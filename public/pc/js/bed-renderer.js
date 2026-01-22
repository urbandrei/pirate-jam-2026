/**
 * Bed Renderer - Three.js visuals for dorm beds
 *
 * Creates and manages meshes for beds in dorm rooms.
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import {
    SMALL_ROOM_SIZE,
    BED_ROWS,
    BED_COLS,
    BED_SPACING_X,
    BED_SPACING_Z,
    BED_SIZE
} from '../shared/constants.js';

// Shared materials (initialized once)
let bedFrameMaterial = null;
let mattressMaterial = null;
let pillowMaterial = null;
let blanketMaterial = null;
let occupiedIndicatorMaterial = null;

/**
 * Initialize shared materials
 */
function initMaterials() {
    if (bedFrameMaterial) return; // Already initialized

    bedFrameMaterial = new THREE.MeshStandardMaterial({
        color: 0x5C4033,  // Dark wood brown
        roughness: 0.7,
        metalness: 0.0
    });

    mattressMaterial = new THREE.MeshStandardMaterial({
        color: 0xE8E8E8,  // Off-white
        roughness: 0.9,
        metalness: 0.0
    });

    pillowMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFFAF0,  // Floral white
        roughness: 0.8,
        metalness: 0.0
    });

    blanketMaterial = new THREE.MeshStandardMaterial({
        color: 0x4169E1,  // Royal blue (matches dorm room color)
        roughness: 0.8,
        metalness: 0.0
    });

    occupiedIndicatorMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFD700,  // Gold
        roughness: 0.5,
        metalness: 0.3,
        transparent: true,
        opacity: 0.6
    });
}

/**
 * Get bed positions for a dorm room cell (mirrors server)
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @returns {Array} Array of bed data
 */
export function getBedPositions(gridX, gridZ) {
    const beds = [];
    const cellCenterX = gridX * SMALL_ROOM_SIZE;
    const cellCenterZ = gridZ * SMALL_ROOM_SIZE;

    // Calculate starting offset for 2x2 grid centered in cell
    const startX = cellCenterX - (BED_COLS - 1) * BED_SPACING_X / 2;
    const startZ = cellCenterZ - (BED_ROWS - 1) * BED_SPACING_Z / 2;

    for (let row = 0; row < BED_ROWS; row++) {
        for (let col = 0; col < BED_COLS; col++) {
            const bedIndex = row * BED_COLS + col;
            const bedId = `bed_${gridX}_${gridZ}_${bedIndex}`;

            beds.push({
                id: bedId,
                gridX: gridX,
                gridZ: gridZ,
                row: row,
                col: col,
                position: {
                    x: startX + col * BED_SPACING_X,
                    y: 0,
                    z: startZ + row * BED_SPACING_Z
                }
            });
        }
    }

    return beds;
}

/**
 * Create a bed mesh
 * @param {Object} bedData - Bed data from server or getBedPositions
 * @returns {THREE.Group} Bed mesh group
 */
export function createBedMesh(bedData) {
    initMaterials();

    const group = new THREE.Group();
    group.userData.bedId = bedData.id;
    group.userData.objectType = 'bed';
    group.userData.occupant = bedData.occupant || null;

    // Bed frame
    createBedFrameGeometry(group);

    // Mattress
    createMattressGeometry(group);

    // Pillow
    createPillowGeometry(group);

    // Blanket
    createBlanketGeometry(group);

    // Headboard
    createHeadboardGeometry(group);

    group.position.set(
        bedData.position.x,
        bedData.position.y,
        bedData.position.z
    );

    return group;
}

/**
 * Create bed frame geometry
 */
function createBedFrameGeometry(group) {
    const width = BED_SIZE.width;
    const height = 0.15;
    const depth = BED_SIZE.depth;

    // Frame base
    const frameGeom = new THREE.BoxGeometry(width, height, depth);
    const frame = new THREE.Mesh(frameGeom, bedFrameMaterial);
    frame.position.y = height / 2;
    frame.castShadow = true;
    frame.receiveShadow = true;
    group.add(frame);

    // Frame legs (4 corners)
    const legHeight = 0.2;
    const legGeom = new THREE.BoxGeometry(0.1, legHeight, 0.1);

    const legPositions = [
        { x: -width / 2 + 0.1, z: -depth / 2 + 0.1 },
        { x: width / 2 - 0.1, z: -depth / 2 + 0.1 },
        { x: -width / 2 + 0.1, z: depth / 2 - 0.1 },
        { x: width / 2 - 0.1, z: depth / 2 - 0.1 }
    ];

    for (const pos of legPositions) {
        const leg = new THREE.Mesh(legGeom, bedFrameMaterial);
        leg.position.set(pos.x, -legHeight / 2, pos.z);
        leg.castShadow = true;
        group.add(leg);
    }
}

/**
 * Create mattress geometry
 */
function createMattressGeometry(group) {
    const width = BED_SIZE.width - 0.1;
    const height = 0.15;
    const depth = BED_SIZE.depth - 0.1;

    const mattressGeom = new THREE.BoxGeometry(width, height, depth);
    const mattress = new THREE.Mesh(mattressGeom, mattressMaterial);
    mattress.position.y = 0.15 + height / 2;
    mattress.castShadow = true;
    mattress.receiveShadow = true;
    group.add(mattress);
}

/**
 * Create pillow geometry
 */
function createPillowGeometry(group) {
    const pillowGeom = new THREE.BoxGeometry(0.6, 0.1, 0.3);
    const pillow = new THREE.Mesh(pillowGeom, pillowMaterial);
    pillow.position.set(0, 0.35, -BED_SIZE.depth / 2 + 0.25);
    pillow.castShadow = true;
    group.add(pillow);
}

/**
 * Create blanket geometry (covers lower 2/3 of bed)
 */
function createBlanketGeometry(group) {
    const width = BED_SIZE.width - 0.15;
    const height = 0.08;
    const depth = BED_SIZE.depth * 0.65;

    const blanketGeom = new THREE.BoxGeometry(width, height, depth);
    const blanket = new THREE.Mesh(blanketGeom, blanketMaterial);
    blanket.position.set(0, 0.35, BED_SIZE.depth / 2 - depth / 2 - 0.05);
    blanket.castShadow = true;
    blanket.userData.isBlanket = true;
    group.add(blanket);
}

/**
 * Create headboard geometry
 */
function createHeadboardGeometry(group) {
    const headboardGeom = new THREE.BoxGeometry(BED_SIZE.width, 0.5, 0.08);
    const headboard = new THREE.Mesh(headboardGeom, bedFrameMaterial);
    headboard.position.set(0, 0.4, -BED_SIZE.depth / 2 - 0.04);
    headboard.castShadow = true;
    group.add(headboard);
}

/**
 * Update bed mesh to show occupancy
 * @param {THREE.Group} group - Bed mesh group
 * @param {Object} bedData - Bed data with occupant field
 * @returns {boolean} Whether any changes were made
 */
export function updateBedMesh(group, bedData) {
    const wasOccupied = group.userData.occupant !== null;
    const isOccupied = bedData.occupant !== null;

    if (wasOccupied === isOccupied) {
        return false;
    }

    // Remove existing occupancy indicator
    const existingIndicator = group.children.find(c => c.userData.isOccupancyIndicator);
    if (existingIndicator) {
        group.remove(existingIndicator);
        if (existingIndicator.geometry) existingIndicator.geometry.dispose();
    }

    // Add occupancy indicator if occupied
    if (isOccupied) {
        // Create a simple body shape to show someone is in the bed
        // Capsule is vertical by default, rotate to lie flat along the bed (Z axis)
        const bodyGeom = new THREE.CapsuleGeometry(0.15, 0.8, 4, 8);
        const body = new THREE.Mesh(bodyGeom, occupiedIndicatorMaterial);
        body.rotation.x = Math.PI / 2;  // Tilt to lie flat (face up)
        body.position.set(0, 0.45, 0.1);
        body.userData.isOccupancyIndicator = true;
        group.add(body);
    }

    group.userData.occupant = bedData.occupant;
    return true;
}

/**
 * Dispose a bed mesh and its resources
 * @param {THREE.Group} group - Bed mesh group
 */
export function disposeBedMesh(group) {
    group.children.forEach(child => {
        if (child.geometry) {
            child.geometry.dispose();
        }
        // Note: Most materials are shared, only dispose non-shared ones
        if (child.userData.isOccupancyIndicator && child.material) {
            // Occupancy indicator uses shared material, don't dispose
        }
    });
}

/**
 * Get the interaction prompt for a bed based on player state and bed occupancy
 * @param {Object} bedData - Bed data with occupant field
 * @param {Object} player - Player object with playerState
 * @returns {Object|null} Interaction {type, prompt} or null if not interactable
 */
export function getBedInteraction(bedData, player) {
    // If player is sleeping, they can only wake up
    if (player.playerState === 'sleeping') {
        return {
            type: 'wake',
            prompt: 'Wake Up'
        };
    }

    // If bed is empty, player can sleep
    if (bedData.occupant === null) {
        return {
            type: 'sleep',
            prompt: 'Sleep'
        };
    }

    // Bed is occupied by someone else
    return null;
}
