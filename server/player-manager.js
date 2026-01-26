/**
 * Player connection and lifecycle management
 */

class PlayerManager {
    constructor(gameState) {
        this.gameState = gameState;
        this.connections = new Map(); // peerId -> connection object
    }

    handleConnection(peerId, connection) {
        console.log(`Player connecting: ${peerId}`);
        this.connections.set(peerId, connection);
    }

    handleJoin(peerId, playerType) {
        if (playerType !== 'pc' && playerType !== 'vr') {
            console.error(`Invalid player type: ${playerType}`);
            return null;
        }

        const player = this.gameState.addPlayer(peerId, playerType);
        console.log(`Player joined: ${peerId} as ${playerType}`);
        console.log(`Total players: ${this.gameState.getPlayerCount()}`);

        return player;
    }

    handleDisconnection(peerId) {
        console.log(`Player disconnected: ${peerId}`);
        this.gameState.removePlayer(peerId);
        this.connections.delete(peerId);
        console.log(`Total players: ${this.gameState.getPlayerCount()}`);
    }

    getConnection(peerId) {
        return this.connections.get(peerId);
    }

    getAllConnections() {
        return this.connections;
    }

    broadcast(message, excludePeerId = null) {
        for (const [peerId, connection] of this.connections) {
            if (peerId !== excludePeerId && connection.open) {
                try {
                    connection.send(message);
                } catch (err) {
                    console.error(`Failed to send to ${peerId}:`, err.message);
                }
            }
        }
    }

    sendTo(peerId, message) {
        const connection = this.connections.get(peerId);
        if (connection && connection.open) {
            try {
                connection.send(message);
                return true;
            } catch (err) {
                console.error(`Failed to send to ${peerId}:`, err.message);
                return false;
            }
        }
        return false;
    }

    /**
     * Send voice audio data to a specific peer
     * Uses separate 'voice' socket event for binary transmission
     * @param {string} peerId - Target peer ID
     * @param {string} senderId - Original sender's peer ID
     * @param {Buffer} audioData - Binary audio data
     */
    sendVoiceTo(peerId, senderId, audioData) {
        const connection = this.connections.get(peerId);
        // Use same check as sendTo - connection.open for consistency
        if (connection && (connection.open || connection.connected)) {
            try {
                connection.emit('voice', { senderId, data: audioData });
                return true;
            } catch (err) {
                console.error(`Failed to send voice to ${peerId}:`, err.message);
                return false;
            }
        }
        return false;
    }
}

module.exports = PlayerManager;
