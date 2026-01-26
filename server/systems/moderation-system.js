/**
 * Moderation System - VR-only player moderation
 */

class ModerationSystem {
    constructor(playerManager, gameState) {
        this.playerManager = playerManager;
        this.gameState = gameState;

        // Muted players: Map<playerId, { expiresAt, reason, moderatorId }>
        this.mutedPlayers = new Map();

        // Temp bans: Map<sessionToken, { expiresAt, reason, originalPlayerId }>
        this.bannedTokens = new Map();
    }

    /**
     * Check if the requester is a VR player (has moderation permissions)
     * @param {string} peerId - Requester's socket ID
     * @returns {boolean}
     */
    hasModPermission(peerId) {
        const player = this.gameState.getPlayer(peerId);
        return player && player.type === 'vr';
    }

    /**
     * Handle moderation action request
     * @param {string} moderatorId - VR player's socket ID
     * @param {Object} message - Moderation message
     * @param {Object} chatSystem - Reference to chat system
     * @returns {Object} Result
     */
    handleModeration(moderatorId, message, chatSystem) {
        // Verify VR-only permission
        if (!this.hasModPermission(moderatorId)) {
            return { success: false, reason: 'Not authorized' };
        }

        const { action, targetId, duration, messageId } = message;

        switch (action) {
            case 'mute':
                return this.mutePlayer(targetId, duration || 0, moderatorId);
            case 'unmute':
                return this.unmutePlayer(targetId);
            case 'kick':
                return this.kickPlayer(targetId, moderatorId);
            case 'tempban':
                return this.tempBanPlayer(targetId, duration || 3600, moderatorId);
            case 'delete_msg':
                return this.deleteMessage(messageId, chatSystem);
            default:
                return { success: false, reason: 'Unknown action' };
        }
    }

    /**
     * Mute a player
     * @param {string} playerId - Player to mute
     * @param {number} duration - Duration in seconds (0 = permanent)
     * @param {string} moderatorId - VR player who issued mute
     * @returns {Object} Result
     */
    mutePlayer(playerId, duration, moderatorId) {
        const player = this.gameState.getPlayer(playerId);
        if (!player) {
            return { success: false, reason: 'Player not found' };
        }

        const expiresAt = duration > 0 ? Date.now() + (duration * 1000) : null;

        this.mutedPlayers.set(playerId, {
            expiresAt: expiresAt,
            reason: 'Muted by moderator',
            moderatorId: moderatorId
        });

        // Notify the muted player
        this.playerManager.sendTo(playerId, {
            type: 'PLAYER_MUTED',
            duration: duration,
            expiresAt: expiresAt
        });

        // Broadcast mute event (for UI updates)
        this.playerManager.broadcast({
            type: 'PLAYER_MUTED',
            playerId: playerId,
            playerName: player.displayName || playerId.slice(0, 8)
        });

        return { success: true, action: 'mute', targetId: playerId };
    }

    /**
     * Unmute a player
     * @param {string} playerId - Player to unmute
     * @returns {Object} Result
     */
    unmutePlayer(playerId) {
        if (!this.mutedPlayers.has(playerId)) {
            return { success: false, reason: 'Player not muted' };
        }

        this.mutedPlayers.delete(playerId);

        // Notify the unmuted player
        this.playerManager.sendTo(playerId, {
            type: 'PLAYER_UNMUTED'
        });

        return { success: true, action: 'unmute', targetId: playerId };
    }

    /**
     * Check if player is currently muted
     * @param {string} playerId - Player ID
     * @returns {boolean}
     */
    isPlayerMuted(playerId) {
        const muteInfo = this.mutedPlayers.get(playerId);
        if (!muteInfo) return false;

        // Check expiration
        if (muteInfo.expiresAt !== null && Date.now() > muteInfo.expiresAt) {
            this.mutedPlayers.delete(playerId);
            return false;
        }

        return true;
    }

    /**
     * Get mute info for a player
     * @param {string} playerId - Player ID
     * @returns {Object|null}
     */
    getMuteInfo(playerId) {
        return this.mutedPlayers.get(playerId) || null;
    }

    /**
     * Kick a player (disconnect, allow immediate rejoin)
     * @param {string} playerId - Player to kick
     * @param {string} moderatorId - VR player who issued kick
     * @returns {Object} Result
     */
    kickPlayer(playerId, moderatorId) {
        const player = this.gameState.getPlayer(playerId);
        if (!player) {
            return { success: false, reason: 'Player not found' };
        }

        const playerName = player.displayName || playerId.slice(0, 8);

        // Notify the kicked player before disconnect
        this.playerManager.sendTo(playerId, {
            type: 'PLAYER_KICKED',
            reason: 'Kicked by moderator'
        });

        // Get the socket and disconnect
        const socket = this.playerManager.getConnection(playerId);
        if (socket) {
            socket.disconnect(true);
        }

        return { success: true, action: 'kick', targetId: playerId };
    }

    /**
     * Temporarily ban a player
     * @param {string} playerId - Player to ban
     * @param {number} duration - Duration in seconds
     * @param {string} moderatorId - VR player who issued ban
     * @returns {Object} Result
     */
    tempBanPlayer(playerId, duration, moderatorId) {
        const player = this.gameState.getPlayer(playerId);
        if (!player) {
            return { success: false, reason: 'Player not found' };
        }

        const sessionToken = player.sessionToken;
        if (!sessionToken) {
            // Fallback: just kick without ban (no token to track)
            return this.kickPlayer(playerId, moderatorId);
        }

        const expiresAt = Date.now() + (duration * 1000);

        this.bannedTokens.set(sessionToken, {
            expiresAt: expiresAt,
            reason: 'Temporarily banned',
            originalPlayerId: playerId
        });

        const playerName = player.displayName || playerId.slice(0, 8);

        // Notify the banned player
        this.playerManager.sendTo(playerId, {
            type: 'PLAYER_KICKED',
            banned: true,
            expiresAt: expiresAt,
            reason: 'Temporarily banned'
        });

        // Disconnect
        const socket = this.playerManager.getConnection(playerId);
        if (socket) {
            socket.disconnect(true);
        }

        return { success: true, action: 'tempban', targetId: playerId, expiresAt };
    }

    /**
     * Check if a session token is banned
     * @param {string} sessionToken - Token to check
     * @returns {Object|null} Ban info or null if not banned
     */
    checkBan(sessionToken) {
        if (!sessionToken) return null;

        const banInfo = this.bannedTokens.get(sessionToken);
        if (!banInfo) return null;

        // Check expiration
        if (Date.now() > banInfo.expiresAt) {
            this.bannedTokens.delete(sessionToken);
            return null;
        }

        return banInfo;
    }

    /**
     * Delete a chat message
     * @param {string} messageId - Message to delete
     * @param {Object} chatSystem - Reference to chat system
     * @returns {Object} Result
     */
    deleteMessage(messageId, chatSystem) {
        if (!chatSystem) {
            return { success: false, reason: 'Chat system not available' };
        }

        const deleted = chatSystem.deleteMessage(messageId);
        if (!deleted) {
            return { success: false, reason: 'Message not found' };
        }

        // Broadcast deletion to all clients
        this.playerManager.broadcast({
            type: 'CHAT_DELETED',
            messageId: messageId
        });

        return { success: true, action: 'delete_msg', messageId };
    }

    /**
     * Update method - clean up expired mutes/bans
     * Call this periodically from game loop
     */
    update() {
        const now = Date.now();

        // Clean expired mutes
        for (const [playerId, muteInfo] of this.mutedPlayers) {
            if (muteInfo.expiresAt !== null && now > muteInfo.expiresAt) {
                this.mutedPlayers.delete(playerId);
                this.playerManager.sendTo(playerId, { type: 'PLAYER_UNMUTED' });
            }
        }

        // Clean expired bans
        for (const [token, banInfo] of this.bannedTokens) {
            if (now > banInfo.expiresAt) {
                this.bannedTokens.delete(token);
            }
        }
    }

    /**
     * Clean up when player disconnects
     * @param {string} peerId - Player ID
     */
    handleDisconnect(peerId) {
        // Mutes persist across reconnects (tracked by peerId, expires on new session)
        // Bans persist via sessionToken
    }
}

module.exports = ModerationSystem;
