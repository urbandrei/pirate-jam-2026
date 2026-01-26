/**
 * Authoritative game state management
 * Maintains canonical state for all players and world
 */

const crypto = require('crypto');
const WorldState = require('./world-state');
const itemSystem = require('./systems/item-system');
const plantSystem = require('./systems/plant-system');
const stationSystem = require('./systems/station-system');
const applianceSystem = require('./systems/appliance-system');
const bedSystem = require('./systems/bed-system');
const { DEFAULT_PLAYER_LIMIT } = require('./systems/player-queue');

class GameState {
    constructor(isDevMode = false) {
        this.isDevMode = isDevMode;

        // Map of peerId -> player state
        this.players = new Map();

        // Player limit (adjustable by VR player)
        this.playerLimit = DEFAULT_PLAYER_LIMIT;

        // World state for building system
        this.worldState = new WorldState(isDevMode);

        // World objects (pickable items, etc.)
        this.worldObjects = new Map();

        // Camera system reference (set by setCameraSystem)
        this.cameraSystem = null;

        // Add test items at spawn room center
        const testSeed = itemSystem.createItem('seed', { x: 0, y: 0.25, z: 0 });
        this.worldObjects.set(testSeed.id, testSeed);

        const testVegetable = itemSystem.createItem('raw_vegetable', { x: 2, y: 0.25, z: 0 });
        this.worldObjects.set(testVegetable.id, testVegetable);

        const testMeal = itemSystem.createItem('basic_meal', { x: -2, y: 0.25, z: 0 });
        this.worldObjects.set(testMeal.id, testMeal);

        // Security camera items will be created after cameraSystem is set
        // Store spawn positions for later initialization
        this._pendingCameraSpawns = [
            { x: 3, y: 0.25, z: 3 },
            { x: -3, y: 0.25, z: 3 },
            { x: 0, y: 0.25, z: -3 },
            { x: 5, y: 0.25, z: -5 },
            { x: -5, y: 0.25, z: -5 }
        ];

        // Seed spawn system
        this.seedSpawnInterval = 60000; // 1 minute in ms
        this.lastSeedSpawn = Date.now();

        // In dev mode, create room-specific objects for the perimeter rooms
        if (isDevMode) {
            this._createDevRoomObjects();
        }
    }

    /**
     * Set the camera system reference and initialize camera items
     * @param {CameraSystem} cameraSystem - The camera system instance
     */
    setCameraSystem(cameraSystem) {
        this.cameraSystem = cameraSystem;

        // Now create security camera items with linked camera entities
        for (const pos of this._pendingCameraSpawns) {
            this.createSecurityCameraItem(pos);
        }
        this._pendingCameraSpawns = [];
    }

    /**
     * Create a security camera item with a linked camera entity
     * The camera entity persists throughout the item's lifecycle (floor/held/placed)
     * @param {Object} position - World position {x, y, z}
     * @returns {Object} The created item with linkedCameraId
     */
    createSecurityCameraItem(position) {
        const item = itemSystem.createItem('security_camera', position);

        // Create linked camera entity if camera system is available
        if (this.cameraSystem) {
            // Camera starts facing forward (+Z direction) from floor level
            const cameraEntity = this.cameraSystem.createCamera(
                'security',
                { x: position.x, y: position.y + 0.1, z: position.z },
                { pitch: 0, yaw: 0, roll: 0 },
                'floor_item' // ownerId indicates this is a floor item, not player-placed
            );

            if (cameraEntity) {
                item.linkedCameraId = cameraEntity.id;
                console.log(`[GameState] Created security camera item with linked camera: ${item.id} -> ${cameraEntity.id}`);
            }
        }

        this.worldObjects.set(item.id, item);
        return item;
    }

    /**
     * Create room-specific objects for dev mode perimeter rooms
     * Must match the room positions in WorldState.initializeDevRooms()
     */
    _createDevRoomObjects() {
        console.log('[GameState] Dev mode: Creating room objects');

        const devRooms = [
            { x: -1, z: -2, type: 'farming' },
            { x: 2, z: -1, type: 'cafeteria' },
            { x: -2, z: -1, type: 'processing' },
            { x: -1, z: 2, type: 'dorm' }
        ];

        for (const room of devRooms) {
            if (room.type === 'farming') {
                plantSystem.createSoilPlotsForCell(room.x, room.z, this.worldObjects);
                console.log(`[GameState] Dev mode: Created soil plots for farming room at (${room.x}, ${room.z})`);
            } else if (room.type === 'processing') {
                stationSystem.createStationsForCell(this.worldObjects, room.x, room.z);
                console.log(`[GameState] Dev mode: Created stations for processing room at (${room.x}, ${room.z})`);
            } else if (room.type === 'cafeteria') {
                applianceSystem.createAppliancesForCell(this.worldObjects, room.x, room.z);
                console.log(`[GameState] Dev mode: Created appliances for cafeteria room at (${room.x}, ${room.z})`);
            } else if (room.type === 'dorm') {
                bedSystem.createBedsForCell(this.worldObjects, room.x, room.z);
                console.log(`[GameState] Dev mode: Created beds for dorm room at (${room.x}, ${room.z})`);
            }
        }
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
            // Chat system
            displayName: peerId.slice(0, 8), // Default to truncated socket ID
            sessionToken: crypto.randomUUID(), // For temp ban tracking
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
        const player = this.players.get(peerId);

        // Drop held item if player was holding something
        if (player && player.heldItem) {
            const item = player.heldItem;

            // Set drop position at player's feet
            item.position = {
                x: player.position.x,
                y: 0.25,
                z: player.position.z
            };

            // Update linked camera for security cameras
            if (item.type === 'security_camera' && item.linkedCameraId && this.cameraSystem) {
                const camera = this.cameraSystem.getCamera(item.linkedCameraId);
                if (camera) {
                    camera.ownerId = 'floor_item';
                    camera.position = { ...item.position };
                    // Face player's last look direction
                    camera.rotation = {
                        yaw: player.lookRotation?.y || 0,
                        pitch: 0,
                        roll: 0
                    };
                    console.log(`[GameState] Disconnecting player ${peerId} dropped camera ${item.linkedCameraId} to floor`);
                }
            }

            // Add item back to world
            this.worldObjects.set(item.id, item);
            console.log(`[GameState] Player ${peerId} disconnected, dropped ${item.type} at (${item.position.x.toFixed(2)}, ${item.position.y.toFixed(2)}, ${item.position.z.toFixed(2)})`);
        }

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

    /**
     * Get count of active players (alive and in game)
     * @returns {number}
     */
    getActivePlayerCount() {
        let count = 0;
        for (const player of this.players.values()) {
            if (player.alive && player.playerState === 'playing') {
                count++;
            }
            // Also count sleeping players as active (they're in the game)
            if (player.alive && player.playerState === 'sleeping') {
                count++;
            }
        }
        return count;
    }

    /**
     * Check if server can accept a new active player
     * @returns {boolean}
     */
    canAcceptPlayer() {
        return this.getActivePlayerCount() < this.playerLimit;
    }

    /**
     * Set the player limit
     * @param {number} limit - New limit (1-50)
     */
    setPlayerLimit(limit) {
        this.playerLimit = Math.max(1, Math.min(50, limit));
        console.log(`[GameState] Player limit set to ${this.playerLimit}`);
    }

    /**
     * Get current player limit
     * @returns {number}
     */
    getPlayerLimit() {
        return this.playerLimit;
    }

    /**
     * Get all players in waiting/dead state
     * @returns {Array}
     */
    getWaitingPlayers() {
        return Array.from(this.players.values()).filter(
            p => !p.alive || p.playerState === 'waiting' || p.playerState === 'dead'
        );
    }

    /**
     * Get all alive/active players
     * @returns {Array}
     */
    getAlivePlayers() {
        return Array.from(this.players.values()).filter(p => p.alive);
    }

    /**
     * Deactivate a player (mark as dead, keep connection)
     * @param {string} peerId
     */
    deactivatePlayer(peerId) {
        const player = this.players.get(peerId);
        if (player) {
            player.alive = false;
            player.playerState = 'dead';
            console.log(`[GameState] Player ${peerId} deactivated`);
        }
    }

    /**
     * Reactivate a player (for respawn)
     * @param {string} peerId
     */
    reactivatePlayer(peerId) {
        const player = this.players.get(peerId);
        if (player) {
            player.alive = true;
            player.playerState = 'playing';
            player.needs = { hunger: 100, thirst: 100, rest: 100 };
            // Respawn at center
            player.position = { x: 0, y: player.type === 'pc' ? 0.9 : 0, z: 0 };
            player.velocity = { x: 0, y: 0, z: 0 };
            console.log(`[GameState] Player ${peerId} reactivated`);
        }
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

    /**
     * Set a player's display name
     * @param {string} peerId - Player's socket ID
     * @param {string} name - New display name
     * @returns {Object} Result with success flag
     */
    setPlayerName(peerId, name) {
        const player = this.players.get(peerId);
        if (!player) {
            return { success: false, reason: 'Player not found' };
        }

        if (typeof name !== 'string') {
            return { success: false, reason: 'Invalid name' };
        }

        name = name.trim();

        if (name.length < 1 || name.length > 20) {
            return { success: false, reason: 'Name must be 1-20 characters' };
        }

        if (!/^[a-zA-Z0-9 ]+$/.test(name)) {
            return { success: false, reason: 'Name must be alphanumeric (letters, numbers, spaces)' };
        }

        player.displayName = name;
        console.log(`[GameState] Player ${peerId} set name to: ${name}`);

        return { success: true, name: name };
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
            // Skip dead/waiting players - they're in local-only waiting room
            // and should be invisible to all other players
            if (player.playerState === 'dead' || player.playerState === 'waiting') {
                continue;
            }
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
                displayName: player.displayName,
                headPosition: player.headPosition,
                headRotation: player.headRotation,
                leftHand: player.leftHand,
                rightHand: player.rightHand,
                heldItem: player.heldItem,
                availableInteraction: player.availableInteraction || null
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

    /**
     * Update seed spawning - spawns a seed every minute in the main room
     * @param {number} currentTime - Current time in ms
     */
    updateSeedSpawn(currentTime) {
        if (currentTime - this.lastSeedSpawn >= this.seedSpawnInterval) {
            // Random position in spawn room (3x3 grid = 30m x 30m, centered at 0,0)
            const x = (Math.random() - 0.5) * 20; // -10 to +10
            const z = (Math.random() - 0.5) * 20; // -10 to +10
            const position = { x, y: 0.25, z };

            const seed = itemSystem.createItem('seed', position);
            this.worldObjects.set(seed.id, seed);
            this.lastSeedSpawn = currentTime;

            console.log(`[GameState] Spawned seed at (${x.toFixed(1)}, 0.25, ${z.toFixed(1)})`);
        }
    }
}

module.exports = GameState;
