/**
 * Bed System - Server-side dorm bed management
 *
 * Handles bed creation, positions, occupancy, and sleep mechanics for dorm rooms.
 */

// Layout constants
const SMALL_ROOM_SIZE = 10;
const BED_ROWS = 2;
const BED_COLS = 2;
const BEDS_PER_CELL = BED_ROWS * BED_COLS;  // 4 beds
const BED_SPACING_X = 3.5;
const BED_SPACING_Z = 4.0;
const BED_INTERACTION_RANGE = 2.0;

// Bed dimensions (must match client constants)
const BED_SIZE = { width: 1.0, height: 0.6, depth: 2.0 };

// Sleep multiplier constants
const SLEEP_BASE_MULTIPLIER = 5;     // Base rest restore rate (matches REST_RESTORE_RATE)
const SLEEP_MAX_MULTIPLIER = 10;     // Perfect minigame multiplier

/**
 * Get all bed positions for a dorm room cell
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @returns {Array} Array of bed data {id, position, gridX, gridZ, row, col}
 */
function getBedPositions(gridX, gridZ) {
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
 * Create a bed world object
 * @param {Object} position - World position {x, y, z}
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @param {number} row - Row index in layout
 * @param {number} col - Column index in layout
 * @returns {Object} Bed object
 */
function createBed(position, gridX, gridZ, row, col) {
    const bedIndex = row * BED_COLS + col;
    const bedId = `bed_${gridX}_${gridZ}_${bedIndex}`;

    return {
        id: bedId,
        objectType: 'bed',
        position: { ...position },
        bounds: {
            width: BED_SIZE.width,
            height: BED_SIZE.height,
            depth: BED_SIZE.depth
        },
        gridX: gridX,
        gridZ: gridZ,
        row: row,
        col: col,
        occupant: null,  // Player ID when occupied
        createdAt: Date.now()
    };
}

/**
 * Find the nearest empty bed at a position
 * @param {number} worldX - World X position
 * @param {number} worldZ - World Z position
 * @param {Map} worldObjects - Map of world objects
 * @returns {Object|null} Nearest empty bed or null
 */
function getNearestEmptyBed(worldX, worldZ, worldObjects) {
    let nearest = null;
    let nearestDist = BED_INTERACTION_RANGE;

    for (const [id, obj] of worldObjects) {
        if (obj.objectType !== 'bed') continue;
        if (obj.occupant !== null) continue;  // Skip occupied beds

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
 * Find any bed at a position (occupied or not)
 * @param {number} worldX - World X position
 * @param {number} worldZ - World Z position
 * @param {Map} worldObjects - Map of world objects
 * @returns {Object|null} Nearest bed or null
 */
function getBedAtPosition(worldX, worldZ, worldObjects) {
    let nearest = null;
    let nearestDist = BED_INTERACTION_RANGE;

    for (const [id, obj] of worldObjects) {
        if (obj.objectType !== 'bed') continue;

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
 * Get a bed by its ID
 * @param {string} bedId - Bed ID
 * @param {Map} worldObjects - Map of world objects
 * @returns {Object|null} Bed object or null
 */
function getBedById(bedId, worldObjects) {
    const obj = worldObjects.get(bedId);
    if (obj && obj.objectType === 'bed') {
        return obj;
    }
    return null;
}

/**
 * Get the bed a player is currently sleeping in
 * @param {string} playerId - Player ID
 * @param {Map} worldObjects - Map of world objects
 * @returns {Object|null} Bed object or null
 */
function getBedByOccupant(playerId, worldObjects) {
    for (const [id, obj] of worldObjects) {
        if (obj.objectType === 'bed' && obj.occupant === playerId) {
            return obj;
        }
    }
    return null;
}

/**
 * Start sleeping in a bed
 * @param {Object} bed - Bed object
 * @param {Object} player - Player object
 * @returns {Object} Result {success, error?}
 */
function startSleep(bed, player) {
    if (bed.occupant !== null) {
        return { success: false, error: 'Bed is already occupied' };
    }

    if (player.playerState === 'sleeping') {
        return { success: false, error: 'Player is already sleeping' };
    }

    if (player.playerState === 'waiting') {
        return { success: false, error: 'Dead players cannot sleep' };
    }

    // Occupy the bed
    bed.occupant = player.id;

    // Update player state
    player.playerState = 'sleeping';
    player.sleepingInBed = bed.id;
    player.sleepMultiplier = SLEEP_BASE_MULTIPLIER;  // Default multiplier until minigame
    player.sleepStartTime = Date.now();

    // Lock player position to bed
    player.position.x = bed.position.x;
    player.position.z = bed.position.z;
    player.position.y = BED_SIZE.height;  // On top of bed

    return { success: true };
}

/**
 * Stop sleeping and leave the bed
 * @param {Object} player - Player object
 * @param {Map} worldObjects - Map of world objects
 * @returns {Object} Result {success, error?}
 */
function stopSleep(player, worldObjects) {
    if (player.playerState !== 'sleeping') {
        return { success: false, error: 'Player is not sleeping' };
    }

    // Find and free the bed
    const bed = getBedByOccupant(player.id, worldObjects);
    if (bed) {
        bed.occupant = null;
    }

    // Update player state
    player.playerState = 'playing';
    player.sleepingInBed = null;
    player.sleepMultiplier = null;
    player.sleepStartTime = null;

    // Position player beside the bed
    if (bed) {
        player.position.x = bed.position.x + BED_SIZE.width / 2 + 0.5;
        player.position.z = bed.position.z;
    }
    player.position.y = 0.9;  // Ground level

    return { success: true };
}

/**
 * Update sleep multiplier based on minigame score
 * @param {Object} player - Player object
 * @param {number} score - Minigame score (0-100 percentage)
 */
function updateSleepMultiplier(player, score) {
    if (player.playerState !== 'sleeping') {
        return;
    }

    // Calculate multiplier based on score (linear interpolation)
    // Score 0 = base multiplier, Score 100 = max multiplier
    const normalizedScore = Math.max(0, Math.min(100, score)) / 100;
    player.sleepMultiplier = SLEEP_BASE_MULTIPLIER +
        (SLEEP_MAX_MULTIPLIER - SLEEP_BASE_MULTIPLIER) * normalizedScore;
}

/**
 * Cleanup all beds in a cell (when room is converted)
 * @param {Map} worldObjects - Map of world objects
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @param {Object} gameState - Game state for player cleanup
 * @returns {number} Number of beds removed
 */
function cleanupBedsInCell(worldObjects, gridX, gridZ, gameState = null) {
    const toRemove = [];

    for (const [id, obj] of worldObjects) {
        if (obj.objectType === 'bed' &&
            obj.gridX === gridX &&
            obj.gridZ === gridZ) {

            // Wake up any player sleeping in this bed
            if (obj.occupant && gameState) {
                const player = gameState.pcPlayers.get(obj.occupant);
                if (player && player.playerState === 'sleeping') {
                    stopSleep(player, worldObjects);
                }
            }

            toRemove.push(id);
        }
    }

    for (const id of toRemove) {
        worldObjects.delete(id);
    }

    return toRemove.length;
}

/**
 * Create all beds for a dorm room cell
 * @param {Map} worldObjects - Map of world objects
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @returns {Array} Array of created bed objects
 */
function createBedsForCell(worldObjects, gridX, gridZ) {
    const positions = getBedPositions(gridX, gridZ);
    const created = [];

    for (const pos of positions) {
        const bed = createBed(
            pos.position,
            pos.gridX,
            pos.gridZ,
            pos.row,
            pos.col
        );
        worldObjects.set(bed.id, bed);
        created.push(bed);
    }

    return created;
}

module.exports = {
    BED_ROWS,
    BED_COLS,
    BEDS_PER_CELL,
    BED_SPACING_X,
    BED_SPACING_Z,
    BED_SIZE,
    BED_INTERACTION_RANGE,
    SLEEP_BASE_MULTIPLIER,
    SLEEP_MAX_MULTIPLIER,
    getBedPositions,
    createBed,
    getNearestEmptyBed,
    getBedAtPosition,
    getBedById,
    getBedByOccupant,
    startSleep,
    stopSleep,
    updateSleepMultiplier,
    cleanupBedsInCell,
    createBedsForCell
};
