/**
 * Plant System - Server-side plant and farming management
 *
 * Handles plant creation, growth, watering, weeds, and soil plot positions.
 * Plants are stored in worldObjects with objectType: 'plant' to distinguish from items.
 */

// Plant constants (mirror of client-side constants)
const PLANT_STAGES = ['seed', 'sprout', 'growing', 'mature', 'harvestable'];
const PLANT_STAGE_THRESHOLDS = [0, 20, 40, 60, 80];
const PLANT_GROWTH_RATE = 100 / 180; // Full growth in ~3 minutes
const PLANT_WATER_DECAY_RATE = 100 / 120; // Water depletes over 2 minutes
const PLANT_WEED_SPAWN_CHANCE = 0.02; // Per second chance (2%)
const PLANT_WATER_GROWTH_MULTIPLIER = 1.5;
const PLANT_DRY_GROWTH_MULTIPLIER = 0.3;
const PLANT_WEED_GROWTH_MULTIPLIER = 0.5;
const PLANT_UPDATE_INTERVAL = 1000; // 1 second
const PLANT_WATER_THRESHOLD = 20;

// Soil plot layout constants
const SMALL_ROOM_SIZE = 10;
const SOIL_PLOT_ROWS = 2;
const SOIL_PLOT_COLS = 3;
const SOIL_PLOT_SPACING_X = 2.5;
const SOIL_PLOT_SPACING_Z = 3.0;

// Track last update time for 1Hz updates
let lastPlantUpdate = 0;

/**
 * Get soil plot positions for a farming cell
 * @param {number} gridX - Cell grid X coordinate
 * @param {number} gridZ - Cell grid Z coordinate
 * @returns {Array} Array of plot objects with id and position
 */
function getSoilPlotPositions(gridX, gridZ) {
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
                    y: 0.01, // Slightly above ground
                    z: cellCenterZ + (row - 0.5) * SOIL_PLOT_SPACING_Z
                }
            });
        }
    }

    return plots;
}

/**
 * Find the soil plot at a given world position
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @param {Object} worldState - World state with grid data
 * @returns {Object|null} Plot object or null if not found/not farming room
 */
function getPlotAtPosition(worldX, worldZ, worldState) {
    // Calculate which grid cell this position is in
    const gridX = Math.round(worldX / SMALL_ROOM_SIZE);
    const gridZ = Math.round(worldZ / SMALL_ROOM_SIZE);

    // Check if this cell is a farming room
    const cellKey = `${gridX},${gridZ}`;
    const cell = worldState.grid.get(cellKey);

    if (!cell || cell.roomType !== 'farming') {
        return null;
    }

    // Get all plots in this cell and find the closest one
    const plots = getSoilPlotPositions(gridX, gridZ);
    let closestPlot = null;
    let closestDistance = Infinity;

    for (const plot of plots) {
        const dx = plot.position.x - worldX;
        const dz = plot.position.z - worldZ;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < closestDistance && distance < 1.5) { // Within 1.5m of plot center
            closestDistance = distance;
            closestPlot = plot;
        }
    }

    return closestPlot;
}

/**
 * Check if a soil plot already has a plant
 * @param {string} soilPlotId - Soil plot ID
 * @param {Map} worldObjects - World objects map
 * @returns {Object|null} Existing plant or null
 */
function getPlantAtPlot(soilPlotId, worldObjects) {
    for (const [id, obj] of worldObjects) {
        if (obj.objectType === 'plant' && obj.soilPlotId === soilPlotId) {
            return obj;
        }
    }
    return null;
}

/**
 * Create a new plant at a soil plot
 * @param {string} soilPlotId - Soil plot ID
 * @param {Object} position - World position {x, y, z}
 * @returns {Object} New plant object
 */
function createPlant(soilPlotId, position) {
    return {
        id: `plant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        objectType: 'plant',
        type: 'vegetable',
        soilPlotId: soilPlotId,
        position: { x: position.x, y: 0.05, z: position.z },
        stage: 'seed',
        growthProgress: 0,
        waterLevel: 50, // Start half-watered
        hasWeeds: false,
        plantedAt: Date.now()
    };
}

/**
 * Get current growth stage based on progress
 * @param {number} growthProgress - Progress 0-100
 * @returns {string} Stage name
 */
function getPlantStage(growthProgress) {
    for (let i = PLANT_STAGE_THRESHOLDS.length - 1; i >= 0; i--) {
        if (growthProgress >= PLANT_STAGE_THRESHOLDS[i]) {
            return PLANT_STAGES[i];
        }
    }
    return PLANT_STAGES[0];
}

/**
 * Update a single plant's growth, water, and weeds
 * @param {Object} plant - Plant object
 * @param {number} deltaSeconds - Time since last update in seconds
 * @returns {boolean} True if plant changed state
 */
function updatePlantGrowth(plant, deltaSeconds) {
    const previousStage = plant.stage;
    let changed = false;

    // Skip if already fully grown
    if (plant.growthProgress >= 100) {
        plant.stage = 'harvestable';
        return plant.stage !== previousStage;
    }

    // Calculate growth rate multipliers
    let growthMultiplier = 1.0;

    // Water affects growth
    if (plant.waterLevel < PLANT_WATER_THRESHOLD) {
        growthMultiplier *= PLANT_DRY_GROWTH_MULTIPLIER;
    } else if (plant.waterLevel > 50) {
        growthMultiplier *= PLANT_WATER_GROWTH_MULTIPLIER;
    }

    // Weeds slow growth
    if (plant.hasWeeds) {
        growthMultiplier *= PLANT_WEED_GROWTH_MULTIPLIER;
    }

    // Apply growth
    const growthAmount = PLANT_GROWTH_RATE * growthMultiplier * deltaSeconds;
    plant.growthProgress = Math.min(100, plant.growthProgress + growthAmount);

    // Update stage
    plant.stage = getPlantStage(plant.growthProgress);

    // Decay water
    plant.waterLevel = Math.max(0, plant.waterLevel - PLANT_WATER_DECAY_RATE * deltaSeconds);

    // Random weed spawn (only if not already weedy)
    if (!plant.hasWeeds && Math.random() < PLANT_WEED_SPAWN_CHANCE * deltaSeconds) {
        plant.hasWeeds = true;
        changed = true;
    }

    return changed || plant.stage !== previousStage;
}

/**
 * Update all plants in worldObjects
 * Called from game loop at network rate, but only runs every PLANT_UPDATE_INTERVAL
 * @param {Map} worldObjects - World objects map
 * @param {number} now - Current timestamp in ms
 * @returns {number} Number of plants updated
 */
function updatePlants(worldObjects, now) {
    // Only update at 1Hz
    if (now - lastPlantUpdate < PLANT_UPDATE_INTERVAL) {
        return 0;
    }

    const deltaSeconds = (now - lastPlantUpdate) / 1000;
    lastPlantUpdate = now;

    let updatedCount = 0;

    for (const [id, obj] of worldObjects) {
        if (obj.objectType !== 'plant') continue;

        const changed = updatePlantGrowth(obj, deltaSeconds);
        if (changed) {
            updatedCount++;
        }
    }

    if (updatedCount > 0) {
        console.log(`[PlantSystem] Updated ${updatedCount} plants`);
    }

    return updatedCount;
}

/**
 * Remove all plants in a specific grid cell
 * Called when a farming room is converted to another type
 * @param {Map} worldObjects - World objects map
 * @param {number} gridX - Cell grid X coordinate
 * @param {number} gridZ - Cell grid Z coordinate
 * @returns {number} Number of plants removed
 */
function cleanupPlantsInCell(worldObjects, gridX, gridZ) {
    const cellCenterX = gridX * SMALL_ROOM_SIZE;
    const cellCenterZ = gridZ * SMALL_ROOM_SIZE;
    const halfCell = SMALL_ROOM_SIZE / 2;
    const toRemove = [];

    for (const [id, obj] of worldObjects) {
        if (obj.objectType !== 'plant') continue;

        // Check if plant is within this cell bounds
        if (obj.position.x >= cellCenterX - halfCell &&
            obj.position.x < cellCenterX + halfCell &&
            obj.position.z >= cellCenterZ - halfCell &&
            obj.position.z < cellCenterZ + halfCell) {
            toRemove.push(id);
        }
    }

    for (const id of toRemove) {
        worldObjects.delete(id);
        console.log(`[PlantSystem] Removed plant ${id} - farming room converted`);
    }

    return toRemove.length;
}

/**
 * Get all plants in worldObjects
 * @param {Map} worldObjects - World objects map
 * @returns {Array} Array of plant objects
 */
function getAllPlants(worldObjects) {
    const plants = [];
    for (const [id, obj] of worldObjects) {
        if (obj.objectType === 'plant') {
            plants.push(obj);
        }
    }
    return plants;
}

/**
 * Create soil plot objects for a farming cell and add to worldObjects
 * @param {number} gridX - Cell grid X coordinate
 * @param {number} gridZ - Cell grid Z coordinate
 * @param {Map} worldObjects - World objects map to add plots to
 * @returns {Array} Array of created soil plot objects
 */
function createSoilPlotsForCell(gridX, gridZ, worldObjects) {
    const plots = getSoilPlotPositions(gridX, gridZ);
    const created = [];

    for (const plot of plots) {
        // Create soil plot object
        const soilPlot = {
            id: plot.id,
            objectType: 'soil_plot',
            position: plot.position,
            gridX: plot.gridX,
            gridZ: plot.gridZ,
            row: plot.row,
            col: plot.col
        };

        worldObjects.set(plot.id, soilPlot);
        created.push(soilPlot);
    }

    console.log(`[PlantSystem] Created ${created.length} soil plots for cell (${gridX}, ${gridZ})`);
    return created;
}

/**
 * Remove soil plots for a cell from worldObjects
 * @param {number} gridX - Cell grid X coordinate
 * @param {number} gridZ - Cell grid Z coordinate
 * @param {Map} worldObjects - World objects map
 * @returns {number} Number of plots removed
 */
function cleanupSoilPlotsInCell(gridX, gridZ, worldObjects) {
    const prefix = `plot_${gridX}_${gridZ}_`;
    const toRemove = [];

    for (const [id, obj] of worldObjects) {
        if (obj.objectType === 'soil_plot' && id.startsWith(prefix)) {
            toRemove.push(id);
        }
    }

    for (const id of toRemove) {
        worldObjects.delete(id);
    }

    if (toRemove.length > 0) {
        console.log(`[PlantSystem] Removed ${toRemove.length} soil plots from cell (${gridX}, ${gridZ})`);
    }

    return toRemove.length;
}

module.exports = {
    PLANT_STAGES,
    PLANT_STAGE_THRESHOLDS,
    getSoilPlotPositions,
    getPlotAtPosition,
    getPlantAtPlot,
    createPlant,
    getPlantStage,
    updatePlantGrowth,
    updatePlants,
    cleanupPlantsInCell,
    getAllPlants,
    createSoilPlotsForCell,
    cleanupSoilPlotsInCell
};
