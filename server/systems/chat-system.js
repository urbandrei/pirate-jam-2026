/**
 * Chat System - Handles text chat messages
 */

const MAX_MESSAGE_LENGTH = 200;
const RATE_LIMIT_MS = 500;
const MESSAGE_HISTORY_SIZE = 50;

class ChatSystem {
    constructor(playerManager, gameState) {
        this.playerManager = playerManager;
        this.gameState = gameState;

        // Message history (circular buffer behavior)
        this.messageHistory = [];

        // Rate limiting: Map<playerId, lastMessageTime>
        this.lastMessageTime = new Map();
    }

    /**
     * Generate a unique message ID
     */
    generateMessageId() {
        const timestamp = Date.now();
        const random = Math.random().toString(16).slice(2, 8);
        return `msg_${timestamp}_${random}`;
    }

    /**
     * Handle incoming chat message
     * @param {string} peerId - Sender's socket ID
     * @param {Object} message - The chat message
     * @param {Object} moderationSystem - Reference to moderation system
     * @returns {Object} Result with success flag
     */
    handleMessage(peerId, message, moderationSystem) {
        const player = this.gameState.getPlayer(peerId);
        if (!player) {
            return { success: false, reason: 'Player not found' };
        }

        // Check if player is muted
        if (moderationSystem && moderationSystem.isPlayerMuted(peerId)) {
            const muteInfo = moderationSystem.getMuteInfo(peerId);
            return {
                success: false,
                reason: 'You are muted',
                expiresAt: muteInfo?.expiresAt
            };
        }

        // Rate limiting
        const lastTime = this.lastMessageTime.get(peerId) || 0;
        const now = Date.now();
        if (now - lastTime < RATE_LIMIT_MS) {
            return { success: false, reason: 'Sending too fast' };
        }

        // Validate message
        let text = message.text;
        if (typeof text !== 'string') {
            return { success: false, reason: 'Invalid message' };
        }

        text = text.trim();
        if (text.length === 0) {
            return { success: false, reason: 'Empty message' };
        }
        if (text.length > MAX_MESSAGE_LENGTH) {
            text = text.slice(0, MAX_MESSAGE_LENGTH);
        }

        // Create message record
        const chatMessage = {
            id: this.generateMessageId(),
            senderId: peerId,
            senderName: player.displayName || peerId.slice(0, 8),
            senderType: player.type,
            text: text,
            timestamp: now,
            deleted: false
        };

        // Store in history
        this.messageHistory.push(chatMessage);
        if (this.messageHistory.length > MESSAGE_HISTORY_SIZE) {
            this.messageHistory.shift();
        }

        // Update rate limit
        this.lastMessageTime.set(peerId, now);

        // Broadcast to all players
        this.playerManager.broadcast({
            type: 'CHAT_RECEIVED',
            id: chatMessage.id,
            senderId: chatMessage.senderId,
            senderName: chatMessage.senderName,
            senderType: chatMessage.senderType,
            text: chatMessage.text,
            timestamp: chatMessage.timestamp
        });

        console.log(`[Chat] ${chatMessage.senderName}: ${chatMessage.text}`);

        return { success: true, messageId: chatMessage.id };
    }

    /**
     * Delete a message by ID (for moderation)
     * @param {string} messageId - Message to delete
     * @returns {boolean} True if found and deleted
     */
    deleteMessage(messageId) {
        const message = this.messageHistory.find(m => m.id === messageId);
        if (message) {
            message.deleted = true;
            return true;
        }
        return false;
    }

    /**
     * Get message history (excluding deleted)
     * @returns {Array} Array of messages
     */
    getHistory() {
        return this.messageHistory.filter(m => !m.deleted);
    }

    /**
     * Clean up when player disconnects
     * @param {string} peerId - Player ID
     */
    handleDisconnect(peerId) {
        this.lastMessageTime.delete(peerId);
    }
}

module.exports = ChatSystem;
