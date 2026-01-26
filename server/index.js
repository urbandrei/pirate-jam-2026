/**
 * Main server entry point
 * Express + Socket.IO for game networking
 */

// Load environment variables from .env file (for local dev and deployment)
require('dotenv').config();

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
const InteractionSystem = require('./systems/interaction-system');
const itemSystem = require('./systems/item-system');
const plantSystem = require('./systems/plant-system');
const stationSystem = require('./systems/station-system');
const { PlayerQueue, JOIN_TIMEOUT } = require('./systems/player-queue');
const TwitchChat = require('./integrations/twitch-chat');
const DiscordBot = require('./integrations/discord-bot');

// Waiting room constants (must match shared/constants.js)
const WAITING_ROOM = {
    CENTER: { x: 500, y: 0, z: 500 },
    SIZE: 10,
    DOOR_POSITION: { x: 500, y: 1.25, z: 495 },
    SPAWN_POSITION: { x: 500, y: 0.9, z: 502 },
    DEATH_COOLDOWN: 60000  // 1 minute
};

// Configuration
const isDevMode = process.argv.includes('dev');
const PORT = process.env.PORT || (isDevMode ? 3000 : 443);
const TICK_RATE = 60; // Physics ticks per second
const NETWORK_RATE = 20; // State updates per second

// Dev server configuration (in-memory, resets on restart)
let devServerUrl = null;
const DEV_SERVER_PASSWORD = process.env.DEV_SERVER_PASSWORD || 'dev123';

// Stream integration credentials (from environment/GitHub secrets)
const TWITCH_CHANNEL = process.env.TWITCH_CHANNEL;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHAT_CHANNEL_ID = process.env.DISCORD_CHAT_CHANNEL_ID;
const DISCORD_COMMANDS_CHANNEL_ID = process.env.DISCORD_COMMANDS_CHANNEL_ID;

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

// Dynamic config.js serving based on dev mode
// In dev mode, use the host from the request (supports both localhost and IP access from VR headsets)
// In production, always use the configured URL
app.get('/pc/config.js', (req, res) => {
    let serverUrl;
    if (isDevMode) {
        const protocol = req.protocol;
        const host = req.get('host'); // e.g., "localhost:3000" or "192.168.1.100:3000"
        serverUrl = `${protocol}://${host}`;
    } else {
        serverUrl = 'https://www.urbandrei.com';
    }
    res.type('application/javascript').send(`window.GAME_SERVER_URL = '${serverUrl}';\n`);
});

app.get('/vr/config.js', (req, res) => {
    let serverUrl;
    if (isDevMode) {
        const protocol = req.protocol;
        const host = req.get('host');
        serverUrl = `${protocol}://${host}`;
    } else {
        serverUrl = 'https://www.urbandrei.com';
    }
    res.type('application/javascript').send(`window.GAME_SERVER_URL = '${serverUrl}';\n`);
});

// Serve static files
app.use('/pc', express.static(path.join(__dirname, '../public/pc')));
app.use('/vr', express.static(path.join(__dirname, '../public/vr')));
app.use('/shared', express.static(path.join(__dirname, '../public/shared')));
app.use('/overlay', express.static(path.join(__dirname, '../public/overlay')));
app.use('/camera-viewer', express.static(path.join(__dirname, '../public/camera-viewer')));

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
            <h3>Cameras</h3>
            <ul>
                <li><a href="/cameras" style="color: #4fc3f7;">Camera Navigation</a> - View all camera feeds</li>
            </ul>

            <hr style="margin: 20px 0; border-color: #444;">
            <h3>Stream Overlays</h3>
            <ul>
                <li><a href="/overlay/chat.html" style="color: #4fc3f7;">Chat Overlay</a> - For OBS browser source</li>
            </ul>

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
const gameState = new GameState(isDevMode);
const playerManager = new PlayerManager(gameState);
const physicsValidator = new PhysicsValidator(gameState);
const roomManager = new RoomManager(gameState.worldState, gameState);
const playerQueue = new PlayerQueue();
const interactionSystem = new InteractionSystem(gameState, roomManager, isDevMode, playerQueue);
const messageHandler = new MessageHandler(gameState, playerManager, interactionSystem, playerQueue);

// Link camera system to game state so camera items can create linked camera entities
gameState.setCameraSystem(messageHandler.getCameraSystem());

// Initialize dev mode cameras and monitors
if (isDevMode) {
    messageHandler.getCameraSystem().initializeDevCameras();
    // Initialize monitors for the dev security room at (2, 0)
    messageHandler.getMonitorSystem().initializeRoomMonitors({ x: 2, z: 0 }, 4);

    // Assign cameras to monitors
    const cameraSystem = messageHandler.getCameraSystem();
    const monitorSystem = messageHandler.getMonitorSystem();
    const cameras = cameraSystem.getCamerasByType('security');
    for (let i = 0; i < Math.min(4, cameras.length); i++) {
        monitorSystem.assignCamera(`monitor_2_0_${i}`, cameras[i].id);
    }
}

// Initialize Twitch chat integration
const twitchChat = new TwitchChat((streamMessage) => {
    messageHandler.chatSystem.handleStreamMessage(streamMessage);
});

// Initialize Discord bot integration
const discordBot = new DiscordBot((discordMessage) => {
    messageHandler.chatSystem.handleStreamMessage(discordMessage);
});

// Set up chat relay to Discord
messageHandler.chatSystem.onMessageSent = (message) => {
    if (discordBot.connected) {
        discordBot.sendToChat(`**${message.senderName}:** ${message.text}`);
    }
};

// Relay Twitch messages to Discord
messageHandler.chatSystem.onStreamMessageReceived = (message) => {
    // Only relay Twitch to Discord (not Discord to itself)
    if (discordBot.connected && message.platform === 'twitch') {
        discordBot.sendToChat(`[Twitch] **${message.senderName}:** ${message.text}`);
    }
};

// Send player join events to Discord
messageHandler.onPlayerJoined = (player) => {
    if (discordBot.connected) {
        discordBot.sendToChat(`\u{1F7E2} **${player.displayName}** joined the game`);
    }
};

// Auto-connect integrations if credentials are configured via environment
if (TWITCH_CHANNEL) {
    twitchChat.connect(TWITCH_CHANNEL).then(result => {
        if (result.success) {
            console.log(`[Twitch] Auto-connected to #${TWITCH_CHANNEL}`);
        } else {
            console.error(`[Twitch] Auto-connect failed: ${result.error}`);
        }
    });
}

if (DISCORD_BOT_TOKEN && DISCORD_CHAT_CHANNEL_ID) {
    discordBot.connect(
        DISCORD_BOT_TOKEN,
        DISCORD_CHAT_CHANNEL_ID,
        DISCORD_COMMANDS_CHANNEL_ID || null
    ).then(result => {
        if (result.success) {
            console.log('[Discord] Auto-connected');
        } else {
            console.error(`[Discord] Auto-connect failed: ${result.error}`);
        }
    });
}

// Stream integration API endpoints (must be after twitchChat initialization)

// Get stream integration status (password protected)
app.get('/api/stream/status', (req, res) => {
    const password = req.query.password || req.headers['x-dev-password'];

    if (password !== DEV_SERVER_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    res.json({
        twitch: twitchChat.getStatus(),
        discord: discordBot.getStatus()
    });
});

// Connect to Twitch channel (password protected)
app.post('/api/stream/twitch/connect', express.json(), async (req, res) => {
    const password = req.query.password || req.headers['x-dev-password'];

    if (password !== DEV_SERVER_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    const { channel } = req.body;
    if (!channel || typeof channel !== 'string') {
        return res.status(400).json({ error: 'Invalid channel' });
    }

    const result = await twitchChat.connect(channel);
    res.json(result);
});

// Disconnect from Twitch (password protected)
app.post('/api/stream/twitch/disconnect', async (req, res) => {
    const password = req.query.password || req.headers['x-dev-password'];

    if (password !== DEV_SERVER_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    await twitchChat.disconnect();
    res.json({ success: true });
});

// Discord API endpoints

// Get Discord status (password protected)
app.get('/api/stream/discord/status', (req, res) => {
    const password = req.query.password || req.headers['x-dev-password'];

    if (password !== DEV_SERVER_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    res.json(discordBot.getStatus());
});

// Connect Discord bot (password protected)
app.post('/api/stream/discord/connect', express.json(), async (req, res) => {
    const password = req.query.password || req.headers['x-dev-password'];

    if (password !== DEV_SERVER_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    const { token, chatChannelId, commandsChannelId } = req.body;

    if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Invalid bot token' });
    }
    if (!chatChannelId || typeof chatChannelId !== 'string') {
        return res.status(400).json({ error: 'Invalid chat channel ID' });
    }

    const result = await discordBot.connect(token, chatChannelId, commandsChannelId || null);
    res.json(result);
});

// Disconnect Discord bot (password protected)
app.post('/api/stream/discord/disconnect', async (req, res) => {
    const password = req.query.password || req.headers['x-dev-password'];

    if (password !== DEV_SERVER_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    await discordBot.disconnect();
    res.json({ success: true });
});

// ==================== Camera Routes ====================

// Camera viewer pages (public, no auth)
app.get('/sec-cam/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/camera-viewer/index.html'));
});

app.get('/stream-cam/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/camera-viewer/index.html'));
});

// Camera navigation page
app.get('/cameras', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Camera Navigation</title>
            <style>
                body {
                    font-family: 'Segoe UI', sans-serif;
                    background: #1a1a2e;
                    color: #eee;
                    padding: 40px;
                    max-width: 600px;
                    margin: 0 auto;
                }
                h1 { color: #4fc3f7; margin-bottom: 30px; }
                h2 { color: #aaa; font-size: 18px; margin-top: 30px; }
                .input-group {
                    display: flex;
                    gap: 10px;
                    margin: 15px 0;
                }
                input[type="number"] {
                    padding: 12px;
                    font-size: 16px;
                    border: 2px solid #444;
                    border-radius: 4px;
                    background: #2a2a4e;
                    color: #fff;
                    width: 100px;
                }
                button {
                    padding: 12px 24px;
                    font-size: 14px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: bold;
                }
                .sec-btn { background: #2196F3; color: white; }
                .stream-btn { background: #9c27b0; color: white; }
                button:hover { opacity: 0.9; }
                .camera-list {
                    margin-top: 10px;
                    padding: 10px;
                    background: #2a2a4e;
                    border-radius: 4px;
                }
                .camera-list a {
                    display: inline-block;
                    margin: 5px;
                    padding: 8px 16px;
                    background: #444;
                    color: #4fc3f7;
                    text-decoration: none;
                    border-radius: 4px;
                }
                .camera-list a:hover { background: #555; }
                .empty { color: #888; font-style: italic; }
                .back-link { margin-top: 30px; }
                .back-link a { color: #4fc3f7; }
            </style>
        </head>
        <body>
            <h1>Camera Navigation</h1>

            <h2>Quick Access</h2>
            <div class="input-group">
                <input type="number" id="cam-num" placeholder="Camera #" min="1">
                <button class="sec-btn" onclick="goToSecCam()">Security Cam</button>
                <button class="stream-btn" onclick="goToStreamCam()">Stream Cam</button>
            </div>

            <h2>Active Security Cameras</h2>
            <div id="sec-cameras" class="camera-list"><span class="empty">Loading...</span></div>

            <h2>Active Stream Cameras</h2>
            <div id="stream-cameras" class="camera-list"><span class="empty">Loading...</span></div>

            <div class="back-link">
                <a href="/">Back to Home</a>
            </div>

            <script>
                function goToSecCam() {
                    const num = document.getElementById('cam-num').value;
                    if (num) window.location.href = '/sec-cam/' + num;
                }
                function goToStreamCam() {
                    const num = document.getElementById('cam-num').value;
                    if (num) window.location.href = '/stream-cam/' + num;
                }

                // Allow Enter key to navigate
                document.getElementById('cam-num').addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') goToSecCam();
                });

                // Load camera list
                async function loadCameras() {
                    try {
                        const response = await fetch('/api/cameras');
                        const data = await response.json();

                        const secDiv = document.getElementById('sec-cameras');
                        const streamDiv = document.getElementById('stream-cameras');

                        if (data.security.length > 0) {
                            secDiv.innerHTML = data.security.map(id =>
                                '<a href="/sec-cam/' + id.replace('cam_', '') + '">#' + id.replace('cam_', '') + '</a>'
                            ).join('');
                        } else {
                            secDiv.innerHTML = '<span class="empty">No security cameras active</span>';
                        }

                        if (data.stream.length > 0) {
                            streamDiv.innerHTML = data.stream.map(id =>
                                '<a href="/stream-cam/' + id.replace('cam_', '') + '">#' + id.replace('cam_', '') + '</a>'
                            ).join('');
                        } else {
                            streamDiv.innerHTML = '<span class="empty">No stream cameras active</span>';
                        }
                    } catch (e) {
                        console.error('Failed to load cameras:', e);
                    }
                }

                loadCameras();
                setInterval(loadCameras, 5000);
            </script>
        </body>
        </html>
    `);
});

// API endpoint for camera list
app.get('/api/cameras', (req, res) => {
    const cameraSystem = messageHandler.getCameraSystem();
    const cameras = cameraSystem.getAllCameras();

    res.json({
        security: cameras.filter(c => c.type === 'security').map(c => c.id),
        stream: cameras.filter(c => c.type === 'stream').map(c => c.id),
        limits: cameraSystem.getLimits(),
        stats: cameraSystem.getCameraStats()
    });
});

// Set dev mode flag for needs system
NeedsSystem.setDevMode(isDevMode);

// Socket.IO event handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Store socket in player manager
    playerManager.handleConnection(socket.id, socket);

    // Handle all game messages
    socket.on('message', (message) => {
        messageHandler.handleMessage(socket.id, message);
    });

    // Handle voice audio data from VR players (binary transmission)
    socket.on('voice', (audioData) => {
        console.log(`[Voice] Received voice event from ${socket.id}, data size: ${audioData ? (audioData.length || audioData.byteLength || 'blob') : 'null'}`);
        messageHandler.handleVoice(socket.id, audioData);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);

        // Remove from queue if they were waiting
        playerQueue.removeFromQueue(socket.id);

        // Check if this was an active player (opens a slot)
        const player = gameState.getPlayer(socket.id);
        const wasActivePlayer = player && player.alive;
        const playerDisplayName = player ? player.displayName : null;

        // Clean up cameras owned by this player
        messageHandler.handlePlayerDisconnect(socket.id);

        playerManager.handleDisconnection(socket.id);

        // Notify remaining players
        io.emit('message', {
            type: 'PLAYER_LEFT',
            playerId: socket.id
        });

        // Send player leave event to Discord
        if (discordBot.connected && playerDisplayName) {
            discordBot.sendToChat(`\u{1F534} **${playerDisplayName}** left the game`);
        }

        // If an active player left, notify next queued player
        if (wasActivePlayer && playerQueue.getQueueLength() > 0) {
            const nextPlayer = playerQueue.peekNextPlayer();
            if (nextPlayer) {
                playerManager.sendTo(nextPlayer.peerId, {
                    type: 'QUEUE_READY'
                });
                console.log(`[PlayerQueue] Slot opened, notified player ${nextPlayer.peerId}`);
            }
        }
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

        // Update camera positions for held security cameras
        const cameraSystem = messageHandler.getCameraSystem();
        for (const player of gameState.players.values()) {
            if (player.heldItem?.type === 'security_camera' && player.heldItem.linkedCameraId) {
                const cameraId = player.heldItem.linkedCameraId;
                // Position camera at player eye level
                cameraSystem.updatePosition(cameraId, {
                    x: player.position.x,
                    y: player.position.y + 0.6, // Eye-ish height relative to capsule center
                    z: player.position.z
                });
                // Rotation from player's look direction
                cameraSystem.updateRotation(cameraId, {
                    pitch: player.lookRotation?.x || 0,
                    yaw: player.lookRotation?.y || 0,
                    roll: 0
                });
            }
        }

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
                console.log(`[NeedsSystem] Player ${player.id} died from needs depletion`);

                // Store death position for body
                const deathPosition = {
                    x: player.position.x,
                    y: player.position.y,
                    z: player.position.z
                };

                // Mark player as dead and record death time
                player.alive = false;
                player.playerState = 'dead';
                player.deathTime = now;

                // Clear any camera adjustments (camera stays on wall in last position)
                const cameraSystem = messageHandler.getCameraSystem();
                const clearedCameraIds = cameraSystem.clearPlayerAdjustments(player.id);
                // Broadcast so other clients know each camera is no longer being adjusted
                for (const cameraId of clearedCameraIds) {
                    playerManager.broadcast({
                        type: 'CAMERA_ADJUST_STOPPED',
                        cameraId: cameraId
                    });
                }

                // Teleport player to waiting room
                player.position.x = WAITING_ROOM.SPAWN_POSITION.x;
                player.position.y = WAITING_ROOM.SPAWN_POSITION.y;
                player.position.z = WAITING_ROOM.SPAWN_POSITION.z;
                player.velocity = { x: 0, y: 0, z: 0 };

                // Add to queue (cooldown tracked via deathTime)
                playerQueue.addToQueue(player.id, 'pc');

                // Create body object at death location
                const bodyObject = {
                    id: `body_${player.id}_${Date.now()}`,
                    type: 'player_body',
                    position: { x: deathPosition.x, y: 0.15, z: deathPosition.z },
                    playerId: player.id,
                    createdAt: Date.now()
                };
                gameState.worldObjects.set(bodyObject.id, bodyObject);
                console.log(`[DeathSystem] Created body for player ${player.id} at (${deathPosition.x.toFixed(2)}, ${deathPosition.z.toFixed(2)})`);

                // Notify the player they died and were teleported
                playerManager.sendTo(player.id, {
                    type: 'PLAYER_DIED',
                    deathPosition: deathPosition,
                    cause: NeedsSystem.getDeathCause(player),
                    waitingRoomPosition: WAITING_ROOM.SPAWN_POSITION
                });

                // Notify others that player died
                playerManager.broadcast({
                    type: 'PLAYER_LEFT',
                    playerId: player.id
                }, player.id);
            }
        }

        // Update item rot (check for items that have rotted into trash)
        itemSystem.updateItemRot(gameState.worldObjects, now);

        // Update plant growth (runs at 1Hz internally)
        plantSystem.updatePlants(gameState.worldObjects, now);

        // Update seed spawning (spawns a seed every minute in main room)
        gameState.updateSeedSpawn(now);

        // Update timed interactions (wash/cut stations)
        const completedTimedInteractions = interactionSystem.updateTimedInteractions(now);
        for (const completed of completedTimedInteractions) {
            playerManager.sendTo(completed.playerId, {
                type: 'TIMED_INTERACT_COMPLETE',
                interactionType: completed.interactionType,
                stationId: completed.stationId,
                result: completed.result
            });
        }

        // Check if players have moved out of range during timed interactions
        for (const player of gameState.getAllPlayers()) {
            if (interactionSystem.hasTimedInteraction(player.id)) {
                if (!interactionSystem.isPlayerInTimedInteractionRange(player.id)) {
                    const cancelled = interactionSystem.cancelTimedInteraction(player.id);
                    if (cancelled.cancelled) {
                        playerManager.sendTo(player.id, {
                            type: 'TIMED_INTERACT_CANCELLED',
                            reason: 'Moved out of range'
                        });
                    }
                }
            }
        }

        if (gameState.getPlayerCount() > 0) {
            // Calculate available interactions for each PC player before sending state
            for (const [playerId, player] of gameState.players) {
                if (player.type === 'pc' && player.playerState === 'playing') {
                    player.availableInteraction = interactionSystem.getTargetedInteraction(player, gameState.worldObjects);
                } else {
                    player.availableInteraction = null;
                }
            }

            // Only send STATE_UPDATE to playing/sleeping players (not dead/waiting)
            // Dead/waiting players have local-only waiting room experience
            const cameraSystem = messageHandler.getCameraSystem();
            const monitorSystem = messageHandler.getMonitorSystem();
            const stateMessage = {
                type: 'STATE_UPDATE',
                state: gameState.getSerializableState(),
                cameras: cameraSystem.getCamerasForStateUpdate(),
                monitors: monitorSystem.getAllMonitorsForStateUpdate()
            };
            for (const player of gameState.getAllPlayers()) {
                if (player.playerState === 'dead' || player.playerState === 'waiting') {
                    continue;
                }
                playerManager.sendTo(player.id, stateMessage);
            }

            // Also send STATE_UPDATE to web viewers
            const webViewers = cameraSystem.webViewers;
            for (const [viewerId] of webViewers) {
                playerManager.sendTo(viewerId, stateMessage);
            }
        }

        // Process waiting room door states (every network tick for smooth updates)
        for (const player of gameState.getAllPlayers()) {
            if (player.playerState !== 'dead' && player.playerState !== 'waiting') {
                continue;
            }

            const cooldownRemaining = Math.max(0, (player.deathTime || 0) + WAITING_ROOM.DEATH_COOLDOWN - now);
            const queuePos = playerQueue.getQueuePosition(player.id);
            const canJoin = cooldownRemaining === 0 && queuePos === 1 && gameState.canAcceptPlayer();

            // Handle 30s join timeout
            if (canJoin) {
                if (!playerQueue.getDoorOpenTime(player.id)) {
                    playerQueue.markDoorOpened(player.id);
                    console.log(`[WaitingRoom] Door opened for player ${player.id}`);
                } else if (playerQueue.hasTimedOut(player.id)) {
                    // Player took too long - move to back of queue
                    playerQueue.moveToBack(player.id);
                    playerManager.sendTo(player.id, { type: 'DOOR_TIMEOUT' });
                    console.log(`[WaitingRoom] Player ${player.id} timed out, moved to back of queue`);
                    continue;
                }
            } else {
                // Door not open - reset timer if it was set
                playerQueue.resetDoorTimer(player.id);
            }

            // Calculate join time remaining
            let joinTimeRemaining = null;
            if (canJoin) {
                const doorOpenTime = playerQueue.getDoorOpenTime(player.id);
                if (doorOpenTime) {
                    joinTimeRemaining = Math.max(0, Math.ceil((JOIN_TIMEOUT - (now - doorOpenTime)) / 1000));
                }
            }

            // Send waiting room state to player
            playerManager.sendTo(player.id, {
                type: 'WAITING_ROOM_STATE',
                cooldownRemaining: Math.ceil(cooldownRemaining / 1000),  // Seconds
                queuePosition: queuePos,
                queueTotal: playerQueue.getQueueLength(),
                doorOpen: canJoin,
                joinTimeRemaining
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
    const modeText = isDevMode ? 'DEV MODE (localhost)' : 'PRODUCTION';
    console.log(`
╔════════════════════════════════════════════╗
║     Pirate Jam 2026 - Game Server          ║
╠════════════════════════════════════════════╣
║  Server running on port ${PORT}               ║
║  Protocol: ${protocol.toUpperCase().padEnd(30)}║
║  Mode:     ${modeText.padEnd(30)}║
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
