/**
 * TwitchChat - Manages Twitch IRC connection via tmi.js
 * Connects in anonymous/read-only mode to a channel
 */

const tmi = require('tmi.js');

// Rate limiting: 500ms per Twitch user to prevent flood
const STREAM_RATE_LIMIT_MS = 500;
const MAX_STREAM_MESSAGE_LENGTH = 200;

class TwitchChat {
    /**
     * @param {Function} onMessage - Callback when a message is received
     */
    constructor(onMessage) {
        this.client = null;
        this.connected = false;
        this.currentChannel = null;
        this.onMessage = onMessage;

        // Rate limiting per Twitch user
        this.lastMessageTime = new Map();

        // Connection state for admin UI
        this.status = 'disconnected'; // 'disconnected', 'connecting', 'connected', 'error'
        this.lastError = null;
    }

    /**
     * Connect to a Twitch channel (anonymous/read-only)
     * @param {string} channel - Channel name (without #)
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async connect(channel) {
        if (this.connected) {
            await this.disconnect();
        }

        this.status = 'connecting';
        this.currentChannel = channel.toLowerCase().replace('#', '');

        try {
            this.client = new tmi.Client({
                channels: [this.currentChannel],
                connection: {
                    reconnect: true,
                    secure: true
                }
            });

            // Set up event handlers
            this.client.on('message', (channel, tags, message, self) => {
                this._handleTwitchMessage(channel, tags, message);
            });

            this.client.on('connected', () => {
                this.connected = true;
                this.status = 'connected';
                this.lastError = null;
                console.log(`[TwitchChat] Connected to #${this.currentChannel}`);
            });

            this.client.on('disconnected', (reason) => {
                this.connected = false;
                this.status = 'disconnected';
                console.log(`[TwitchChat] Disconnected: ${reason}`);
            });

            await this.client.connect();
            return { success: true };
        } catch (err) {
            this.status = 'error';
            this.lastError = err.message;
            console.error(`[TwitchChat] Connection error:`, err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Disconnect from Twitch
     */
    async disconnect() {
        if (this.client) {
            try {
                await this.client.disconnect();
            } catch (err) {
                console.warn('[TwitchChat] Error during disconnect:', err);
            }
            this.client = null;
        }
        this.connected = false;
        this.status = 'disconnected';
        this.currentChannel = null;
        this.lastMessageTime.clear();
    }

    /**
     * Handle incoming Twitch message
     */
    _handleTwitchMessage(channel, tags, message) {
        const userId = tags['user-id'];
        const username = tags['display-name'] || tags.username;

        // Rate limit per user
        const lastTime = this.lastMessageTime.get(userId) || 0;
        const now = Date.now();
        if (now - lastTime < STREAM_RATE_LIMIT_MS) {
            return; // Skip rate-limited messages
        }
        this.lastMessageTime.set(userId, now);

        // Truncate message
        let text = message.trim();
        if (text.length > MAX_STREAM_MESSAGE_LENGTH) {
            text = text.slice(0, MAX_STREAM_MESSAGE_LENGTH);
        }

        // Skip empty messages
        if (!text) return;

        // Call the broadcast callback
        if (this.onMessage) {
            this.onMessage({
                platform: 'twitch',
                userId: userId,
                username: username,
                text: text,
                timestamp: now,
                color: tags.color || null,
                badges: tags.badges || {}
            });
        }
    }

    /**
     * Get current status for admin UI
     */
    getStatus() {
        return {
            status: this.status,
            channel: this.currentChannel,
            connected: this.connected,
            lastError: this.lastError
        };
    }

    /**
     * Cleanup on server shutdown
     */
    dispose() {
        this.disconnect();
    }
}

module.exports = TwitchChat;
