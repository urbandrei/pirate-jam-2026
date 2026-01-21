/**
 * Farming Renderer - Procedural plant and soil plot meshes for PC client
 *
 * Creates Three.js meshes for:
 * - Soil plots (dark brown rectangles)
 * - Plants at various growth stages (procedural geometry)
 * - Weed overlays
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import {
    PLANT_STAGES,
    PLANT_COLORS,
    SOIL_PLOT_SIZE,
    SOIL_PLOT_ROWS,
    SOIL_PLOT_COLS,
    SOIL_PLOT_SPACING_X,
    SOIL_PLOT_SPACING_Z,
    SMALL_ROOM_SIZE
} from '../shared/constants.js';

// Shared materials for performance
let soilMaterial = null;
let stemMaterial = null;
let leafMaterial = null;
let fruitMaterial = null;
let weedMaterial = null;

/**
 * Initialize shared materials (call once)
 */
function initMaterials() {
    if (soilMaterial) return; // Already initialized

    soilMaterial = new THREE.MeshStandardMaterial({
        color: 0x3d2817, // Dark brown soil
        roughness: 0.9,
        metalness: 0.0
    });

    stemMaterial = new THREE.MeshStandardMaterial({
        color: PLANT_COLORS.growing,
        roughness: 0.7,
        metalness: 0.0
    });

    leafMaterial = new THREE.MeshStandardMaterial({
        color: PLANT_COLORS.mature,
        roughness: 0.6,
        metalness: 0.0
    });

    fruitMaterial = new THREE.MeshStandardMaterial({
        color: PLANT_COLORS.fruit,
        roughness: 0.5,
        metalness: 0.1
    });

    weedMaterial = new THREE.MeshStandardMaterial({
        color: PLANT_COLORS.weed,
        roughness: 0.8,
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
 * Create a soil plot mesh
 * @param {Object} position - World position {x, y, z}
 * @returns {THREE.Mesh}
 */
export function createSoilPlotMesh(position) {
    initMaterials();

    const geometry = new THREE.PlaneGeometry(SOIL_PLOT_SIZE, SOIL_PLOT_SIZE);
    const mesh = new THREE.Mesh(geometry, soilMaterial);

    // Rotate to be horizontal
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(position.x, position.y, position.z);
    mesh.receiveShadow = true;

    return mesh;
}

/**
 * Create a plant mesh based on growth stage
 * @param {Object} plantData - Plant data from server
 * @returns {THREE.Group} Group containing plant meshes
 */
export function createPlantMesh(plantData) {
    initMaterials();

    const group = new THREE.Group();
    group.position.set(plantData.position.x, 0, plantData.position.z);

    // Add stage-specific geometry
    switch (plantData.stage) {
        case 'seed':
            addSeedGeometry(group);
            break;
        case 'sprout':
            addSproutGeometry(group);
            break;
        case 'growing':
            addGrowingGeometry(group);
            break;
        case 'mature':
            addMatureGeometry(group);
            break;
        case 'harvestable':
            addHarvestableGeometry(group);
            break;
    }

    // Add weeds if present
    if (plantData.hasWeeds) {
        addWeedGeometry(group);
    }

    // Store plant data in userData for interaction system
    group.userData.plantId = plantData.id;
    group.userData.stage = plantData.stage;
    group.userData.hasWeeds = plantData.hasWeeds;
    group.userData.objectType = 'plant';

    return group;
}

/**
 * Update an existing plant mesh when state changes
 * @param {THREE.Group} group - Existing plant group
 * @param {Object} plantData - Updated plant data
 * @returns {boolean} True if mesh was rebuilt (requires re-registration)
 */
export function updatePlantMesh(group, plantData) {
    // Check if stage or weeds changed
    if (group.userData.stage === plantData.stage &&
        group.userData.hasWeeds === plantData.hasWeeds) {
        return false; // No visual change
    }

    // Clear existing children
    while (group.children.length > 0) {
        const child = group.children[0];
        if (child.geometry) child.geometry.dispose();
        group.remove(child);
    }

    // Rebuild with new state
    switch (plantData.stage) {
        case 'seed':
            addSeedGeometry(group);
            break;
        case 'sprout':
            addSproutGeometry(group);
            break;
        case 'growing':
            addGrowingGeometry(group);
            break;
        case 'mature':
            addMatureGeometry(group);
            break;
        case 'harvestable':
            addHarvestableGeometry(group);
            break;
    }

    if (plantData.hasWeeds) {
        addWeedGeometry(group);
    }

    // Update userData
    group.userData.stage = plantData.stage;
    group.userData.hasWeeds = plantData.hasWeeds;

    return true;
}

// ============================================
// Private geometry helper functions
// ============================================

function addSeedGeometry(group) {
    // Brown mound (flattened sphere)
    const geometry = new THREE.SphereGeometry(0.15, 8, 6);
    geometry.scale(1, 0.3, 1); // Flatten

    const material = new THREE.MeshStandardMaterial({
        color: PLANT_COLORS.seed,
        roughness: 0.9
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.05;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    group.add(mesh);
}

function addSproutGeometry(group) {
    // Thin stem
    const stemGeometry = new THREE.CylinderGeometry(0.02, 0.03, 0.15, 6);
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = 0.075;
    stem.castShadow = true;

    // Small top
    const topGeometry = new THREE.SphereGeometry(0.04, 6, 6);
    const top = new THREE.Mesh(topGeometry, leafMaterial);
    top.position.y = 0.17;
    top.castShadow = true;

    group.add(stem);
    group.add(top);
}

function addGrowingGeometry(group) {
    // Taller stem
    const stemGeometry = new THREE.CylinderGeometry(0.03, 0.04, 0.3, 6);
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = 0.15;
    stem.castShadow = true;

    group.add(stem);

    // Two cone leaves
    const leafGeometry = new THREE.ConeGeometry(0.08, 0.15, 4);

    for (let i = 0; i < 2; i++) {
        const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
        leaf.position.y = 0.25;
        leaf.position.x = (i === 0 ? -0.06 : 0.06);
        leaf.rotation.z = (i === 0 ? 0.5 : -0.5);
        leaf.castShadow = true;
        group.add(leaf);
    }
}

function addMatureGeometry(group) {
    // Full stem
    const stemGeometry = new THREE.CylinderGeometry(0.04, 0.05, 0.5, 8);
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = 0.25;
    stem.castShadow = true;

    group.add(stem);

    // Multiple leaves
    const leafGeometry = new THREE.ConeGeometry(0.1, 0.2, 4);

    for (let i = 0; i < 4; i++) {
        const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
        leaf.position.y = 0.35 + (i % 2) * 0.1;
        const angle = (i / 4) * Math.PI * 2;
        leaf.position.x = Math.cos(angle) * 0.1;
        leaf.position.z = Math.sin(angle) * 0.1;
        leaf.rotation.z = Math.cos(angle) * 0.5;
        leaf.rotation.x = Math.sin(angle) * 0.5;
        leaf.castShadow = true;
        group.add(leaf);
    }
}

function addHarvestableGeometry(group) {
    // Same as mature plus fruit
    addMatureGeometry(group);

    // Add fruit/vegetable
    const fruitGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    fruitGeometry.scale(0.8, 1.2, 0.8); // Slightly elongated

    const fruit = new THREE.Mesh(fruitGeometry, fruitMaterial);
    fruit.position.y = 0.5;
    fruit.castShadow = true;

    group.add(fruit);
}

function addWeedGeometry(group) {
    // Small brown tufts around base
    const weedGeometry = new THREE.ConeGeometry(0.05, 0.1, 4);

    for (let i = 0; i < 4; i++) {
        const weed = new THREE.Mesh(weedGeometry, weedMaterial);
        const angle = (i / 4) * Math.PI * 2 + 0.4; // Offset from leaves
        weed.position.x = Math.cos(angle) * 0.2;
        weed.position.z = Math.sin(angle) * 0.2;
        weed.position.y = 0.05;
        weed.rotation.z = (Math.random() - 0.5) * 0.5;
        weed.castShadow = true;
        group.add(weed);
    }
}

/**
 * Dispose of plant mesh resources
 * @param {THREE.Group} group - Plant group to dispose
 */
export function disposePlantMesh(group) {
    while (group.children.length > 0) {
        const child = group.children[0];
        if (child.geometry) child.geometry.dispose();
        // Note: Materials are shared, don't dispose them
        group.remove(child);
    }
}

/**
 * Dispose of soil plot mesh
 * @param {THREE.Mesh} mesh - Soil plot mesh to dispose
 */
export function disposeSoilPlotMesh(mesh) {
    if (mesh.geometry) mesh.geometry.dispose();
    // Note: Material is shared, don't dispose it
}
