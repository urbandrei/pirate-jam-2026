/**
 * World state management for the building system
 * Manages grid cells, doorways, and wall generation
 */

// Import constants - using require for Node.js compatibility
const SMALL_ROOM_SIZE = 20 / 3; // ~6.67m (ROOM_SIZE / 3)
const WALL_THICKNESS = 0.2;
const DOORWAY_HEIGHT = 1.8 * 1.3; // ~2.34m (PLAYER_HEIGHT * 1.3)
const DOORWAY_WIDTH = 1.2;

// Cell types
const CELL_SPAWN = 'spawn';
const CELL_ROOM = 'room';

class WorldState {
    constructor() {
        this.grid = new Map(); // "x,z" -> cell data
        this.doorways = [];    // Generated doorway list
        this.version = 0;      // Sync version counter

        // Initialize with spawn room at (0,0)
        this.initializeSpawnRoom();
    }

    /**
     * Initialize the spawn room at grid position (0,0)
     */
    initializeSpawnRoom() {
        this.grid.set('0,0', {
            type: CELL_SPAWN,
            roomId: 'spawn',
            addedBy: 'system',
            addedAt: Date.now()
        });
        this.regenerateDoorways();
    }

    /**
     * Attempt to place a block at the given grid position
     * @param {number} gridX - Grid X coordinate
     * @param {number} gridZ - Grid Z coordinate
     * @param {string} blockSize - '1x1' or '1x2'
     * @param {string} playerId - ID of the player placing the block
     * @returns {Object} Result with success flag and details
     */
    placeBlock(gridX, gridZ, blockSize, playerId) {
        // Validation
        if (!this.canPlaceBlock(gridX, gridZ, blockSize)) {
            return { success: false, reason: 'Invalid placement - cells occupied or invalid' };
        }

        // Check adjacency - at least one cell must be adjacent to existing room
        if (!this.isAdjacentToExisting(gridX, gridZ, blockSize)) {
            return { success: false, reason: 'Block must be adjacent to existing rooms' };
        }

        // Place the block(s)
        const cells = this.getBlockCells(gridX, gridZ, blockSize);
        const timestamp = Date.now();

        cells.forEach(({ x, z }) => {
            this.grid.set(`${x},${z}`, {
                type: CELL_ROOM,
                roomId: `room_${x}_${z}`,
                addedBy: playerId,
                addedAt: timestamp
            });
        });

        // Regenerate doorways
        this.regenerateDoorways();

        this.version++;

        return {
            success: true,
            cells: cells,
            doorways: this.doorways,
            version: this.version
        };
    }

    /**
     * Check if a block can be placed at the given position
     */
    canPlaceBlock(gridX, gridZ, blockSize) {
        const cells = this.getBlockCells(gridX, gridZ, blockSize);
        return cells.every(({ x, z }) => !this.grid.has(`${x},${z}`));
    }

    /**
     * Check if at least one cell of the block is adjacent to an existing room
     */
    isAdjacentToExisting(gridX, gridZ, blockSize) {
        const cells = this.getBlockCells(gridX, gridZ, blockSize);

        for (const { x, z } of cells) {
            const neighbors = [
                `${x},${z - 1}`, // north
                `${x},${z + 1}`, // south
                `${x + 1},${z}`, // east
                `${x - 1},${z}`  // west
            ];

            for (const neighborKey of neighbors) {
                if (this.grid.has(neighborKey)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Get all cells that a block would occupy
     */
    getBlockCells(gridX, gridZ, blockSize) {
        if (blockSize === '1x2') {
            return [
                { x: gridX, z: gridZ },
                { x: gridX + 1, z: gridZ }
            ];
        }
        return [{ x: gridX, z: gridZ }];
    }

    /**
     * Regenerate all doorways based on current grid state
     * Doorways are created between all adjacent occupied cells
     */
    regenerateDoorways() {
        this.doorways = [];
        const processed = new Set();

        for (const [key] of this.grid) {
            const [x, z] = key.split(',').map(Number);

            // Check all four directions
            const directions = [
                { dx: 0, dz: -1, wall: 'north' },
                { dx: 0, dz: 1, wall: 'south' },
                { dx: 1, dz: 0, wall: 'east' },
                { dx: -1, dz: 0, wall: 'west' }
            ];

            for (const dir of directions) {
                const nx = x + dir.dx;
                const nz = z + dir.dz;
                const neighborKey = `${nx},${nz}`;

                // Skip if neighbor doesn't exist
                if (!this.grid.has(neighborKey)) continue;

                // Create unique doorway ID (smaller coordinates first for consistency)
                const doorId = this.getDoorwayKey(x, z, nx, nz);

                // Skip if already processed
                if (processed.has(doorId)) continue;
                processed.add(doorId);

                // Calculate doorway world position (on the shared wall)
                const position = this.calculateDoorwayPosition(x, z, dir.wall);

                this.doorways.push({
                    id: doorId,
                    room1: { x, z },
                    room2: { x: nx, z: nz },
                    wall: dir.wall,
                    position: position
                });
            }
        }
    }

    /**
     * Get consistent doorway key regardless of direction
     */
    getDoorwayKey(x1, z1, x2, z2) {
        if (x1 < x2 || (x1 === x2 && z1 < z2)) {
            return `door_${x1},${z1}_${x2},${z2}`;
        }
        return `door_${x2},${z2}_${x1},${z1}`;
    }

    /**
     * Calculate the world position of a doorway
     */
    calculateDoorwayPosition(gridX, gridZ, wall) {
        const worldX = gridX * SMALL_ROOM_SIZE;
        const worldZ = gridZ * SMALL_ROOM_SIZE;
        const half = SMALL_ROOM_SIZE / 2;

        switch (wall) {
            case 'north': return { x: worldX, z: worldZ - half };
            case 'south': return { x: worldX, z: worldZ + half };
            case 'east': return { x: worldX + half, z: worldZ };
            case 'west': return { x: worldX - half, z: worldZ };
            default: return { x: worldX, z: worldZ };
        }
    }

    /**
     * Get the current grid bounds
     */
    getGridBounds() {
        let minX = 0, maxX = 0, minZ = 0, maxZ = 0;

        for (const [key] of this.grid) {
            const [x, z] = key.split(',').map(Number);
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }

        return { minX, maxX, minZ, maxZ };
    }

    /**
     * Convert to serializable format for network transmission
     */
    getSerializableState() {
        const gridArray = [];
        for (const [key, cell] of this.grid) {
            const [x, z] = key.split(',').map(Number);
            gridArray.push({ x, z, ...cell });
        }

        return {
            grid: gridArray,
            doorways: this.doorways,
            bounds: this.getGridBounds(),
            version: this.version
        };
    }

    /**
     * Reset to initial state (spawn room only)
     */
    reset() {
        this.grid.clear();
        this.doorways = [];
        this.version = 0;
        this.initializeSpawnRoom();
    }
}

module.exports = WorldState;
