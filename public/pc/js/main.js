/**
 * PC Client Main Entry Point
 */

import { Scene } from './scene.js';
import { Controls } from './controls.js';
import { Network } from './network.js';
import { Player } from './player.js';
import { RemotePlayers } from './remote-players.js';
import { INPUT_RATE } from '../shared/constants.js';

class Game {
    constructor() {
        this.scene = null;
        this.controls = null;
        this.network = null;
        this.player = null;
        this.remotePlayers = null;

        this.lastTime = performance.now();
        this.lastInputTime = 0;
        this.inputInterval = 1000 / INPUT_RATE;

        this.isGrabbed = false;

        this.init();
    }

    async init() {
        console.log('Initializing PC client...');

        // Setup Three.js scene
        const container = document.getElementById('game-container');
        this.scene = new Scene(container);

        // Setup controls
        this.controls = new Controls(this.scene.camera, this.scene.renderer.domElement);

        // Setup player
        this.player = new Player(this.scene);

        // Setup remote players renderer
        this.remotePlayers = new RemotePlayers(this.scene);

        // Setup network
        this.network = new Network();
        this.setupNetworkCallbacks();

        // Connect to server
        try {
            await this.network.connect();
            console.log('Connected to game server');
        } catch (err) {
            console.error('Failed to connect:', err);
        }

        // Start game loop
        this.gameLoop();
    }

    setupNetworkCallbacks() {
        this.network.onStateUpdate = (state) => {
            // Update local player from authoritative server state
            const myState = state.players[this.network.playerId];
            if (myState) {
                this.player.updateFromServer(myState);

                // Check if we're grabbed
                if (myState.isGrabbed && !this.isGrabbed) {
                    this.isGrabbed = true;
                    this.controls.setGrabbed(true);
                } else if (!myState.isGrabbed && this.isGrabbed) {
                    this.isGrabbed = false;
                    this.controls.setGrabbed(false);
                }
            }

            // Update remote players
            this.remotePlayers.updatePlayers(state, this.network.playerId);

            // Update world geometry from server state
            if (state.world) {
                this.scene.rebuildFromWorldState(state.world);
            }
        };

        this.network.onGrabbed = (grabbedBy) => {
            this.isGrabbed = true;
            this.controls.setGrabbed(true);
        };

        this.network.onReleased = () => {
            this.isGrabbed = false;
            this.controls.setGrabbed(false);
        };

        this.network.onPlayerLeft = (playerId) => {
            this.remotePlayers.removePlayer(playerId);
        };
    }

    gameLoop() {
        requestAnimationFrame(() => this.gameLoop());

        const now = performance.now();
        const deltaTime = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // Update player position (interpolation)
        this.player.update(deltaTime);

        // Update camera based on player position
        this.controls.update(this.player.getPosition());

        // Send input to server at fixed rate
        if (now - this.lastInputTime >= this.inputInterval) {
            if (this.network.isConnected) {
                const input = this.controls.getInput();
                this.network.sendInput(input, input.lookRotation);

                // Clear jump after sending
                if (input.jump) {
                    this.controls.clearJump();
                }
            }
            this.lastInputTime = now;
        }

        // Render
        this.scene.render();
    }
}

// Start the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
