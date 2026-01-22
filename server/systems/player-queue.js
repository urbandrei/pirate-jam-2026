/**
 * Player Queue System
 *
 * Manages the queue for players waiting to join a full game.
 * - FIFO (first-in-first-out) priority
 * - Configurable player limit
 * - Handles both new players joining full game and dead players rejoining
 */

const DEFAULT_PLAYER_LIMIT = 10;

const JOIN_TIMEOUT = 30000;  // 30 seconds to walk through door

class PlayerQueue {
    constructor() {
        this.queue = [];  // Array of { peerId, joinedAt, playerType, doorOpenedAt }
        this.playerLimit = DEFAULT_PLAYER_LIMIT;
    }

    /**
     * Set the maximum number of active players
     * @param {number} limit - New player limit (1-50)
     */
    setPlayerLimit(limit) {
        this.playerLimit = Math.max(1, Math.min(50, limit));
        console.log(`[PlayerQueue] Player limit set to ${this.playerLimit}`);
    }

    /**
     * Get current player limit
     * @returns {number}
     */
    getPlayerLimit() {
        return this.playerLimit;
    }

    /**
     * Add a player to the queue
     * @param {string} peerId - Socket ID
     * @param {string} playerType - 'pc' or 'vr'
     * @returns {number} Queue position (1-based)
     */
    addToQueue(peerId, playerType = 'pc') {
        // Don't add if already in queue
        if (this.isInQueue(peerId)) {
            return this.getQueuePosition(peerId);
        }

        this.queue.push({
            peerId,
            playerType,
            joinedAt: Date.now()
        });

        const position = this.queue.length;
        console.log(`[PlayerQueue] Player ${peerId} added to queue at position ${position}`);
        return position;
    }

    /**
     * Remove a player from the queue
     * @param {string} peerId - Socket ID
     * @returns {boolean} True if player was in queue and removed
     */
    removeFromQueue(peerId) {
        const index = this.queue.findIndex(p => p.peerId === peerId);
        if (index !== -1) {
            this.queue.splice(index, 1);
            console.log(`[PlayerQueue] Player ${peerId} removed from queue`);
            return true;
        }
        return false;
    }

    /**
     * Check if player is in queue
     * @param {string} peerId - Socket ID
     * @returns {boolean}
     */
    isInQueue(peerId) {
        return this.queue.some(p => p.peerId === peerId);
    }

    /**
     * Get player's position in queue (1-based)
     * @param {string} peerId - Socket ID
     * @returns {number} Position (1-based) or 0 if not in queue
     */
    getQueuePosition(peerId) {
        const index = this.queue.findIndex(p => p.peerId === peerId);
        return index === -1 ? 0 : index + 1;
    }

    /**
     * Get total number of players waiting
     * @returns {number}
     */
    getQueueLength() {
        return this.queue.length;
    }

    /**
     * Get the next player in queue without removing them
     * @returns {Object|null} Player data or null if queue empty
     */
    peekNextPlayer() {
        return this.queue.length > 0 ? this.queue[0] : null;
    }

    /**
     * Pop and return the next player from queue
     * @returns {Object|null} Player data or null if queue empty
     */
    getNextPlayer() {
        if (this.queue.length === 0) {
            return null;
        }
        const player = this.queue.shift();
        console.log(`[PlayerQueue] Player ${player.peerId} removed from front of queue`);
        return player;
    }

    /**
     * Get queue info for a specific player
     * @param {string} peerId - Socket ID
     * @returns {Object} Queue info
     */
    getQueueInfo(peerId) {
        return {
            position: this.getQueuePosition(peerId),
            total: this.getQueueLength(),
            inQueue: this.isInQueue(peerId)
        };
    }

    /**
     * Get all players currently in queue
     * @returns {Array}
     */
    getAllQueued() {
        return [...this.queue];
    }

    /**
     * Check how many slots are available
     * @param {number} activePlayerCount - Current active players
     * @returns {number} Number of open slots
     */
    getOpenSlots(activePlayerCount) {
        return Math.max(0, this.playerLimit - activePlayerCount);
    }

    /**
     * Clear the entire queue
     */
    clear() {
        const count = this.queue.length;
        this.queue = [];
        console.log(`[PlayerQueue] Queue cleared (${count} players removed)`);
    }

    /**
     * Mark that the door has opened for a player (starts 30s countdown)
     * @param {string} peerId - Socket ID
     */
    markDoorOpened(peerId) {
        const entry = this.queue.find(p => p.peerId === peerId);
        if (entry && !entry.doorOpenedAt) {
            entry.doorOpenedAt = Date.now();
            console.log(`[PlayerQueue] Door opened for ${peerId}`);
        }
    }

    /**
     * Get when the door was opened for a player
     * @param {string} peerId - Socket ID
     * @returns {number|null} Timestamp or null if not opened
     */
    getDoorOpenTime(peerId) {
        const entry = this.queue.find(p => p.peerId === peerId);
        return entry ? entry.doorOpenedAt || null : null;
    }

    /**
     * Check if player has timed out (30s elapsed since door opened)
     * @param {string} peerId - Socket ID
     * @returns {boolean}
     */
    hasTimedOut(peerId) {
        const entry = this.queue.find(p => p.peerId === peerId);
        if (!entry || !entry.doorOpenedAt) return false;
        return Date.now() - entry.doorOpenedAt >= JOIN_TIMEOUT;
    }

    /**
     * Move a player to the back of the queue (after timeout)
     * @param {string} peerId - Socket ID
     */
    moveToBack(peerId) {
        const index = this.queue.findIndex(p => p.peerId === peerId);
        if (index !== -1) {
            const entry = this.queue.splice(index, 1)[0];
            entry.doorOpenedAt = null;  // Reset door timer
            this.queue.push(entry);
            console.log(`[PlayerQueue] Player ${peerId} moved to back of queue (position ${this.queue.length})`);
        }
    }

    /**
     * Reset door timer for a player (when door closes)
     * @param {string} peerId - Socket ID
     */
    resetDoorTimer(peerId) {
        const entry = this.queue.find(p => p.peerId === peerId);
        if (entry) {
            entry.doorOpenedAt = null;
        }
    }
}

module.exports = { PlayerQueue, DEFAULT_PLAYER_LIMIT, JOIN_TIMEOUT };
