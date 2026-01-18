/**
 * Socket.IO network client for VR
 */

import { MSG, createJoinMessage, createVRPoseMessage, createGrabAttemptMessage, createGrabReleaseMessage } from '../../pc/shared/protocol.js';

export class Network {
    constructor() {
        this.socket = null;
        this.playerId = null;
        this.isConnected = false;

        // Callbacks
        this.onConnected = null;
        this.onDisconnected = null;
        this.onStateUpdate = null;
        this.onGrabSuccess = null;
        this.onReleaseSuccess = null;
        this.onPlayerJoined = null;
        this.onPlayerLeft = null;

        // Status element
        this.statusEl = document.getElementById('status');
        this.grabStatusEl = document.getElementById('grab-status');
    }

    connect() {
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
                console.log('Connected with ID:', this.playerId);
                this.updateStatus('Connected! Enter VR to play');

                // Send join request as VR player
                this.send(createJoinMessage('vr'));

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
                console.log('Joined game as VR player:', message);
                this.updateStatus('Ready - Enter VR to play');
                break;

            case MSG.STATE_UPDATE:
                if (this.onStateUpdate) {
                    this.onStateUpdate(message.state);
                }
                break;

            case MSG.GRAB_SUCCESS:
                console.log('Grabbed player:', message.grabbedPlayer);
                this.updateGrabStatus('Holding player: ' + message.grabbedPlayer.slice(0, 8));
                if (this.onGrabSuccess) this.onGrabSuccess(message.grabbedPlayer);
                break;

            case MSG.RELEASE_SUCCESS:
                console.log('Released player:', message.releasedPlayer);
                this.updateGrabStatus('');
                if (this.onReleaseSuccess) this.onReleaseSuccess(message.releasedPlayer);
                break;

            case MSG.PLAYER_JOINED:
                console.log('Player joined:', message.player);
                if (this.onPlayerJoined) this.onPlayerJoined(message.player);
                break;

            case MSG.PLAYER_LEFT:
                console.log('Player left:', message.playerId);
                if (this.onPlayerLeft) this.onPlayerLeft(message.playerId);
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

    sendGrabAttempt(hand) {
        this.send(createGrabAttemptMessage(hand));
    }

    sendGrabRelease() {
        this.send(createGrabReleaseMessage());
    }

    updateStatus(text) {
        if (this.statusEl) {
            this.statusEl.textContent = text;
        }
    }

    updateGrabStatus(text) {
        if (this.grabStatusEl) {
            this.grabStatusEl.textContent = text;
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}
