/**
 * Interaction System - Server-side validation and execution
 *
 * Handles all player interactions with world objects:
 * - Validates player can perform interaction (range, state, permissions)
 * - Executes interaction effects
 * - Returns available interactions at player position
 */

const itemSystem = require('./item-system');

const INTERACTION_RANGE = 2.0; // meters

class InteractionSystem {
    constructor(gameState, roomManager) {
        this.gameState = gameState;
        this.roomManager = roomManager;
    }

    /**
     * Check if player can perform an interaction
     * @param {Object} player - Player object
     * @param {string} interactionType - Type of interaction
     * @param {string} targetId - ID of target object
     * @param {Object} targetPosition - World position of target {x, y, z}
     * @returns {{ valid: boolean, reason?: string }}
     */
    canInteract(player, interactionType, targetId, targetPosition) {
        // Must be alive and playing
        if (!player.alive) {
            return { valid: false, reason: 'Player is not alive' };
        }

        if (player.playerState !== 'playing') {
            return { valid: false, reason: 'Player not in playing state' };
        }

        // Skip range check for drop_item (target position is where we're dropping, not what we're interacting with)
        if (interactionType !== 'drop_item') {
            // Check range from player position (camera position approximated)
            const playerPos = player.position;
            const eyeHeightOffset = 0.7; // Approximate offset from capsule center to eye
            const dx = targetPosition.x - playerPos.x;
            const dy = targetPosition.y - (playerPos.y + eyeHeightOffset);
            const dz = targetPosition.z - playerPos.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (distance > INTERACTION_RANGE) {
                return { valid: false, reason: 'Target out of range' };
            }
        }

        // Interaction-specific validation (extensible)
        return this._validateSpecificInteraction(player, interactionType, targetId);
    }

    /**
     * Execute an interaction
     * @param {Object} player - Player object
     * @param {string} interactionType - Type of interaction
     * @param {string} targetId - ID of target object
     * @param {Object} targetPosition - World position for drop interactions {x, y, z}
     * @returns {{ success: boolean, result?: any, error?: string }}
     */
    executeInteraction(player, interactionType, targetId, targetPosition) {
        switch (interactionType) {
            case 'sleep':
                return this._executeSleep(player, targetId);
            case 'wake':
                return this._executeWake(player);
            case 'eat':
                return this._executeEat(player, targetId);
            case 'plant_seed':
                return this._executePlantSeed(player, targetId);
            case 'water_plant':
                return this._executeWaterPlant(player, targetId);
            case 'harvest':
                return this._executeHarvest(player, targetId);
            case 'weed':
                return this._executeWeed(player, targetId);
            case 'wash':
                return this._executeWash(player, targetId);
            case 'cut':
                return this._executeCut(player, targetId);
            case 'assemble':
                return this._executeAssemble(player, targetId);
            case 'pickup_food':
            case 'pickup_item':
                return this._executePickup(player, targetId);
            case 'drop_item':
                return this._executeDrop(player, targetPosition);
            default:
                return { success: false, error: `Unknown interaction: ${interactionType}` };
        }
    }

    /**
     * Get available interactions for a player at their current position
     * @param {Object} player - Player object
     * @returns {Array<{ type: string, targetId: string, prompt: string }>}
     */
    getAvailableInteractions(player) {
        const interactions = [];

        // This will be populated when entity systems are implemented
        // For now, return empty array

        return interactions;
    }

    // ============================================
    // Private validation methods
    // ============================================

    _validateSpecificInteraction(player, interactionType, targetId) {
        // Extensible validation - add cases as features are implemented
        switch (interactionType) {
            case 'sleep':
                // Will validate bed exists and is unoccupied when dorm system exists
                return { valid: true };
            case 'wake':
                // Player must be sleeping
                if (player.playerState !== 'sleeping') {
                    return { valid: false, reason: 'Player is not sleeping' };
                }
                return { valid: true };
            case 'eat':
                // Will validate player is holding food when item system exists
                return { valid: true };
            default:
                // Default: allow interaction, execution will handle specifics
                return { valid: true };
        }
    }

    // ============================================
    // Private execution methods - Placeholder implementations
    // These will be completed when their respective systems are built
    // ============================================

    _executeSleep(player, bedId) {
        // Placeholder - will be implemented with dorm room system
        console.log(`[InteractionSystem] Sleep interaction - not yet implemented`);
        return { success: false, error: 'Sleep not yet implemented' };
    }

    _executeWake(player) {
        if (player.playerState === 'sleeping') {
            player.playerState = 'playing';
            console.log(`[InteractionSystem] Player ${player.id} woke up`);
            return { success: true };
        }
        return { success: false, error: 'Player not sleeping' };
    }

    _executeEat(player, itemId) {
        // Placeholder - will be implemented with item system
        console.log(`[InteractionSystem] Eat interaction - not yet implemented`);
        return { success: false, error: 'Eat not yet implemented' };
    }

    _executePlantSeed(player, plotId) {
        // Placeholder - will be implemented with farming room
        console.log(`[InteractionSystem] Plant seed interaction - not yet implemented`);
        return { success: false, error: 'Plant seed not yet implemented' };
    }

    _executeWaterPlant(player, plantId) {
        // Placeholder - will be implemented with farming room
        console.log(`[InteractionSystem] Water plant interaction - not yet implemented`);
        return { success: false, error: 'Water plant not yet implemented' };
    }

    _executeHarvest(player, plantId) {
        // Placeholder - will be implemented with farming room
        console.log(`[InteractionSystem] Harvest interaction - not yet implemented`);
        return { success: false, error: 'Harvest not yet implemented' };
    }

    _executeWeed(player, plantId) {
        // Placeholder - will be implemented with farming room
        console.log(`[InteractionSystem] Weed interaction - not yet implemented`);
        return { success: false, error: 'Weed not yet implemented' };
    }

    _executeWash(player, stationId) {
        // Placeholder - will be implemented with food processing room
        console.log(`[InteractionSystem] Wash interaction - not yet implemented`);
        return { success: false, error: 'Wash not yet implemented' };
    }

    _executeCut(player, stationId) {
        // Placeholder - will be implemented with food processing room
        console.log(`[InteractionSystem] Cut interaction - not yet implemented`);
        return { success: false, error: 'Cut not yet implemented' };
    }

    _executeAssemble(player, stationId) {
        // Placeholder - will be implemented with food processing room
        console.log(`[InteractionSystem] Assemble interaction - not yet implemented`);
        return { success: false, error: 'Assemble not yet implemented' };
    }

    _executePickup(player, itemId) {
        // Get the world object
        const obj = this.gameState.getWorldObject(itemId);
        if (!obj) {
            return { success: false, error: 'Object not found' };
        }

        // Check if player is already holding something
        if (player.heldItem) {
            // Try to stack items
            if (itemSystem.canStackItems(player.heldItem, obj)) {
                const stackedItem = itemSystem.stackItems(player.heldItem, obj);
                if (stackedItem) {
                    // Remove picked up item from world
                    this.gameState.removeWorldObject(itemId);
                    // Update held item to stacked version
                    player.heldItem = stackedItem;
                    console.log(`[InteractionSystem] Player ${player.id} stacked ${obj.type}, now holding ${stackedItem.stackCount}`);
                    return { success: true, item: stackedItem, stacked: true };
                }
            }
            return { success: false, error: 'Items cannot be combined' };
        }

        // Remove from world and attach to player
        this.gameState.removeWorldObject(itemId);
        player.heldItem = obj;

        console.log(`[InteractionSystem] Player ${player.id} picked up ${obj.type} (${itemId})`);
        return { success: true, item: obj };
    }

    _executeDrop(player, targetPosition) {
        // Check if player is holding something
        if (!player.heldItem) {
            return { success: false, error: 'Not holding anything' };
        }

        const item = player.heldItem;

        // Update item position to drop location
        if (targetPosition) {
            item.position = {
                x: targetPosition.x,
                y: targetPosition.y,
                z: targetPosition.z
            };
        } else {
            // Fallback: drop at player position
            item.position = {
                x: player.position.x,
                y: 0.25,
                z: player.position.z
            };
        }

        // Add back to world and clear from player
        this.gameState.addWorldObject(item);
        player.heldItem = null;

        console.log(`[InteractionSystem] Player ${player.id} dropped ${item.type} (${item.id}) at (${item.position.x.toFixed(2)}, ${item.position.y.toFixed(2)}, ${item.position.z.toFixed(2)})`);
        return { success: true, item };
    }
}

module.exports = InteractionSystem;
