/**
 * Server-side physics simulation and validation
 * Processes player inputs and updates positions authoritatively
 */

const MOVE_SPEED = 5.0; // meters per second
const JUMP_VELOCITY = 5.0; // meters per second
const GRAVITY = -15.0; // meters per second squared
const GROUND_LEVEL = 0.9; // Player capsule center height when grounded
const WORLD_BOUNDS = 50; // Half-size of the play area

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
                this.updatePCPlayer(player, deltaTime);
            }
        }
    }

    /**
     * Update a PC player based on their input state
     */
    updatePCPlayer(player, deltaTime) {
        // Don't update movement if player is grabbed
        if (this.gameState.isPlayerGrabbed(player.id)) {
            return;
        }

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

        // Apply horizontal movement
        player.position.x += moveX * deltaTime;
        player.position.z += moveZ * deltaTime;

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
