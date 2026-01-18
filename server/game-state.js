/**
 * Authoritative game state management
 * Maintains canonical state for all players
 */

class GameState {
    constructor() {
        // Map of peerId -> player state
        this.players = new Map();

        // Grab relationships: vrPlayerId -> pcPlayerId
        this.grabs = new Map();

        // Reverse lookup: pcPlayerId -> vrPlayerId (who's grabbing them)
        this.grabbedBy = new Map();
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
        // Clean up any grab relationships
        if (this.grabs.has(peerId)) {
            const grabbedPlayer = this.grabs.get(peerId);
            this.grabbedBy.delete(grabbedPlayer);
            this.grabs.delete(peerId);
        }
        if (this.grabbedBy.has(peerId)) {
            const grabber = this.grabbedBy.get(peerId);
            this.grabs.delete(grabber);
            this.grabbedBy.delete(peerId);
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

    setGrab(vrPlayerId, pcPlayerId) {
        this.grabs.set(vrPlayerId, pcPlayerId);
        this.grabbedBy.set(pcPlayerId, vrPlayerId);
    }

    releaseGrab(vrPlayerId) {
        const pcPlayerId = this.grabs.get(vrPlayerId);
        if (pcPlayerId) {
            this.grabbedBy.delete(pcPlayerId);
            this.grabs.delete(vrPlayerId);
            return pcPlayerId;
        }
        return null;
    }

    isPlayerGrabbed(pcPlayerId) {
        return this.grabbedBy.has(pcPlayerId);
    }

    getGrabber(pcPlayerId) {
        return this.grabbedBy.get(pcPlayerId);
    }

    getGrabbedPlayer(vrPlayerId) {
        return this.grabs.get(vrPlayerId);
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
                rightHand: player.rightHand,
                isGrabbed: this.grabbedBy.has(player.id),
                grabbedBy: this.grabbedBy.get(player.id) || null
            };
        }

        return {
            players,
            grabs: Object.fromEntries(this.grabs),
            timestamp: Date.now()
        };
    }
}

module.exports = GameState;
