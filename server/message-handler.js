/**
 * Network message routing and handling
 */

class MessageHandler {
    constructor(gameState, playerManager, grabSystem, io = null) {
        this.gameState = gameState;
        this.playerManager = playerManager;
        this.grabSystem = grabSystem;
        this.io = io;
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
            case 'GRAB_ATTEMPT':
                this.handleGrabAttempt(peerId, message);
                break;
            case 'GRAB_RELEASE':
                this.handleGrabRelease(peerId, message);
                break;
            case 'ERROR_REPORT':
                this.handleErrorReport(peerId, message);
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

    handleGrabAttempt(peerId, message) {
        // Pass the hand position from the message for immediate grab check
        const grabbedPlayer = this.grabSystem.attemptGrab(
            peerId,
            message.hand || 'right',
            message.handPosition
        );

        if (grabbedPlayer) {
            // Notify the grabbed player
            this.playerManager.sendTo(grabbedPlayer.id, {
                type: 'GRABBED',
                grabbedBy: peerId
            });

            // Notify the VR player of successful grab
            this.playerManager.sendTo(peerId, {
                type: 'GRAB_SUCCESS',
                grabbedPlayer: grabbedPlayer.id
            });
        }
    }

    handleGrabRelease(peerId, message) {
        // Pass velocity to grab system for throw mechanic
        const releasedPlayerId = this.grabSystem.releaseGrab(peerId, message.velocity);

        if (releasedPlayerId) {
            // Notify the released player
            this.playerManager.sendTo(releasedPlayerId, {
                type: 'RELEASED'
            });

            // Notify the VR player
            this.playerManager.sendTo(peerId, {
                type: 'RELEASE_SUCCESS',
                releasedPlayer: releasedPlayerId
            });
        }
    }

    handleErrorReport(peerId, message) {
        console.log(`[CLIENT ERROR] ${peerId}: ${message.errorType} - ${message.message}`);
        if (message.stack) {
            console.log(`  Stack: ${message.stack}`);
        }

        // Broadcast to all clients including sender
        if (this.io) {
            this.io.emit('message', {
                type: 'ERROR_BROADCAST',
                source: peerId,
                errorType: message.errorType,
                message: message.message,
                timestamp: message.timestamp
            });
        }
    }
}

module.exports = MessageHandler;
