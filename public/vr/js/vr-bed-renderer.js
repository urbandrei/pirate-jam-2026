/**
 * VR Bed Renderer - Three.js visuals for dorm beds in VR tiny world
 *
 * Simplified version of PC bed-renderer for VR scale (0.1x).
 * Creates bed meshes for dorm rooms.
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import {
    SMALL_ROOM_SIZE,
    BED_ROWS,
    BED_COLS,
    BED_SPACING_X,
    BED_SPACING_Z,
    BED_SIZE
} from '../../pc/shared/constants.js';

// Shared materials (initialized once)
let bedFrameMaterial = null;
let mattressMaterial = null;
let blanketMaterial = null;
let occupiedMaterial = null;

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

    blanketMaterial = new THREE.MeshStandardMaterial({
        color: 0x4169E1,  // Royal blue
        roughness: 0.8,
        metalness: 0.0
    });

    occupiedMaterial = new THREE.MeshStandardMaterial({
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
 * Create a bed mesh for VR (simplified, scaled)
 * @param {Object} bedData - Bed data from server or getBedPositions
 * @param {number} scale - VR scale factor (typically 0.1)
 * @returns {THREE.Group} Bed mesh group
 */
export function createBedMesh(bedData, scale) {
    initMaterials();

    const group = new THREE.Group();
    group.userData.bedId = bedData.id;
    group.userData.objectType = 'bed';
    group.userData.occupant = bedData.occupant || null;

    const width = BED_SIZE.width * scale;
    const height = BED_SIZE.height * scale;
    const depth = BED_SIZE.depth * scale;

    // Bed frame (single box, simplified for VR)
    const frameGeom = new THREE.BoxGeometry(width, height * 0.3, depth);
    const frame = new THREE.Mesh(frameGeom, bedFrameMaterial);
    frame.position.y = height * 0.15;
    frame.castShadow = true;
    frame.receiveShadow = true;
    group.add(frame);

    // Mattress
    const mattressGeom = new THREE.BoxGeometry(width * 0.95, height * 0.3, depth * 0.95);
    const mattress = new THREE.Mesh(mattressGeom, mattressMaterial);
    mattress.position.y = height * 0.45;
    mattress.castShadow = true;
    group.add(mattress);

    // Blanket (covers lower 2/3)
    const blanketGeom = new THREE.BoxGeometry(width * 0.9, height * 0.15, depth * 0.6);
    const blanket = new THREE.Mesh(blanketGeom, blanketMaterial);
    blanket.position.set(0, height * 0.55, depth * 0.15);
    blanket.castShadow = true;
    group.add(blanket);

    // Headboard
    const headboardGeom = new THREE.BoxGeometry(width, height * 0.8, depth * 0.1);
    const headboard = new THREE.Mesh(headboardGeom, bedFrameMaterial);
    headboard.position.set(0, height * 0.6, -depth * 0.45);
    headboard.castShadow = true;
    group.add(headboard);

    group.position.set(
        bedData.position.x * scale,
        bedData.position.y * scale,
        bedData.position.z * scale
    );

    return group;
}

/**
 * Update bed mesh to show occupancy
 * @param {THREE.Group} group - Bed mesh group
 * @param {Object} bedData - Bed data with occupant field
 * @param {number} scale - VR scale factor
 * @returns {boolean} Whether any changes were made
 */
export function updateBedMesh(group, bedData, scale) {
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
        const height = BED_SIZE.height * scale;
        const depth = BED_SIZE.depth * scale;

        // Create a simple capsule to show someone is in the bed
        const bodyGeom = new THREE.CapsuleGeometry(0.15 * scale, 0.6 * scale, 4, 8);
        const body = new THREE.Mesh(bodyGeom, occupiedMaterial);
        body.rotation.x = Math.PI / 2;  // Lying down
        body.rotation.z = Math.PI / 2;  // Along bed length
        body.position.set(0, height * 0.7, 0);
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
        // Note: Materials are shared, don't dispose them
    });
}
