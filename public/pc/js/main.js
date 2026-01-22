/**
 * PC Client Main Entry Point
 */

import { Scene } from './scene.js';
import { Controls } from './controls.js';
import { Network } from './network.js';
import { Player } from './player.js';
import { RemotePlayers } from './remote-players.js';
import { HUD } from './hud.js';
import { InteractionSystem } from './interaction-system.js';
import { SleepMinigame } from './sleep-minigame.js';
import { INPUT_RATE, ITEMS } from '../shared/constants.js';

class Game {
    constructor() {
        this.scene = null;
        this.controls = null;
        this.network = null;
        this.player = null;
        this.remotePlayers = null;
        this.hud = null;
        this.interactionSystem = null;
        this.sleepMinigame = null;

        this.lastTime = performance.now();
        this.lastInputTime = 0;
        this.inputInterval = 1000 / INPUT_RATE;

        this.isGrabbed = false;
        this.isSleeping = false;
        this.isDead = false;
        this.isInQueue = false;
        this.isInWaitingRoom = false;

        this.init();
    }

    async init() {
        console.log('Initializing PC client...');

        // Setup Three.js scene
        const container = document.getElementById('game-container');
        this.scene = new Scene(container);

        // Setup controls
        this.controls = new Controls(this.scene.camera, this.scene.renderer.domElement);

        // Setup player (pass camera for held item display)
        this.player = new Player(this.scene, this.scene.camera);

        // Setup remote players renderer
        this.remotePlayers = new RemotePlayers(this.scene);

        // Setup HUD
        this.hud = new HUD();

        // Setup interaction system
        this.interactionSystem = new InteractionSystem(this.scene, this.scene.camera);

        // Wire up click handler from controls
        this.controls.onLeftClick = () => {
            // Check for waiting room door interaction first
            if (this.isInWaitingRoom) {
                const doorInteraction = this.scene.getWaitingRoomDoorInteraction();
                if (doorInteraction) {
                    // Try to join game through door
                    this.network.sendInteract(doorInteraction.type, doorInteraction.targetId, doorInteraction.position);
                    return;
                }
            }

            // First, check if we're targeting an interactable (prioritize interaction over drop)
            if (this.interactionSystem.hasTarget()) {
                // We have a valid target - try to interact
                this.interactionSystem.handleClick();
            } else if (this.player.isHoldingItem()) {
                // No target but holding an item - check if consumable, otherwise drop
                const heldItem = this.player.getHeldItem();
                const itemDef = heldItem ? ITEMS[heldItem.type] : null;

                if (itemDef && itemDef.hunger) {
                    // Food item - eat it
                    this.handleConsume('eat', heldItem);
                } else if (itemDef && itemDef.rest && heldItem.type === 'coffee') {
                    // Coffee - drink it
                    this.handleConsume('drink_coffee', heldItem);
                } else if (itemDef && itemDef.thirst && heldItem.type === 'water_container') {
                    // Water container - drink from it
                    this.handleConsume('drink_container', heldItem);
                } else {
                    // Non-consumable item - drop it
                    this.handleDrop();
                }
            }
            // If neither, do nothing
        };

        // Wire up interaction callback to network
        this.interactionSystem.onInteract = (interactionType, targetId, targetPosition) => {
            if (this.network && this.network.isConnected) {
                // Route wash/cut to timed interaction flow
                if (interactionType === 'wash' || interactionType === 'cut') {
                    this.network.sendTimedInteractStart(interactionType, targetId, targetPosition);
                } else if (interactionType === 'sleep') {
                    // Sleep interaction - send to server and start minigame on success
                    this.network.sendInteract(interactionType, targetId, targetPosition);
                    // Minigame will start when we receive INTERACT_SUCCESS for sleep
                } else {
                    this.network.sendInteract(interactionType, targetId, targetPosition);
                }
            }
        };

        // Wire up timed interaction cancel callback
        this.interactionSystem.onTimedInteractCancel = () => {
            if (this.network && this.network.isConnected) {
                this.network.sendTimedInteractCancel();
            }
        };

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

    /**
     * Handle dropping the currently held item
     */
    handleDrop() {
        if (!this.player.isHoldingItem()) return;

        const heldItem = this.player.getHeldItem();

        // Calculate drop position: 1.5m in front of player at ground level
        const pos = this.player.getPosition();
        const lookRotation = this.controls.getInput().lookRotation;
        const yaw = lookRotation.y;

        // Direction player is facing (from yaw angle)
        const dropDistance = 1.5;
        const dropPosition = {
            x: pos.x - Math.sin(yaw) * dropDistance,
            y: 0.25, // Just above ground
            z: pos.z - Math.cos(yaw) * dropDistance
        };

        // Send drop interaction to server
        if (this.network && this.network.isConnected) {
            this.network.sendInteract('drop_item', heldItem.id, dropPosition);
        }
    }

    /**
     * Handle consuming a held item (eating/drinking)
     * @param {string} interactionType - 'eat', 'drink_coffee', or 'drink_container'
     * @param {Object} item - The item being consumed
     */
    handleConsume(interactionType, item) {
        if (!item) return;

        const pos = this.player.getPosition();

        // Send consume interaction to server
        if (this.network && this.network.isConnected) {
            this.network.sendInteract(interactionType, item.id, pos);
        }
    }

    setupNetworkCallbacks() {
        // Handle successful join (including from queue)
        this.network.onJoined = () => {
            if (this.isInQueue) {
                this.handleJoinedFromQueue();
            }
        };

        this.network.onStateUpdate = (state) => {
            // Skip all state updates while in waiting room (local-only experience)
            // Waiting room players don't receive STATE_UPDATE from server anyway,
            // but this is a defensive check
            if (this.isInWaitingRoom) {
                return;
            }

            // Update local player from authoritative server state
            const myState = state.players[this.network.playerId];
            if (myState) {
                this.player.updateFromServer(myState);

                // Update HUD with player needs
                if (myState.needs) {
                    this.hud.updateNeeds(myState.needs);
                }

                // Update held item display (both 3D and HUD)
                this.player.updateHeldItem(myState.heldItem);
                this.hud.updateHeldItem(myState.heldItem);

                // Check if we're grabbed
                if (myState.isGrabbed && !this.isGrabbed) {
                    this.isGrabbed = true;
                    this.controls.setGrabbed(true);
                } else if (!myState.isGrabbed && this.isGrabbed) {
                    this.isGrabbed = false;
                    this.controls.setGrabbed(false);
                }

                // Update available interaction from server
                this.interactionSystem.setAvailableInteraction(myState.availableInteraction);
            }

            // Update remote players
            this.remotePlayers.updatePlayers(state, this.network.playerId);

            // Update world geometry from server state
            if (state.world) {
                this.scene.rebuildFromWorldState(state.world);
            }

            // Update world objects (pickable items, plants, appliances, beds, etc.)
            if (state.worldObjects) {
                const heldItem = myState ? myState.heldItem : null;
                this.scene.updateWorldObjects(state.worldObjects, this.interactionSystem, myState, heldItem);
                // Note: Soil plot interactions now handled by server via availableInteraction
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

        // Interaction response callbacks
        this.network.onInteractSuccess = (interactionType, targetId, result) => {
            console.log(`Interaction ${interactionType} on ${targetId} succeeded`, result);

            // Handle sleep interaction success - start minigame
            if (interactionType === 'sleep') {
                this.startSleepMinigame();
            } else if (interactionType === 'wake') {
                this.handleWakeUp();
            }
        };

        this.network.onInteractFail = (interactionType, targetId, reason) => {
            console.log(`Interaction ${interactionType} on ${targetId} failed: ${reason}`);
            // Future: could show error message briefly on HUD
        };

        // Sleep minigame result callback
        this.network.onSleepMinigameResult = (score, multiplier) => {
            console.log(`Sleep minigame result received: score=${score}%, multiplier=${multiplier}`);
        };

        // Death and revive callbacks
        this.network.onPlayerDied = (deathPosition, cause, waitingRoomPosition) => {
            this.handleDeath(deathPosition, cause, waitingRoomPosition);
        };

        this.network.onPlayerRevived = (position, needs) => {
            this.handleRevive(position, needs);
        };

        // Waiting room state callback
        this.network.onWaitingRoomState = (state) => {
            this.scene.updateWaitingRoomState(state);
        };

        // Door timeout callback
        this.network.onDoorTimeout = () => {
            console.log('[Game] Took too long - moved to back of queue');
            // Could show a brief message to the player
        };

        // Queue callbacks (for new players joining full game)
        this.network.onJoinQueued = (position, total, playerLimit, waitingRoomPosition) => {
            // Game was full when we tried to join - teleport to waiting room
            console.log(`[Game] Game full (${playerLimit} players). Queued at position ${position}/${total}`);
            this.isInQueue = true;
            this.isInWaitingRoom = true;

            // Initialize player position to waiting room (critical for camera placement)
            if (waitingRoomPosition) {
                this.player.setPosition(waitingRoomPosition);
            }

            this.scene.showWaitingRoom();

            // Initialize queue state immediately (before WAITING_ROOM_STATE arrives from server)
            this.scene.updateWaitingRoomState({
                cooldownRemaining: 0,  // No cooldown for new players joining full game
                queuePosition: position,
                queueTotal: total,
                doorOpen: false,  // Door only opens when game has space
                joinTimeRemaining: null
            });
        };

        this.network.onQueueJoined = (position, total) => {
            // Dead player successfully joined queue after cooldown
            console.log(`[Game] Joined queue at position ${position}/${total}`);
            this.isInQueue = true;
        };

        this.network.onQueueUpdate = (position, total) => {
            // Queue position updated - handled by WAITING_ROOM_STATE
            console.log(`[Game] Queue position: ${position}/${total}`);
        };

        this.network.onQueueReady = () => {
            // Slot available - door should now be open (green)
            // Player needs to walk through door to join
            console.log('[Game] Slot available! Walk through the door to join.');
        };

        this.network.onJoinFromQueueFailed = (reason) => {
            // Failed to join from queue
            console.log('[Game] Failed to join from queue:', reason);
        };

        // Timed interaction callbacks
        this.network.onTimedInteractProgress = (interactionType, targetId, duration) => {
            // Server confirmed timed interaction started - show progress bar
            this.interactionSystem.startTimedInteraction(interactionType, targetId, duration);
        };

        this.network.onTimedInteractComplete = (interactionType, stationId, result) => {
            // Server confirmed timed interaction completed
            this.interactionSystem.completeTimedInteraction();
            console.log(`Timed interaction ${interactionType} completed at ${stationId}`, result);
        };

        this.network.onTimedInteractCancelled = (reason) => {
            // Server cancelled the timed interaction
            this.interactionSystem.completeTimedInteraction(); // Hide progress bar
            console.log(`Timed interaction cancelled: ${reason}`);
        };
    }

    gameLoop() {
        requestAnimationFrame(() => this.gameLoop());

        const now = performance.now();
        const deltaTime = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // Update player position (interpolation)
        this.player.update(deltaTime);

        // Local movement for waiting room (no server updates come back)
        if (this.isInWaitingRoom) {
            this.updateLocalWaitingRoomMovement(deltaTime);
        }

        // Update camera based on player position
        this.controls.update(this.player.getPosition());

        // Update interaction system (raycasting and highlighting)
        this.interactionSystem.update();

        // Update timed interaction progress (if active)
        if (this.interactionSystem.isInTimedInteraction()) {
            this.interactionSystem.updateTimedInteraction();
        }

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

    /**
     * Start the sleep minigame
     */
    startSleepMinigame() {
        if (this.isSleeping) return;

        this.isSleeping = true;
        this.controls.setSleeping(true);  // Disable movement and lock camera up while sleeping

        // Release pointer lock so user can click on minigame squares
        document.exitPointerLock();

        // Create and start the minigame
        this.sleepMinigame = new SleepMinigame((score, multiplier) => {
            // Minigame completed - send result to server
            if (this.network && this.network.isConnected) {
                this.network.sendSleepMinigameComplete(score, multiplier);

                // Immediately wake up after minigame - no waiting
                this.network.sendInteract('wake', null, this.player.getPosition());
            }

            console.log(`Sleep minigame completed: score=${score}%, multiplier=${multiplier.toFixed(1)}x`);
        });

        this.sleepMinigame.start();
    }

    /**
     * Handle waking up from sleep (called when server confirms wake)
     */
    handleWakeUp() {
        this.isSleeping = false;
        this.controls.setSleeping(false);  // Re-enable movement and camera

        if (this.sleepMinigame) {
            this.sleepMinigame.stop();
            this.sleepMinigame = null;
        }

        // Re-lock pointer after minigame ends
        this.scene.renderer.domElement.requestPointerLock();

        console.log('Player woke up');
    }

    /**
     * Handle player death - teleported to physical waiting room
     */
    handleDeath(deathPosition, cause = 'unknown', waitingRoomPosition) {
        if (this.isDead) return;

        this.isDead = true;
        this.isInWaitingRoom = true;

        // Don't disable controls - player can walk around waiting room
        this.controls.setDead(false);

        // Show physical waiting room
        this.scene.showWaitingRoom();

        console.log('[Game] Player died at', deathPosition, 'cause:', cause, '- teleported to waiting room');
    }

    /**
     * Handle player revive (joining game from queue)
     */
    handleRevive(position) {
        this.isDead = false;
        this.isInQueue = false;
        this.isInWaitingRoom = false;
        this.controls.setDead(false);

        // Hide physical waiting room
        this.scene.hideWaitingRoom();

        // Re-lock pointer
        this.scene.renderer.domElement.requestPointerLock();

        console.log('[Game] Player respawned at', position);
    }

    /**
     * Handle successful join from queue (JOINED message after queue)
     */
    handleJoinedFromQueue() {
        this.isDead = false;
        this.isInQueue = false;
        this.isInWaitingRoom = false;
        this.controls.setDead(false);

        // Hide physical waiting room
        this.scene.hideWaitingRoom();

        // Re-lock pointer
        this.scene.renderer.domElement.requestPointerLock();

        console.log('[Game] Joined game from queue');
    }

    /**
     * Handle local movement in waiting room (no server updates)
     * @param {number} deltaTime - Time since last frame in seconds
     */
    updateLocalWaitingRoomMovement(deltaTime) {
        const input = this.controls.getInput();
        const MOVE_SPEED = 5.0;  // Same as server
        const lookYaw = input.lookRotation.y;

        let moveX = 0;
        let moveZ = 0;

        if (input.forward) {
            moveX -= Math.sin(lookYaw);
            moveZ -= Math.cos(lookYaw);
        }
        if (input.backward) {
            moveX += Math.sin(lookYaw);
            moveZ += Math.cos(lookYaw);
        }
        if (input.left) {
            moveX -= Math.cos(lookYaw);
            moveZ += Math.sin(lookYaw);
        }
        if (input.right) {
            moveX += Math.cos(lookYaw);
            moveZ -= Math.sin(lookYaw);
        }

        // Normalize diagonal movement
        const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (moveLen > 0) {
            moveX = (moveX / moveLen) * MOVE_SPEED;
            moveZ = (moveZ / moveLen) * MOVE_SPEED;
        }

        // Apply movement
        const pos = this.player.getPosition();
        pos.x += moveX * deltaTime;
        pos.z += moveZ * deltaTime;

        // Clamp to waiting room bounds (10x10m room centered at 500, 500)
        const CENTER_X = 500, CENTER_Z = 500;
        const HALF_SIZE = 5, RADIUS = 0.3;
        pos.x = Math.max(CENTER_X - HALF_SIZE + RADIUS, Math.min(CENTER_X + HALF_SIZE - RADIUS, pos.x));
        pos.z = Math.max(CENTER_Z - HALF_SIZE + RADIUS, Math.min(CENTER_Z + HALF_SIZE - RADIUS, pos.z));

        this.player.setPosition(pos);
    }
}

// Start the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
