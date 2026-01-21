/**
 * VR Farming Renderer - Three.js visuals for soil plots in VR tiny world
 *
 * Simplified version of PC farming-renderer for VR scale (0.1x).
 * Creates soil plot meshes for farming rooms.
 * Plants are handled separately by scene.js.
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import {
    SOIL_PLOT_SIZE,
    SOIL_PLOT_ROWS,
    SOIL_PLOT_COLS,
    SOIL_PLOT_SPACING_X,
    SOIL_PLOT_SPACING_Z,
    SMALL_ROOM_SIZE
} from '../../pc/shared/constants.js';

// Shared material (initialized once)
let soilMaterial = null;

/**
 * Initialize shared material
 */
function initMaterial() {
    if (soilMaterial) return; // Already initialized

    soilMaterial = new THREE.MeshStandardMaterial({
        color: 0x3d2817, // Dark brown soil
        roughness: 0.9,
        metalness: 0.0
    });
}

/**
 * Calculate soil plot positions for a farming cell
 * @param {number} gridX - Cell grid X coordinate
 * @param {number} gridZ - Cell grid Z coordinate
 * @returns {Array} Array of plot objects with id and position
 */
export function getSoilPlotPositions(gridX, gridZ) {
    const plots = [];
    const cellCenterX = gridX * SMALL_ROOM_SIZE;
    const cellCenterZ = gridZ * SMALL_ROOM_SIZE;

    for (let row = 0; row < SOIL_PLOT_ROWS; row++) {
        for (let col = 0; col < SOIL_PLOT_COLS; col++) {
            const plotId = `plot_${gridX}_${gridZ}_${row}_${col}`;
            plots.push({
                id: plotId,
                gridX: gridX,
                gridZ: gridZ,
                row: row,
                col: col,
                position: {
                    x: cellCenterX + (col - 1) * SOIL_PLOT_SPACING_X,
                    y: 0.03, // Above the room floor (which is at 0.02)
                    z: cellCenterZ + (row - 0.5) * SOIL_PLOT_SPACING_Z
                }
            });
        }
    }

    return plots;
}

/**
 * Create a soil plot mesh for VR (scaled)
 * @param {Object} position - World position {x, y, z}
 * @param {number} scale - VR scale factor (typically 0.1)
 * @returns {THREE.Mesh}
 */
export function createSoilPlotMesh(position, scale) {
    initMaterial();

    const geometry = new THREE.PlaneGeometry(SOIL_PLOT_SIZE * scale, SOIL_PLOT_SIZE * scale);
    const mesh = new THREE.Mesh(geometry, soilMaterial);

    // Rotate to be horizontal
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(
        position.x * scale,
        position.y * scale,
        position.z * scale
    );
    mesh.receiveShadow = true;

    return mesh;
}

/**
 * Dispose of soil plot mesh
 * @param {THREE.Mesh} mesh - Soil plot mesh to dispose
 */
export function disposeSoilPlotMesh(mesh) {
    if (mesh.geometry) mesh.geometry.dispose();
    // Note: Material is shared, don't dispose it
}
