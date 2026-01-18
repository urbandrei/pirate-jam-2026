/**
 * Server-side grab mechanics
 * Handles VR player grabbing PC players
 */

const GRAB_RADIUS = 0.5; // meters in PC scale
const PINCH_THRESHOLD = 0.02; // 2cm in VR scale
const THROW_MULTIPLIER = 1.5; // Amplify throw velocity for more fun
const MAX_THROW_SPEED = 30; // Cap maximum throw speed (m/s in world units)

class GrabSystem {
    constructor(gameState) {
        this.gameState = gameState;
    }

    /**
     * Check if a VR hand is close enough to a PC player to grab them
     * @param {Object} handPosition - Hand position in VR scale
     * @param {Object} pcPlayerPosition - PC player position in PC scale
     * @returns {boolean}
     */
    isInGrabRange(handPosition, pcPlayerPosition) {
        // Hand position is already in the same coordinate space as PC players
        const dx = handPosition.x - pcPlayerPosition.x;
        const dy = handPosition.y - pcPlayerPosition.y;
        const dz = handPosition.z - pcPlayerPosition.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        return distance <= GRAB_RADIUS;
    }

    /**
     * Attempt to grab a PC player
     * @param {string} vrPlayerId - The VR player attempting to grab
     * @param {string} hand - 'left' or 'right'
     * @param {Object} immediateHandPosition - Optional hand position sent with the grab attempt
     * @returns {Object|null} - The grabbed player or null
     */
    attemptGrab(vrPlayerId, hand, immediateHandPosition = null) {
        console.log(`Grab attempt from VR player ${vrPlayerId} with ${hand} hand`);

        const vrPlayer = this.gameState.getPlayer(vrPlayerId);
        if (!vrPlayer || vrPlayer.type !== 'vr') {
            console.log('  -> Failed: VR player not found or not VR type');
            return null;
        }

        // Check if this VR player is already grabbing someone
        if (this.gameState.getGrabbedPlayer(vrPlayerId)) {
            console.log('  -> Failed: Already grabbing someone');
            return null;
        }

        // Use immediate hand position if provided, otherwise fall back to stored position
        let handPosition = immediateHandPosition;
        if (!handPosition) {
            const handData = hand === 'left' ? vrPlayer.leftHand : vrPlayer.rightHand;
            if (handData && handData.position) {
                handPosition = handData.position;
            }
        }

        if (!handPosition) {
            console.log(`  -> Failed: No ${hand} hand position available`);
            console.log('    Immediate position:', immediateHandPosition ? 'provided' : 'null');
            console.log('    Left hand:', vrPlayer.leftHand ? 'present' : 'null');
            console.log('    Right hand:', vrPlayer.rightHand ? 'present' : 'null');
            return null;
        }

        console.log(`  Hand position: (${handPosition.x.toFixed(2)}, ${handPosition.y.toFixed(2)}, ${handPosition.z.toFixed(2)})`);

        // Count PC players for debug
        const pcPlayers = this.gameState.getAllPlayers().filter(p => p.type === 'pc');
        console.log(`  PC players in game: ${pcPlayers.length}`);

        // Find closest PC player in range
        let closestPlayer = null;
        let closestDistance = Infinity;

        for (const player of this.gameState.getAllPlayers()) {
            if (player.type !== 'pc') continue;
            if (this.gameState.isPlayerGrabbed(player.id)) continue;

            // Hand position is already in the same coordinate space as PC players
            const dx = handPosition.x - player.position.x;
            const dy = handPosition.y - player.position.y;
            const dz = handPosition.z - player.position.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            console.log(`    PC player at (${player.position.x.toFixed(2)}, ${player.position.y.toFixed(2)}, ${player.position.z.toFixed(2)}) - distance: ${distance.toFixed(2)}m (need <= ${GRAB_RADIUS}m)`);

            if (distance <= GRAB_RADIUS && distance < closestDistance) {
                closestPlayer = player;
                closestDistance = distance;
            }
        }

        if (closestPlayer) {
            this.gameState.setGrab(vrPlayerId, closestPlayer.id, hand);
            console.log(`VR player ${vrPlayerId} grabbed PC player ${closestPlayer.id} with ${hand} hand`);
            return closestPlayer;
        }

        console.log(`VR player ${vrPlayerId} grab attempt failed - no PC player in range`);
        return null;
    }

    /**
     * Release a grabbed player with optional throw velocity
     * @param {string} vrPlayerId - The VR player releasing
     * @param {Object} velocity - Optional throw velocity {x, y, z} in world units/sec
     * @returns {string|null} - The released player's ID or null
     */
    releaseGrab(vrPlayerId, velocity = null) {
        const releasedId = this.gameState.releaseGrab(vrPlayerId);
        if (releasedId) {
            // Apply throw velocity if provided
            if (velocity && (velocity.x !== 0 || velocity.y !== 0 || velocity.z !== 0)) {
                const releasedPlayer = this.gameState.getPlayer(releasedId);
                if (releasedPlayer) {
                    // Calculate throw velocity with multiplier
                    let throwVel = {
                        x: velocity.x * THROW_MULTIPLIER,
                        y: velocity.y * THROW_MULTIPLIER,
                        z: velocity.z * THROW_MULTIPLIER
                    };

                    // Cap the throw speed
                    const speed = Math.sqrt(throwVel.x ** 2 + throwVel.y ** 2 + throwVel.z ** 2);
                    if (speed > MAX_THROW_SPEED) {
                        const scale = MAX_THROW_SPEED / speed;
                        throwVel.x *= scale;
                        throwVel.y *= scale;
                        throwVel.z *= scale;
                    }

                    // Apply the throw velocity
                    releasedPlayer.velocity = throwVel;
                    releasedPlayer.grounded = false;

                    console.log(`VR player ${vrPlayerId} threw PC player ${releasedId} with velocity:`, throwVel);
                }
            } else {
                console.log(`VR player ${vrPlayerId} released PC player ${releasedId}`);
            }
        }
        return releasedId;
    }

    /**
     * Update grabbed player positions to follow the pinch point (or wrist as fallback)
     * Uses lerp interpolation to smooth movement and prevent jitter
     */
    updateGrabbedPositions() {
        const SMOOTHING = 0.8; // Interpolation factor per tick (higher = more responsive)

        for (const [vrPlayerId, pcPlayerId] of this.gameState.grabs) {
            const vrPlayer = this.gameState.getPlayer(vrPlayerId);
            const pcPlayer = this.gameState.getPlayer(pcPlayerId);

            if (!vrPlayer || !pcPlayer) continue;

            // Use the hand that was used to grab
            const grabHand = this.gameState.getGrabHand(vrPlayerId);
            const handData = grabHand === 'left' ? vrPlayer.leftHand : vrPlayer.rightHand;

            if (handData) {
                // Use pinch point if available, otherwise fall back to wrist position
                const targetPosition = handData.pinchPoint || handData.position;

                if (targetPosition) {
                    // Smoothly interpolate toward pinch point instead of teleporting
                    pcPlayer.position.x += (targetPosition.x - pcPlayer.position.x) * SMOOTHING;
                    pcPlayer.position.y += (targetPosition.y - pcPlayer.position.y) * SMOOTHING;
                    pcPlayer.position.z += (targetPosition.z - pcPlayer.position.z) * SMOOTHING;

                    pcPlayer.velocity = { x: 0, y: 0, z: 0 };
                    pcPlayer.grounded = false;
                }
            }
        }
    }
}

module.exports = GrabSystem;
