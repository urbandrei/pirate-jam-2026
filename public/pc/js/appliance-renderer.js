/**
 * Appliance Renderer - Three.js visuals for cafeteria appliances
 *
 * Creates and manages meshes for vending machine, coffee machine, water station, and tables.
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import {
    SMALL_ROOM_SIZE,
    APPLIANCES,
    ITEMS
} from '../shared/constants.js';

// Layout constants (mirroring server)
const APPLIANCE_SPACING = 3.0;
const TABLE_COUNT = 2;
const TABLE_SPACING = 3.5;

// Appliance order (along one wall)
const APPLIANCE_ORDER = ['vending_machine', 'coffee_machine', 'water_station'];

// Shared materials (initialized once)
let vendingMaterial = null;
let vendingGlassMaterial = null;
let coffeeMaterial = null;
let waterMaterial = null;
let tableMaterial = null;
let tableLegMaterial = null;

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

    vendingGlassMaterial = new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.4
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

    tableLegMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,  // Dark gray (metal legs)
        roughness: 0.5,
        metalness: 0.5
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
 * Create an appliance mesh
 * @param {Object} applianceData - Appliance data from server or getAppliancePositions
 * @returns {THREE.Group} Appliance mesh group
 */
export function createApplianceMesh(applianceData) {
    initMaterials();

    const group = new THREE.Group();
    group.userData.applianceId = applianceData.id;
    group.userData.applianceType = applianceData.applianceType;
    group.userData.objectType = 'appliance';
    group.userData.slots = applianceData.slots || [];

    switch (applianceData.applianceType) {
        case 'vending_machine':
            createVendingMachineGeometry(group);
            break;
        case 'coffee_machine':
            createCoffeeMachineGeometry(group);
            break;
        case 'water_station':
            createWaterStationGeometry(group);
            break;
    }

    group.position.set(
        applianceData.position.x,
        applianceData.position.y,
        applianceData.position.z
    );

    return group;
}

/**
 * Create a table mesh
 * @param {Object} tableData - Table data
 * @returns {THREE.Group} Table mesh group
 */
export function createTableMesh(tableData) {
    initMaterials();

    const group = new THREE.Group();
    group.userData.tableId = tableData.id;
    group.userData.objectType = 'table';

    // Table top
    const topGeom = new THREE.BoxGeometry(2.0, 0.1, 1.2);
    const top = new THREE.Mesh(topGeom, tableMaterial);
    top.position.y = 0.75;
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    // Table legs (4 corners)
    const legGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8);
    const legPositions = [
        { x: -0.85, z: -0.45 },
        { x: 0.85, z: -0.45 },
        { x: -0.85, z: 0.45 },
        { x: 0.85, z: 0.45 }
    ];

    for (const pos of legPositions) {
        const leg = new THREE.Mesh(legGeom, tableLegMaterial);
        leg.position.set(pos.x, 0.35, pos.z);
        leg.castShadow = true;
        group.add(leg);
    }

    group.position.set(
        tableData.position.x,
        tableData.position.y,
        tableData.position.z
    );

    return group;
}

/**
 * Create vending machine geometry
 */
function createVendingMachineGeometry(group) {
    const config = APPLIANCES.vending_machine;

    // Main body
    const bodyGeom = new THREE.BoxGeometry(config.width, config.height, config.depth);
    const body = new THREE.Mesh(bodyGeom, vendingMaterial);
    body.position.y = config.height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Glass front panel
    const glassGeom = new THREE.BoxGeometry(config.width * 0.8, config.height * 0.6, 0.05);
    const glass = new THREE.Mesh(glassGeom, vendingGlassMaterial);
    glass.position.set(0, config.height * 0.55, config.depth / 2);
    group.add(glass);

    // Slot indicators (2 rows x 3 columns = 6 slots)
    const slotPositions = [];
    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
            const x = (col - 1) * 0.4;
            const y = config.height * 0.6 - row * 0.4;
            const z = config.depth / 2 + 0.03;
            slotPositions.push({ x, y, z, index: row * 3 + col });
        }
    }

    group.userData.slotPositions = slotPositions;

    // Dispenser tray at bottom
    const trayGeom = new THREE.BoxGeometry(config.width * 0.7, 0.15, 0.3);
    const tray = new THREE.Mesh(trayGeom, vendingMaterial);
    tray.position.set(0, 0.3, config.depth / 2 + 0.1);
    tray.castShadow = true;
    group.add(tray);
}

/**
 * Create coffee machine geometry
 */
function createCoffeeMachineGeometry(group) {
    const config = APPLIANCES.coffee_machine;

    // Main body
    const bodyGeom = new THREE.BoxGeometry(config.width, config.height, config.depth);
    const body = new THREE.Mesh(bodyGeom, coffeeMaterial);
    body.position.y = config.height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Coffee dispenser spout
    const spoutGeom = new THREE.CylinderGeometry(0.05, 0.08, 0.2, 16);
    const spoutMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const spout = new THREE.Mesh(spoutGeom, spoutMat);
    spout.position.set(0, config.height * 0.4, config.depth / 2 + 0.1);
    spout.castShadow = true;
    group.add(spout);

    // Cup platform
    const platformGeom = new THREE.BoxGeometry(0.3, 0.05, 0.25);
    const platform = new THREE.Mesh(platformGeom, coffeeMaterial);
    platform.position.set(0, 0.2, config.depth / 2 + 0.1);
    platform.receiveShadow = true;
    group.add(platform);

    // Decorative panel with "coffee" indicator
    const panelGeom = new THREE.BoxGeometry(0.4, 0.2, 0.02);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x4a2c2a });  // Coffee brown
    const panel = new THREE.Mesh(panelGeom, panelMat);
    panel.position.set(0, config.height * 0.8, config.depth / 2 + 0.01);
    group.add(panel);
}

/**
 * Create water station geometry
 */
function createWaterStationGeometry(group) {
    const config = APPLIANCES.water_station;

    // Basin/sink base
    const baseGeom = new THREE.BoxGeometry(config.width, config.height * 0.7, config.depth);
    const base = new THREE.Mesh(baseGeom, waterMaterial);
    base.position.y = config.height * 0.35;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Basin depression (slightly darker)
    const basinGeom = new THREE.BoxGeometry(config.width * 0.8, 0.1, config.depth * 0.6);
    const basinMat = new THREE.MeshStandardMaterial({
        color: 0x3a6b8a,
        roughness: 0.2
    });
    const basin = new THREE.Mesh(basinGeom, basinMat);
    basin.position.y = config.height * 0.75;
    group.add(basin);

    // Water surface
    const waterSurfGeom = new THREE.PlaneGeometry(config.width * 0.7, config.depth * 0.5);
    const waterSurfMat = new THREE.MeshStandardMaterial({
        color: 0x5599cc,
        roughness: 0.1,
        metalness: 0.2,
        transparent: true,
        opacity: 0.6
    });
    const waterSurf = new THREE.Mesh(waterSurfGeom, waterSurfMat);
    waterSurf.rotation.x = -Math.PI / 2;
    waterSurf.position.y = config.height * 0.76;
    group.add(waterSurf);

    // Faucet
    const faucetGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8);
    const faucetMat = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.2,
        metalness: 0.8
    });
    const faucet = new THREE.Mesh(faucetGeom, faucetMat);
    faucet.position.set(0, config.height * 0.9, -config.depth * 0.3);
    faucet.castShadow = true;
    group.add(faucet);

    // Faucet spout (bent pipe)
    const spoutGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8);
    const spout = new THREE.Mesh(spoutGeom, faucetMat);
    spout.rotation.x = Math.PI / 2;
    spout.position.set(0, config.height * 0.95, -config.depth * 0.15);
    group.add(spout);
}

/**
 * Update vending machine mesh to show items in slots
 * @param {THREE.Group} group - Appliance mesh group
 * @param {Object} applianceData - Appliance data with slots array
 * @returns {boolean} Whether any changes were made
 */
export function updateApplianceMesh(group, applianceData) {
    if (group.userData.applianceType !== 'vending_machine') {
        return false;
    }

    const slots = applianceData.slots || [];
    const slotPositions = group.userData.slotPositions || [];
    const currentSlotState = group.userData.currentSlotState || [];

    // Check if slots changed
    let changed = false;
    for (let i = 0; i < slotPositions.length; i++) {
        const newSlot = slots[i];
        const oldSlot = currentSlotState[i];
        if ((newSlot && !oldSlot) || (!newSlot && oldSlot) ||
            (newSlot && oldSlot && newSlot.itemType !== oldSlot.itemType)) {
            changed = true;
            break;
        }
    }

    if (!changed) return false;

    // Remove old item meshes
    const toRemove = group.children.filter(c => c.userData.isSlotItem);
    for (const mesh of toRemove) {
        group.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material && !mesh.material.shared) mesh.material.dispose();
    }

    // Add new item meshes
    for (let i = 0; i < slotPositions.length && i < slots.length; i++) {
        const slot = slots[i];
        if (!slot) continue;

        const pos = slotPositions[i];
        const itemDef = ITEMS[slot.itemType] || { color: 0xFFD700 };

        const itemGeom = new THREE.BoxGeometry(0.25, 0.25, 0.1);
        const itemMat = new THREE.MeshStandardMaterial({
            color: itemDef.color,
            roughness: 0.5
        });
        const itemMesh = new THREE.Mesh(itemGeom, itemMat);
        itemMesh.position.set(pos.x, pos.y, pos.z);
        itemMesh.userData.isSlotItem = true;
        itemMesh.castShadow = true;
        group.add(itemMesh);
    }

    // Update tracked state
    group.userData.currentSlotState = slots.map(s => s ? { itemType: s.itemType } : null);
    return true;
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
        // Note: Most materials are shared, only dispose non-shared ones
        if (child.material && !child.material.shared) {
            // Check if it's a unique material (slot items have unique materials)
            if (child.userData.isSlotItem) {
                child.material.dispose();
            }
        }
    });
}

/**
 * Get the interaction prompt for an appliance based on player's held item
 * @param {string} applianceType - Appliance type
 * @param {Object|null} heldItem - Player's held item
 * @returns {Array<Object>} Array of interactions {type, prompt}
 */
export function getApplianceInteractions(applianceType, heldItem) {
    const interactions = [];
    const heldItemType = heldItem ? heldItem.type : null;

    switch (applianceType) {
        case 'vending_machine':
            // Can load if holding food with hunger property
            if (heldItem && heldItemType) {
                const itemDef = ITEMS[heldItemType];
                if (itemDef && itemDef.hunger) {
                    interactions.push({
                        type: 'load_vending',
                        prompt: `Load ${itemDef.name}`
                    });
                }
                // If holding non-food, no vending machine interaction available
            } else if (!heldItem) {
                // Can take if hands empty (prompt shows even if machine empty - server validates)
                interactions.push({
                    type: 'take_vending',
                    prompt: 'Take Food'
                });
            }
            break;

        case 'coffee_machine':
            if (!heldItem) {
                interactions.push({
                    type: 'get_coffee',
                    prompt: 'Get Coffee'
                });
            }
            break;

        case 'water_station':
            // Always can drink water
            interactions.push({
                type: 'drink_water',
                prompt: 'Drink Water'
            });
            // Can refill watering can
            if (heldItemType === 'water_container') {
                interactions.push({
                    type: 'fill_watering_can',
                    prompt: 'Refill Container'
                });
            }
            break;
    }

    return interactions;
}
