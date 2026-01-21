/**
 * VR Station Renderer - Three.js visuals for processing stations in VR tiny world
 *
 * Simplified version of PC station-renderer for VR scale (0.1x).
 * Creates wash, cut, and assembly station meshes.
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import {
    SMALL_ROOM_SIZE,
    STATIONS,
    STATION_ROWS,
    STATION_COLS,
    STATION_SPACING_X,
    STATION_SPACING_Z
} from '../../pc/shared/constants.js';

// Shared materials (initialized once)
let washMaterial = null;
let cutMaterial = null;
let assemblyMaterial = null;

// Station type order for grid layout: wash, cut, assembly (one column each)
const STATION_ORDER = ['wash_station', 'cut_station', 'assembly_station'];

/**
 * Initialize shared materials
 */
function initMaterials() {
    if (washMaterial) return; // Already initialized

    washMaterial = new THREE.MeshStandardMaterial({
        color: STATIONS.wash_station.color,
        roughness: 0.3,
        metalness: 0.2
    });

    cutMaterial = new THREE.MeshStandardMaterial({
        color: STATIONS.cut_station.color,
        roughness: 0.8,
        metalness: 0.0
    });

    assemblyMaterial = new THREE.MeshStandardMaterial({
        color: STATIONS.assembly_station.color,
        roughness: 0.4,
        metalness: 0.3
    });
}

/**
 * Get station positions for a processing room cell (mirrors server)
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @returns {Array} Array of station data {id, position, stationType, gridX, gridZ, row, col}
 */
export function getStationPositions(gridX, gridZ) {
    const stations = [];
    const cellCenterX = gridX * SMALL_ROOM_SIZE;
    const cellCenterZ = gridZ * SMALL_ROOM_SIZE;

    // Calculate starting offset for 2x3 grid centered in cell
    const startX = cellCenterX - (STATION_COLS - 1) * STATION_SPACING_X / 2;
    const startZ = cellCenterZ - (STATION_ROWS - 1) * STATION_SPACING_Z / 2;

    for (let col = 0; col < STATION_COLS; col++) {
        for (let row = 0; row < STATION_ROWS; row++) {
            const stationType = STATION_ORDER[col];
            const stationId = `station_${stationType}_${gridX}_${gridZ}_${row}_${col}`;

            stations.push({
                id: stationId,
                stationType: stationType,
                gridX: gridX,
                gridZ: gridZ,
                row: row,
                col: col,
                position: {
                    x: startX + col * STATION_SPACING_X,
                    y: 0,
                    z: startZ + row * STATION_SPACING_Z
                }
            });
        }
    }

    return stations;
}

/**
 * Create a station mesh for VR (simplified, scaled)
 * @param {Object} stationData - Station data from getStationPositions
 * @param {number} scale - VR scale factor (typically 0.1)
 * @returns {THREE.Group} Station mesh group
 */
export function createStationMesh(stationData, scale) {
    initMaterials();

    const group = new THREE.Group();
    group.userData.stationId = stationData.id;
    group.userData.stationType = stationData.stationType;
    group.userData.objectType = 'station';

    switch (stationData.stationType) {
        case 'wash_station':
            createWashStationGeometry(group, scale);
            break;
        case 'cut_station':
            createCutStationGeometry(group, scale);
            break;
        case 'assembly_station':
            createAssemblyStationGeometry(group, scale);
            break;
    }

    group.position.set(
        stationData.position.x * scale,
        stationData.position.y * scale,
        stationData.position.z * scale
    );

    return group;
}

/**
 * Create wash station geometry (blue box - simplified for VR)
 */
function createWashStationGeometry(group, scale) {
    // Single box representing the wash station
    const baseGeom = new THREE.BoxGeometry(1.2 * scale, 0.9 * scale, 0.8 * scale);
    const base = new THREE.Mesh(baseGeom, washMaterial);
    base.position.y = 0.45 * scale;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
}

/**
 * Create cut station geometry (brown box - simplified for VR)
 */
function createCutStationGeometry(group, scale) {
    // Single box representing the cutting table
    const tableGeom = new THREE.BoxGeometry(1.4 * scale, 0.7 * scale, 0.9 * scale);
    const table = new THREE.Mesh(tableGeom, cutMaterial);
    table.position.y = 0.35 * scale;
    table.castShadow = true;
    table.receiveShadow = true;
    group.add(table);
}

/**
 * Create assembly station geometry (silver box - simplified for VR)
 */
function createAssemblyStationGeometry(group, scale) {
    // Single box representing the assembly counter
    const counterGeom = new THREE.BoxGeometry(1.6 * scale, 0.85 * scale, 1.0 * scale);
    const counter = new THREE.Mesh(counterGeom, assemblyMaterial);
    counter.position.y = 0.425 * scale;
    counter.castShadow = true;
    counter.receiveShadow = true;
    group.add(counter);
}

/**
 * Dispose a station mesh and its resources
 * @param {THREE.Group} group - Station mesh group
 */
export function disposeStationMesh(group) {
    group.children.forEach(child => {
        if (child.geometry) {
            child.geometry.dispose();
        }
        // Note: Materials are shared, don't dispose them
    });
}
