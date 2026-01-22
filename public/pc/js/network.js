/**
 * Socket.IO network client for PC
 */

import { MSG, createJoinMessage, createInputMessage, createInteractMessage, createTimedInteractStartMessage, createTimedInteractCancelMessage, createSleepMinigameCompleteMessage } from '../shared/protocol.js';

export class Network {
    constructor() {
        this.socket = null;
        this.playerId = null;
        this.isConnected = false;

        // Callbacks
        this.onConnected = null;
        this.onDisconnected = null;
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
                this.updateStatus('Connected! Click to play');

                // Send join request
                this.send(createJoinMessage('pc'));

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
                this.updateStatus(`Playing as ${this.playerId.slice(0, 8)}`);
                break;

            case MSG.STATE_UPDATE:
                if (this.onStateUpdate) {
                    this.onStateUpdate(message.state);
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
                console.log('You died at:', message.deathPosition);
                if (this.onPlayerDied) this.onPlayerDied(message.deathPosition);
                break;

            case MSG.PLAYER_REVIVED:
                console.log('Player revived:', message.playerId || 'you');
                if (message.position && this.onPlayerRevived) {
                    this.onPlayerRevived(message.position, message.needs);
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
