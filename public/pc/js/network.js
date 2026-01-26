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

        // Voice callbacks
        this.onVoiceReceived = null;

        // Camera callbacks
        this.onCameraPlaced = null;
        this.onCameraPickedUp = null;
        this.onCameraAdjusted = null;
        this.onCameraLimitsUpdated = null;
        this.onCamerasUpdate = null;  // For STATE_UPDATE cameras array
        this.onCameraAdjustStarted = null;  // Camera being adjusted by a player
        this.onCameraAdjustStopped = null;  // Camera no longer being adjusted

        // Monitor callbacks
        this.onMonitorViewStarted = null;   // Successfully started viewing a monitor
        this.onMonitorViewDenied = null;    // Failed to view monitor (in use)
        this.onMonitorViewerLocked = null;  // Another player started viewing a monitor
        this.onMonitorViewerReleased = null; // Monitor viewer released
        this.onMonitorCameraChanged = null;  // Monitor camera assignment changed
        this.onMonitorsUpdate = null;        // For STATE_UPDATE monitors array

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
                this.updateStatus('Connected');

                // Don't auto-join - let home page handle joining
                if (this.onConnected) this.onConnected();
                resolve();
            });

            this.socket.on('message', (message) => {
                this.handleMessage(message);
            });

            // Handle voice audio from VR players (separate binary event)
            this.socket.on('voice', (payload) => {
                if (this.onVoiceReceived && payload && payload.senderId && payload.data) {
                    this.onVoiceReceived(payload.senderId, payload.data);
                }
            });

            this.socket.on('disconnect', () => {
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
                // Also pass monitors array if present
                if (message.monitors && this.onMonitorsUpdate) {
                    this.onMonitorsUpdate(message.monitors);
                }
                break;

            case MSG.GRABBED:
                if (this.onGrabbed) this.onGrabbed(message.grabbedBy);
                break;

            case MSG.RELEASED:
                if (this.onReleased) this.onReleased();
                break;

            case MSG.PLAYER_JOINED:
                if (this.onPlayerJoined) this.onPlayerJoined(message.player);
                break;

            case MSG.PLAYER_LEFT:
                if (this.onPlayerLeft) this.onPlayerLeft(message.playerId);
                break;

            case MSG.INTERACT_SUCCESS:
                if (this.onInteractSuccess) {
                    this.onInteractSuccess(message.interactionType, message.targetId, message.result);
                }
                break;

            case MSG.INTERACT_FAIL:
                if (this.onInteractFail) {
                    this.onInteractFail(message.interactionType, message.targetId, message.reason);
                }
                break;

            case MSG.TIMED_INTERACT_PROGRESS:
                if (this.onTimedInteractProgress) {
                    this.onTimedInteractProgress(message.interactionType, message.targetId, message.duration);
                }
                break;

            case MSG.TIMED_INTERACT_COMPLETE:
                if (this.onTimedInteractComplete) {
                    this.onTimedInteractComplete(message.interactionType, message.stationId, message.result);
                }
                break;

            case MSG.TIMED_INTERACT_CANCELLED:
                if (this.onTimedInteractCancelled) {
                    this.onTimedInteractCancelled(message.reason);
                }
                break;

            case MSG.SLEEP_MINIGAME_RESULT:
                if (this.onSleepMinigameResult) {
                    this.onSleepMinigameResult(message.score, message.multiplier);
                }
                break;

            case MSG.PLAYER_DIED:
                if (this.onPlayerDied) this.onPlayerDied(message.deathPosition, message.cause);
                break;

            case MSG.PLAYER_REVIVED:
                if (message.position && this.onPlayerRevived) {
                    this.onPlayerRevived(message.position, message.needs);
                }
                break;

            // Queue messages
            case 'JOIN_QUEUED':
                if (this.onJoinQueued) {
                    this.onJoinQueued(message.position, message.total, message.playerLimit, message.waitingRoomPosition);
                }
                break;

            case 'QUEUE_JOINED':
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
                if (this.onQueueReady) {
                    this.onQueueReady();
                }
                break;

            case 'JOIN_FROM_QUEUE_FAILED':
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
                if (this.onChatFailed) {
                    this.onChatFailed(message.reason);
                }
                break;

            case MSG.NAME_UPDATED:
                if (this.onNameUpdated) {
                    this.onNameUpdated(message.name);
                }
                break;

            case MSG.NAME_UPDATE_FAILED:
                if (this.onNameUpdateFailed) {
                    this.onNameUpdateFailed(message.reason);
                }
                break;

            case MSG.PLAYER_MUTED:
                if (this.onPlayerMuted) {
                    this.onPlayerMuted(message.playerId, message.duration);
                }
                break;

            case MSG.PLAYER_KICKED:
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
                if (this.onCameraPlaced) {
                    this.onCameraPlaced(message.camera);
                }
                break;

            case MSG.CAMERA_PICKED_UP:
                if (this.onCameraPickedUp) {
                    this.onCameraPickedUp(message.cameraId);
                }
                break;

            case MSG.CAMERA_ADJUSTED:
                if (this.onCameraAdjusted) {
                    this.onCameraAdjusted(message.cameraId, message.rotation);
                }
                break;

            case MSG.CAMERA_LIMITS_UPDATED:
                if (this.onCameraLimitsUpdated) {
                    this.onCameraLimitsUpdated(message.limits);
                }
                break;

            case 'CAMERA_ADJUST_STARTED':
                if (this.onCameraAdjustStarted) {
                    this.onCameraAdjustStarted(message.cameraId, message.playerId);
                }
                break;

            case 'CAMERA_ADJUST_STOPPED':
                if (this.onCameraAdjustStopped) {
                    this.onCameraAdjustStopped(message.cameraId);
                }
                break;

            // Monitor messages
            case 'MONITOR_VIEW_STARTED':
                if (this.onMonitorViewStarted) {
                    this.onMonitorViewStarted(message.monitorId, message.cameraId, message.cameraIds, message.currentIndex);
                }
                break;

            case 'MONITOR_VIEW_DENIED':
                if (this.onMonitorViewDenied) {
                    this.onMonitorViewDenied(message.monitorId, message.reason);
                }
                break;

            case 'MONITOR_VIEWER_LOCKED':
                if (this.onMonitorViewerLocked) {
                    this.onMonitorViewerLocked(message.monitorId, message.viewerId);
                }
                break;

            case 'MONITOR_VIEWER_RELEASED':
                if (this.onMonitorViewerReleased) {
                    this.onMonitorViewerReleased(message.monitorId);
                }
                break;

            case 'MONITOR_CAMERA_CHANGED':
                if (this.onMonitorCameraChanged) {
                    this.onMonitorCameraChanged(message.monitorId, message.cameraId);
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

    // Monitor messages
    sendStartMonitorView(monitorId) {
        this.send({
            type: 'START_MONITOR_VIEW',
            monitorId
        });
    }

    sendStopMonitorView(monitorId) {
        this.send({
            type: 'STOP_MONITOR_VIEW',
            monitorId
        });
    }

    sendChangeMonitorCamera(monitorId, cameraId) {
        this.send({
            type: 'CHANGE_MONITOR_CAMERA',
            monitorId,
            cameraId
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
