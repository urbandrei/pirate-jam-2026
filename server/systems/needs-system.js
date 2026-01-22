/**
 * Needs System - Handles survival needs decay for players
 *
 * Needs decay over time:
 * - Hunger: depletes over 10 minutes
 * - Thirst: depletes over 8 minutes
 * - Rest: depletes over 15 minutes
 *
 * When any need hits 0, the player dies.
 */

// Decay rates (units per second)
// These match the constants in public/pc/shared/constants.js
const HUNGER_DECAY_RATE = 100 / 600;  // 0-100 over 10 minutes
const THIRST_DECAY_RATE = 100 / 480;  // 0-100 over 8 minutes
const REST_DECAY_RATE = 100 / 900;    // 0-100 over 15 minutes
const REST_RESTORE_RATE = REST_DECAY_RATE * 5;  // 5x faster when sleeping

/**
 * Update a player's needs based on elapsed time
 * @param {Object} player - The player object from game state
 * @param {number} deltaTime - Time elapsed in seconds
 * @returns {boolean} True if player should die (any need hit 0)
 */
function updateNeeds(player, deltaTime) {
    // Skip if player is not alive or is in waiting room
    if (!player.alive || player.playerState === 'waiting') {
        return false;
    }

    // Skip needs decay for VR players (they're overseers, not survivors)
    if (player.type === 'vr') {
        return false;
    }

    const needs = player.needs;

    // Handle sleeping state - rest restores instead of decaying
    if (player.playerState === 'sleeping') {
        // Use player's sleep multiplier (set by minigame) or default to base rate
        const sleepMultiplier = player.sleepMultiplier || (REST_RESTORE_RATE / REST_DECAY_RATE);
        const effectiveRestoreRate = REST_DECAY_RATE * sleepMultiplier;
        needs.rest = Math.min(100, needs.rest + effectiveRestoreRate * deltaTime);

        // Still decay hunger and thirst while sleeping (can starve in bed)
        needs.hunger = Math.max(0, needs.hunger - HUNGER_DECAY_RATE * deltaTime);
        needs.thirst = Math.max(0, needs.thirst - THIRST_DECAY_RATE * deltaTime);

        // Auto-wake when rest is full
        if (needs.rest >= 100) {
            // Note: The actual wake logic should be handled by bed-system
            // This is just a flag that the game loop should trigger wake
            player.shouldAutoWake = true;
        }
    } else {
        // Normal decay for all needs when playing
        needs.hunger = Math.max(0, needs.hunger - HUNGER_DECAY_RATE * deltaTime);
        needs.thirst = Math.max(0, needs.thirst - THIRST_DECAY_RATE * deltaTime);
        needs.rest = Math.max(0, needs.rest - REST_DECAY_RATE * deltaTime);
    }

    // Check for death condition (any need at 0)
    if (needs.hunger <= 0 || needs.thirst <= 0 || needs.rest <= 0) {
        return true; // Player should die
    }

    return false;
}

/**
 * Calculate aggregate needs statistics for all players
 * @param {Array} players - Array of player objects
 * @returns {Object} Aggregate statistics
 */
function calculateAggregateStats(players) {
    const alivePCPlayers = players.filter(p => p.type === 'pc' && p.alive);

    if (alivePCPlayers.length === 0) {
        return {
            totalPlayers: players.length,
            alivePlayers: 0,
            deadPlayers: players.filter(p => !p.alive).length,
            averageHunger: 0,
            averageThirst: 0,
            averageRest: 0,
            criticalCount: 0
        };
    }

    let totalHunger = 0;
    let totalThirst = 0;
    let totalRest = 0;
    let criticalCount = 0;

    for (const player of alivePCPlayers) {
        totalHunger += player.needs.hunger;
        totalThirst += player.needs.thirst;
        totalRest += player.needs.rest;

        // Count players with any critical need
        if (player.needs.hunger < 20 || player.needs.thirst < 20 || player.needs.rest < 20) {
            criticalCount++;
        }
    }

    return {
        totalPlayers: players.length,
        alivePlayers: alivePCPlayers.length,
        deadPlayers: players.filter(p => !p.alive).length,
        averageHunger: Math.round(totalHunger / alivePCPlayers.length),
        averageThirst: Math.round(totalThirst / alivePCPlayers.length),
        averageRest: Math.round(totalRest / alivePCPlayers.length),
        criticalCount
    };
}

/**
 * Reset a player's needs to full (used on respawn)
 * @param {Object} player - The player object
 */
function resetNeeds(player) {
    player.needs.hunger = 100;
    player.needs.thirst = 100;
    player.needs.rest = 100;
    player.alive = true;
    player.playerState = 'playing';
}

/**
 * Determine the cause of death based on which need hit 0
 * @param {Object} player - The player object
 * @returns {string} Death cause: 'hunger', 'thirst', or 'exhaustion'
 */
function getDeathCause(player) {
    if (player.needs.hunger <= 0) return 'hunger';
    if (player.needs.thirst <= 0) return 'thirst';
    if (player.needs.rest <= 0) return 'exhaustion';
    return 'unknown';
}

module.exports = {
    updateNeeds,
    calculateAggregateStats,
    resetNeeds,
    getDeathCause,
    // Export constants for testing
    HUNGER_DECAY_RATE,
    THIRST_DECAY_RATE,
    REST_DECAY_RATE,
    REST_RESTORE_RATE
};
