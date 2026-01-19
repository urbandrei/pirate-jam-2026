/**
 * Socket.IO network client for PC
 */

import { MSG, createJoinMessage, createInputMessage } from '../shared/protocol.js';

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

            case MSG.ERROR_BROADCAST:
                console.log(`[ERROR from ${message.source}] ${message.errorType}: ${message.message}`);
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

    sendError(errorType, error) {
        if (!this.isConnected) return;
        this.socket.emit('message', {
            type: 'ERROR_REPORT',
            errorType: errorType,
            message: error.message || String(error),
            stack: error.stack || null,
            timestamp: Date.now()
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
