/**
 * Socket.IO network client for VR
 */

import { MSG, createJoinMessage, createVRPoseMessage } from '../../pc/shared/protocol.js';

export class Network {
    constructor() {
        this.socket = null;
        this.playerId = null;
        this.isConnected = false;
        this.socketScript = null; // Track Socket.IO script for cleanup
        this.password = null; // VR password for authentication

        // Callbacks
        this.onConnected = null;
        this.onDisconnected = null;
        this.onStateUpdate = null;
        this.onPlayerJoined = null;
        this.onPlayerLeft = null;
        this.onChatReceived = null;
        this.onStreamChatReceived = null;
        this.onRejected = null; // Called when password is wrong

        // Camera callbacks
        this.onCameraPlaced = null;
        this.onCameraPickedUp = null;
        this.onCameraLimitsUpdated = null;
        this.onCamerasUpdate = null;

        // Status element
        this.statusEl = document.getElementById('status');
    }

    connect(password = null) {
        this.password = password;
        return new Promise((resolve, reject) => {
            this.updateStatus('Connecting to server...');

            // Determine game server URL for loading Socket.IO
            let gameServerBase = '';
            const port = parseInt(window.location.port) || 80;
            if (window.GAME_SERVER_URL) {
                gameServerBase = window.GAME_SERVER_URL;
            } else if (port !== 3000 && port !== 80 && port !== 443) {
                gameServerBase = `${window.location.protocol}//${window.location.hostname}:3000`;
            }

            // Load Socket.IO client dynamically from game server
            const script = document.createElement('script');
            script.src = `${gameServerBase}/socket.io/socket.io.js`;
            script.onload = () => {
                this.initializeSocket(resolve, reject);
            };
            script.onerror = () => {
                this.updateStatus('Failed to load Socket.IO');
                reject(new Error('Failed to load Socket.IO'));
            };
            document.head.appendChild(script);
            this.socketScript = script; // Store reference for cleanup
        });
    }

    initializeSocket(resolve, reject) {
        try {
            // Connect to game server
            // If served from a different port (e.g., 3002), connect to game server on port 3000
            let serverUrl = window.GAME_SERVER_URL;
            if (!serverUrl) {
                const port = parseInt(window.location.port) || 80;
                if (port !== 3000 && port !== 80 && port !== 443) {
                    serverUrl = `${window.location.protocol}//${window.location.hostname}:3000`;
                }
            }
            this.socket = io(serverUrl);

            this.socket.on('connect', () => {
                this.playerId = this.socket.id;
                this.isConnected = true;
                this.updateStatus('Connected! Enter VR to play');

                // Send join request as VR player (with password if set)
                this.send(createJoinMessage('vr', this.password));

                if (this.onConnected) this.onConnected();
                resolve();
            });

            this.socket.on('message', (message) => {
                this.handleMessage(message);
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
                this.updateStatus('Ready - Enter VR to play');
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

            case MSG.PLAYER_JOINED:
                if (this.onPlayerJoined) this.onPlayerJoined(message.player);
                break;

            case MSG.PLAYER_LEFT:
                if (this.onPlayerLeft) this.onPlayerLeft(message.playerId);
                break;

            case MSG.CHAT_RECEIVED:
                if (this.onChatReceived) {
                    this.onChatReceived(message.senderId, message.senderName, message.text);
                }
                break;

            case MSG.STREAM_CHAT_RECEIVED:
                if (this.onStreamChatReceived) {
                    this.onStreamChatReceived(message);
                }
                break;

            // Camera events
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

            case MSG.CAMERA_LIMITS_UPDATED:
                if (this.onCameraLimitsUpdated) {
                    this.onCameraLimitsUpdated(message.limits);
                }
                break;

            case 'REJECTED':
                this.updateStatus('Rejected: ' + message.reason);
                if (this.onRejected) {
                    this.onRejected(message.reason);
                }
                break;
        }
    }

    send(message) {
        if (this.socket && this.isConnected) {
            this.socket.emit('message', message);
        }
    }

    sendPose(head, leftHand, rightHand) {
        this.send(createVRPoseMessage(head, leftHand, rightHand));
    }

    /**
     * Send voice audio data to server (binary transmission)
     * @param {Blob} audioData - Audio chunk from MediaRecorder
     */
    sendVoice(audioData) {
        if (this.socket && this.isConnected) {
            this.socket.emit('voice', audioData);
        }
    }

    updateStatus(text) {
        if (this.statusEl) {
            this.statusEl.textContent = text;
        }
    }

    disconnect() {
        if (this.socket) {
            // Remove all event listeners to prevent accumulation on reconnect
            this.socket.off('connect');
            this.socket.off('message');
            this.socket.off('disconnect');
            this.socket.off('connect_error');
            this.socket.disconnect();
            this.socket = null;
        }

        // Remove Socket.IO script from DOM to prevent duplicate loads
        if (this.socketScript && this.socketScript.parentNode) {
            this.socketScript.parentNode.removeChild(this.socketScript);
            this.socketScript = null;
        }

        this.playerId = null;
        this.isConnected = false;
    }
}
