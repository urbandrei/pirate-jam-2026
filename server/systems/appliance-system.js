/**
 * Appliance System - Server-side cafeteria appliance management
 *
 * Handles appliance creation, positions, and interactions for cafeteria rooms.
 * Includes: Vending Machine, Coffee Machine, Water Station
 */

const itemSystem = require('./item-system');

// Appliance types
const APPLIANCE_TYPES = {
    VENDING_MACHINE: 'vending_machine',
    COFFEE_MACHINE: 'coffee_machine',
    WATER_STATION: 'water_station'
};

// Appliance configuration
const APPLIANCES = {
    vending_machine: {
        name: 'Vending Machine',
        color: 0x808080,
        slots: 6,
        width: 1.5,
        height: 2.0,
        depth: 0.8
    },
    coffee_machine: {
        name: 'Coffee Machine',
        color: 0x2F4F4F,
        width: 0.8,
        height: 1.2,
        depth: 0.6
    },
    water_station: {
        name: 'Water Station',
        color: 0x4682B4,
        width: 1.2,
        height: 1.0,
        depth: 0.8,
        thirstRestore: 30
    }
};

// Layout constants
const SMALL_ROOM_SIZE = 10;
const APPLIANCE_SPACING = 3.0;
const APPLIANCE_INTERACTION_RANGE = 2.0;

// Appliance order (along one wall)
const APPLIANCE_ORDER = [
    APPLIANCE_TYPES.VENDING_MACHINE,
    APPLIANCE_TYPES.COFFEE_MACHINE,
    APPLIANCE_TYPES.WATER_STATION
];

// Table configuration
const TABLE_COUNT = 2;
const TABLE_SPACING = 3.5;

/**
 * Get all appliance positions for a cafeteria room cell
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @returns {Array} Array of appliance data {id, position, applianceType, gridX, gridZ}
 */
function getAppliancePositions(gridX, gridZ) {
    const appliances = [];
    const cellCenterX = gridX * SMALL_ROOM_SIZE;
    const cellCenterZ = gridZ * SMALL_ROOM_SIZE;

    // Place appliances along the -Z wall (back wall)
    const wallZ = cellCenterZ - SMALL_ROOM_SIZE / 2 + 1.0;  // 1m from wall
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
 * @returns {Array} Array of table data {id, position, gridX, gridZ}
 */
function getTablePositions(gridX, gridZ) {
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
                z: cellCenterZ + 1.5  // Slightly toward +Z side
            }
        });
    }

    return tables;
}

/**
 * Create an appliance world object
 * @param {string} applianceType - Type of appliance
 * @param {Object} position - World position {x, y, z}
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @returns {Object} Appliance object
 */
function createAppliance(applianceType, position, gridX, gridZ) {
    const applianceId = `appliance_${applianceType}_${gridX}_${gridZ}`;
    const config = APPLIANCES[applianceType];

    const appliance = {
        id: applianceId,
        objectType: 'appliance',
        applianceType: applianceType,
        position: { ...position },
        bounds: {
            width: config.width,
            height: config.height,
            depth: config.depth
        },
        gridX: gridX,
        gridZ: gridZ,
        createdAt: Date.now()
    };

    // Vending machine has slots for food items
    if (applianceType === APPLIANCE_TYPES.VENDING_MACHINE) {
        appliance.slots = new Array(config.slots).fill(null);
    }

    return appliance;
}

/**
 * Create a table world object
 * @param {Object} position - World position {x, y, z}
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @param {number} index - Table index in room
 * @returns {Object} Table object
 */
function createTable(position, gridX, gridZ, index) {
    return {
        id: `table_${gridX}_${gridZ}_${index}`,
        objectType: 'table',
        position: { ...position },
        gridX: gridX,
        gridZ: gridZ,
        createdAt: Date.now()
    };
}

/**
 * Find the nearest appliance of a given type at a position
 * @param {number} worldX - World X position
 * @param {number} worldZ - World Z position
 * @param {Map} worldObjects - Map of world objects
 * @param {string} applianceType - Optional: filter by appliance type
 * @returns {Object|null} Nearest appliance or null
 */
function getApplianceAtPosition(worldX, worldZ, worldObjects, applianceType = null) {
    let nearest = null;
    let nearestDist = APPLIANCE_INTERACTION_RANGE;

    for (const [id, obj] of worldObjects) {
        if (obj.objectType !== 'appliance') continue;
        if (applianceType && obj.applianceType !== applianceType) continue;

        const dx = obj.position.x - worldX;
        const dz = obj.position.z - worldZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = obj;
        }
    }

    return nearest;
}

/**
 * Get an appliance by its ID
 * @param {string} applianceId - Appliance ID
 * @param {Map} worldObjects - Map of world objects
 * @returns {Object|null} Appliance object or null
 */
function getApplianceById(applianceId, worldObjects) {
    const obj = worldObjects.get(applianceId);
    if (obj && obj.objectType === 'appliance') {
        return obj;
    }
    return null;
}

/**
 * Load a food item into a vending machine slot
 * @param {Object} appliance - Vending machine appliance
 * @param {Object} item - Item to load
 * @param {number} slotIndex - Optional slot index (auto-finds empty if not specified)
 * @returns {Object} Result {success, slotIndex?, error?}
 */
function loadVendingMachine(appliance, item, slotIndex = null) {
    if (appliance.applianceType !== APPLIANCE_TYPES.VENDING_MACHINE) {
        return { success: false, error: 'Not a vending machine' };
    }

    // Check if item is food (has hunger property)
    const itemConfig = itemSystem.ITEMS[item.type];
    if (!itemConfig || !itemConfig.hunger) {
        return { success: false, error: 'Only food items can be loaded into vending machine' };
    }

    // Find empty slot if not specified
    if (slotIndex === null) {
        slotIndex = appliance.slots.findIndex(slot => slot === null);
        if (slotIndex === -1) {
            return { success: false, error: 'Vending machine is full' };
        }
    } else {
        // Validate specified slot
        if (slotIndex < 0 || slotIndex >= appliance.slots.length) {
            return { success: false, error: 'Invalid slot index' };
        }
        if (appliance.slots[slotIndex] !== null) {
            return { success: false, error: 'Slot is already occupied' };
        }
    }

    // Store item in slot
    appliance.slots[slotIndex] = {
        itemType: item.type,
        loadedAt: Date.now()
    };

    return {
        success: true,
        slotIndex: slotIndex
    };
}

/**
 * Take a food item from a vending machine slot
 * @param {Object} appliance - Vending machine appliance
 * @param {number} slotIndex - Slot index to take from
 * @returns {Object} Result {success, item?, error?}
 */
function takeFromVendingMachine(appliance, slotIndex) {
    if (appliance.applianceType !== APPLIANCE_TYPES.VENDING_MACHINE) {
        return { success: false, error: 'Not a vending machine' };
    }

    if (slotIndex < 0 || slotIndex >= appliance.slots.length) {
        return { success: false, error: 'Invalid slot index' };
    }

    const slotData = appliance.slots[slotIndex];
    if (slotData === null) {
        return { success: false, error: 'Slot is empty' };
    }

    // Create item for player
    const item = itemSystem.createItem(slotData.itemType, appliance.position);
    appliance.slots[slotIndex] = null;

    return {
        success: true,
        item: item
    };
}

/**
 * Get the first occupied slot in a vending machine
 * @param {Object} appliance - Vending machine appliance
 * @returns {number} Slot index or -1 if empty
 */
function getFirstOccupiedSlot(appliance) {
    if (appliance.applianceType !== APPLIANCE_TYPES.VENDING_MACHINE) {
        return -1;
    }
    return appliance.slots.findIndex(slot => slot !== null);
}

/**
 * Dispense coffee from coffee machine
 * @param {Object} appliance - Coffee machine appliance
 * @returns {Object} Result {success, item?, error?}
 */
function dispenseCoffee(appliance) {
    if (appliance.applianceType !== APPLIANCE_TYPES.COFFEE_MACHINE) {
        return { success: false, error: 'Not a coffee machine' };
    }

    const item = itemSystem.createItem('coffee', appliance.position);

    return {
        success: true,
        item: item
    };
}

/**
 * Get appliance configuration
 * @param {string} applianceType - Appliance type
 * @returns {Object|null} Appliance config or null
 */
function getApplianceConfig(applianceType) {
    return APPLIANCES[applianceType] || null;
}

/**
 * Cleanup all appliances and tables in a cell (when room is converted)
 * @param {Map} worldObjects - Map of world objects
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @returns {number} Number of objects removed
 */
function cleanupAppliancesInCell(worldObjects, gridX, gridZ) {
    const toRemove = [];

    for (const [id, obj] of worldObjects) {
        if ((obj.objectType === 'appliance' || obj.objectType === 'table') &&
            obj.gridX === gridX &&
            obj.gridZ === gridZ) {
            toRemove.push(id);
        }
    }

    for (const id of toRemove) {
        worldObjects.delete(id);
    }

    return toRemove.length;
}

/**
 * Create all appliances and tables for a cafeteria room cell
 * @param {Map} worldObjects - Map of world objects
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @returns {Array} Array of created objects
 */
function createAppliancesForCell(worldObjects, gridX, gridZ) {
    const created = [];

    // Create appliances
    const appliancePositions = getAppliancePositions(gridX, gridZ);
    for (const pos of appliancePositions) {
        const appliance = createAppliance(
            pos.applianceType,
            pos.position,
            pos.gridX,
            pos.gridZ
        );
        worldObjects.set(appliance.id, appliance);
        created.push(appliance);
    }

    // Create tables
    const tablePositions = getTablePositions(gridX, gridZ);
    for (let i = 0; i < tablePositions.length; i++) {
        const pos = tablePositions[i];
        const table = createTable(pos.position, pos.gridX, pos.gridZ, i);
        worldObjects.set(table.id, table);
        created.push(table);
    }

    return created;
}

module.exports = {
    APPLIANCE_TYPES,
    APPLIANCES,
    APPLIANCE_INTERACTION_RANGE,
    getAppliancePositions,
    getTablePositions,
    createAppliance,
    createTable,
    getApplianceAtPosition,
    getApplianceById,
    loadVendingMachine,
    takeFromVendingMachine,
    getFirstOccupiedSlot,
    dispenseCoffee,
    getApplianceConfig,
    cleanupAppliancesInCell,
    createAppliancesForCell
};
