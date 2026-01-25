/**
 * Monitor System - Server-side monitor management
 *
 * Handles monitor-to-camera assignments and viewer locking.
 * Monitors persist their camera assignments across viewer sessions.
 * Only one player can view a specific monitor at a time.
 */

class MonitorSystem {
    constructor() {
        // Map of monitorId -> { cameraId, roomCell }
        // Stores which camera each monitor is displaying
        this.monitorConfigs = new Map();

        // Map of monitorId -> playerId
        // Tracks which player is currently viewing each monitor
        this.activeViewers = new Map();
    }

    /**
     * Initialize monitors for a security room cell
     * @param {Object} roomCell - Room cell data { x, z }
     * @param {number} monitorCount - Number of monitors (default 4)
     */
    initializeRoomMonitors(roomCell, monitorCount = 4) {
        for (let i = 0; i < monitorCount; i++) {
            const monitorId = this.generateMonitorId(roomCell, i);
            if (!this.monitorConfigs.has(monitorId)) {
                this.monitorConfigs.set(monitorId, {
                    cameraId: null,
                    roomCell: { x: roomCell.x, z: roomCell.z },
                    index: i
                });
            }
        }
        console.log(`[MonitorSystem] Initialized ${monitorCount} monitors for room at (${roomCell.x}, ${roomCell.z})`);
    }

    /**
     * Generate a consistent monitor ID
     * @param {Object} roomCell - Room cell { x, z }
     * @param {number} index - Monitor index within room (0-3)
     * @returns {string} Monitor ID
     */
    generateMonitorId(roomCell, index) {
        return `monitor_${roomCell.x}_${roomCell.z}_${index}`;
    }

    /**
     * Parse a monitor ID to get room cell and index
     * @param {string} monitorId - Monitor ID
     * @returns {Object|null} { roomCell: {x, z}, index } or null if invalid
     */
    parseMonitorId(monitorId) {
        const match = monitorId.match(/^monitor_(-?\d+)_(-?\d+)_(\d+)$/);
        if (!match) return null;
        return {
            roomCell: { x: parseInt(match[1], 10), z: parseInt(match[2], 10) },
            index: parseInt(match[3], 10)
        };
    }

    /**
     * Assign a camera to a monitor
     * @param {string} monitorId - Monitor ID
     * @param {string|null} cameraId - Camera ID to assign, or null to clear
     * @returns {boolean} Whether assignment was successful
     */
    assignCamera(monitorId, cameraId) {
        const config = this.monitorConfigs.get(monitorId);
        if (!config) {
            console.warn(`[MonitorSystem] Monitor not found: ${monitorId}`);
            return false;
        }

        config.cameraId = cameraId;
        console.log(`[MonitorSystem] Assigned camera ${cameraId} to monitor ${monitorId}`);
        return true;
    }

    /**
     * Get the camera assigned to a monitor
     * @param {string} monitorId - Monitor ID
     * @returns {string|null} Camera ID or null
     */
    getAssignedCamera(monitorId) {
        const config = this.monitorConfigs.get(monitorId);
        return config ? config.cameraId : null;
    }

    /**
     * Lock a monitor for viewing by a player
     * @param {string} monitorId - Monitor ID
     * @param {string} playerId - Player ID requesting the lock
     * @returns {boolean} True if lock acquired, false if already locked by another player
     */
    lockViewer(monitorId, playerId) {
        const existingViewer = this.activeViewers.get(monitorId);
        if (existingViewer && existingViewer !== playerId) {
            console.log(`[MonitorSystem] Monitor ${monitorId} already locked by ${existingViewer}`);
            return false;
        }

        this.activeViewers.set(monitorId, playerId);
        console.log(`[MonitorSystem] Player ${playerId} locked monitor ${monitorId}`);
        return true;
    }

    /**
     * Release a monitor viewer lock
     * @param {string} monitorId - Monitor ID
     * @param {string} playerId - Player ID releasing the lock
     * @returns {boolean} True if released, false if not locked by this player
     */
    releaseViewer(monitorId, playerId) {
        const currentViewer = this.activeViewers.get(monitorId);
        if (currentViewer !== playerId) {
            return false;
        }

        this.activeViewers.delete(monitorId);
        console.log(`[MonitorSystem] Player ${playerId} released monitor ${monitorId}`);
        return true;
    }

    /**
     * Get who is viewing a monitor
     * @param {string} monitorId - Monitor ID
     * @returns {string|null} Player ID or null
     */
    getViewer(monitorId) {
        return this.activeViewers.get(monitorId) || null;
    }

    /**
     * Check if a monitor is being viewed
     * @param {string} monitorId - Monitor ID
     * @returns {boolean}
     */
    isLocked(monitorId) {
        return this.activeViewers.has(monitorId);
    }

    /**
     * Get monitor config
     * @param {string} monitorId - Monitor ID
     * @returns {Object|null} { cameraId, roomCell, index } or null
     */
    getConfig(monitorId) {
        return this.monitorConfigs.get(monitorId) || null;
    }

    /**
     * Get all monitor configs for a room
     * @param {Object} roomCell - Room cell { x, z }
     * @returns {Array} Array of { monitorId, cameraId, index }
     */
    getRoomMonitors(roomCell) {
        const result = [];
        for (const [monitorId, config] of this.monitorConfigs) {
            if (config.roomCell.x === roomCell.x && config.roomCell.z === roomCell.z) {
                result.push({
                    monitorId,
                    cameraId: config.cameraId,
                    index: config.index
                });
            }
        }
        return result.sort((a, b) => a.index - b.index);
    }

    /**
     * Get all monitor configs for state updates
     * @returns {Array} Array of { monitorId, cameraId, roomCell, index, viewerId }
     */
    getAllMonitorsForStateUpdate() {
        const result = [];
        for (const [monitorId, config] of this.monitorConfigs) {
            result.push({
                monitorId,
                cameraId: config.cameraId,
                roomCell: config.roomCell,
                index: config.index,
                viewerId: this.activeViewers.get(monitorId) || null
            });
        }
        return result;
    }

    /**
     * Clean up all viewer locks for a disconnected player
     * @param {string} playerId - Disconnected player ID
     * @returns {Array} Array of monitor IDs that were released
     */
    cleanupPlayerViewers(playerId) {
        const releasedMonitors = [];
        for (const [monitorId, viewerId] of this.activeViewers) {
            if (viewerId === playerId) {
                this.activeViewers.delete(monitorId);
                releasedMonitors.push(monitorId);
            }
        }
        if (releasedMonitors.length > 0) {
            console.log(`[MonitorSystem] Released ${releasedMonitors.length} monitors for disconnected player: ${playerId}`);
        }
        return releasedMonitors;
    }

    /**
     * Clean up monitors for a room that no longer exists
     * @param {Object} roomCell - Room cell { x, z }
     * @returns {Array} Array of removed monitor IDs
     */
    cleanupRoomMonitors(roomCell) {
        const removedMonitors = [];
        for (const [monitorId, config] of this.monitorConfigs) {
            if (config.roomCell.x === roomCell.x && config.roomCell.z === roomCell.z) {
                this.monitorConfigs.delete(monitorId);
                this.activeViewers.delete(monitorId);
                removedMonitors.push(monitorId);
            }
        }
        if (removedMonitors.length > 0) {
            console.log(`[MonitorSystem] Removed ${removedMonitors.length} monitors for room at (${roomCell.x}, ${roomCell.z})`);
        }
        return removedMonitors;
    }
}

module.exports = { MonitorSystem };
