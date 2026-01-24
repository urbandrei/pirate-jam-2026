/**
 * Socket.IO network client for PC
 */

import { MSG, createJoinMessage, createInputMessage, createInteractMessage, createTimedInteractStartMessage, createTimedInteractCancelMessage, createSleepMinigameCompleteMessage, createChatMessage, createSetNameMessage, createEnterCameraViewMessage, createExitCameraViewMessage, createPlaceCameraMessage, createPickupCameraMessage, createAdjustCameraMessage } from '../shared/protocol.js';

export class Network {
    constructor() {
        this.socket = null;
        this.playerId = null;
        this.isConnected = false;

        // Callbacks
        this.onConnected = null;
        this.onDisconnected = null;
        this.onJoined = null;
        this.onStateUpdate = null;
        this.onGrabbed = null;
        this.onReleased = null;
        this.onPlayerJoined = null;
        this.onPlayerLeft = null;
        this.onInteractSuccess = null;
        this.onInteractFail = null;
        this.onTimedInteractProgress = null;
        this.onTimedInteractComplete = null;
        this.onTimedInteractCancelled = null;
        this.onSleepMinigameResult = null;
        this.onPlayerDied = null;
        this.onPlayerRevived = null;

        // Queue callbacks
        this.onJoinQueued = null;
        this.onQueueJoined = null;
        this.onQueueUpdate = null;
        this.onQueueReady = null;
        this.onJoinFromQueueFailed = null;

        // Waiting room callbacks
        this.onWaitingRoomState = null;
        this.onDoorTimeout = null;

        // Chat callbacks
        this.onChatReceived = null;
        this.onChatFailed = null;
        this.onNameUpdated = null;
        this.onNameUpdateFailed = null;
        this.onPlayerMuted = null;
        this.onPlayerKicked = null;

        // Stream chat callbacks
        this.onStreamChatReceived = null;

        // Camera callbacks
        this.onCameraPlaced = null;
        this.onCameraPickedUp = null;
        this.onCameraAdjusted = null;
        this.onCameraLimitsUpdated = null;
        this.onCamerasUpdate = null;  // For STATE_UPDATE cameras array
        this.onCameraAdjustStarted = null;  // Camera being adjusted by a player
        this.onCameraAdjustStopped = null;  // Camera no longer being adjusted

        // Status element
        this.statusEl = document.getElementById('status');
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.updateStatus('Connecting to server...');

            // Check that Socket.IO is loaded
            if (typeof io === 'undefined') {
                this.updateStatus('Socket.IO not loaded');
                reject(new Error('Socket.IO not loaded'));
                return;
            }

            this.initializeSocket(resolve, reject);
        });
    }

    initializeSocket(resolve, reject) {
        try {
            // Determine server URL:
            // 1. Use GAME_SERVER_URL from config.js if set (for itch.io deployment)
            // 2. Otherwise connect to same origin (for local development)
            let serverUrl = window.GAME_SERVER_URL || undefined;
            this.socket = io(serverUrl);

            this.socket.on('connect', () => {
                this.playerId = this.socket.id;
                this.isConnected = true;
                console.log('Connected with ID:', this.playerId);
                this.updateStatus('Connected');

                // Don't auto-join - let home page handle joining
                if (this.onConnected) this.onConnected();
                resolve();
            });

            this.socket.on('message', (message) => {
                this.handleMessage(message);
            });

            this.socket.on('disconnect', () => {
                console.log('Disconnected from server');
                this.isConnected = false;
                this.updateStatus('Disconnected');
                if (this.onDisconnected) this.onDisconnected();
            });

            this.socket.on('connect_error', (err) => {
                console.error('Connection error:', err);
                this.updateStatus('Connection error');
            });
        } catch (err) {
            reject(err);
        }
    }

    handleMessage(message) {
        switch (message.type) {
            case MSG.JOINED:
                console.log('Joined game:', message);
                // Status will be set by main.js after name is confirmed
                if (this.onJoined) this.onJoined(message.player, message.state);
                break;

            case MSG.STATE_UPDATE:
                if (this.onStateUpdate) {
                    this.onStateUpdate(message.state);
                }
                // Also pass cameras array if present
                if (message.cameras && this.onCamerasUpdate) {
                    this.onCamerasUpdate(message.cameras);
                }
                break;

            case MSG.GRABBED:
                console.log('You were grabbed by:', message.grabbedBy);
                if (this.onGrabbed) this.onGrabbed(message.grabbedBy);
                break;

            case MSG.RELEASED:
                console.log('You were released');
                if (this.onReleased) this.onReleased();
                break;

            case MSG.PLAYER_JOINED:
                console.log('Player joined:', message.player);
                if (this.onPlayerJoined) this.onPlayerJoined(message.player);
                break;

            case MSG.PLAYER_LEFT:
                console.log('Player left:', message.playerId);
                if (this.onPlayerLeft) this.onPlayerLeft(message.playerId);
                break;

            case MSG.INTERACT_SUCCESS:
                console.log('Interaction succeeded:', message.interactionType);
                if (this.onInteractSuccess) {
                    this.onInteractSuccess(message.interactionType, message.targetId, message.result);
                }
                break;

            case MSG.INTERACT_FAIL:
                console.log('Interaction failed:', message.reason);
                if (this.onInteractFail) {
                    this.onInteractFail(message.interactionType, message.targetId, message.reason);
                }
                break;

            case MSG.TIMED_INTERACT_PROGRESS:
                console.log('Timed interaction started:', message.interactionType, 'duration:', message.duration);
                if (this.onTimedInteractProgress) {
                    this.onTimedInteractProgress(message.interactionType, message.targetId, message.duration);
                }
                break;

            case MSG.TIMED_INTERACT_COMPLETE:
                console.log('Timed interaction complete:', message.interactionType);
                if (this.onTimedInteractComplete) {
                    this.onTimedInteractComplete(message.interactionType, message.stationId, message.result);
                }
                break;

            case MSG.TIMED_INTERACT_CANCELLED:
                console.log('Timed interaction cancelled:', message.reason);
                if (this.onTimedInteractCancelled) {
                    this.onTimedInteractCancelled(message.reason);
                }
                break;

            case MSG.SLEEP_MINIGAME_RESULT:
                console.log('Sleep minigame result:', message.score, message.multiplier);
                if (this.onSleepMinigameResult) {
                    this.onSleepMinigameResult(message.score, message.multiplier);
                }
                break;

            case MSG.PLAYER_DIED:
                console.log('You died at:', message.deathPosition, 'cause:', message.cause);
                if (this.onPlayerDied) this.onPlayerDied(message.deathPosition, message.cause);
                break;

            case MSG.PLAYER_REVIVED:
                console.log('Player revived:', message.playerId || 'you');
                if (message.position && this.onPlayerRevived) {
                    this.onPlayerRevived(message.position, message.needs);
                }
                break;

            // Queue messages
            case 'JOIN_QUEUED':
                console.log('Game full, added to queue at position:', message.position);
                if (this.onJoinQueued) {
                    this.onJoinQueued(message.position, message.total, message.playerLimit, message.waitingRoomPosition);
                }
                break;

            case 'QUEUE_JOINED':
                console.log('Joined queue at position:', message.position);
                if (this.onQueueJoined) {
                    this.onQueueJoined(message.position, message.total);
                }
                break;

            case 'QUEUE_UPDATE':
                if (this.onQueueUpdate) {
                    this.onQueueUpdate(message.position, message.total);
                }
                break;

            case 'QUEUE_READY':
                console.log('Slot available! Can join now.');
                if (this.onQueueReady) {
                    this.onQueueReady();
                }
                break;

            case 'JOIN_FROM_QUEUE_FAILED':
                console.log('Failed to join from queue:', message.reason);
                if (this.onJoinFromQueueFailed) {
                    this.onJoinFromQueueFailed(message.reason);
                }
                break;

            // Waiting room messages
            case 'WAITING_ROOM_STATE':
                if (this.onWaitingRoomState) {
                    this.onWaitingRoomState(message);
                }
                break;

            case 'DOOR_TIMEOUT':
                console.log('Took too long to enter door - moved to back of queue');
                if (this.onDoorTimeout) {
                    this.onDoorTimeout();
                }
                break;

            // Chat messages
            case MSG.CHAT_RECEIVED:
                if (this.onChatReceived) {
                    this.onChatReceived(message);
                }
                break;

            case MSG.CHAT_FAILED:
                console.log('Chat message failed:', message.reason);
                if (this.onChatFailed) {
                    this.onChatFailed(message.reason);
                }
                break;

            case MSG.NAME_UPDATED:
                console.log('Name updated to:', message.name);
                if (this.onNameUpdated) {
                    this.onNameUpdated(message.name);
                }
                break;

            case MSG.NAME_UPDATE_FAILED:
                console.log('Name update failed:', message.reason);
                if (this.onNameUpdateFailed) {
                    this.onNameUpdateFailed(message.reason);
                }
                break;

            case MSG.PLAYER_MUTED:
                console.log('Player muted:', message.playerId);
                if (this.onPlayerMuted) {
                    this.onPlayerMuted(message.playerId, message.duration);
                }
                break;

            case MSG.PLAYER_KICKED:
                console.log('Player kicked:', message.playerId);
                if (this.onPlayerKicked) {
                    this.onPlayerKicked(message.playerId);
                }
                break;

            // Stream chat messages
            case MSG.STREAM_CHAT_RECEIVED:
                if (this.onStreamChatReceived) {
                    this.onStreamChatReceived(message);
                }
                break;

            // Camera messages
            case MSG.CAMERA_PLACED:
                console.log('Camera placed:', message.camera);
                if (this.onCameraPlaced) {
                    this.onCameraPlaced(message.camera);
                }
                break;

            case MSG.CAMERA_PICKED_UP:
                console.log('Camera picked up:', message.cameraId);
                if (this.onCameraPickedUp) {
                    this.onCameraPickedUp(message.cameraId);
                }
                break;

            case MSG.CAMERA_ADJUSTED:
                console.log('Camera adjusted:', message.cameraId);
                if (this.onCameraAdjusted) {
                    this.onCameraAdjusted(message.cameraId, message.rotation);
                }
                break;

            case MSG.CAMERA_LIMITS_UPDATED:
                console.log('Camera limits updated:', message.limits);
                if (this.onCameraLimitsUpdated) {
                    this.onCameraLimitsUpdated(message.limits);
                }
                break;

            case 'CAMERA_ADJUST_STARTED':
                console.log('Camera adjust started:', message.cameraId, 'by', message.playerId);
                if (this.onCameraAdjustStarted) {
                    this.onCameraAdjustStarted(message.cameraId, message.playerId);
                }
                break;

            case 'CAMERA_ADJUST_STOPPED':
                console.log('Camera adjust stopped:', message.cameraId);
                if (this.onCameraAdjustStopped) {
                    this.onCameraAdjustStopped(message.cameraId);
                }
                break;
        }
    }

    send(message) {
        if (this.socket && this.isConnected) {
            this.socket.emit('message', message);
        }
    }

    sendInput(input, lookRotation) {
        this.send(createInputMessage(input, lookRotation));
    }

    sendInteract(interactionType, targetId, targetPosition) {
        this.send(createInteractMessage(interactionType, targetId, targetPosition));
    }

    sendTimedInteractStart(interactionType, targetId, targetPosition) {
        this.send(createTimedInteractStartMessage(interactionType, targetId, targetPosition));
    }

    sendTimedInteractCancel() {
        this.send(createTimedInteractCancelMessage());
    }

    sendSleepMinigameComplete(score, multiplier) {
        this.send(createSleepMinigameCompleteMessage(score, multiplier));
    }

    sendRevive() {
        this.send({ type: MSG.REVIVE });
    }

    sendChatMessage(text) {
        this.send(createChatMessage(text));
    }

    sendSetName(name) {
        this.send(createSetNameMessage(name));
    }

    sendJoin() {
        this.send(createJoinMessage('pc'));
    }

    sendEnterCameraView(cameraId) {
        this.send(createEnterCameraViewMessage(cameraId));
    }

    sendExitCameraView() {
        this.send(createExitCameraViewMessage());
    }

    sendPlaceCamera(type, position, rotation) {
        this.send(createPlaceCameraMessage(type, position, rotation));
    }

    sendAdjustCamera(cameraId, rotation) {
        this.send(createAdjustCameraMessage(cameraId, rotation));
    }

    sendPickupCamera(cameraId) {
        this.send(createPickupCameraMessage(cameraId));
    }

    sendStartAdjustCamera(cameraId) {
        this.send({ type: 'START_ADJUST_CAMERA', cameraId });
    }

    sendStopAdjustCamera(cameraId) {
        this.send({ type: 'STOP_ADJUST_CAMERA', cameraId });
    }

    sendUpdateCamera(cameraId, position, rotation) {
        this.send({
            type: 'UPDATE_CAMERA',
            cameraId,
            position,
            rotation
        });
    }

    updateStatus(text) {
        if (this.statusEl) {
            this.statusEl.textContent = text;
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}
