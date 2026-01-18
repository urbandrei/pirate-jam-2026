/**
 * Main server entry point
 * Express + Socket.IO for game networking
 */

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');

const GameState = require('./game-state');
const PlayerManager = require('./player-manager');
const GrabSystem = require('./grab-system');
const PhysicsValidator = require('./physics-validator');
const MessageHandler = require('./message-handler');

// Configuration
const PORT = process.env.PORT || 3000;
const TICK_RATE = 60; // Physics ticks per second
const NETWORK_RATE = 20; // State updates per second

// SSL Configuration (for production with Let's Encrypt)
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '/etc/letsencrypt/live/urbandrei.com/fullchain.pem';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '/etc/letsencrypt/live/urbandrei.com/privkey.pem';
const USE_HTTPS = process.env.USE_HTTPS === 'true' || (fs.existsSync(SSL_CERT_PATH) && fs.existsSync(SSL_KEY_PATH));

// Initialize Express
const app = express();

// Create HTTP or HTTPS server based on certificate availability
let server;
if (USE_HTTPS) {
    const sslOptions = {
        cert: fs.readFileSync(SSL_CERT_PATH),
        key: fs.readFileSync(SSL_KEY_PATH)
    };
    server = https.createServer(sslOptions, app);
    console.log('Starting with HTTPS (SSL enabled)');
} else {
    server = http.createServer(app);
    console.log('Starting with HTTP (no SSL certificates found)');
}

// Enable CORS for all origins (required for itch.io)
app.use(cors());

// Initialize Socket.IO
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Serve static files
app.use('/pc', express.static(path.join(__dirname, '../public/pc')));
app.use('/vr', express.static(path.join(__dirname, '../public/vr')));
app.use('/shared', express.static(path.join(__dirname, '../public/shared')));

// Root redirect
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Pirate Jam 2026</title></head>
        <body style="font-family: sans-serif; padding: 20px;">
            <h1>Pirate Jam 2026 - Giants vs Tiny</h1>
            <ul>
                <li><a href="/pc/">PC Client</a> - WASD + Mouse controls</li>
                <li><a href="/vr/">VR Client</a> - Meta Quest WebXR</li>
            </ul>
            <p>Players connected: <span id="count">0</span></p>
            <script>
                setInterval(() => {
                    fetch('/api/status').then(r => r.json()).then(d => {
                        document.getElementById('count').textContent = d.playerCount;
                    });
                }, 1000);
            </script>
        </body>
        </html>
    `);
});

// API endpoint for status
app.get('/api/status', (req, res) => {
    res.json({
        playerCount: gameState.getPlayerCount(),
        uptime: process.uptime()
    });
});

// Initialize game systems
const gameState = new GameState();
const playerManager = new PlayerManager(gameState);
const grabSystem = new GrabSystem(gameState);
const physicsValidator = new PhysicsValidator(gameState);
const messageHandler = new MessageHandler(gameState, playerManager, grabSystem);

// Socket.IO event handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Store socket in player manager
    playerManager.handleConnection(socket.id, socket);

    // Handle all game messages
    socket.on('message', (message) => {
        messageHandler.handleMessage(socket.id, message);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        playerManager.handleDisconnection(socket.id);

        // Notify remaining players
        io.emit('message', {
            type: 'PLAYER_LEFT',
            playerId: socket.id
        });
    });
});

// Update player manager to use Socket.IO
playerManager.broadcast = function(message, excludeId = null) {
    for (const [peerId, socket] of this.connections) {
        if (peerId !== excludeId) {
            socket.emit('message', message);
        }
    }
};

playerManager.sendTo = function(peerId, message) {
    const socket = this.connections.get(peerId);
    if (socket) {
        socket.emit('message', message);
        return true;
    }
    return false;
};

// Game loop
let lastTickTime = Date.now();
let lastNetworkTime = Date.now();

function gameLoop() {
    const now = Date.now();

    // Physics tick
    const tickDelta = (now - lastTickTime) / 1000;
    if (tickDelta >= 1 / TICK_RATE) {
        physicsValidator.tick(tickDelta);
        grabSystem.updateGrabbedPositions();
        lastTickTime = now;
    }

    // Network update
    const networkDelta = now - lastNetworkTime;
    if (networkDelta >= 1000 / NETWORK_RATE) {
        if (gameState.getPlayerCount() > 0) {
            io.emit('message', {
                type: 'STATE_UPDATE',
                state: gameState.getSerializableState()
            });
        }
        lastNetworkTime = now;
    }

    // Schedule next iteration
    setImmediate(gameLoop);
}

// Start server
server.listen(PORT, () => {
    const protocol = USE_HTTPS ? 'https' : 'http';
    console.log(`
╔════════════════════════════════════════════╗
║     Pirate Jam 2026 - Game Server          ║
╠════════════════════════════════════════════╣
║  Server running on port ${PORT}               ║
║  Protocol: ${protocol.toUpperCase().padEnd(30)}║
║                                            ║
║  PC Client:  ${protocol}://localhost:${PORT}/pc/    ║
║  VR Client:  ${protocol}://localhost:${PORT}/vr/    ║
║                                            ║
║  Physics:    ${TICK_RATE} Hz                        ║
║  Network:    ${NETWORK_RATE} Hz                        ║
╚════════════════════════════════════════════╝
    `);

    // Start game loop
    gameLoop();
});
