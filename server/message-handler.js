/**
 * Network message routing and handling
 */

class MessageHandler {
    constructor(gameState, playerManager) {
        this.gameState = gameState;
        this.playerManager = playerManager;
    }

    /**
     * Handle incoming message from a client
     * @param {string} peerId - The sender's peer ID
     * @param {Object} message - The message data
     */
    handleMessage(peerId, message) {
        if (!message || !message.type) {
            console.warn(`Invalid message from ${peerId}:`, message);
            return;
        }

        switch (message.type) {
            case 'JOIN':
                this.handleJoin(peerId, message);
                break;
            case 'INPUT':
                this.handleInput(peerId, message);
                break;
            case 'VR_POSE':
                this.handleVRPose(peerId, message);
                break;
            case 'PLACE_BLOCK':
                this.handlePlaceBlock(peerId, message);
                break;
            default:
                console.warn(`Unknown message type from ${peerId}:`, message.type);
        }
    }

    handleJoin(peerId, message) {
        const player = this.playerManager.handleJoin(peerId, message.playerType);
        if (player) {
            // Send confirmation with initial state
            this.playerManager.sendTo(peerId, {
                type: 'JOINED',
                playerId: peerId,
                player: player,
                state: this.gameState.getSerializableState()
            });

            // Notify other players
            this.playerManager.broadcast({
                type: 'PLAYER_JOINED',
                player: {
                    id: player.id,
                    type: player.type,
                    position: player.position
                }
            }, peerId);
        }
    }

    handleInput(peerId, message) {
        // Only accept input from PC players
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'pc') return;

        this.gameState.updatePlayerInput(peerId, {
            forward: !!message.forward,
            backward: !!message.backward,
            left: !!message.left,
            right: !!message.right,
            jump: !!message.jump,
            lookRotation: message.lookRotation
        });
    }

    handleVRPose(peerId, message) {
        // Only accept poses from VR players
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'vr') return;

        this.gameState.updateVRPose(peerId, {
            head: message.head,
            leftHand: message.leftHand,
            rightHand: message.rightHand
        });
    }

    /**
     * Handle block placement request from VR player
     */
    handlePlaceBlock(peerId, message) {
        // Only accept placement from VR players
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'vr') {
            console.warn(`[MessageHandler] PLACE_BLOCK rejected: not a VR player (${peerId})`);
            return;
        }

        const gridX = parseInt(message.gridX, 10);
        const gridZ = parseInt(message.gridZ, 10);
        const blockSize = message.blockSize || '1x1';

        // Validate block size
        if (blockSize !== '1x1' && blockSize !== '1x2') {
            console.warn(`[MessageHandler] PLACE_BLOCK rejected: invalid blockSize (${blockSize})`);
            return;
        }

        console.log(`[MessageHandler] PLACE_BLOCK from ${peerId}: grid(${gridX}, ${gridZ}), size=${blockSize}`);

        const result = this.gameState.placeBlock(gridX, gridZ, blockSize, peerId);

        if (result.success) {
            console.log(`[MessageHandler] Block placed successfully, version=${result.version}`);

            // Broadcast to all clients
            this.playerManager.broadcast({
                type: 'BLOCK_PLACED',
                gridX: gridX,
                gridZ: gridZ,
                blockSize: blockSize,
                placedBy: peerId,
                world: this.gameState.getWorldState()
            });
        } else {
            console.log(`[MessageHandler] Block placement failed: ${result.reason}`);

            // Send failure notification to requesting player only
            this.playerManager.sendTo(peerId, {
                type: 'PLACE_BLOCK_FAILED',
                reason: result.reason,
                gridX: gridX,
                gridZ: gridZ
            });
        }
    }
}

module.exports = MessageHandler;
