/**
 * Authoritative game state management
 * Maintains canonical state for all players and world
 */

const WorldState = require('./world-state');
const itemSystem = require('./systems/item-system');

class GameState {
    constructor() {
        // Map of peerId -> player state
        this.players = new Map();

        // World state for building system
        this.worldState = new WorldState();

        // World objects (pickable items, etc.)
        this.worldObjects = new Map();

        // Add test items at spawn room center
        const testSeed = itemSystem.createItem('seed', { x: 0, y: 0.25, z: 0 });
        this.worldObjects.set(testSeed.id, testSeed);

        const testVegetable = itemSystem.createItem('raw_vegetable', { x: 2, y: 0.25, z: 0 });
        this.worldObjects.set(testVegetable.id, testVegetable);

        const testMeal = itemSystem.createItem('basic_meal', { x: -2, y: 0.25, z: 0 });
        this.worldObjects.set(testMeal.id, testMeal);
    }

    addPlayer(peerId, playerType) {
        const player = {
            id: peerId,
            type: playerType, // 'pc' or 'vr'
            position: { x: 0, y: playerType === 'pc' ? 0.9 : 0, z: 0 }, // PC players start at capsule center height
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            velocity: { x: 0, y: 0, z: 0 },
            grounded: true,
            // Survival needs (PC players only, but tracked for all)
            needs: {
                hunger: 100,
                thirst: 100,
                rest: 100
            },
            alive: true,
            playerState: 'playing', // 'playing' | 'waiting' | 'sleeping'
            // VR-specific data
            headPosition: null,
            headRotation: null,
            leftHand: null,
            rightHand: null,
            // PC-specific data
            lookRotation: { x: 0, y: 0 }, // pitch, yaw
            // Input state for PC players
            input: {
                forward: false,
                backward: false,
                left: false,
                right: false,
                jump: false
            },
            // Held item (picked up object)
            heldItem: null,
            lastUpdate: Date.now()
        };

        // Spawn at random position on the plane
        player.position.x = (Math.random() - 0.5) * 20;
        player.position.z = (Math.random() - 0.5) * 20;

        this.players.set(peerId, player);
        return player;
    }

    removePlayer(peerId) {
        this.players.delete(peerId);
    }

    getPlayer(peerId) {
        return this.players.get(peerId);
    }

    getAllPlayers() {
        return Array.from(this.players.values());
    }

    getPlayerCount() {
        return this.players.size;
    }

    updatePlayerInput(peerId, input) {
        const player = this.players.get(peerId);
        if (player && player.type === 'pc') {
            player.input = { ...player.input, ...input };
            if (input.lookRotation) {
                player.lookRotation = input.lookRotation;
            }
            player.lastUpdate = Date.now();
        }
    }

    updateVRPose(peerId, pose) {
        const player = this.players.get(peerId);
        if (player && player.type === 'vr') {
            if (pose.head) {
                player.headPosition = pose.head.position;
                player.headRotation = pose.head.rotation;
                // VR player position matches head position (same coordinate space as PC)
                player.position = {
                    x: pose.head.position.x,
                    y: pose.head.position.y,
                    z: pose.head.position.z
                };
            }
            if (pose.leftHand) {
                player.leftHand = pose.leftHand;
            }
            if (pose.rightHand) {
                player.rightHand = pose.rightHand;
            }
            player.lastUpdate = Date.now();
        }
    }

    // Get serializable state for network transmission
    getSerializableState() {
        const players = {};
        for (const [id, player] of this.players) {
            players[id] = {
                id: player.id,
                type: player.type,
                position: player.position,
                rotation: player.rotation,
                lookRotation: player.lookRotation,
                grounded: player.grounded,
                needs: player.needs,
                alive: player.alive,
                playerState: player.playerState,
                headPosition: player.headPosition,
                headRotation: player.headRotation,
                leftHand: player.leftHand,
                rightHand: player.rightHand,
                heldItem: player.heldItem
            };
        }

        return {
            players,
            world: this.worldState.getSerializableState(),
            worldObjects: Array.from(this.worldObjects.values()),
            timestamp: Date.now()
        };
    }

    /**
     * Place a block in the world
     * @param {number} gridX - Grid X coordinate
     * @param {number} gridZ - Grid Z coordinate
     * @param {string} blockSize - '1x1' or '1x2'
     * @param {string} playerId - ID of the player placing the block
     * @param {number} rotation - 0 for east-west, 1 for north-south (1x2 only)
     * @returns {Object} Result with success flag and details
     */
    placeBlock(gridX, gridZ, blockSize, playerId, rotation = 0) {
        return this.worldState.placeBlock(gridX, gridZ, blockSize, playerId, rotation);
    }

    /**
     * Get the current world state
     */
    getWorldState() {
        return this.worldState.getSerializableState();
    }

    /**
     * Get a world object by ID
     */
    getWorldObject(id) {
        return this.worldObjects.get(id);
    }

    /**
     * Remove a world object by ID
     */
    removeWorldObject(id) {
        return this.worldObjects.delete(id);
    }

    /**
     * Add a world object
     */
    addWorldObject(obj) {
        this.worldObjects.set(obj.id, obj);
    }

    /**
     * Create and add a new item to the world
     * @param {string} type - Item type from ITEMS
     * @param {Object} position - World position {x, y, z}
     * @returns {Object} The created item
     */
    createWorldItem(type, position) {
        const item = itemSystem.createItem(type, position);
        this.worldObjects.set(item.id, item);
        return item;
    }
}

module.exports = GameState;
