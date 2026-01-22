/**
 * Server-side physics simulation and validation
 * Processes player inputs and updates positions authoritatively
 */

const MOVE_SPEED = 5.0; // meters per second
const JUMP_VELOCITY = 5.0; // meters per second
const GRAVITY = -15.0; // meters per second squared
const GROUND_LEVEL = 0.9; // Player capsule center height when grounded
const WORLD_BOUNDS = 50; // Half-size of the play area
const CELL_SIZE = 10; // SMALL_ROOM_SIZE - 10m grid cells
const PLAYER_RADIUS = 0.3; // Player collision radius

// Waiting room constants (must match shared/constants.js)
const WAITING_ROOM_CENTER = { x: 500, z: 500 };
const WAITING_ROOM_HALF_SIZE = 5; // Half of 10m room

class PhysicsValidator {
    constructor(gameState) {
        this.gameState = gameState;
        this.lastTickTime = Date.now();
    }

    /**
     * Run a physics tick for all players
     * @param {number} deltaTime - Time since last tick in seconds
     */
    tick(deltaTime) {
        for (const player of this.gameState.getAllPlayers()) {
            if (player.type === 'pc') {
                // Dead/waiting players use waiting room physics
                if (player.playerState === 'dead' || player.playerState === 'waiting') {
                    this.updateWaitingRoomPlayer(player, deltaTime);
                } else {
                    this.updatePCPlayer(player, deltaTime);
                }
            }
        }
    }

    /**
     * Update a PC player based on their input state
     */
    updatePCPlayer(player, deltaTime) {
        const input = player.input;
        const lookYaw = player.lookRotation?.y || 0;

        // Calculate movement direction based on look direction
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

        // Calculate new position
        const newX = player.position.x + moveX * deltaTime;
        const newZ = player.position.z + moveZ * deltaTime;

        // Get world state for collision checking
        const worldState = this.gameState.getWorldState();

        // Apply horizontal movement with wall collision (separate X and Z for sliding)
        if (!this.checkWallCollision(newX, player.position.z, worldState)) {
            player.position.x = newX;
        }
        if (!this.checkWallCollision(player.position.x, newZ, worldState)) {
            player.position.z = newZ;
        }

        // Handle jumping
        if (input.jump && player.grounded) {
            player.velocity.y = JUMP_VELOCITY;
            player.grounded = false;
            // Clear jump input after processing
            player.input.jump = false;
        }

        // Apply gravity
        if (!player.grounded) {
            player.velocity.y += GRAVITY * deltaTime;
            player.position.y += player.velocity.y * deltaTime;

            // Ground collision
            if (player.position.y <= GROUND_LEVEL) {
                player.position.y = GROUND_LEVEL;
                player.velocity.y = 0;
                player.grounded = true;
            }
        }

        // Clamp to world bounds
        player.position.x = Math.max(-WORLD_BOUNDS, Math.min(WORLD_BOUNDS, player.position.x));
        player.position.z = Math.max(-WORLD_BOUNDS, Math.min(WORLD_BOUNDS, player.position.z));
    }

    /**
     * Check if a position collides with any walls
     * @param {number} x - X position to check
     * @param {number} z - Z position to check
     * @param {Object} worldState - World state with grid and doorways
     * @returns {boolean} True if collision detected
     */
    checkWallCollision(x, z, worldState) {
        if (!worldState || !worldState.grid) return false;

        const half = CELL_SIZE / 2;

        // Check against walls of each cell
        for (const cell of worldState.grid) {
            const cellCenterX = cell.x * CELL_SIZE;
            const cellCenterZ = cell.z * CELL_SIZE;

            // Check if player is near this cell (optimization)
            if (Math.abs(x - cellCenterX) > CELL_SIZE + PLAYER_RADIUS ||
                Math.abs(z - cellCenterZ) > CELL_SIZE + PLAYER_RADIUS) {
                continue;
            }

            // Check each wall of this cell
            // North wall (z - half)
            if (this.checkWallSegment(x, z, cellCenterX, cellCenterZ - half, 'z', cell, 0, -1, worldState)) {
                return true;
            }
            // South wall (z + half)
            if (this.checkWallSegment(x, z, cellCenterX, cellCenterZ + half, 'z', cell, 0, 1, worldState)) {
                return true;
            }
            // East wall (x + half)
            if (this.checkWallSegment(x, z, cellCenterX + half, cellCenterZ, 'x', cell, 1, 0, worldState)) {
                return true;
            }
            // West wall (x - half)
            if (this.checkWallSegment(x, z, cellCenterX - half, cellCenterZ, 'x', cell, -1, 0, worldState)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check collision with a single wall segment
     */
    checkWallSegment(playerX, playerZ, wallX, wallZ, axis, cell, dx, dz, worldState) {
        const half = CELL_SIZE / 2;

        // Check if there's a neighbor in this direction
        const neighborX = cell.x + dx;
        const neighborZ = cell.z + dz;
        const neighbor = worldState.grid.find(c => c.x === neighborX && c.z === neighborZ);

        // If neighbor exists with same mergeGroup, no wall (open space)
        if (neighbor && neighbor.mergeGroup === cell.mergeGroup) {
            return false;
        }

        // If neighbor exists with different mergeGroup, check if there's a doorway
        if (neighbor && neighbor.mergeGroup !== cell.mergeGroup) {
            const hasDoorway = worldState.doorways && worldState.doorways.some(d =>
                (d.cell1.x === cell.x && d.cell1.z === cell.z && d.cell2.x === neighborX && d.cell2.z === neighborZ) ||
                (d.cell2.x === cell.x && d.cell2.z === cell.z && d.cell1.x === neighborX && d.cell1.z === neighborZ)
            );

            if (hasDoorway) {
                // Wall with doorway - check if player is in doorway gap
                const doorwayWidth = 1.2; // DOORWAY_WIDTH
                if (axis === 'z') {
                    // Wall runs along X, doorway centered on wallX
                    if (Math.abs(playerX - wallX) < doorwayWidth / 2) {
                        return false; // In doorway, no collision
                    }
                } else {
                    // Wall runs along Z, doorway centered on wallZ
                    if (Math.abs(playerZ - wallZ) < doorwayWidth / 2) {
                        return false; // In doorway, no collision
                    }
                }
            }
        }

        // Check collision with wall line
        if (axis === 'z') {
            // Wall runs along X-axis at wallZ
            const wallMinX = wallX - half;
            const wallMaxX = wallX + half;
            if (playerX >= wallMinX - PLAYER_RADIUS && playerX <= wallMaxX + PLAYER_RADIUS) {
                if (Math.abs(playerZ - wallZ) < PLAYER_RADIUS) {
                    return true;
                }
            }
        } else {
            // Wall runs along Z-axis at wallX
            const wallMinZ = wallZ - half;
            const wallMaxZ = wallZ + half;
            if (playerZ >= wallMinZ - PLAYER_RADIUS && playerZ <= wallMaxZ + PLAYER_RADIUS) {
                if (Math.abs(playerX - wallX) < PLAYER_RADIUS) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Update a player in the waiting room (simplified physics)
     * @param {Object} player - Player object
     * @param {number} deltaTime - Time since last tick in seconds
     */
    updateWaitingRoomPlayer(player, deltaTime) {
        const input = player.input;
        const lookYaw = player.lookRotation?.y || 0;

        // Calculate movement direction based on look direction
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
        player.position.x += moveX * deltaTime;
        player.position.z += moveZ * deltaTime;

        // Handle jumping
        if (input.jump && player.grounded) {
            player.velocity.y = JUMP_VELOCITY;
            player.grounded = false;
            player.input.jump = false;
        }

        // Apply gravity
        if (!player.grounded) {
            player.velocity.y += GRAVITY * deltaTime;
            player.position.y += player.velocity.y * deltaTime;

            if (player.position.y <= GROUND_LEVEL) {
                player.position.y = GROUND_LEVEL;
                player.velocity.y = 0;
                player.grounded = true;
            }
        }

        // Clamp to waiting room bounds (10x10m room centered at 500, 500)
        const minX = WAITING_ROOM_CENTER.x - WAITING_ROOM_HALF_SIZE + PLAYER_RADIUS;
        const maxX = WAITING_ROOM_CENTER.x + WAITING_ROOM_HALF_SIZE - PLAYER_RADIUS;
        const minZ = WAITING_ROOM_CENTER.z - WAITING_ROOM_HALF_SIZE + PLAYER_RADIUS;
        const maxZ = WAITING_ROOM_CENTER.z + WAITING_ROOM_HALF_SIZE - PLAYER_RADIUS;

        player.position.x = Math.max(minX, Math.min(maxX, player.position.x));
        player.position.z = Math.max(minZ, Math.min(maxZ, player.position.z));
    }

    /**
     * Validate a position is within acceptable bounds
     */
    validatePosition(position) {
        return (
            Math.abs(position.x) <= WORLD_BOUNDS &&
            position.y >= 0 &&
            position.y <= 100 &&
            Math.abs(position.z) <= WORLD_BOUNDS
        );
    }

    /**
     * Validate movement speed is reasonable (anti-cheat)
     */
    validateMovementSpeed(oldPos, newPos, deltaTime) {
        const maxSpeed = MOVE_SPEED * 1.5; // Allow some tolerance
        const dx = newPos.x - oldPos.x;
        const dz = newPos.z - oldPos.z;
        const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
        const speed = horizontalDistance / deltaTime;

        return speed <= maxSpeed;
    }
}

module.exports = PhysicsValidator;
