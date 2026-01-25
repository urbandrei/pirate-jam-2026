/**
 * DiscordBot - Manages Discord bot connection via discord.js
 * Provides bidirectional chat bridge and bot commands
 */

const { Client, GatewayIntentBits, Events } = require('discord.js');

// Rate limiting: 500ms per Discord user to prevent flood
const RATE_LIMIT_MS = 500;
const MAX_MESSAGE_LENGTH = 200;

class DiscordBot {
    /**
     * @param {Function} onMessage - Callback when a chat message is received
     */
    constructor(onMessage) {
        this.client = null;
        this.connected = false;
        this.onMessage = onMessage;

        // Configuration
        this.token = null;
        this.chatChannelId = null;
        this.commandsChannelId = null;

        // Rate limiting per Discord user
        this.lastMessageTime = new Map();

        // Connection state for admin UI
        this.status = 'disconnected'; // 'disconnected', 'connecting', 'connected', 'error'
        this.lastError = null;

        // Command handlers (set by server)
        this.onCamerasCommand = null;
        this.onCameraCommand = null;
    }

    /**
     * Connect to Discord with bot token
     * @param {string} token - Bot token
     * @param {string} chatChannelId - Channel ID for chat bridge
     * @param {string} commandsChannelId - Channel ID for bot commands (optional)
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async connect(token, chatChannelId, commandsChannelId = null) {
        if (this.connected) {
            await this.disconnect();
        }

        this.status = 'connecting';
        this.token = token;
        this.chatChannelId = chatChannelId;
        this.commandsChannelId = commandsChannelId;

        try {
            this.client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent
                ]
            });

            // Set up event handlers
            this.client.on(Events.MessageCreate, (message) => {
                this._handleDiscordMessage(message);
            });

            this.client.on(Events.ClientReady, () => {
                this.connected = true;
                this.status = 'connected';
                this.lastError = null;
                console.log(`[DiscordBot] Connected as ${this.client.user.tag}`);
            });

            this.client.on(Events.Error, (error) => {
                this.lastError = error.message;
                console.error('[DiscordBot] Error:', error);
            });

            this.client.on('disconnect', () => {
                this.connected = false;
                this.status = 'disconnected';
                console.log('[DiscordBot] Disconnected');
            });

            await this.client.login(token);
            return { success: true };
        } catch (err) {
            this.status = 'error';
            this.lastError = err.message;
            console.error('[DiscordBot] Connection error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Disconnect from Discord
     */
    async disconnect() {
        if (this.client) {
            try {
                await this.client.destroy();
            } catch (err) {
                console.warn('[DiscordBot] Error during disconnect:', err);
            }
            this.client = null;
        }
        this.connected = false;
        this.status = 'disconnected';
        this.token = null;
        this.chatChannelId = null;
        this.commandsChannelId = null;
        this.lastMessageTime.clear();
    }

    /**
     * Handle incoming Discord message
     */
    _handleDiscordMessage(message) {
        // Ignore bot messages
        if (message.author.bot) return;

        const channelId = message.channel.id;

        // Handle chat channel messages (relay to game)
        if (channelId === this.chatChannelId) {
            this._handleChatMessage(message);
        }

        // Handle command channel messages
        if (channelId === this.commandsChannelId ||
            (this.commandsChannelId === null && channelId === this.chatChannelId)) {
            this._handleCommandMessage(message);
        }
    }

    /**
     * Handle chat message (relay to game)
     */
    _handleChatMessage(message) {
        const userId = message.author.id;
        const username = message.author.displayName || message.author.username;

        // Skip if message starts with command prefix
        if (message.content.trim().startsWith('!')) {
            return;
        }

        // Rate limit per user
        const lastTime = this.lastMessageTime.get(userId) || 0;
        const now = Date.now();
        if (now - lastTime < RATE_LIMIT_MS) {
            return;
        }
        this.lastMessageTime.set(userId, now);

        // Truncate message
        let text = message.content.trim();
        if (text.length > MAX_MESSAGE_LENGTH) {
            text = text.slice(0, MAX_MESSAGE_LENGTH);
        }

        // Skip empty messages
        if (!text) return;

        // Relay to game via callback
        if (this.onMessage) {
            this.onMessage({
                platform: 'discord',
                userId: userId,
                username: username,
                text: text,
                timestamp: now,
                color: null,
                badges: {}
            });
        }
    }

    /**
     * Handle command message
     */
    async _handleCommandMessage(message) {
        const content = message.content.trim();

        // Check for !cameras command
        if (content.toLowerCase() === '!cameras') {
            if (this.onCamerasCommand) {
                try {
                    const response = await this.onCamerasCommand();
                    await message.reply(response);
                } catch (err) {
                    console.error('[DiscordBot] Error handling !cameras:', err);
                    await message.reply('An error occurred while fetching cameras.');
                }
            }
            return;
        }

        // Check for !camera <number> command
        const cameraMatch = content.match(/^!camera\s+(\d+)$/i);
        if (cameraMatch) {
            const camNumber = parseInt(cameraMatch[1], 10);
            if (this.onCameraCommand) {
                try {
                    const result = await this.onCameraCommand(camNumber);
                    if (result.error) {
                        await message.reply(result.error);
                    } else if (result.link) {
                        await message.reply(`**Camera #${camNumber}:** ${result.link}`);
                    }
                } catch (err) {
                    console.error('[DiscordBot] Error handling !camera:', err);
                    await message.reply('An error occurred while fetching camera info.');
                }
            }
            return;
        }
    }

    /**
     * Send message to Discord chat channel (game -> Discord)
     * @param {string} text - Message text
     * @returns {Promise<boolean>} Success
     */
    async sendToChat(text) {
        if (!this.connected || !this.chatChannelId || !this.client) {
            return false;
        }

        try {
            const channel = await this.client.channels.fetch(this.chatChannelId);
            if (channel) {
                await channel.send(text);
                return true;
            }
        } catch (err) {
            console.error('[DiscordBot] Failed to send message:', err);
        }
        return false;
    }

    /**
     * Get current status for admin UI
     */
    getStatus() {
        return {
            status: this.status,
            connected: this.connected,
            chatChannelId: this.chatChannelId,
            commandsChannelId: this.commandsChannelId,
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

module.exports = DiscordBot;
