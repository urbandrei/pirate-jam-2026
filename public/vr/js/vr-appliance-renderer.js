/**
 * VR Appliance Renderer - Three.js visuals for cafeteria appliances in VR tiny world
 *
 * Simplified version of PC appliance-renderer for VR scale (0.1x).
 * Creates vending machine, coffee machine, water station, and table meshes.
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import {
    SMALL_ROOM_SIZE,
    APPLIANCES
} from '../../pc/shared/constants.js';

// Layout constants (mirroring server)
const APPLIANCE_SPACING = 3.0;
const TABLE_COUNT = 2;
const TABLE_SPACING = 3.5;

// Appliance order (along one wall)
const APPLIANCE_ORDER = ['vending_machine', 'coffee_machine', 'water_station'];

// Shared materials (initialized once)
let vendingMaterial = null;
let coffeeMaterial = null;
let waterMaterial = null;
let tableMaterial = null;

/**
 * Initialize shared materials
 */
function initMaterials() {
    if (vendingMaterial) return; // Already initialized

    vendingMaterial = new THREE.MeshStandardMaterial({
        color: APPLIANCES.vending_machine.color,
        roughness: 0.4,
        metalness: 0.3
    });

    coffeeMaterial = new THREE.MeshStandardMaterial({
        color: APPLIANCES.coffee_machine.color,
        roughness: 0.3,
        metalness: 0.4
    });

    waterMaterial = new THREE.MeshStandardMaterial({
        color: APPLIANCES.water_station.color,
        roughness: 0.2,
        metalness: 0.3
    });

    tableMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B4513,  // Saddle brown (wood)
        roughness: 0.7,
        metalness: 0.0
    });
}

/**
 * Get appliance positions for a cafeteria room cell (mirrors server)
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @returns {Array} Array of appliance data
 */
export function getAppliancePositions(gridX, gridZ) {
    const appliances = [];
    const cellCenterX = gridX * SMALL_ROOM_SIZE;
    const cellCenterZ = gridZ * SMALL_ROOM_SIZE;

    // Place appliances along the -Z wall (back wall)
    const wallZ = cellCenterZ - SMALL_ROOM_SIZE / 2 + 1.0;
    const startX = cellCenterX - (APPLIANCE_ORDER.length - 1) * APPLIANCE_SPACING / 2;

    for (let i = 0; i < APPLIANCE_ORDER.length; i++) {
        const applianceType = APPLIANCE_ORDER[i];
        const applianceId = `appliance_${applianceType}_${gridX}_${gridZ}`;

        appliances.push({
            id: applianceId,
            applianceType: applianceType,
            gridX: gridX,
            gridZ: gridZ,
            position: {
                x: startX + i * APPLIANCE_SPACING,
                y: 0,
                z: wallZ
            }
        });
    }

    return appliances;
}

/**
 * Get table positions for a cafeteria room cell
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @returns {Array} Array of table data
 */
export function getTablePositions(gridX, gridZ) {
    const tables = [];
    const cellCenterX = gridX * SMALL_ROOM_SIZE;
    const cellCenterZ = gridZ * SMALL_ROOM_SIZE;

    // Place tables in center of room
    const startX = cellCenterX - (TABLE_COUNT - 1) * TABLE_SPACING / 2;

    for (let i = 0; i < TABLE_COUNT; i++) {
        const tableId = `table_${gridX}_${gridZ}_${i}`;

        tables.push({
            id: tableId,
            objectType: 'table',
            gridX: gridX,
            gridZ: gridZ,
            position: {
                x: startX + i * TABLE_SPACING,
                y: 0,
                z: cellCenterZ + 1.5
            }
        });
    }

    return tables;
}

/**
 * Create an appliance mesh for VR (simplified, scaled)
 * @param {Object} applianceData - Appliance data
 * @param {number} scale - VR scale factor (typically 0.1)
 * @returns {THREE.Group} Appliance mesh group
 */
export function createApplianceMesh(applianceData, scale) {
    initMaterials();

    const group = new THREE.Group();
    group.userData.applianceId = applianceData.id;
    group.userData.applianceType = applianceData.applianceType;
    group.userData.objectType = 'appliance';

    switch (applianceData.applianceType) {
        case 'vending_machine':
            createVendingMachineGeometry(group, scale);
            break;
        case 'coffee_machine':
            createCoffeeMachineGeometry(group, scale);
            break;
        case 'water_station':
            createWaterStationGeometry(group, scale);
            break;
    }

    group.position.set(
        applianceData.position.x * scale,
        applianceData.position.y * scale,
        applianceData.position.z * scale
    );

    return group;
}

/**
 * Create a table mesh for VR (simplified, scaled)
 * @param {Object} tableData - Table data
 * @param {number} scale - VR scale factor (typically 0.1)
 * @returns {THREE.Group} Table mesh group
 */
export function createTableMesh(tableData, scale) {
    initMaterials();

    const group = new THREE.Group();
    group.userData.tableId = tableData.id;
    group.userData.objectType = 'table';

    // Single box for table (simplified for VR)
    const tableGeom = new THREE.BoxGeometry(2.0 * scale, 0.75 * scale, 1.2 * scale);
    const table = new THREE.Mesh(tableGeom, tableMaterial);
    table.position.y = 0.375 * scale;
    table.castShadow = true;
    table.receiveShadow = true;
    group.add(table);

    group.position.set(
        tableData.position.x * scale,
        tableData.position.y * scale,
        tableData.position.z * scale
    );

    return group;
}

/**
 * Create vending machine geometry (simplified box for VR)
 */
function createVendingMachineGeometry(group, scale) {
    const config = APPLIANCES.vending_machine;

    // Single tall box
    const bodyGeom = new THREE.BoxGeometry(config.width * scale, config.height * scale, config.depth * scale);
    const body = new THREE.Mesh(bodyGeom, vendingMaterial);
    body.position.y = config.height * scale / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
}

/**
 * Create coffee machine geometry (simplified box for VR)
 */
function createCoffeeMachineGeometry(group, scale) {
    const config = APPLIANCES.coffee_machine;

    // Single box
    const bodyGeom = new THREE.BoxGeometry(config.width * scale, config.height * scale, config.depth * scale);
    const body = new THREE.Mesh(bodyGeom, coffeeMaterial);
    body.position.y = config.height * scale / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
}

/**
 * Create water station geometry (simplified box for VR)
 */
function createWaterStationGeometry(group, scale) {
    const config = APPLIANCES.water_station;

    // Single box
    const bodyGeom = new THREE.BoxGeometry(config.width * scale, config.height * scale, config.depth * scale);
    const body = new THREE.Mesh(bodyGeom, waterMaterial);
    body.position.y = config.height * scale / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
}

/**
 * Dispose an appliance mesh and its resources
 * @param {THREE.Group} group - Appliance mesh group
 */
export function disposeApplianceMesh(group) {
    group.children.forEach(child => {
        if (child.geometry) {
            child.geometry.dispose();
        }
        // Note: Materials are shared, don't dispose them
    });
}
