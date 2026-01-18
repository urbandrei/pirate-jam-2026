/**
 * Server-side grab mechanics
 * Handles VR player grabbing PC players
 */

const GRAB_RADIUS = 0.5; // meters in PC scale
const PINCH_THRESHOLD = 0.02; // 2cm in VR scale

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
     * @returns {Object|null} - The grabbed player or null
     */
    attemptGrab(vrPlayerId, hand) {
        const vrPlayer = this.gameState.getPlayer(vrPlayerId);
        if (!vrPlayer || vrPlayer.type !== 'vr') {
            return null;
        }

        // Check if this VR player is already grabbing someone
        if (this.gameState.getGrabbedPlayer(vrPlayerId)) {
            return null;
        }

        // Get hand position
        const handData = hand === 'left' ? vrPlayer.leftHand : vrPlayer.rightHand;
        if (!handData || !handData.position) {
            return null;
        }

        // Find closest PC player in range
        let closestPlayer = null;
        let closestDistance = Infinity;

        for (const player of this.gameState.getAllPlayers()) {
            if (player.type !== 'pc') continue;
            if (this.gameState.isPlayerGrabbed(player.id)) continue;

            // Hand position is already in the same coordinate space as PC players
            const dx = handData.position.x - player.position.x;
            const dy = handData.position.y - player.position.y;
            const dz = handData.position.z - player.position.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (distance <= GRAB_RADIUS && distance < closestDistance) {
                closestPlayer = player;
                closestDistance = distance;
            }
        }

        if (closestPlayer) {
            this.gameState.setGrab(vrPlayerId, closestPlayer.id);
            console.log(`VR player ${vrPlayerId} grabbed PC player ${closestPlayer.id}`);
            return closestPlayer;
        }

        return null;
    }

    /**
     * Release a grabbed player
     * @param {string} vrPlayerId - The VR player releasing
     * @returns {string|null} - The released player's ID or null
     */
    releaseGrab(vrPlayerId) {
        const releasedId = this.gameState.releaseGrab(vrPlayerId);
        if (releasedId) {
            console.log(`VR player ${vrPlayerId} released PC player ${releasedId}`);
        }
        return releasedId;
    }

    /**
     * Update grabbed player positions to follow the grabbing hand
     * Uses lerp interpolation to smooth movement and prevent jitter
     */
    updateGrabbedPositions() {
        const SMOOTHING = 0.25; // Interpolation factor per tick

        for (const [vrPlayerId, pcPlayerId] of this.gameState.grabs) {
            const vrPlayer = this.gameState.getPlayer(vrPlayerId);
            const pcPlayer = this.gameState.getPlayer(pcPlayerId);

            if (!vrPlayer || !pcPlayer) continue;

            // Use right hand by default, fall back to left
            const handData = vrPlayer.rightHand || vrPlayer.leftHand;
            if (handData && handData.position) {
                // Smoothly interpolate toward hand position instead of teleporting
                pcPlayer.position.x += (handData.position.x - pcPlayer.position.x) * SMOOTHING;
                pcPlayer.position.y += (handData.position.y - pcPlayer.position.y) * SMOOTHING;
                pcPlayer.position.z += (handData.position.z - pcPlayer.position.z) * SMOOTHING;

                pcPlayer.velocity = { x: 0, y: 0, z: 0 };
                pcPlayer.grounded = false;
            }
        }
    }
}

module.exports = GrabSystem;
