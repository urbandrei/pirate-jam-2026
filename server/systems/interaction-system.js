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
const stationSystem = require('./station-system');
const applianceSystem = require('./appliance-system');
const bedSystem = require('./bed-system');

const INTERACTION_RANGE = 2.0; // meters

class InteractionSystem {
    constructor(gameState, roomManager, isDevMode = false, playerQueue = null) {
        this.gameState = gameState;
        this.roomManager = roomManager;
        this.isDevMode = isDevMode;
        this.playerQueue = playerQueue;

        // Timed interaction tracking: playerId -> { stationId, stationType, startTime, duration, targetPosition, inputItem }
        this.timedInteractions = new Map();
    }

    /**
     * Set the player queue reference (for join_game interaction)
     * @param {PlayerQueue} queue
     */
    setPlayerQueue(queue) {
        this.playerQueue = queue;
    }

    // ============================================
    // Timed Interaction Methods
    // ============================================

    /**
     * Start a timed interaction (wash/cut stations)
     * @param {Object} player - Player object
     * @param {string} interactionType - 'wash' or 'cut'
     * @param {string} stationId - Station ID
     * @param {Object} targetPosition - Station position
     * @returns {{ success: boolean, duration?: number, error?: string }}
     */
    startTimedInteraction(player, interactionType, stationId, targetPosition) {
        // Check if player already has active timed interaction
        if (this.timedInteractions.has(player.id)) {
            return { success: false, error: 'Already in a timed interaction' };
        }

        // Get station
        const station = stationSystem.getStationById(stationId, this.gameState.worldObjects);
        if (!station) {
            return { success: false, error: 'Station not found' };
        }

        const stationConfig = stationSystem.getStationConfig(station.stationType);
        if (!stationConfig) {
            return { success: false, error: 'Invalid station type' };
        }

        // Validate player holds correct input item
        if (!player.heldItem || player.heldItem.type !== stationConfig.inputItem) {
            return { success: false, error: `Must be holding ${stationConfig.inputItem}` };
        }

        // Validate station type matches interaction type
        if (interactionType === 'wash' && station.stationType !== stationSystem.STATION_TYPES.WASH) {
            return { success: false, error: 'Not a wash station' };
        }
        if (interactionType === 'cut' && station.stationType !== stationSystem.STATION_TYPES.CUT) {
            return { success: false, error: 'Not a cutting station' };
        }

        // Store the input item and start timed interaction
        const inputItem = player.heldItem;
        player.heldItem = null; // Item is "in use" at station

        this.timedInteractions.set(player.id, {
            playerId: player.id,
            stationId: stationId,
            stationType: station.stationType,
            interactionType: interactionType,
            startTime: Date.now(),
            duration: stationConfig.interactionTime,
            targetPosition: targetPosition,
            inputItem: inputItem
        });

        console.log(`[InteractionSystem] Player ${player.id} started ${interactionType} at ${stationId} (${stationConfig.interactionTime}ms)`);

        return {
            success: true,
            duration: stationConfig.interactionTime
        };
    }

    /**
     * Update timed interactions and complete any that are done
     * Called from game loop
     * @param {number} now - Current timestamp
     * @returns {Array} Array of completed interactions
     */
    updateTimedInteractions(now) {
        const completed = [];

        for (const [playerId, timedData] of this.timedInteractions) {
            const elapsed = now - timedData.startTime;

            if (elapsed >= timedData.duration) {
                // Interaction complete
                const result = this._completeTimedInteraction(playerId, timedData);
                completed.push({
                    playerId: playerId,
                    interactionType: timedData.interactionType,
                    stationId: timedData.stationId,
                    result: result
                });
            }
        }

        return completed;
    }

    /**
     * Complete a timed interaction and give output item
     * @param {string} playerId - Player ID
     * @param {Object} timedData - Timed interaction data
     * @returns {Object} Result with output item
     */
    _completeTimedInteraction(playerId, timedData) {
        const player = this.gameState.getPlayer(playerId);
        if (!player) {
            this.timedInteractions.delete(playerId);
            return { success: false, error: 'Player not found' };
        }

        const stationConfig = stationSystem.getStationConfig(timedData.stationType);
        if (!stationConfig || !stationConfig.outputItem) {
            this.timedInteractions.delete(playerId);
            return { success: false, error: 'Invalid station config' };
        }

        // Create output item and give to player
        const outputItem = itemSystem.createItem(stationConfig.outputItem, player.position);
        player.heldItem = outputItem;

        // Remove from active timed interactions
        this.timedInteractions.delete(playerId);

        console.log(`[InteractionSystem] Player ${playerId} completed ${timedData.interactionType}: ${timedData.inputItem.type} -> ${stationConfig.outputItem}`);

        return {
            success: true,
            item: outputItem
        };
    }

    /**
     * Cancel a player's timed interaction and return their item
     * @param {string} playerId - Player ID
     * @returns {{ cancelled: boolean, reason?: string }}
     */
    cancelTimedInteraction(playerId) {
        const timedData = this.timedInteractions.get(playerId);
        if (!timedData) {
            return { cancelled: false, reason: 'No active timed interaction' };
        }

        const player = this.gameState.getPlayer(playerId);
        if (player) {
            // Return the input item to player
            player.heldItem = timedData.inputItem;
        }

        this.timedInteractions.delete(playerId);

        console.log(`[InteractionSystem] Cancelled timed interaction for player ${playerId}`);

        return { cancelled: true };
    }

    /**
     * Check if player has an active timed interaction
     * @param {string} playerId - Player ID
     * @returns {boolean}
     */
    hasTimedInteraction(playerId) {
        return this.timedInteractions.has(playerId);
    }

    /**
     * Get a player's current timed interaction
     * @param {string} playerId - Player ID
     * @returns {Object|null}
     */
    getTimedInteraction(playerId) {
        return this.timedInteractions.get(playerId) || null;
    }

    /**
     * Check if a player is within range of their timed interaction target
     * @param {string} playerId - Player ID
     * @returns {boolean}
     */
    isPlayerInTimedInteractionRange(playerId) {
        const timedData = this.timedInteractions.get(playerId);
        if (!timedData) return true; // No interaction, so not out of range

        const player = this.gameState.getPlayer(playerId);
        if (!player) return false;

        const dx = player.position.x - timedData.targetPosition.x;
        const dz = player.position.z - timedData.targetPosition.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        return distance <= INTERACTION_RANGE;
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
        // join_game is a special case - allowed when dead/waiting
        if (interactionType === 'join_game') {
            // Must be in waiting room state
            if (player.playerState !== 'dead' && player.playerState !== 'waiting') {
                return { valid: false, reason: 'Not in waiting room' };
            }
            // Distance validated client-side (waiting room is local-only experience)
            return { valid: true };
        }

        // Must be alive for other interactions
        if (!player.alive) {
            return { valid: false, reason: 'Player is not alive' };
        }

        // Wake is allowed when sleeping, all other interactions require playing state
        if (interactionType === 'wake') {
            if (player.playerState !== 'sleeping') {
                return { valid: false, reason: 'Player is not sleeping' };
            }
            // Skip range check for wake - player is in bed
            return { valid: true };
        }

        if (player.playerState !== 'playing') {
            return { valid: false, reason: 'Player not in playing state' };
        }

        // Skip range check for drop_item (target position is where we're dropping, not what we're interacting with)
        if (interactionType !== 'drop_item') {
            // Try to get the target object to check bounds
            const targetObj = targetId ? this.gameState.getWorldObject(targetId) : null;

            if (!this._isInInteractionRange(player, targetPosition, targetObj)) {
                return { valid: false, reason: 'Target out of range' };
            }
        }

        // Interaction-specific validation (extensible)
        return this._validateSpecificInteraction(player, interactionType, targetId);
    }

    /**
     * Check if player is within interaction range of a target
     * Uses bounding box if available, otherwise point distance
     * @param {Object} player - Player object
     * @param {Object} targetPosition - Target position {x, y, z}
     * @param {Object|null} targetObj - Target object (may have bounds)
     * @returns {boolean} True if in range
     */
    _isInInteractionRange(player, targetPosition, targetObj) {
        const playerPos = player.position;
        const eyePos = {
            x: playerPos.x,
            y: playerPos.y + 0.7,
            z: playerPos.z
        };

        // If target has bounds, check distance to nearest point on bounding box
        if (targetObj && targetObj.bounds) {
            const bounds = targetObj.bounds;
            const objPos = targetObj.position;

            // Calculate nearest point on bounding box to player
            const boxMin = {
                x: objPos.x - bounds.width / 2,
                y: objPos.y,
                z: objPos.z - bounds.depth / 2
            };
            const boxMax = {
                x: objPos.x + bounds.width / 2,
                y: objPos.y + bounds.height,
                z: objPos.z + bounds.depth / 2
            };

            // Clamp player position to box bounds to find nearest point
            const nearestX = Math.max(boxMin.x, Math.min(eyePos.x, boxMax.x));
            const nearestY = Math.max(boxMin.y, Math.min(eyePos.y, boxMax.y));
            const nearestZ = Math.max(boxMin.z, Math.min(eyePos.z, boxMax.z));

            const dx = eyePos.x - nearestX;
            const dy = eyePos.y - nearestY;
            const dz = eyePos.z - nearestZ;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            return distance <= INTERACTION_RANGE;
        }

        // Fallback: 2D distance for appliances without bounds, 3D for others
        const dx = targetPosition.x - playerPos.x;
        const dz = targetPosition.z - playerPos.z;

        if (targetObj && (targetObj.objectType === 'appliance' || targetObj.objectType === 'station')) {
            // 2D horizontal distance for appliances/stations
            const distance = Math.sqrt(dx * dx + dz * dz);
            return distance <= INTERACTION_RANGE;
        }

        // 3D distance for other objects
        const eyeHeightOffset = 0.7;
        const dy = targetPosition.y - (playerPos.y + eyeHeightOffset);
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return distance <= INTERACTION_RANGE;
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
            case 'drink_coffee':
                return this._executeDrinkCoffee(player);
            case 'drink_container':
                return this._executeDrinkContainer(player);
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
            // Cafeteria appliance interactions
            case 'load_vending':
                return this._executeLoadVending(player, targetId);
            case 'take_vending':
                return this._executeTakeVending(player, targetId);
            case 'get_coffee':
                return this._executeGetCoffee(player, targetId);
            case 'drink_water':
                return this._executeDrinkWater(player, targetId);
            case 'fill_watering_can':
                return this._executeFillWateringCan(player, targetId);
            case 'join_game':
                return this._executeJoinGame(player);
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
                // Validate bed exists and is unoccupied
                const bed = bedSystem.getBedById(targetId, this.gameState.worldObjects);
                if (!bed) {
                    return { valid: false, reason: 'Bed not found' };
                }
                if (bed.occupant !== null) {
                    return { valid: false, reason: 'Bed is already occupied' };
                }
                return { valid: true };
            case 'wake':
                // Player must be sleeping
                if (player.playerState !== 'sleeping') {
                    return { valid: false, reason: 'Player is not sleeping' };
                }
                return { valid: true };
            case 'eat':
                // Player must be holding food (item with hunger property)
                if (!player.heldItem) {
                    return { valid: false, reason: 'Not holding anything' };
                }
                const eatItemConfig = itemSystem.ITEMS[player.heldItem.type];
                if (!eatItemConfig || !eatItemConfig.hunger) {
                    return { valid: false, reason: 'Not holding food' };
                }
                return { valid: true };
            case 'drink_coffee':
                // Player must be holding coffee
                if (!player.heldItem || player.heldItem.type !== 'coffee') {
                    return { valid: false, reason: 'Not holding coffee' };
                }
                return { valid: true };
            case 'drink_container':
                // Player must be holding water container with charges
                if (!player.heldItem || player.heldItem.type !== 'water_container') {
                    return { valid: false, reason: 'Not holding water container' };
                }
                if (player.heldItem.charges !== undefined && player.heldItem.charges <= 0) {
                    return { valid: false, reason: 'Water container is empty' };
                }
                return { valid: true };
            case 'load_vending':
                // Must be holding food to load
                if (!player.heldItem) {
                    return { valid: false, reason: 'Not holding anything' };
                }
                const loadItemConfig = itemSystem.ITEMS[player.heldItem.type];
                if (!loadItemConfig || !loadItemConfig.hunger) {
                    return { valid: false, reason: 'Can only load food items' };
                }
                return { valid: true };
            case 'take_vending':
                // Must have empty hands
                if (player.heldItem) {
                    return { valid: false, reason: 'Hands must be empty' };
                }
                return { valid: true };
            case 'get_coffee':
                // Must have empty hands
                if (player.heldItem) {
                    return { valid: false, reason: 'Hands must be empty' };
                }
                return { valid: true };
            case 'drink_water':
                // No restrictions - anyone can drink
                return { valid: true };
            case 'fill_watering_can':
                // Must be holding empty water container
                if (!player.heldItem || player.heldItem.type !== 'water_container') {
                    return { valid: false, reason: 'Must be holding a water container' };
                }
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
        // Get bed from world objects
        const bed = bedSystem.getBedById(bedId, this.gameState.worldObjects);
        if (!bed) {
            return { success: false, error: 'Bed not found' };
        }

        // Start sleeping using bed system
        const result = bedSystem.startSleep(bed, player);

        if (result.success) {
            console.log(`[InteractionSystem] Player ${player.id} started sleeping in bed ${bedId}`);
            return {
                success: true,
                bedId: bedId,
                position: bed.position
            };
        }

        return { success: false, error: result.error };
    }

    _executeWake(player) {
        if (player.playerState !== 'sleeping') {
            return { success: false, error: 'Player not sleeping' };
        }

        // Stop sleeping using bed system
        const result = bedSystem.stopSleep(player, this.gameState.worldObjects);

        if (result.success) {
            console.log(`[InteractionSystem] Player ${player.id} woke up`);
            return { success: true };
        }

        return { success: false, error: result.error };
    }

    _executeEat(player, itemId) {
        // Validate player is holding food
        if (!player.heldItem) {
            return { success: false, error: 'Not holding anything' };
        }

        const itemConfig = itemSystem.ITEMS[player.heldItem.type];
        if (!itemConfig || !itemConfig.hunger) {
            return { success: false, error: 'Not holding food' };
        }

        // Restore hunger
        const hungerRestored = itemConfig.hunger;
        player.needs.hunger = Math.min(100, player.needs.hunger + hungerRestored);

        // Consume item
        if (player.heldItem.stackCount > 1) {
            player.heldItem.stackCount--;
        } else {
            player.heldItem = null;
        }

        console.log(`[InteractionSystem] Player ${player.id} ate ${itemConfig.name}, restored ${hungerRestored} hunger (now ${player.needs.hunger.toFixed(1)})`);
        return {
            success: true,
            hungerRestored: hungerRestored,
            currentHunger: player.needs.hunger
        };
    }

    _executeDrinkCoffee(player) {
        // Validate player is holding coffee
        if (!player.heldItem || player.heldItem.type !== 'coffee') {
            return { success: false, error: 'Not holding coffee' };
        }

        const itemConfig = itemSystem.ITEMS.coffee;
        const restRestored = itemConfig.rest || 25;

        // Restore rest
        player.needs.rest = Math.min(100, player.needs.rest + restRestored);

        // Consume coffee
        if (player.heldItem.stackCount > 1) {
            player.heldItem.stackCount--;
        } else {
            player.heldItem = null;
        }

        console.log(`[InteractionSystem] Player ${player.id} drank coffee, restored ${restRestored} rest (now ${player.needs.rest.toFixed(1)})`);
        return {
            success: true,
            restRestored: restRestored,
            currentRest: player.needs.rest
        };
    }

    _executeDrinkContainer(player) {
        // Validate player is holding water container
        if (!player.heldItem || player.heldItem.type !== 'water_container') {
            return { success: false, error: 'Not holding water container' };
        }

        // Check charges
        if (player.heldItem.charges !== undefined && player.heldItem.charges <= 0) {
            return { success: false, error: 'Water container is empty' };
        }

        const itemConfig = itemSystem.ITEMS.water_container;
        const thirstRestored = itemConfig.thirst || 40;

        // Restore thirst
        player.needs.thirst = Math.min(100, player.needs.thirst + thirstRestored);

        // Consume one charge
        if (player.heldItem.charges !== undefined) {
            player.heldItem.charges--;
        }

        console.log(`[InteractionSystem] Player ${player.id} drank from water container, restored ${thirstRestored} thirst (now ${player.needs.thirst.toFixed(1)}, charges: ${player.heldItem.charges})`);
        return {
            success: true,
            thirstRestored: thirstRestored,
            currentThirst: player.needs.thirst,
            chargesRemaining: player.heldItem.charges
        };
    }

    // ============================================
    // Cafeteria appliance execution methods
    // ============================================

    _executeLoadVending(player, applianceId) {
        // Get vending machine
        const appliance = applianceSystem.getApplianceById(applianceId, this.gameState.worldObjects);
        if (!appliance || appliance.applianceType !== applianceSystem.APPLIANCE_TYPES.VENDING_MACHINE) {
            return { success: false, error: 'Vending machine not found' };
        }

        // Validate player has food to load
        if (!player.heldItem) {
            return { success: false, error: 'Not holding anything' };
        }

        const itemConfig = itemSystem.ITEMS[player.heldItem.type];
        if (!itemConfig || !itemConfig.hunger) {
            return { success: false, error: 'Can only load food items' };
        }

        // Load item into vending machine
        const result = applianceSystem.loadVendingMachine(appliance, player.heldItem);

        if (result.success) {
            // Remove item from player
            if (player.heldItem.stackCount > 1) {
                player.heldItem.stackCount--;
            } else {
                player.heldItem = null;
            }

            console.log(`[InteractionSystem] Player ${player.id} loaded food into vending machine slot ${result.slotIndex}`);
            return {
                success: true,
                slotIndex: result.slotIndex
            };
        }

        return { success: false, error: result.error };
    }

    _executeTakeVending(player, applianceId) {
        // Get vending machine
        const appliance = applianceSystem.getApplianceById(applianceId, this.gameState.worldObjects);
        if (!appliance || appliance.applianceType !== applianceSystem.APPLIANCE_TYPES.VENDING_MACHINE) {
            return { success: false, error: 'Vending machine not found' };
        }

        // Validate player has empty hands
        if (player.heldItem) {
            return { success: false, error: 'Hands must be empty' };
        }

        // Find first occupied slot
        const slotIndex = applianceSystem.getFirstOccupiedSlot(appliance);
        if (slotIndex === -1) {
            return { success: false, error: 'Vending machine is empty' };
        }

        // Take item from vending machine
        const result = applianceSystem.takeFromVendingMachine(appliance, slotIndex);

        if (result.success) {
            // Give item to player
            player.heldItem = result.item;

            console.log(`[InteractionSystem] Player ${player.id} took ${result.item.type} from vending machine`);
            return {
                success: true,
                item: result.item
            };
        }

        return { success: false, error: result.error };
    }

    _executeGetCoffee(player, applianceId) {
        // Get coffee machine
        const appliance = applianceSystem.getApplianceById(applianceId, this.gameState.worldObjects);
        if (!appliance || appliance.applianceType !== applianceSystem.APPLIANCE_TYPES.COFFEE_MACHINE) {
            return { success: false, error: 'Coffee machine not found' };
        }

        // Validate player has empty hands
        if (player.heldItem) {
            return { success: false, error: 'Hands must be empty' };
        }

        // Dispense coffee
        const result = applianceSystem.dispenseCoffee(appliance);

        if (result.success) {
            // Give coffee to player
            player.heldItem = result.item;

            console.log(`[InteractionSystem] Player ${player.id} got coffee from machine`);
            return {
                success: true,
                item: result.item
            };
        }

        return { success: false, error: result.error };
    }

    _executeDrinkWater(player, applianceId) {
        // Get water station
        const appliance = applianceSystem.getApplianceById(applianceId, this.gameState.worldObjects);
        if (!appliance || appliance.applianceType !== applianceSystem.APPLIANCE_TYPES.WATER_STATION) {
            return { success: false, error: 'Water station not found' };
        }

        const applianceConfig = applianceSystem.getApplianceConfig(appliance.applianceType);
        const thirstRestored = applianceConfig.thirstRestore || 30;

        // Restore thirst
        player.needs.thirst = Math.min(100, player.needs.thirst + thirstRestored);

        console.log(`[InteractionSystem] Player ${player.id} drank from water station, restored ${thirstRestored} thirst (now ${player.needs.thirst.toFixed(1)})`);
        return {
            success: true,
            thirstRestored: thirstRestored,
            currentThirst: player.needs.thirst
        };
    }

    _executeFillWateringCan(player, applianceId) {
        // Get water station
        const appliance = applianceSystem.getApplianceById(applianceId, this.gameState.worldObjects);
        if (!appliance || appliance.applianceType !== applianceSystem.APPLIANCE_TYPES.WATER_STATION) {
            return { success: false, error: 'Water station not found' };
        }

        // Validate player is holding water container
        if (!player.heldItem || player.heldItem.type !== 'water_container') {
            return { success: false, error: 'Must be holding a water container' };
        }

        const itemConfig = itemSystem.ITEMS.water_container;
        const maxCharges = itemConfig.charges || 3;

        // Refill to max charges
        player.heldItem.charges = maxCharges;

        console.log(`[InteractionSystem] Player ${player.id} refilled water container to ${maxCharges} charges`);
        return {
            success: true,
            charges: maxCharges
        };
    }

    /**
     * Execute join_game interaction (walking through waiting room door)
     * @param {Object} player - Player object
     * @returns {{ success: boolean, error?: string }}
     */
    _executeJoinGame(player) {
        // Validate player is in waiting room
        if (player.playerState !== 'dead' && player.playerState !== 'waiting') {
            return { success: false, error: 'Not in waiting room' };
        }

        // Check cooldown
        const DEATH_COOLDOWN = 60000;  // 1 minute
        const cooldownRemaining = (player.deathTime || 0) + DEATH_COOLDOWN - Date.now();
        if (cooldownRemaining > 0) {
            return { success: false, error: 'On cooldown' };
        }

        // Check queue position
        if (!this.playerQueue) {
            return { success: false, error: 'Queue system not available' };
        }

        if (this.playerQueue.getQueuePosition(player.id) !== 1) {
            return { success: false, error: 'Not first in queue' };
        }

        // Check if game has space
        if (!this.gameState.canAcceptPlayer()) {
            return { success: false, error: 'Game full' };
        }

        // Success - remove from queue and reactivate player
        this.playerQueue.removeFromQueue(player.id);

        // Reset player state
        player.alive = true;
        player.playerState = 'playing';
        player.deathTime = null;

        // Reset needs to full
        player.needs = {
            hunger: 100,
            thirst: 100,
            rest: 100
        };

        // Teleport to spawn in main world
        player.position = { x: 0, y: 0.9, z: 0 };
        player.velocity = { x: 0, y: 0, z: 0 };

        console.log(`[InteractionSystem] Player ${player.id} rejoined game through door`);
        return { success: true };
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
        // Wash is a timed interaction - this method should not be called directly
        // Instead, use startTimedInteraction for wash/cut
        // This is here for compatibility with the regular interaction flow
        const station = stationSystem.getStationById(stationId, this.gameState.worldObjects);
        if (!station || station.stationType !== stationSystem.STATION_TYPES.WASH) {
            return { success: false, error: 'Not a wash station' };
        }

        const stationConfig = stationSystem.getStationConfig(station.stationType);
        if (!player.heldItem || player.heldItem.type !== stationConfig.inputItem) {
            return { success: false, error: `Must be holding ${stationConfig.inputItem}` };
        }

        // Signal that this is a timed interaction
        return {
            success: false,
            error: 'Use timed interaction for wash',
            requiresTimed: true,
            duration: stationConfig.interactionTime
        };
    }

    _executeCut(player, stationId) {
        // Cut is a timed interaction - this method should not be called directly
        // Instead, use startTimedInteraction for wash/cut
        const station = stationSystem.getStationById(stationId, this.gameState.worldObjects);
        if (!station || station.stationType !== stationSystem.STATION_TYPES.CUT) {
            return { success: false, error: 'Not a cutting station' };
        }

        const stationConfig = stationSystem.getStationConfig(station.stationType);
        if (!player.heldItem || player.heldItem.type !== stationConfig.inputItem) {
            return { success: false, error: `Must be holding ${stationConfig.inputItem}` };
        }

        // Signal that this is a timed interaction
        return {
            success: false,
            error: 'Use timed interaction for cut',
            requiresTimed: true,
            duration: stationConfig.interactionTime
        };
    }

    _executeAssemble(player, stationId) {
        // Assembly is instant - player drops ingredient on station
        const station = stationSystem.getStationById(stationId, this.gameState.worldObjects);
        if (!station || station.stationType !== stationSystem.STATION_TYPES.ASSEMBLY) {
            return { success: false, error: 'Not an assembly station' };
        }

        const stationConfig = stationSystem.getStationConfig(station.stationType);
        if (!player.heldItem || player.heldItem.type !== stationConfig.inputItem) {
            return { success: false, error: `Must be holding ${stationConfig.inputItem}` };
        }

        // Take item from player and add to assembly station
        const item = player.heldItem;
        player.heldItem = null;

        const result = stationSystem.addIngredient(station, item);

        if (result.success && result.recipeComplete) {
            // Give the result item to player
            player.heldItem = result.resultItem;
            console.log(`[InteractionSystem] Player ${player.id} assembled ${result.resultItem.type} from ${result.ingredientCount} ingredients`);
            return {
                success: true,
                recipeComplete: true,
                item: result.resultItem,
                ingredientCount: result.ingredientCount
            };
        } else if (result.success) {
            // Ingredient added but recipe not complete
            console.log(`[InteractionSystem] Player ${player.id} added ingredient to assembly (${result.ingredientCount}/3)`);
            return {
                success: true,
                recipeComplete: false,
                ingredientCount: result.ingredientCount
            };
        }

        // Failed to add
        player.heldItem = item; // Return item to player
        return { success: false, error: result.error };
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

    // ============================================
    // Server-Authoritative Interaction Detection
    // ============================================

    /**
     * Test if a ray intersects an axis-aligned bounding box
     * @param {Object} rayOrigin - {x, y, z}
     * @param {Object} rayDir - normalized direction {x, y, z}
     * @param {Object} boxMin - {x, y, z} minimum corner
     * @param {Object} boxMax - {x, y, z} maximum corner
     * @param {number} maxDist - maximum ray distance to check
     * @returns {number|null} Distance to intersection, or null if no hit
     */
    _rayBoxIntersection(rayOrigin, rayDir, boxMin, boxMax, maxDist) {
        let tmin = -Infinity;
        let tmax = Infinity;

        for (const axis of ['x', 'y', 'z']) {
            if (Math.abs(rayDir[axis]) < 0.0001) {
                // Ray parallel to slab - check if origin is inside
                if (rayOrigin[axis] < boxMin[axis] || rayOrigin[axis] > boxMax[axis]) {
                    return null;
                }
            } else {
                const invD = 1.0 / rayDir[axis];
                let t0 = (boxMin[axis] - rayOrigin[axis]) * invD;
                let t1 = (boxMax[axis] - rayOrigin[axis]) * invD;
                if (invD < 0) [t0, t1] = [t1, t0];
                tmin = Math.max(tmin, t0);
                tmax = Math.min(tmax, t1);
                if (tmax < tmin) return null;
            }
        }

        // Check if intersection is within valid range
        if (tmax < 0) return null;  // Box is behind the ray
        if (tmin > maxDist) return null;  // Box is beyond max range

        // If tmin < 0, ray origin is inside the box - return tmax (exit point)
        // Otherwise return tmin (entry point)
        const hitDist = tmin < 0 ? tmax : tmin;

        return hitDist <= maxDist ? hitDist : null;
    }

    /**
     * Get the interaction target the player is looking at
     * @param {Object} player - Player object with position and lookRotation
     * @param {Map} worldObjects - Map of world objects
     * @returns {Object|null} { targetId, targetType, interactions[], position } or null
     */
    getTargetedInteraction(player, worldObjects) {
        const ANGLE_TOLERANCE = 0.3; // radians (~17 degrees)

        const eyePos = {
            x: player.position.x,
            y: player.position.y + 0.7, // eye height offset from capsule center
            z: player.position.z
        };

        // Look direction from pitch (x) and yaw (y)
        const pitch = player.lookRotation?.x || 0;
        const yaw = player.lookRotation?.y || 0;
        const lookDir = {
            x: -Math.sin(yaw) * Math.cos(pitch),
            y: Math.sin(pitch),
            z: -Math.cos(yaw) * Math.cos(pitch)
        };

        let closest = null;
        let closestDist = INTERACTION_RANGE;

        for (const [id, obj] of worldObjects) {
            // Skip non-interactable objects
            if (!this._isInteractable(obj)) continue;

            // Get object position
            const objPos = obj.position;
            if (!objPos) continue;

            let hitDist = null;

            // Use bounding box if available (appliances, beds)
            if (obj.bounds) {
                const boxMin = {
                    x: objPos.x - obj.bounds.width / 2,
                    y: objPos.y,  // Position is at base
                    z: objPos.z - obj.bounds.depth / 2
                };
                const boxMax = {
                    x: objPos.x + obj.bounds.width / 2,
                    y: objPos.y + obj.bounds.height,
                    z: objPos.z + obj.bounds.depth / 2
                };
                hitDist = this._rayBoxIntersection(eyePos, lookDir, boxMin, boxMax, INTERACTION_RANGE);
            } else {
                // Fallback to point-based targeting for objects without bounds
                const toObj = {
                    x: objPos.x - eyePos.x,
                    y: objPos.y - eyePos.y,
                    z: objPos.z - eyePos.z
                };

                const dist = Math.sqrt(toObj.x * toObj.x + toObj.y * toObj.y + toObj.z * toObj.z);
                if (dist > INTERACTION_RANGE || dist < 0.1) continue;

                // Normalize and check angle
                const toObjNorm = { x: toObj.x / dist, y: toObj.y / dist, z: toObj.z / dist };
                const dot = lookDir.x * toObjNorm.x + lookDir.y * toObjNorm.y + lookDir.z * toObjNorm.z;
                const angle = Math.acos(Math.min(1, Math.max(-1, dot)));

                if (angle < ANGLE_TOLERANCE) {
                    hitDist = dist;
                }
            }

            if (hitDist !== null && hitDist < closestDist) {
                const interactions = this._getInteractionsForObject(obj, player);
                if (interactions.length > 0) {
                    closest = {
                        targetId: id,
                        targetType: obj.objectType,
                        interactions: interactions,
                        position: objPos
                    };
                    closestDist = hitDist;
                }
            }
        }

        return closest;
    }

    /**
     * Check if an object is interactable
     * @param {Object} obj - World object
     * @returns {boolean}
     */
    _isInteractable(obj) {
        // Objects with explicit objectType
        if (['plant', 'station', 'appliance', 'bed', 'soil_plot'].includes(obj.objectType)) {
            return true;
        }
        // Items have 'type' field (like 'seed', 'raw_vegetable') but no objectType
        // Check if it looks like an item (has type, position, and id starting with 'item_')
        if (obj.type && obj.position && obj.id && obj.id.startsWith('item_')) {
            return true;
        }
        return false;
    }

    /**
     * Get available interactions for an object based on player state
     * @param {Object} obj - World object
     * @param {Object} player - Player object
     * @returns {Array} Array of { type, prompt }
     */
    _getInteractionsForObject(obj, player) {
        const interactions = [];
        const heldItem = player.heldItem;

        // Handle items (they have 'type' but no 'objectType')
        if (!obj.objectType && obj.type && obj.id?.startsWith('item_')) {
            if (!heldItem) {
                const itemDef = itemSystem.getItemDefinition(obj.type);
                const name = itemDef ? itemDef.name : obj.type;
                interactions.push({ type: 'pickup_item', prompt: `Pick up ${name}` });
            } else if (itemSystem.canStackItems(heldItem, obj)) {
                interactions.push({ type: 'pickup_item', prompt: 'Stack' });
            }
            return interactions;
        }

        switch (obj.objectType) {
            case 'plant':
                if (obj.stage === 'harvestable' && !heldItem) {
                    interactions.push({ type: 'harvest', prompt: 'Harvest' });
                }
                if (obj.hasWeeds) {
                    interactions.push({ type: 'weed', prompt: 'Remove Weeds' });
                }
                if (heldItem?.type === 'water_container' && (heldItem.charges === undefined || heldItem.charges > 0)) {
                    interactions.push({ type: 'water_plant', prompt: 'Water' });
                }
                break;

            case 'soil_plot':
                // Check if plot already has a plant
                const existingPlant = plantSystem.getPlantAtPlot(obj.id, this.gameState.worldObjects);
                if (!existingPlant && heldItem?.type === 'seed') {
                    interactions.push({ type: 'plant_seed', prompt: 'Plant Seed' });
                }
                break;

            case 'appliance':
                interactions.push(...this._getApplianceInteractions(obj, heldItem));
                break;

            case 'bed':
                if (!obj.occupant && player.playerState === 'playing') {
                    interactions.push({ type: 'sleep', prompt: 'Sleep' });
                }
                break;

            case 'station':
                interactions.push(...this._getStationInteractions(obj, heldItem));
                break;
        }

        return interactions;
    }

    /**
     * Get interactions for appliances
     * @param {Object} appliance - Appliance object
     * @param {Object} heldItem - Player's held item
     * @returns {Array} Array of { type, prompt }
     */
    _getApplianceInteractions(appliance, heldItem) {
        const interactions = [];

        switch (appliance.applianceType) {
            case 'vending_machine':
                if (heldItem) {
                    const itemDef = itemSystem.getItemDefinition(heldItem.type);
                    if (itemDef && itemDef.hunger) {
                        interactions.push({ type: 'load_vending', prompt: `Load ${itemDef.name}` });
                    }
                } else {
                    // Check if vending machine has food
                    if (appliance.slots && appliance.slots.some(slot => slot !== null)) {
                        interactions.push({ type: 'take_vending', prompt: 'Take Food' });
                    }
                }
                break;

            case 'coffee_machine':
                if (!heldItem) {
                    interactions.push({ type: 'get_coffee', prompt: 'Get Coffee' });
                }
                break;

            case 'water_station':
                if (!heldItem) {
                    interactions.push({ type: 'drink_water', prompt: 'Drink Water' });
                } else if (heldItem.type === 'water_container') {
                    interactions.push({ type: 'fill_watering_can', prompt: 'Refill Container' });
                }
                break;
        }

        return interactions;
    }

    /**
     * Get interactions for stations
     * @param {Object} station - Station object
     * @param {Object} heldItem - Player's held item
     * @returns {Array} Array of { type, prompt }
     */
    _getStationInteractions(station, heldItem) {
        const interactions = [];
        const config = stationSystem.getStationConfig(station.stationType);

        if (!config) return interactions;

        switch (station.stationType) {
            case 'wash_station':
                if (heldItem?.type === config.inputItem) {
                    interactions.push({ type: 'wash', prompt: 'Wash' });
                }
                break;

            case 'cut_station':
                if (heldItem?.type === config.inputItem) {
                    interactions.push({ type: 'cut', prompt: 'Cut' });
                }
                break;

            case 'assembly_station':
                if (heldItem?.type === config.inputItem) {
                    const count = station.ingredients ? station.ingredients.length : 0;
                    interactions.push({ type: 'assemble', prompt: `Add Ingredient (${count}/3)` });
                }
                break;
        }

        return interactions;
    }
}

module.exports = InteractionSystem;
