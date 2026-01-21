/**
 * Interaction System - Server-side validation and execution
 *
 * Handles all player interactions with world objects:
 * - Validates player can perform interaction (range, state, permissions)
 * - Executes interaction effects
 * - Returns available interactions at player position
 */

const itemSystem = require('./item-system');
const plantSystem = require('./plant-system');

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
            case 'plant_seed':
                // Must be holding a seed
                if (!player.heldItem || player.heldItem.type !== 'seed') {
                    return { valid: false, reason: 'Must be holding a seed' };
                }
                return { valid: true };
            case 'water_plant':
                // Must be holding water container with charges
                if (!player.heldItem || player.heldItem.type !== 'water_container') {
                    return { valid: false, reason: 'Must be holding a water container' };
                }
                if (player.heldItem.charges !== undefined && player.heldItem.charges <= 0) {
                    return { valid: false, reason: 'Water container is empty' };
                }
                return { valid: true };
            case 'harvest':
                // Must have empty hands
                if (player.heldItem) {
                    return { valid: false, reason: 'Hands must be empty to harvest' };
                }
                // Validate plant is harvestable
                const harvestPlant = this.gameState.getWorldObject(targetId);
                if (!harvestPlant || harvestPlant.objectType !== 'plant') {
                    return { valid: false, reason: 'Not a plant' };
                }
                if (harvestPlant.stage !== 'harvestable') {
                    return { valid: false, reason: 'Plant is not ready to harvest' };
                }
                return { valid: true };
            case 'weed':
                // Validate plant has weeds
                const weedPlant = this.gameState.getWorldObject(targetId);
                if (!weedPlant || weedPlant.objectType !== 'plant') {
                    return { valid: false, reason: 'Not a plant' };
                }
                if (!weedPlant.hasWeeds) {
                    return { valid: false, reason: 'Plant has no weeds' };
                }
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
        // Validate player holds seed
        if (!player.heldItem || player.heldItem.type !== 'seed') {
            return { success: false, error: 'Must be holding a seed' };
        }

        // Parse plot ID to get grid position (format: plot_gridX_gridZ_row_col)
        const parts = plotId.split('_');
        if (parts.length !== 5 || parts[0] !== 'plot') {
            return { success: false, error: 'Invalid plot ID' };
        }

        const gridX = parseInt(parts[1]);
        const gridZ = parseInt(parts[2]);

        // Verify this is a farming room
        const cellKey = `${gridX},${gridZ}`;
        const cell = this.gameState.worldState.grid.get(cellKey);
        if (!cell || cell.roomType !== 'farming') {
            return { success: false, error: 'Plot is not in a farming room' };
        }

        // Check if plot already has a plant
        const existingPlant = plantSystem.getPlantAtPlot(plotId, this.gameState.worldObjects);
        if (existingPlant) {
            return { success: false, error: 'Plot already has a plant' };
        }

        // Get plot position
        const plots = plantSystem.getSoilPlotPositions(gridX, gridZ);
        const plot = plots.find(p => p.id === plotId);
        if (!plot) {
            return { success: false, error: 'Plot not found' };
        }

        // Create plant and add to world
        const plant = plantSystem.createPlant(plotId, plot.position);
        this.gameState.addWorldObject(plant);

        // Consume seed (reduce stack or remove)
        if (player.heldItem.stackCount > 1) {
            player.heldItem.stackCount--;
        } else {
            player.heldItem = null;
        }

        console.log(`[InteractionSystem] Player ${player.id} planted seed at ${plotId}`);
        return { success: true, plant };
    }

    _executeWaterPlant(player, plantId) {
        // Validate player holds water container
        if (!player.heldItem || player.heldItem.type !== 'water_container') {
            return { success: false, error: 'Must be holding a water container' };
        }

        // Check water container has charges
        if (player.heldItem.charges !== undefined && player.heldItem.charges <= 0) {
            return { success: false, error: 'Water container is empty' };
        }

        // Get plant from world objects
        const plant = this.gameState.getWorldObject(plantId);
        if (!plant || plant.objectType !== 'plant') {
            return { success: false, error: 'Plant not found' };
        }

        // Water the plant
        plant.waterLevel = 100;

        // Consume water charge
        if (player.heldItem.charges !== undefined) {
            player.heldItem.charges--;
            if (player.heldItem.charges <= 0) {
                // Container is now empty, could remove or keep as empty container
                console.log(`[InteractionSystem] Water container empty`);
            }
        }

        console.log(`[InteractionSystem] Player ${player.id} watered plant ${plantId}`);
        return { success: true };
    }

    _executeHarvest(player, plantId) {
        // Validate player has empty hands
        if (player.heldItem) {
            return { success: false, error: 'Hands must be empty to harvest' };
        }

        // Get plant from world objects
        const plant = this.gameState.getWorldObject(plantId);
        if (!plant || plant.objectType !== 'plant') {
            return { success: false, error: 'Plant not found' };
        }

        // Validate plant is harvestable
        if (plant.stage !== 'harvestable') {
            return { success: false, error: 'Plant is not ready to harvest' };
        }

        // Remove plant from world
        this.gameState.removeWorldObject(plantId);

        // Create vegetable item and give to player
        const vegetable = itemSystem.createItem('raw_vegetable', plant.position);
        player.heldItem = vegetable;

        console.log(`[InteractionSystem] Player ${player.id} harvested plant ${plantId}`);
        return { success: true, item: vegetable };
    }

    _executeWeed(player, plantId) {
        // Get plant from world objects
        const plant = this.gameState.getWorldObject(plantId);
        if (!plant || plant.objectType !== 'plant') {
            return { success: false, error: 'Plant not found' };
        }

        // Validate plant has weeds
        if (!plant.hasWeeds) {
            return { success: false, error: 'Plant has no weeds' };
        }

        // Remove weeds
        plant.hasWeeds = false;

        console.log(`[InteractionSystem] Player ${player.id} removed weeds from plant ${plantId}`);
        return { success: true };
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
