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
}

module.exports = PlayerManager;
