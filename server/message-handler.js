/**
 * Network message routing and handling
 */

const plantSystem = require('./systems/plant-system');
const stationSystem = require('./systems/station-system');
const applianceSystem = require('./systems/appliance-system');
const bedSystem = require('./systems/bed-system');
const NeedsSystem = require('./systems/needs-system');
const ChatSystem = require('./systems/chat-system');
const ModerationSystem = require('./systems/moderation-system');
const { CameraSystem, CAMERA_TYPES } = require('./systems/camera-system');
const { MonitorSystem } = require('./systems/monitor-system');

class MessageHandler {
    constructor(gameState, playerManager, interactionSystem = null, playerQueue = null) {
        this.gameState = gameState;
        this.playerManager = playerManager;
        this.interactionSystem = interactionSystem;
        this.playerQueue = playerQueue;

        // Initialize chat systems
        this.chatSystem = new ChatSystem(playerManager, gameState);
        this.moderationSystem = new ModerationSystem(playerManager, gameState);

        // Initialize camera system
        this.cameraSystem = new CameraSystem();

        // Initialize monitor system
        this.monitorSystem = new MonitorSystem();

        // Store names received before JOIN (socketId -> name)
        this.pendingNames = new Map();

        // Callbacks for external listeners
        this.onPlayerJoined = null;  // Called with (player) when player joins
        this.onPlayerLeft = null;    // Called with (playerId, displayName) when player leaves
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
            case 'TIMED_INTERACT_START':
                this.handleTimedInteractStart(peerId, message);
                break;
            case 'TIMED_INTERACT_CANCEL':
                this.handleTimedInteractCancel(peerId, message);
                break;
            case 'SLEEP_MINIGAME_COMPLETE':
                this.handleSleepMinigameComplete(peerId, message);
                break;
            case 'REVIVE':
                this.handleRevive(peerId, message);
                break;
            case 'JOIN_QUEUE':
                this.handleJoinQueue(peerId, message);
                break;
            case 'JOIN_FROM_QUEUE':
                this.handleJoinFromQueue(peerId, message);
                break;
            case 'SET_NAME':
                this.handleSetName(peerId, message);
                break;
            case 'CHAT_MESSAGE':
                this.handleChatMessage(peerId, message);
                break;
            case 'MODERATE_PLAYER':
                this.handleModeratePlayer(peerId, message);
                break;
            // Camera messages
            case 'PLACE_CAMERA':
                this.handlePlaceCamera(peerId, message);
                break;
            case 'PICKUP_CAMERA':
                this.handlePickupCamera(peerId, message);
                break;
            case 'ADJUST_CAMERA':
                this.handleAdjustCamera(peerId, message);
                break;
            case 'UPDATE_CAMERA':
                this.handleUpdateCamera(peerId, message);
                break;
            case 'ENTER_CAMERA_VIEW':
                this.handleEnterCameraView(peerId, message);
                break;
            case 'EXIT_CAMERA_VIEW':
                this.handleExitCameraView(peerId, message);
                break;
            case 'START_ADJUST_CAMERA':
                this.handleStartAdjustCamera(peerId, message);
                break;
            case 'STOP_ADJUST_CAMERA':
                this.handleStopAdjustCamera(peerId, message);
                break;
            case 'SET_CAMERA_LIMITS':
                this.handleSetCameraLimits(peerId, message);
                break;
            // Monitor messages
            case 'START_MONITOR_VIEW':
                this.handleStartMonitorView(peerId, message);
                break;
            case 'STOP_MONITOR_VIEW':
                this.handleStopMonitorView(peerId, message);
                break;
            case 'CHANGE_MONITOR_CAMERA':
                this.handleChangeMonitorCamera(peerId, message);
                break;
            case 'DEBUG_LOG':
                console.log(`[DEBUG ${message.source}] ${peerId}: ${message.message}`);
                break;
            default:
                console.warn(`Unknown message type from ${peerId}:`, message.type);
        }
    }

    handleJoin(peerId, message) {
        const playerType = message.playerType || 'pc';

        // Handle viewer connections (web camera viewers)
        if (playerType === 'viewer') {
            this.handleViewerJoin(peerId, message);
            return;
        }

        // Check if player is banned (by session token)
        if (message.sessionToken) {
            const banInfo = this.moderationSystem.checkBan(message.sessionToken);
            if (banInfo) {
                console.log(`[MessageHandler] Banned player attempted to join: ${peerId}`);
                this.playerManager.sendTo(peerId, {
                    type: 'BANNED',
                    expiresAt: banInfo.expiresAt,
                    reason: banInfo.reason
                });
                const socket = this.playerManager.getConnection(peerId);
                if (socket) {
                    socket.disconnect(true);
                }
                return;
            }
        }

        // VR players always get in (they manage the game)
        // PC players need to check player limit
        if (playerType === 'pc' && this.playerQueue && !this.gameState.canAcceptPlayer()) {
            // Game is full - create player in waiting state so they can walk around waiting room
            const player = this.playerManager.handleJoin(peerId, playerType);
            if (player) {
                // Set player as waiting (not alive, not playing - won't count toward limit)
                player.alive = false;
                player.playerState = 'waiting';
                player.deathTime = null;  // No cooldown for new players joining full game

                // Position in waiting room
                player.position = { x: 500, y: 0.9, z: 502 };
                player.velocity = { x: 0, y: 0, z: 0 };

                // Add to queue
                const position = this.playerQueue.addToQueue(peerId, playerType);
                console.log(`[MessageHandler] Game full, player ${peerId} placed in waiting room at queue position ${position}`);

                this.playerManager.sendTo(peerId, {
                    type: 'JOIN_QUEUED',
                    position: position,
                    total: this.playerQueue.getQueueLength(),
                    playerLimit: this.gameState.getPlayerLimit(),
                    waitingRoomPosition: player.position  // Client needs this to position camera
                });
            }
            return;
        }

        const player = this.playerManager.handleJoin(peerId, playerType);
        if (player) {
            // Apply pending name if SET_NAME was received before JOIN
            const pendingName = this.pendingNames.get(peerId);
            if (pendingName) {
                this.gameState.setPlayerName(peerId, pendingName);
                this.pendingNames.delete(peerId);
                console.log(`[MessageHandler] Applied pending name for ${peerId}: ${pendingName}`);
            }

            // Send confirmation with initial state and session token
            this.playerManager.sendTo(peerId, {
                type: 'JOINED',
                playerId: peerId,
                sessionToken: player.sessionToken,
                player: player,
                state: this.gameState.getSerializableState()
            });

            // Send NAME_UPDATED so client updates status display
            this.playerManager.sendTo(peerId, {
                type: 'NAME_UPDATED',
                name: player.displayName,
                playerId: peerId
            });

            // Notify other players (displayName now has correct name)
            this.playerManager.broadcast({
                type: 'PLAYER_JOINED',
                player: {
                    id: player.id,
                    type: player.type,
                    position: player.position,
                    displayName: player.displayName
                }
            }, peerId);

            // Call external listener if set
            if (this.onPlayerJoined) {
                this.onPlayerJoined(player);
            }
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

        // Log occasionally to confirm VR is connected (every 100th message)
        if (!this._vrPoseCount) this._vrPoseCount = {};
        if (!this._vrPoseCount[peerId]) this._vrPoseCount[peerId] = 0;
        this._vrPoseCount[peerId]++;
        if (this._vrPoseCount[peerId] % 100 === 1) {
            const lh = message.leftHand;
            const rh = message.rightHand;
            if (lh || rh) {
                console.log(`[VR_POSE] ${peerId} - LH: ${lh ? `(${lh.position?.x?.toFixed(2)}, ${lh.position?.y?.toFixed(2)}, ${lh.position?.z?.toFixed(2)}) pinch=${lh.pinching}` : 'null'}, RH: ${rh ? `(${rh.position?.x?.toFixed(2)}, ${rh.position?.y?.toFixed(2)}, ${rh.position?.z?.toFixed(2)}) pinch=${rh.pinching}` : 'null'}`);
            } else {
                console.log(`[VR_POSE] ${peerId} - Both hands null (hand tracking not active?)`);
            }
        }

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
        const validRoomTypes = ['generic', 'farming', 'processing', 'cafeteria', 'dorm', 'waiting', 'security'];
        if (!validRoomTypes.includes(roomType)) {
            console.warn(`[MessageHandler] PLACE_BLOCK rejected: invalid roomType (${roomType})`);
            return;
        }

        console.log(`[MessageHandler] PLACE_BLOCK from ${peerId}: grid(${gridX}, ${gridZ}), size=${blockSize}, rotation=${rotation}, roomType=${roomType}`);

        const result = this.gameState.placeBlock(gridX, gridZ, blockSize, peerId, rotation, roomType);

        if (result.success) {
            console.log(`[MessageHandler] Block placed successfully, version=${result.version}`);

            // Create room-type-specific entities for the placed cell(s)
            const cells = blockSize === '1x2'
                ? (rotation === 0 ? [[gridX, gridZ], [gridX + 1, gridZ]] : [[gridX, gridZ], [gridX, gridZ + 1]])
                : [[gridX, gridZ]];

            for (const [cellX, cellZ] of cells) {
                if (roomType === 'farming') {
                    plantSystem.createSoilPlotsForCell(cellX, cellZ, this.gameState.worldObjects);
                } else if (roomType === 'processing') {
                    stationSystem.createStationsForCell(this.gameState.worldObjects, cellX, cellZ);
                } else if (roomType === 'cafeteria') {
                    applianceSystem.createAppliancesForCell(this.gameState.worldObjects, cellX, cellZ);
                } else if (roomType === 'dorm') {
                    bedSystem.createBedsForCell(this.gameState.worldObjects, cellX, cellZ);
                } else if (roomType === 'security') {
                    this.monitorSystem.initializeRoomMonitors({ x: cellX, z: cellZ }, 4);
                }
            }

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
        const validRoomTypes = ['generic', 'farming', 'processing', 'cafeteria', 'dorm', 'waiting', 'security'];
        if (!validRoomTypes.includes(roomType)) {
            console.warn(`[MessageHandler] CONVERT_ROOM rejected: invalid roomType (${roomType})`);
            return;
        }

        console.log(`[MessageHandler] CONVERT_ROOM from ${peerId}: grid(${gridX}, ${gridZ}), roomType=${roomType}`);

        // Check if converting FROM any room type - need to cleanup entities
        const cellKey = `${gridX},${gridZ}`;
        const currentCell = this.gameState.worldState.grid.get(cellKey);
        const wasFromFarming = currentCell && currentCell.roomType === 'farming';
        const wasFromProcessing = currentCell && currentCell.roomType === 'processing';
        const wasFromCafeteria = currentCell && currentCell.roomType === 'cafeteria';
        const wasFromDorm = currentCell && currentCell.roomType === 'dorm';
        const wasFromSecurity = currentCell && currentCell.roomType === 'security';

        const result = this.gameState.worldState.setRoomType(gridX, gridZ, roomType);

        if (result.success) {
            // If we converted away from farming, destroy any plants and soil plots in this cell
            if (wasFromFarming && roomType !== 'farming') {
                const removedPlants = plantSystem.cleanupPlantsInCell(this.gameState.worldObjects, gridX, gridZ);
                if (removedPlants > 0) {
                    console.log(`[MessageHandler] Removed ${removedPlants} plants from converted farming room`);
                }
                const removedPlots = plantSystem.cleanupSoilPlotsInCell(gridX, gridZ, this.gameState.worldObjects);
                if (removedPlots > 0) {
                    console.log(`[MessageHandler] Removed ${removedPlots} soil plots from converted farming room`);
                }
            }

            // If we converted away from processing, destroy any stations in this cell
            if (wasFromProcessing && roomType !== 'processing') {
                const removedCount = stationSystem.cleanupStationsInCell(this.gameState.worldObjects, gridX, gridZ);
                if (removedCount > 0) {
                    console.log(`[MessageHandler] Removed ${removedCount} stations from converted processing room`);
                }
            }

            // If we converted away from cafeteria, destroy any appliances/tables in this cell
            if (wasFromCafeteria && roomType !== 'cafeteria') {
                const removedCount = applianceSystem.cleanupAppliancesInCell(this.gameState.worldObjects, gridX, gridZ);
                if (removedCount > 0) {
                    console.log(`[MessageHandler] Removed ${removedCount} appliances/tables from converted cafeteria room`);
                }
            }

            // If we converted away from dorm, destroy any beds in this cell (and wake sleeping players)
            if (wasFromDorm && roomType !== 'dorm') {
                const removedCount = bedSystem.cleanupBedsInCell(this.gameState.worldObjects, gridX, gridZ, this.gameState);
                if (removedCount > 0) {
                    console.log(`[MessageHandler] Removed ${removedCount} beds from converted dorm room`);
                }
            }

            // If we converted away from security, destroy monitors in this cell
            if (wasFromSecurity && roomType !== 'security') {
                const removedMonitors = this.monitorSystem.cleanupRoomMonitors({ x: gridX, z: gridZ });
                if (removedMonitors.length > 0) {
                    console.log(`[MessageHandler] Removed ${removedMonitors.length} monitors from converted security room`);
                }
            }

            // If we converted TO farming, create soil plots
            if (roomType === 'farming' && !wasFromFarming) {
                const createdPlots = plantSystem.createSoilPlotsForCell(gridX, gridZ, this.gameState.worldObjects);
                console.log(`[MessageHandler] Created ${createdPlots.length} soil plots for new farming room`);
            }

            // If we converted TO processing, create stations
            if (roomType === 'processing' && !wasFromProcessing) {
                const createdStations = stationSystem.createStationsForCell(this.gameState.worldObjects, gridX, gridZ);
                console.log(`[MessageHandler] Created ${createdStations.length} stations for new processing room`);
            }

            // If we converted TO cafeteria, create appliances and tables
            if (roomType === 'cafeteria' && !wasFromCafeteria) {
                const createdObjects = applianceSystem.createAppliancesForCell(this.gameState.worldObjects, gridX, gridZ);
                console.log(`[MessageHandler] Created ${createdObjects.length} appliances/tables for new cafeteria room`);
            }

            // If we converted TO dorm, create beds
            if (roomType === 'dorm' && !wasFromDorm) {
                const createdBeds = bedSystem.createBedsForCell(this.gameState.worldObjects, gridX, gridZ);
                console.log(`[MessageHandler] Created ${createdBeds.length} beds for new dorm room`);
            }

            // If we converted TO security, create monitors
            if (roomType === 'security' && !wasFromSecurity) {
                this.monitorSystem.initializeRoomMonitors({ x: gridX, z: gridZ }, 4);
                console.log(`[MessageHandler] Created 4 monitors for new security room`);
            }

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

            // Special handling for join_game - send PLAYER_REVIVED
            if (interactionType === 'join_game') {
                this.playerManager.sendTo(peerId, {
                    type: 'PLAYER_REVIVED',
                    position: player.position,
                    needs: player.needs
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
            } else {
                this.playerManager.sendTo(peerId, {
                    type: 'INTERACT_SUCCESS',
                    interactionType,
                    targetId,
                    result: execResult.result
                });
            }
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

    /**
     * Handle timed interaction start request (wash/cut stations)
     */
    handleTimedInteractStart(peerId, message) {
        // Only accept from PC players
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'pc') {
            console.warn(`[MessageHandler] TIMED_INTERACT_START rejected: not a PC player (${peerId})`);
            return;
        }

        // Check if interaction system is available
        if (!this.interactionSystem) {
            console.warn(`[MessageHandler] TIMED_INTERACT_START rejected: interaction system not initialized`);
            this.playerManager.sendTo(peerId, {
                type: 'TIMED_INTERACT_CANCELLED',
                reason: 'Interaction system not available'
            });
            return;
        }

        const { interactionType, targetId, targetPosition } = message;

        // Validate the interaction type is timed (wash or cut)
        if (interactionType !== 'wash' && interactionType !== 'cut') {
            console.warn(`[MessageHandler] TIMED_INTERACT_START rejected: invalid type (${interactionType})`);
            this.playerManager.sendTo(peerId, {
                type: 'TIMED_INTERACT_CANCELLED',
                reason: 'Invalid timed interaction type'
            });
            return;
        }

        // Validate range (use canInteract for range check)
        const canResult = this.interactionSystem.canInteract(
            player,
            interactionType,
            targetId,
            targetPosition || { x: player.position.x, y: player.position.y, z: player.position.z }
        );

        if (!canResult.valid) {
            console.log(`[MessageHandler] TIMED_INTERACT_START validation failed: ${canResult.reason}`);
            this.playerManager.sendTo(peerId, {
                type: 'TIMED_INTERACT_CANCELLED',
                reason: canResult.reason
            });
            return;
        }

        // Start the timed interaction
        const startResult = this.interactionSystem.startTimedInteraction(
            player,
            interactionType,
            targetId,
            targetPosition
        );

        if (startResult.success) {
            console.log(`[MessageHandler] TIMED_INTERACT_START success: ${interactionType} on ${targetId}, duration=${startResult.duration}ms`);
            this.playerManager.sendTo(peerId, {
                type: 'TIMED_INTERACT_PROGRESS',
                interactionType,
                targetId,
                duration: startResult.duration
            });
        } else {
            console.log(`[MessageHandler] TIMED_INTERACT_START failed: ${startResult.error}`);
            this.playerManager.sendTo(peerId, {
                type: 'TIMED_INTERACT_CANCELLED',
                reason: startResult.error
            });
        }
    }

    /**
     * Handle timed interaction cancel request
     */
    handleTimedInteractCancel(peerId, message) {
        // Only accept from PC players
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'pc') {
            console.warn(`[MessageHandler] TIMED_INTERACT_CANCEL rejected: not a PC player (${peerId})`);
            return;
        }

        // Check if interaction system is available
        if (!this.interactionSystem) {
            return;
        }

        const cancelResult = this.interactionSystem.cancelTimedInteraction(peerId);

        if (cancelResult.cancelled) {
            console.log(`[MessageHandler] TIMED_INTERACT_CANCEL: cancelled for player ${peerId}`);
            this.playerManager.sendTo(peerId, {
                type: 'TIMED_INTERACT_CANCELLED',
                reason: 'Player cancelled'
            });
        }
    }

    /**
     * Handle sleep minigame completion from PC player
     */
    handleSleepMinigameComplete(peerId, message) {
        // Only accept from PC players
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'pc') {
            console.warn(`[MessageHandler] SLEEP_MINIGAME_COMPLETE rejected: not a PC player (${peerId})`);
            return;
        }

        // Verify player is actually sleeping
        if (player.playerState !== 'sleeping') {
            console.warn(`[MessageHandler] SLEEP_MINIGAME_COMPLETE rejected: player not sleeping (${peerId})`);
            return;
        }

        const { score } = message;

        // Validate score
        const validScore = Math.max(0, Math.min(100, parseInt(score, 10) || 0));

        // Update sleep multiplier based on minigame performance
        bedSystem.updateSleepMultiplier(player, validScore);

        console.log(`[MessageHandler] SLEEP_MINIGAME_COMPLETE: player ${peerId}, score=${validScore}%, multiplier=${player.sleepMultiplier.toFixed(1)}`);

        // Send confirmation
        this.playerManager.sendTo(peerId, {
            type: 'SLEEP_MINIGAME_RESULT',
            score: validScore,
            multiplier: player.sleepMultiplier
        });
    }

    /**
     * Handle revive request from dead PC player
     */
    handleRevive(peerId, message) {
        const player = this.gameState.getPlayer(peerId);
        if (!player) {
            console.warn(`[MessageHandler] REVIVE rejected: player not found (${peerId})`);
            return;
        }

        if (player.type !== 'pc') {
            console.warn(`[MessageHandler] REVIVE rejected: not a PC player (${peerId})`);
            return;
        }

        if (player.alive || player.playerState !== 'dead') {
            console.warn(`[MessageHandler] REVIVE rejected: player not dead (${peerId})`);
            return;
        }

        // Reset player needs
        NeedsSystem.resetNeeds(player);

        // Respawn at spawn room center
        player.position = { x: 0, y: 0.9, z: 0 };
        player.velocity = { x: 0, y: 0, z: 0 };
        player.grounded = true;

        // Clear any held items
        player.heldItem = null;

        console.log(`[MessageHandler] Player ${peerId} revived at spawn`);

        // Send confirmation
        this.playerManager.sendTo(peerId, {
            type: 'PLAYER_REVIVED',
            position: player.position,
            needs: player.needs
        });

        // Broadcast to other players
        this.playerManager.broadcast({
            type: 'PLAYER_REVIVED',
            playerId: peerId
        }, peerId);
    }

    /**
     * Handle dead player joining the queue after cooldown
     */
    handleJoinQueue(peerId, message) {
        if (!this.playerQueue) {
            console.warn(`[MessageHandler] JOIN_QUEUE rejected: player queue not initialized`);
            return;
        }

        // Check if player is already in queue
        if (this.playerQueue.isInQueue(peerId)) {
            const info = this.playerQueue.getQueueInfo(peerId);
            this.playerManager.sendTo(peerId, {
                type: 'QUEUE_JOINED',
                position: info.position,
                total: info.total
            });
            return;
        }

        // Add to queue
        const position = this.playerQueue.addToQueue(peerId, 'pc');
        console.log(`[MessageHandler] Player ${peerId} joined queue at position ${position}`);

        this.playerManager.sendTo(peerId, {
            type: 'QUEUE_JOINED',
            position: position,
            total: this.playerQueue.getQueueLength()
        });
    }

    /**
     * Handle player joining game from queue (after QUEUE_READY)
     */
    handleJoinFromQueue(peerId, message) {
        if (!this.playerQueue) {
            console.warn(`[MessageHandler] JOIN_FROM_QUEUE rejected: player queue not initialized`);
            return;
        }

        // Verify player was in queue and it's their turn
        const queuePosition = this.playerQueue.getQueuePosition(peerId);
        if (queuePosition !== 1) {
            console.warn(`[MessageHandler] JOIN_FROM_QUEUE rejected: player ${peerId} not at front of queue (position: ${queuePosition})`);
            this.playerManager.sendTo(peerId, {
                type: 'JOIN_FROM_QUEUE_FAILED',
                reason: 'Not at front of queue'
            });
            return;
        }

        // Double-check there's room
        if (!this.gameState.canAcceptPlayer()) {
            console.warn(`[MessageHandler] JOIN_FROM_QUEUE rejected: game is full`);
            this.playerManager.sendTo(peerId, {
                type: 'JOIN_FROM_QUEUE_FAILED',
                reason: 'Game is still full'
            });
            return;
        }

        // Remove from queue
        this.playerQueue.removeFromQueue(peerId);

        // Check if player already exists (dead player rejoining)
        let player = this.gameState.getPlayer(peerId);

        if (player) {
            // Reactivate existing player
            this.gameState.reactivatePlayer(peerId);
            player = this.gameState.getPlayer(peerId);
            console.log(`[MessageHandler] Player ${peerId} reactivated from queue`);
        } else {
            // New player from queue
            player = this.playerManager.handleJoin(peerId, 'pc');
            console.log(`[MessageHandler] New player ${peerId} joined from queue`);
        }

        if (player) {
            // Send confirmation with full state
            this.playerManager.sendTo(peerId, {
                type: 'JOINED',
                playerId: peerId,
                sessionToken: player.sessionToken,
                player: player,
                state: this.gameState.getSerializableState()
            });

            // Notify other players
            this.playerManager.broadcast({
                type: 'PLAYER_JOINED',
                player: {
                    id: player.id,
                    type: player.type,
                    position: player.position,
                    displayName: player.displayName
                }
            }, peerId);

            // Call external listener if set
            if (this.onPlayerJoined) {
                this.onPlayerJoined(player);
            }
        }
    }

    /**
     * Handle set name request
     */
    handleSetName(peerId, message) {
        // Check if player exists yet
        const player = this.gameState.getPlayer(peerId);
        if (!player) {
            // Player hasn't joined yet - store name for when they do
            // Validate name before storing
            let name = message.name;
            if (typeof name === 'string') {
                name = name.trim();
                if (name.length >= 1 && name.length <= 20 && /^[a-zA-Z0-9 ]+$/.test(name)) {
                    this.pendingNames.set(peerId, name);
                    console.log(`[MessageHandler] Stored pending name for ${peerId}: ${name}`);
                }
            }
            return;
        }

        const result = this.gameState.setPlayerName(peerId, message.name);

        if (result.success) {
            // Send confirmation to player
            this.playerManager.sendTo(peerId, {
                type: 'NAME_UPDATED',
                name: result.name,
                playerId: peerId
            });

            // Broadcast name change to all other players
            this.playerManager.broadcast({
                type: 'NAME_UPDATED',
                name: result.name,
                playerId: peerId
            }, peerId);
        } else {
            this.playerManager.sendTo(peerId, {
                type: 'NAME_UPDATE_FAILED',
                reason: result.reason
            });
        }
    }

    /**
     * Handle chat message
     */
    handleChatMessage(peerId, message) {
        const result = this.chatSystem.handleMessage(peerId, message, this.moderationSystem);

        if (!result.success) {
            this.playerManager.sendTo(peerId, {
                type: 'CHAT_FAILED',
                reason: result.reason,
                expiresAt: result.expiresAt
            });
        }
    }

    /**
     * Handle moderation action (VR-only)
     */
    handleModeratePlayer(peerId, message) {
        const result = this.moderationSystem.handleModeration(peerId, message, this.chatSystem);

        this.playerManager.sendTo(peerId, {
            type: 'MODERATION_APPLIED',
            action: message.action,
            success: result.success,
            reason: result.reason,
            targetId: message.targetId
        });
    }

    // ==================== Camera Message Handlers ====================

    /**
     * Handle camera placement from PC (security) or VR (stream) player
     */
    handlePlaceCamera(peerId, message) {
        console.log(`[MessageHandler] PLACE_CAMERA received from ${peerId}:`, JSON.stringify(message));

        const player = this.gameState.getPlayer(peerId);
        if (!player) {
            console.warn(`[MessageHandler] PLACE_CAMERA rejected: player not found (${peerId})`);
            return;
        }

        const { cameraType, position, rotation } = message;

        // Validate camera type based on player type
        if (player.type === 'pc' && cameraType !== CAMERA_TYPES.SECURITY) {
            console.warn(`[MessageHandler] PLACE_CAMERA rejected: PC players can only place security cameras`);
            this.playerManager.sendTo(peerId, {
                type: 'PLACE_CAMERA_FAILED',
                reason: 'PC players can only place security cameras'
            });
            return;
        }

        // For PC players, validate they're holding a security camera item
        if (player.type === 'pc') {
            if (!player.heldItem || player.heldItem.type !== 'security_camera') {
                console.warn(`[MessageHandler] PLACE_CAMERA rejected: PC player not holding a security camera`);
                this.playerManager.sendTo(peerId, {
                    type: 'PLACE_CAMERA_FAILED',
                    reason: 'Must be holding a security camera'
                });
                return;
            }
        }

        if (player.type === 'vr' && cameraType !== CAMERA_TYPES.STREAM) {
            console.warn(`[MessageHandler] PLACE_CAMERA rejected: VR players can only place stream cameras`);
            this.playerManager.sendTo(peerId, {
                type: 'PLACE_CAMERA_FAILED',
                reason: 'VR players can only place stream cameras'
            });
            return;
        }

        let camera = null;

        // For PC players with a linked camera, update existing camera instead of creating new
        if (player.type === 'pc' && player.heldItem?.linkedCameraId) {
            const linkedCameraId = player.heldItem.linkedCameraId;
            const existingCamera = this.cameraSystem.getCamera(linkedCameraId);

            if (existingCamera) {
                // Update existing camera position and rotation
                this.cameraSystem.updatePosition(linkedCameraId, position);
                this.cameraSystem.updateRotation(linkedCameraId, rotation);
                existingCamera.ownerId = peerId;  // Mark as placed by this player
                camera = existingCamera;
                console.log(`[MessageHandler] Camera updated (linked): ${camera.id} by ${peerId}`);
            }
        }

        // If no linked camera was found, create a new one
        if (!camera) {
            camera = this.cameraSystem.createCamera(cameraType, position, rotation, peerId);
        }

        if (camera) {
            console.log(`[MessageHandler] Camera placed: ${camera.id} by ${peerId}`);

            // For PC players, consume the held camera item
            if (player.type === 'pc' && player.heldItem?.type === 'security_camera') {
                player.heldItem = null;
            }

            // Send confirmation to placer
            this.playerManager.sendTo(peerId, {
                type: 'CAMERA_PLACED',
                camera: camera
            });

            // Broadcast to all other players
            this.playerManager.broadcast({
                type: 'CAMERA_PLACED',
                camera: camera
            }, peerId);
        } else {
            this.playerManager.sendTo(peerId, {
                type: 'PLACE_CAMERA_FAILED',
                reason: 'Camera limit reached or invalid placement'
            });
        }
    }

    /**
     * Handle camera pickup from PC player (picking up placed wall-mounted camera)
     */
    handlePickupCamera(peerId, message) {
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'pc') {
            console.warn(`[MessageHandler] PICKUP_CAMERA rejected: not a PC player (${peerId})`);
            return;
        }

        // Player must not be holding anything to pick up a camera
        if (player.heldItem) {
            console.warn(`[MessageHandler] PICKUP_CAMERA rejected: player already holding an item`);
            return;
        }

        const { cameraId } = message;
        const camera = this.cameraSystem.getCamera(cameraId);

        if (!camera) {
            console.warn(`[MessageHandler] PICKUP_CAMERA rejected: camera not found (${cameraId})`);
            return;
        }

        // Only allow picking up security cameras
        if (camera.type !== CAMERA_TYPES.SECURITY) {
            console.warn(`[MessageHandler] PICKUP_CAMERA rejected: can only pick up security cameras`);
            return;
        }

        // Check if camera is being adjusted by someone
        const adjuster = this.cameraSystem.getAdjustingPlayer(cameraId);
        if (adjuster) {
            console.warn(`[MessageHandler] PICKUP_CAMERA rejected: camera ${cameraId} is being adjusted by ${adjuster}`);
            return;
        }

        // Check range - wall cameras have longer range (4m) than floor cameras (2m)
        const isWallCamera = camera.ownerId && camera.ownerId !== 'floor_item' && !camera.ownerId.startsWith('held_');
        const maxRange = isWallCamera ? 4.0 : 2.0;
        const dx = player.position.x - camera.position.x;
        const dz = player.position.z - camera.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance > maxRange) {
            console.warn(`[MessageHandler] PICKUP_CAMERA rejected: player too far (${distance.toFixed(2)}m > ${maxRange}m)`);
            return;
        }

        // DON'T remove the camera entity - keep it for always-on feed
        // Just transfer ownership to the held item
        console.log(`[MessageHandler] Camera picked up: ${cameraId} by ${peerId}`);

        // Check if this is a floor camera (has an existing floor item)
        if (camera.ownerId === 'floor_item') {
            // Find the floor item with this linkedCameraId
            let floorItem = null;
            for (const [itemId, item] of this.gameState.worldObjects) {
                if (item.type === 'security_camera' && item.linkedCameraId === cameraId) {
                    floorItem = item;
                    break;
                }
            }

            if (floorItem) {
                // Remove from world and give to player
                this.gameState.worldObjects.delete(floorItem.id);
                player.heldItem = floorItem;
                console.log(`[MessageHandler] Floor camera item picked up: ${floorItem.id} (linked to ${cameraId})`);
            } else {
                // Fallback: create new item (shouldn't happen normally)
                console.warn(`[MessageHandler] Floor camera item not found for camera ${cameraId}, creating new item`);
                const itemSystem = require('./systems/item-system');
                player.heldItem = itemSystem.createItem('security_camera', player.position);
                player.heldItem.linkedCameraId = cameraId;
            }
        } else {
            // Wall camera - create a new item linked to existing camera
            const itemSystem = require('./systems/item-system');
            player.heldItem = itemSystem.createItem('security_camera', player.position);
            player.heldItem.linkedCameraId = cameraId;  // Link to existing camera entity
        }

        // Update camera owner to indicate it's held (not wall-mounted)
        camera.ownerId = `held_${peerId}`;

        // Send confirmation to player who picked up
        this.playerManager.sendTo(peerId, {
            type: 'CAMERA_PICKED_UP',
            cameraId: cameraId
        });

        // Broadcast to all other players (camera still exists, just being held now)
        this.playerManager.broadcast({
            type: 'CAMERA_PICKED_UP',
            cameraId: cameraId,
            pickedUpBy: peerId
        }, peerId);
    }

    /**
     * Handle camera rotation adjustment
     * PC players can adjust security cameras, VR players can adjust stream cameras
     */
    handleAdjustCamera(peerId, message) {
        const player = this.gameState.getPlayer(peerId);
        if (!player) {
            console.warn(`[MessageHandler] ADJUST_CAMERA rejected: player not found (${peerId})`);
            return;
        }

        const { cameraId, rotation } = message;
        const camera = this.cameraSystem.getCamera(cameraId);

        if (!camera) {
            console.warn(`[MessageHandler] ADJUST_CAMERA rejected: camera not found (${cameraId})`);
            return;
        }

        // PC players can adjust security cameras, VR players can adjust stream cameras
        const isValidAdjustment =
            (player.type === 'pc' && camera.type === CAMERA_TYPES.SECURITY) ||
            (player.type === 'vr' && camera.type === CAMERA_TYPES.STREAM);

        if (!isValidAdjustment) {
            console.warn(`[MessageHandler] ADJUST_CAMERA rejected: ${player.type} player cannot adjust ${camera.type} cameras`);
            return;
        }

        // Only allow final adjustment from the player who has the lock
        const adjuster = this.cameraSystem.getAdjustingPlayer(cameraId);
        if (adjuster && adjuster !== peerId) {
            console.warn(`[MessageHandler] ADJUST_CAMERA rejected: camera ${cameraId} is being adjusted by ${adjuster}, not ${peerId}`);
            return;
        }

        // Update the camera rotation
        if (this.cameraSystem.updateRotation(cameraId, rotation)) {
            // Broadcast to all players
            this.playerManager.broadcast({
                type: 'CAMERA_ADJUSTED',
                cameraId: cameraId,
                rotation: rotation
            });
        }
    }

    /**
     * Handle continuous camera updates (position and/or rotation) during VR grab/rotation
     * Used for live updates while moving/rotating cameras
     */
    handleUpdateCamera(peerId, message) {
        const { cameraId, position, rotation } = message;
        const camera = this.cameraSystem.getCamera(cameraId);

        if (!camera) {
            // Camera may not exist yet or was deleted - silently ignore
            return;
        }

        // Only allow updates from the player who has the adjustment lock
        const adjuster = this.cameraSystem.getAdjustingPlayer(cameraId);
        if (adjuster && adjuster !== peerId) {
            console.warn(`[MessageHandler] UPDATE_CAMERA rejected: camera ${cameraId} is being adjusted by ${adjuster}, not ${peerId}`);
            return;
        }

        // Update position if provided
        if (position) {
            this.cameraSystem.updatePosition(cameraId, position);
        }

        // Update rotation if provided
        if (rotation) {
            this.cameraSystem.updateRotation(cameraId, rotation);
        }

        // No broadcast needed - STATE_UPDATE will include the changes automatically
    }

    /**
     * Handle PC player entering camera view mode
     */
    handleEnterCameraView(peerId, message) {
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'pc') {
            console.warn(`[MessageHandler] ENTER_CAMERA_VIEW rejected: not a PC player (${peerId})`);
            return;
        }

        const { cameraId } = message;

        // If cameraId is provided, validate camera exists
        if (cameraId) {
            const camera = this.cameraSystem.getCamera(cameraId);
            if (!camera) {
                console.warn(`[MessageHandler] ENTER_CAMERA_VIEW rejected: camera not found (${cameraId})`);
                return;
            }
        }

        this.cameraSystem.setViewer(peerId, cameraId);
        console.log(`[MessageHandler] Player ${peerId} entered camera view: ${cameraId || 'placement mode'}`);
    }

    /**
     * Handle PC player exiting camera view mode
     */
    handleExitCameraView(peerId, message) {
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'pc') {
            return;
        }

        this.cameraSystem.setViewer(peerId, null);
        console.log(`[MessageHandler] Player ${peerId} exited camera view`);
    }

    /**
     * Handle PC player starting to adjust a camera (locks it)
     */
    handleStartAdjustCamera(peerId, message) {
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'pc') {
            return;
        }

        const { cameraId } = message;
        const camera = this.cameraSystem.getCamera(cameraId);

        if (!camera) {
            console.warn(`[MessageHandler] START_ADJUST_CAMERA rejected: camera not found (${cameraId})`);
            return;
        }

        // Try to lock the camera
        if (this.cameraSystem.startAdjusting(cameraId, peerId)) {
            console.log(`[MessageHandler] Player ${peerId} started adjusting camera ${cameraId}`);
            // Broadcast that this camera is now being adjusted
            this.playerManager.broadcast({
                type: 'CAMERA_ADJUST_STARTED',
                cameraId: cameraId,
                playerId: peerId
            });
        } else {
            const adjuster = this.cameraSystem.getAdjustingPlayer(cameraId);
            console.warn(`[MessageHandler] START_ADJUST_CAMERA rejected: camera ${cameraId} already being adjusted by ${adjuster}`);
            this.playerManager.sendTo(peerId, {
                type: 'ADJUST_CAMERA_FAILED',
                cameraId: cameraId,
                reason: 'Camera is being adjusted by another player'
            });
        }
    }

    /**
     * Handle PC player stopping camera adjustment (unlocks it)
     */
    handleStopAdjustCamera(peerId, message) {
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'pc') {
            return;
        }

        const { cameraId } = message;
        this.cameraSystem.stopAdjusting(cameraId, peerId);
        console.log(`[MessageHandler] Player ${peerId} stopped adjusting camera ${cameraId}`);

        // Broadcast that this camera is no longer being adjusted
        this.playerManager.broadcast({
            type: 'CAMERA_ADJUST_STOPPED',
            cameraId: cameraId
        });
    }

    /**
     * Handle VR player setting camera limits
     */
    handleSetCameraLimits(peerId, message) {
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'vr') {
            console.warn(`[MessageHandler] SET_CAMERA_LIMITS rejected: not a VR player (${peerId})`);
            return;
        }

        const { securityLimit, streamLimit } = message;

        this.cameraSystem.setLimits(securityLimit, streamLimit);

        // Broadcast new limits to all players
        this.playerManager.broadcast({
            type: 'CAMERA_LIMITS_UPDATED',
            limits: this.cameraSystem.getLimits()
        });
    }

    /**
     * Handle viewer connection (web camera viewer)
     * Viewers receive STATE_UPDATE but don't participate as players
     */
    handleViewerJoin(peerId, message) {
        const { cameraId } = message;

        // Validate camera exists if specified
        if (cameraId) {
            const camera = this.cameraSystem.getCamera(cameraId);
            if (!camera) {
                this.playerManager.sendTo(peerId, {
                    type: 'CAMERA_NOT_FOUND',
                    cameraId: cameraId
                });
                return;
            }
        }

        // Register as web viewer
        this.cameraSystem.registerWebViewer(peerId, cameraId);

        console.log(`[MessageHandler] Viewer ${peerId} joined for camera: ${cameraId || 'none'}`);

        // Send initial state (viewers get the same state as players)
        this.playerManager.sendTo(peerId, {
            type: 'JOINED',
            playerId: peerId,
            playerType: 'viewer',
            cameraId: cameraId,
            state: this.gameState.getSerializableState(),
            cameras: this.cameraSystem.getAllCameras()
        });
    }

    // ==================== Monitor Message Handlers ====================

    /**
     * Handle PC player requesting to view a monitor
     */
    handleStartMonitorView(peerId, message) {
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'pc') {
            console.warn(`[MessageHandler] START_MONITOR_VIEW rejected: not a PC player (${peerId})`);
            return;
        }

        const { monitorId } = message;

        // Get monitor config
        const config = this.monitorSystem.getConfig(monitorId);
        if (!config) {
            console.warn(`[MessageHandler] START_MONITOR_VIEW rejected: monitor not found (${monitorId})`);
            this.playerManager.sendTo(peerId, {
                type: 'MONITOR_VIEW_DENIED',
                monitorId,
                reason: 'Monitor not found'
            });
            return;
        }

        // Try to lock the monitor
        if (this.monitorSystem.lockViewer(monitorId, peerId)) {
            // Get all available cameras for navigation
            const cameras = this.cameraSystem.getCamerasByType(CAMERA_TYPES.SECURITY);
            const cameraIds = cameras.map(c => c.id);

            console.log(`[MessageHandler] Player ${peerId} started viewing monitor ${monitorId}`);

            // Send success to the requesting player
            this.playerManager.sendTo(peerId, {
                type: 'MONITOR_VIEW_STARTED',
                monitorId,
                cameraId: config.cameraId,
                cameraIds,  // All available camera IDs for navigation
                currentIndex: config.cameraId ? cameraIds.indexOf(config.cameraId) : -1
            });

            // Broadcast to all players that this monitor is locked
            this.playerManager.broadcast({
                type: 'MONITOR_VIEWER_LOCKED',
                monitorId,
                viewerId: peerId
            }, peerId);
        } else {
            const currentViewer = this.monitorSystem.getViewer(monitorId);
            console.log(`[MessageHandler] START_MONITOR_VIEW rejected: monitor ${monitorId} in use by ${currentViewer}`);
            this.playerManager.sendTo(peerId, {
                type: 'MONITOR_VIEW_DENIED',
                monitorId,
                reason: 'Monitor is in use by another player'
            });
        }
    }

    /**
     * Handle PC player stopping monitor view
     */
    handleStopMonitorView(peerId, message) {
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'pc') {
            return;
        }

        const { monitorId } = message;

        if (this.monitorSystem.releaseViewer(monitorId, peerId)) {
            console.log(`[MessageHandler] Player ${peerId} stopped viewing monitor ${monitorId}`);

            // Broadcast to all players that this monitor is released
            this.playerManager.broadcast({
                type: 'MONITOR_VIEWER_RELEASED',
                monitorId
            });
        }
    }

    /**
     * Handle PC player changing monitor camera assignment
     */
    handleChangeMonitorCamera(peerId, message) {
        const player = this.gameState.getPlayer(peerId);
        if (!player || player.type !== 'pc') {
            console.warn(`[MessageHandler] CHANGE_MONITOR_CAMERA rejected: not a PC player (${peerId})`);
            return;
        }

        const { monitorId, cameraId } = message;

        // Verify the player has the monitor lock
        const currentViewer = this.monitorSystem.getViewer(monitorId);
        if (currentViewer !== peerId) {
            console.warn(`[MessageHandler] CHANGE_MONITOR_CAMERA rejected: player ${peerId} doesn't have lock on ${monitorId}`);
            return;
        }

        // Validate camera exists (if not null)
        if (cameraId) {
            const camera = this.cameraSystem.getCamera(cameraId);
            if (!camera || camera.type !== CAMERA_TYPES.SECURITY) {
                console.warn(`[MessageHandler] CHANGE_MONITOR_CAMERA rejected: camera not found or not security (${cameraId})`);
                return;
            }
        }

        // Update the assignment
        if (this.monitorSystem.assignCamera(monitorId, cameraId)) {
            console.log(`[MessageHandler] Monitor ${monitorId} camera changed to ${cameraId} by ${peerId}`);

            // Broadcast to all players
            this.playerManager.broadcast({
                type: 'MONITOR_CAMERA_CHANGED',
                monitorId,
                cameraId
            });
        }
    }

    /**
     * Get camera system (for external access, e.g., state updates)
     */
    getCameraSystem() {
        return this.cameraSystem;
    }

    /**
     * Get monitor system (for external access, e.g., state updates)
     */
    getMonitorSystem() {
        return this.monitorSystem;
    }

    /**
     * Clean up cameras when a player disconnects
     */
    handlePlayerDisconnect(peerId) {
        const removedCameraIds = this.cameraSystem.cleanupPlayerCameras(peerId);

        // Broadcast camera removals
        for (const cameraId of removedCameraIds) {
            this.playerManager.broadcast({
                type: 'CAMERA_PICKED_UP',
                cameraId: cameraId,
                reason: 'Owner disconnected'
            });
        }

        // Clear any camera adjustments this player was doing
        const clearedAdjustments = this.cameraSystem.clearPlayerAdjustments(peerId);
        for (const cameraId of clearedAdjustments) {
            this.playerManager.broadcast({
                type: 'CAMERA_ADJUST_STOPPED',
                cameraId: cameraId
            });
        }

        // Also unregister as web viewer
        this.cameraSystem.unregisterWebViewer(peerId);

        // Clean up monitor viewer locks
        const releasedMonitors = this.monitorSystem.cleanupPlayerViewers(peerId);
        for (const monitorId of releasedMonitors) {
            this.playerManager.broadcast({
                type: 'MONITOR_VIEWER_RELEASED',
                monitorId
            });
        }
    }
}

module.exports = MessageHandler;
