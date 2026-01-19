/**
 * Authoritative game state management
 * Maintains canonical state for all players
 */

class GameState {
    constructor() {
        // Map of peerId -> player state
        this.players = new Map();
    }

    addPlayer(peerId, playerType) {
        const player = {
            id: peerId,
            type: playerType, // 'pc' or 'vr'
            position: { x: 0, y: playerType === 'pc' ? 0.9 : 0, z: 0 }, // PC players start at capsule center height
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            velocity: { x: 0, y: 0, z: 0 },
            grounded: true,
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
                headPosition: player.headPosition,
                headRotation: player.headRotation,
                leftHand: player.leftHand,
                rightHand: player.rightHand
            };
        }

        return {
            players,
            timestamp: Date.now()
        };
    }
}

module.exports = GameState;
