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
}

module.exports = MessageHandler;
