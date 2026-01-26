/**
 * Station System - Server-side processing station management
 *
 * Handles station creation, positions, and assembly logic for processing rooms.
 */

const itemSystem = require('./item-system');

// Station configuration (mirror of client-side constants)
const STATION_TYPES = {
    WASH: 'wash_station',
    CUT: 'cut_station',
    ASSEMBLY: 'assembly_station'
};

const STATIONS = {
    wash_station: {
        name: 'Wash Station',
        color: 0x4169E1,
        interactionTime: 4000,
        inputItem: 'raw_vegetable',
        outputItem: 'washed_vegetable',
        width: 1.2,
        height: 0.9,
        depth: 0.8
    },
    cut_station: {
        name: 'Cutting Board',
        color: 0x8B4513,
        interactionTime: 5000,
        inputItem: 'washed_vegetable',
        outputItem: 'prepared_vegetable',
        width: 1.4,
        height: 0.75,
        depth: 0.9
    },
    assembly_station: {
        name: 'Assembly Counter',
        color: 0xC0C0C0,
        inputItem: 'prepared_vegetable',
        width: 1.6,
        height: 0.87,
        depth: 1.0
    }
};

const RECIPES = {
    1: 'basic_meal',
    2: 'standard_meal',
    3: 'quality_meal'
};

// Layout constants
const SMALL_ROOM_SIZE = 10;
const STATION_ROWS = 2;
const STATION_COLS = 3;
const STATION_SPACING_X = 2.5;
const STATION_SPACING_Z = 3.0;
const STATION_INTERACTION_RANGE = 1.5;

// Station type order for grid layout: wash, cut, assembly (one row each type)
const STATION_ORDER = [
    STATION_TYPES.WASH,
    STATION_TYPES.CUT,
    STATION_TYPES.ASSEMBLY
];

/**
 * Get all station positions for a processing room cell
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @returns {Array} Array of station data {id, position, stationType, gridX, gridZ, row, col}
 */
function getStationPositions(gridX, gridZ) {
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
 * Create a station world object
 * @param {string} stationType - Type of station
 * @param {Object} position - World position {x, y, z}
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @param {number} row - Row index in layout
 * @param {number} col - Column index in layout
 * @returns {Object} Station object
 */
function createStation(stationType, position, gridX, gridZ, row, col) {
    const stationId = `station_${stationType}_${gridX}_${gridZ}_${row}_${col}`;
    const config = STATIONS[stationType];

    return {
        id: stationId,
        objectType: 'station',
        stationType: stationType,
        position: { ...position },
        bounds: {
            width: config.width,
            height: config.height,
            depth: config.depth
        },
        gridX: gridX,
        gridZ: gridZ,
        row: row,
        col: col,
        ingredients: [],  // Only used by assembly stations
        createdAt: Date.now()
    };
}

/**
 * Find the nearest station of a given type at a position
 * @param {number} worldX - World X position
 * @param {number} worldZ - World Z position
 * @param {Map} worldObjects - Map of world objects
 * @param {string} stationType - Optional: filter by station type
 * @returns {Object|null} Nearest station or null
 */
function getStationAtPosition(worldX, worldZ, worldObjects, stationType = null) {
    let nearest = null;
    let nearestDist = STATION_INTERACTION_RANGE;

    for (const [id, obj] of worldObjects) {
        if (obj.objectType !== 'station') continue;
        if (stationType && obj.stationType !== stationType) continue;

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
 * Get a station by its ID
 * @param {string} stationId - Station ID
 * @param {Map} worldObjects - Map of world objects
 * @returns {Object|null} Station object or null
 */
function getStationById(stationId, worldObjects) {
    const obj = worldObjects.get(stationId);
    if (obj && obj.objectType === 'station') {
        return obj;
    }
    return null;
}

/**
 * Add an ingredient to an assembly station
 * @param {Object} station - Assembly station object
 * @param {Object} item - Item to add
 * @returns {Object} Result {success, recipe?, resultItem?}
 */
function addIngredient(station, item) {
    if (station.stationType !== STATION_TYPES.ASSEMBLY) {
        return { success: false, error: 'Not an assembly station' };
    }

    const stationConfig = STATIONS[station.stationType];
    if (item.type !== stationConfig.inputItem) {
        return { success: false, error: `Station only accepts ${stationConfig.inputItem}` };
    }

    // Add ingredient (store type, not full item)
    station.ingredients.push(item.type);

    // Check if we have a complete recipe
    const ingredientCount = station.ingredients.length;
    const recipeOutput = RECIPES[ingredientCount];

    if (recipeOutput) {
        // Recipe complete - create output and clear station
        const resultItem = itemSystem.createItem(recipeOutput, station.position);
        station.ingredients = [];

        return {
            success: true,
            recipeComplete: true,
            ingredientCount: ingredientCount,
            resultItem: resultItem
        };
    }

    // Ingredient added but recipe not complete yet

    return {
        success: true,
        recipeComplete: false,
        ingredientCount: ingredientCount
    };
}

/**
 * Clear ingredients from an assembly station
 * @param {Object} station - Assembly station object
 */
function clearAssembly(station) {
    if (station.stationType === STATION_TYPES.ASSEMBLY) {
        station.ingredients = [];
    }
}

/**
 * Cleanup all stations in a cell (when room is converted)
 * @param {Map} worldObjects - Map of world objects
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @returns {number} Number of stations removed
 */
function cleanupStationsInCell(worldObjects, gridX, gridZ) {
    const toRemove = [];

    for (const [id, obj] of worldObjects) {
        if (obj.objectType === 'station' &&
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
 * Create all stations for a processing room cell and add to world objects
 * @param {Map} worldObjects - Map of world objects
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @returns {Array} Array of created station objects
 */
function createStationsForCell(worldObjects, gridX, gridZ) {
    const positions = getStationPositions(gridX, gridZ);
    const created = [];

    for (const pos of positions) {
        const station = createStation(
            pos.stationType,
            pos.position,
            pos.gridX,
            pos.gridZ,
            pos.row,
            pos.col
        );
        worldObjects.set(station.id, station);
        created.push(station);
    }

    return created;
}

/**
 * Get station configuration
 * @param {string} stationType - Station type
 * @returns {Object|null} Station config or null
 */
function getStationConfig(stationType) {
    return STATIONS[stationType] || null;
}

module.exports = {
    STATION_TYPES,
    STATIONS,
    RECIPES,
    STATION_INTERACTION_RANGE,
    getStationPositions,
    createStation,
    getStationAtPosition,
    getStationById,
    addIngredient,
    clearAssembly,
    cleanupStationsInCell,
    createStationsForCell,
    getStationConfig
};
