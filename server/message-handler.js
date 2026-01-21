/**
 * Network message routing and handling
 */

class MessageHandler {
    constructor(gameState, playerManager, interactionSystem = null) {
        this.gameState = gameState;
        this.playerManager = playerManager;
        this.interactionSystem = interactionSystem;
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
            case 'CONVERT_ROOM':
                this.handleConvertRoom(peerId, message);
                break;
            case 'INTERACT':
                this.handleInteract(peerId, message);
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
        const rotation = parseInt(message.rotation, 10) || 0;
        const roomType = message.roomType || 'generic';

        // Validate block size
        if (blockSize !== '1x1' && blockSize !== '1x2') {
            console.warn(`[MessageHandler] PLACE_BLOCK rejected: invalid blockSize (${blockSize})`);
            return;
        }

        // Validate rotation
        if (rotation !== 0 && rotation !== 1) {
            console.warn(`[MessageHandler] PLACE_BLOCK rejected: invalid rotation (${rotation})`);
            return;
        }

        // Validate room type
        const validRoomTypes = ['generic', 'farming', 'processing', 'cafeteria', 'dorm', 'waiting'];
        if (!validRoomTypes.includes(roomType)) {
            console.warn(`[MessageHandler] PLACE_BLOCK rejected: invalid roomType (${roomType})`);
            return;
        }

        console.log(`[MessageHandler] PLACE_BLOCK from ${peerId}: grid(${gridX}, ${gridZ}), size=${blockSize}, rotation=${rotation}, roomType=${roomType}`);

        const result = this.gameState.placeBlock(gridX, gridZ, blockSize, peerId, rotation, roomType);

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

    /**
     * Handle room type conversion request from VR player
     */
    handleConvertRoom(peerId, message) {
        // Only accept conversion from VR players
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'vr') {
            console.warn(`[MessageHandler] CONVERT_ROOM rejected: not a VR player (${peerId})`);
            return;
        }

        const gridX = parseInt(message.gridX, 10);
        const gridZ = parseInt(message.gridZ, 10);
        const roomType = message.roomType;

        // Validate room type
        const validRoomTypes = ['generic', 'farming', 'processing', 'cafeteria', 'dorm', 'waiting'];
        if (!validRoomTypes.includes(roomType)) {
            console.warn(`[MessageHandler] CONVERT_ROOM rejected: invalid roomType (${roomType})`);
            return;
        }

        console.log(`[MessageHandler] CONVERT_ROOM from ${peerId}: grid(${gridX}, ${gridZ}), roomType=${roomType}`);

        const result = this.gameState.worldState.setRoomType(gridX, gridZ, roomType);

        if (result.success) {
            console.log(`[MessageHandler] Room converted successfully, version=${result.version}`);

            // Broadcast to all clients
            this.playerManager.broadcast({
                type: 'ROOM_CONVERTED',
                gridX: gridX,
                gridZ: gridZ,
                roomType: roomType,
                convertedBy: peerId,
                world: this.gameState.getWorldState()
            });
        } else {
            console.log(`[MessageHandler] Room conversion failed: ${result.reason}`);

            // Send failure notification to requesting player only
            this.playerManager.sendTo(peerId, {
                type: 'CONVERT_ROOM_FAILED',
                reason: result.reason,
                gridX: gridX,
                gridZ: gridZ
            });
        }
    }

    /**
     * Handle interaction request from PC player
     */
    handleInteract(peerId, message) {
        // Only accept interactions from PC players
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'pc') {
            console.warn(`[MessageHandler] INTERACT rejected: not a PC player (${peerId})`);
            return;
        }

        // Check if interaction system is available
        if (!this.interactionSystem) {
            console.warn(`[MessageHandler] INTERACT rejected: interaction system not initialized`);
            this.playerManager.sendTo(peerId, {
                type: 'INTERACT_FAIL',
                interactionType: message.interactionType,
                targetId: message.targetId,
                reason: 'Interaction system not available'
            });
            return;
        }

        const { interactionType, targetId, targetPosition } = message;

        // Validate the interaction
        const canResult = this.interactionSystem.canInteract(
            player,
            interactionType,
            targetId,
            targetPosition || { x: player.position.x, y: player.position.y, z: player.position.z }
        );

        if (!canResult.valid) {
            console.log(`[MessageHandler] INTERACT validation failed: ${canResult.reason}`);
            this.playerManager.sendTo(peerId, {
                type: 'INTERACT_FAIL',
                interactionType,
                targetId,
                reason: canResult.reason
            });
            return;
        }

        // Execute the interaction
        const execResult = this.interactionSystem.executeInteraction(
            player,
            interactionType,
            targetId,
            targetPosition
        );

        if (execResult.success) {
            console.log(`[MessageHandler] INTERACT success: ${interactionType} on ${targetId}`);
            this.playerManager.sendTo(peerId, {
                type: 'INTERACT_SUCCESS',
                interactionType,
                targetId,
                result: execResult.result
            });
            // Note: State changes propagate via regular STATE_UPDATE
        } else {
            console.log(`[MessageHandler] INTERACT execution failed: ${execResult.error}`);
            this.playerManager.sendTo(peerId, {
                type: 'INTERACT_FAIL',
                interactionType,
                targetId,
                reason: execResult.error
            });
        }
    }
}

module.exports = MessageHandler;
