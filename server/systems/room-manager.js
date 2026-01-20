/**
 * Room Manager - Utility functions for querying room data
 *
 * Provides methods to:
 * - Find room at a world position
 * - Get all players in rooms of a given type
 * - Find nearest room of a specific type
 */

const SMALL_ROOM_SIZE = 10; // Match server/world-state.js

class RoomManager {
    constructor(worldState, gameState) {
        this.worldState = worldState;
        this.gameState = gameState;
    }

    /**
     * Get the room data at a world position
     * @param {number} worldX - World X coordinate
     * @param {number} worldZ - World Z coordinate
     * @returns {Object|null} Cell data or null if no room at position
     */
    getRoomAtPosition(worldX, worldZ) {
        const gridX = Math.round(worldX / SMALL_ROOM_SIZE);
        const gridZ = Math.round(worldZ / SMALL_ROOM_SIZE);

        const key = `${gridX},${gridZ}`;
        return this.worldState.grid.get(key) || null;
    }

    /**
     * Get the room type at a world position
     * @param {number} worldX - World X coordinate
     * @param {number} worldZ - World Z coordinate
     * @returns {string|null} Room type or null
     */
    getRoomTypeAtPosition(worldX, worldZ) {
        const room = this.getRoomAtPosition(worldX, worldZ);
        return room ? room.roomType : null;
    }

    /**
     * Get all players currently in rooms of a given type
     * @param {string} roomType - Room type to search for
     * @returns {Array} Array of player objects in matching rooms
     */
    getPlayersInRoomType(roomType) {
        const players = this.gameState.getAllPlayers();
        return players.filter(player => {
            if (player.type !== 'pc') return false;
            const playerRoomType = this.getRoomTypeAtPosition(
                player.position.x,
                player.position.z
            );
            return playerRoomType === roomType;
        });
    }

    /**
     * Get all cells of a given room type
     * @param {string} roomType - Room type to search for
     * @returns {Array} Array of cell data objects
     */
    getCellsByRoomType(roomType) {
        const cells = [];
        for (const [key, cell] of this.worldState.grid) {
            if (cell.roomType === roomType) {
                const [x, z] = key.split(',').map(Number);
                cells.push({ ...cell, x, z });
            }
        }
        return cells;
    }

    /**
     * Find the nearest room of a specific type to a position
     * @param {Object} position - { x, z } world position
     * @param {string} roomType - Room type to find
     * @returns {Object|null} { cell, distance, worldPosition } or null if none found
     */
    findNearestRoom(position, roomType) {
        const cells = this.getCellsByRoomType(roomType);
        if (cells.length === 0) return null;

        let nearest = null;
        let minDistance = Infinity;

        for (const cell of cells) {
            const cellWorldX = cell.x * SMALL_ROOM_SIZE;
            const cellWorldZ = cell.z * SMALL_ROOM_SIZE;

            const dx = position.x - cellWorldX;
            const dz = position.z - cellWorldZ;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance < minDistance) {
                minDistance = distance;
                nearest = {
                    cell: cell,
                    distance: distance,
                    worldPosition: { x: cellWorldX, z: cellWorldZ }
                };
            }
        }

        return nearest;
    }

    /**
     * Check if a player is inside any room
     * @param {Object} player - Player object with position
     * @returns {boolean} True if player is in a room cell
     */
    isPlayerInRoom(player) {
        return this.getRoomAtPosition(player.position.x, player.position.z) !== null;
    }

    /**
     * Get room statistics
     * @returns {Object} Stats about room types and occupancy
     */
    getRoomStats() {
        const stats = {
            totalCells: 0,
            byType: {},
            playersInRooms: 0,
            playersOutsideRooms: 0
        };

        // Count cells by type
        for (const [key, cell] of this.worldState.grid) {
            stats.totalCells++;
            const type = cell.roomType || 'generic';
            stats.byType[type] = (stats.byType[type] || 0) + 1;
        }

        // Count player locations
        const players = this.gameState.getAllPlayers();
        for (const player of players) {
            if (player.type !== 'pc') continue;
            if (this.isPlayerInRoom(player)) {
                stats.playersInRooms++;
            } else {
                stats.playersOutsideRooms++;
            }
        }

        return stats;
    }
}

module.exports = RoomManager;
