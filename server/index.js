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
const PhysicsValidator = require('./physics-validator');
const MessageHandler = require('./message-handler');
const NeedsSystem = require('./systems/needs-system');
const RoomManager = require('./systems/room-manager');

// Configuration
const PORT = process.env.PORT || 443;
const TICK_RATE = 60; // Physics ticks per second
const NETWORK_RATE = 20; // State updates per second

// Dev server configuration (in-memory, resets on restart)
let devServerUrl = null;
const DEV_SERVER_PASSWORD = process.env.DEV_SERVER_PASSWORD || 'dev123';

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
        <body style="font-family: sans-serif; padding: 20px; background: #1a1a2e; color: #eee;">
            <h1>Pirate Jam 2026 - Giants vs Tiny</h1>
            <ul>
                <li><a href="/pc/" style="color: #4fc3f7;">PC Client</a> - WASD + Mouse controls</li>
                <li><a href="/vr/" style="color: #4fc3f7;">VR Client</a> - Meta Quest WebXR</li>
            </ul>
            <p>Players connected: <span id="count">0</span></p>

            <hr style="margin: 20px 0; border-color: #444;">
            <div id="dev-server-section" style="display: none;">
                <h3>Development Server</h3>
                <p>
                    <span id="dev-status" style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: gray; margin-right: 8px;"></span>
                    <a id="dev-link" href="#" target="_blank" style="color: #4fc3f7;">Dev Server</a>
                    <span id="dev-status-text" style="color: #888; margin-left: 10px;">(checking...)</span>
                </p>
            </div>

            <script>
                // Update player count
                setInterval(() => {
                    fetch('/api/status').then(r => r.json()).then(d => {
                        document.getElementById('count').textContent = d.playerCount;
                    });
                }, 1000);

                // Check dev server configuration and status
                let devServerUrl = null;

                async function checkDevServer() {
                    try {
                        const response = await fetch('/api/dev-server');
                        const data = await response.json();

                        if (data.configured && data.url) {
                            devServerUrl = data.url;
                            document.getElementById('dev-server-section').style.display = 'block';
                            document.getElementById('dev-link').href = devServerUrl;
                            document.getElementById('dev-link').textContent = devServerUrl;
                            checkDevServerHealth();
                        } else {
                            document.getElementById('dev-server-section').style.display = 'none';
                        }
                    } catch (e) {
                        console.error('Failed to check dev server config:', e);
                    }
                }

                async function checkDevServerHealth() {
                    if (!devServerUrl) return;

                    const statusDot = document.getElementById('dev-status');
                    const statusText = document.getElementById('dev-status-text');

                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 5000);

                        const response = await fetch(devServerUrl + '/health', {
                            signal: controller.signal,
                            mode: 'cors'
                        });
                        clearTimeout(timeoutId);

                        if (response.ok) {
                            statusDot.style.background = '#4caf50';
                            statusText.textContent = '(online)';
                            statusText.style.color = '#4caf50';
                        } else {
                            statusDot.style.background = '#f44336';
                            statusText.textContent = '(offline)';
                            statusText.style.color = '#f44336';
                        }
                    } catch (e) {
                        statusDot.style.background = '#f44336';
                        statusText.textContent = '(offline)';
                        statusText.style.color = '#f44336';
                    }
                }

                // Initial check
                checkDevServer();

                // Poll dev server config every 30 seconds, health every 5 seconds
                setInterval(checkDevServer, 30000);
                setInterval(checkDevServerHealth, 5000);
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

// Healthcheck endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime()
    });
});

// Get dev server URL
app.get('/api/dev-server', (req, res) => {
    res.json({
        url: devServerUrl,
        configured: devServerUrl !== null
    });
});

// Set dev server URL (password protected)
app.post('/api/dev-server', express.json(), (req, res) => {
    const password = req.query.password || req.headers['x-dev-password'];

    if (password !== DEV_SERVER_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    const { url } = req.body;

    if (url && typeof url === 'string') {
        devServerUrl = url.trim() || null;
        console.log(`[Server] Dev server URL set to: ${devServerUrl}`);
        res.json({ success: true, url: devServerUrl });
    } else if (url === null || url === '') {
        devServerUrl = null;
        console.log('[Server] Dev server URL cleared');
        res.json({ success: true, url: null });
    } else {
        res.status(400).json({ error: 'Invalid URL format' });
    }
});

// Initialize game systems
const gameState = new GameState();
const playerManager = new PlayerManager(gameState);
const physicsValidator = new PhysicsValidator(gameState);
const messageHandler = new MessageHandler(gameState, playerManager);
const roomManager = new RoomManager(gameState.worldState, gameState);

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
        lastTickTime = now;
    }

    // Network update
    const networkDelta = now - lastNetworkTime;
    if (networkDelta >= 1000 / NETWORK_RATE) {
        // Update needs for all players (runs at network rate, not physics rate)
        const networkDeltaSeconds = networkDelta / 1000;
        for (const player of gameState.getAllPlayers()) {
            const shouldDie = NeedsSystem.updateNeeds(player, networkDeltaSeconds);
            if (shouldDie && player.alive) {
                // Log death for now - actual death handling will be added later
                console.log(`[NeedsSystem] Player ${player.id} died from needs depletion`);
                player.alive = false;
                player.playerState = 'waiting';
                // TODO: Implement death queue and waiting room teleport
            }
        }

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
