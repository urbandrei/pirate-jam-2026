/**
 * Station Renderer - Three.js visuals for processing stations
 *
 * Creates and manages meshes for wash, cut, and assembly stations.
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import {
    SMALL_ROOM_SIZE,
    STATIONS,
    STATION_ROWS,
    STATION_COLS,
    STATION_SPACING_X,
    STATION_SPACING_Z,
    ITEMS
} from '../shared/constants.js';

// Shared materials (initialized once)
let washMaterial = null;
let cutMaterial = null;
let assemblyMaterial = null;
let basinMaterial = null;
let cuttingBoardMaterial = null;
let ingredientMaterial = null;

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

    basinMaterial = new THREE.MeshStandardMaterial({
        color: 0x2255aa,
        roughness: 0.2,
        metalness: 0.1
    });

    cuttingBoardMaterial = new THREE.MeshStandardMaterial({
        color: 0xdeb887,
        roughness: 0.9,
        metalness: 0.0
    });

    ingredientMaterial = new THREE.MeshStandardMaterial({
        color: 0x98FB98,
        roughness: 0.5,
        metalness: 0.1
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
 * Create a station mesh
 * @param {Object} stationData - Station data from getStationPositions
 * @returns {THREE.Group} Station mesh group
 */
export function createStationMesh(stationData) {
    initMaterials();

    const group = new THREE.Group();
    group.userData.stationId = stationData.id;
    group.userData.stationType = stationData.stationType;
    group.userData.objectType = 'station';

    switch (stationData.stationType) {
        case 'wash_station':
            createWashStationGeometry(group);
            break;
        case 'cut_station':
            createCutStationGeometry(group);
            break;
        case 'assembly_station':
            createAssemblyStationGeometry(group);
            break;
    }

    group.position.set(
        stationData.position.x,
        stationData.position.y,
        stationData.position.z
    );

    return group;
}

/**
 * Create wash station geometry (blue basin on pedestal)
 */
function createWashStationGeometry(group) {
    // Base pedestal
    const baseGeom = new THREE.BoxGeometry(1.2, 0.8, 0.8);
    const base = new THREE.Mesh(baseGeom, washMaterial);
    base.position.y = 0.4;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Basin top (flat rectangle with depression effect)
    const basinGeom = new THREE.BoxGeometry(1.0, 0.1, 0.6);
    const basin = new THREE.Mesh(basinGeom, basinMaterial);
    basin.position.y = 0.85;
    basin.castShadow = true;
    group.add(basin);

    // Water surface (slight blue tint)
    const waterGeom = new THREE.PlaneGeometry(0.8, 0.4);
    const waterMat = new THREE.MeshStandardMaterial({
        color: 0x4488cc,
        roughness: 0.1,
        metalness: 0.3,
        transparent: true,
        opacity: 0.7
    });
    const water = new THREE.Mesh(waterGeom, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.86;
    group.add(water);
}

/**
 * Create cut station geometry (wooden table with cutting board)
 */
function createCutStationGeometry(group) {
    // Table base
    const tableGeom = new THREE.BoxGeometry(1.4, 0.7, 0.9);
    const table = new THREE.Mesh(tableGeom, cutMaterial);
    table.position.y = 0.35;
    table.castShadow = true;
    table.receiveShadow = true;
    group.add(table);

    // Cutting board on top
    const boardGeom = new THREE.BoxGeometry(0.8, 0.05, 0.5);
    const board = new THREE.Mesh(boardGeom, cuttingBoardMaterial);
    board.position.y = 0.725;
    board.castShadow = true;
    group.add(board);
}

/**
 * Create assembly station geometry (silver counter with ingredient slots)
 */
function createAssemblyStationGeometry(group) {
    // Counter base
    const counterGeom = new THREE.BoxGeometry(1.6, 0.85, 1.0);
    const counter = new THREE.Mesh(counterGeom, assemblyMaterial);
    counter.position.y = 0.425;
    counter.castShadow = true;
    counter.receiveShadow = true;
    group.add(counter);

    // Ingredient slot indicators (3 small circles on top)
    const slotGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16);
    const slotMat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.5
    });

    for (let i = 0; i < 3; i++) {
        const slot = new THREE.Mesh(slotGeom, slotMat);
        slot.position.set(-0.4 + i * 0.4, 0.86, 0);
        slot.receiveShadow = true;
        group.add(slot);
    }

    // Store slot positions for ingredient display
    group.userData.ingredientSlots = [
        { x: -0.4, y: 0.95, z: 0 },
        { x: 0, y: 0.95, z: 0 },
        { x: 0.4, y: 0.95, z: 0 }
    ];
}

/**
 * Update station mesh to show accumulated ingredients (assembly only)
 * @param {THREE.Group} group - Station mesh group
 * @param {Object} stationData - Station data with ingredients array
 * @returns {boolean} Whether any changes were made
 */
export function updateStationMesh(group, stationData) {
    if (group.userData.stationType !== 'assembly_station') {
        return false;
    }

    const ingredients = stationData.ingredients || [];
    const currentCount = group.userData.ingredientCount || 0;

    // No change
    if (ingredients.length === currentCount) {
        return false;
    }

    // Remove old ingredient meshes
    const toRemove = group.children.filter(c => c.userData.isIngredient);
    for (const mesh of toRemove) {
        group.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
    }

    // Add new ingredient meshes
    const slots = group.userData.ingredientSlots || [];
    for (let i = 0; i < ingredients.length && i < slots.length; i++) {
        const ingredientGeom = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const itemDef = ITEMS[ingredients[i]] || { color: 0x98FB98 };
        const ingredientMat = new THREE.MeshStandardMaterial({
            color: itemDef.color,
            roughness: 0.5
        });
        const ingredientMesh = new THREE.Mesh(ingredientGeom, ingredientMat);
        ingredientMesh.position.set(slots[i].x, slots[i].y, slots[i].z);
        ingredientMesh.castShadow = true;
        ingredientMesh.userData.isIngredient = true;
        group.add(ingredientMesh);
    }

    group.userData.ingredientCount = ingredients.length;
    return true;
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

/**
 * Get the interaction prompt for a station based on player's held item
 * @param {string} stationType - Station type
 * @param {Object|null} heldItem - Player's held item
 * @returns {Object|null} Interaction {type, prompt} or null if not interactable
 */
export function getStationInteraction(stationType, heldItem) {
    const stationConfig = STATIONS[stationType];
    if (!stationConfig) return null;

    const heldItemType = heldItem ? heldItem.type : null;

    switch (stationType) {
        case 'wash_station':
            if (heldItemType === stationConfig.inputItem) {
                return { type: 'wash', prompt: `Wash ${ITEMS[heldItemType]?.name || heldItemType}` };
            }
            return null;

        case 'cut_station':
            if (heldItemType === stationConfig.inputItem) {
                return { type: 'cut', prompt: `Cut ${ITEMS[heldItemType]?.name || heldItemType}` };
            }
            return null;

        case 'assembly_station':
            if (heldItemType === stationConfig.inputItem) {
                return { type: 'assemble', prompt: 'Add to Assembly' };
            }
            return null;

        default:
            return null;
    }
}
