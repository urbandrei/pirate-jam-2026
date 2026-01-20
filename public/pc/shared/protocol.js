/**
 * Network protocol message types and utilities
 */

// Message types
export const MSG = {
    // Client -> Server
    JOIN: 'JOIN',
    INPUT: 'INPUT',
    VR_POSE: 'VR_POSE',
    PLACE_BLOCK: 'PLACE_BLOCK',

    // Server -> Client
    JOINED: 'JOINED',
    PLAYER_JOINED: 'PLAYER_JOINED',
    PLAYER_LEFT: 'PLAYER_LEFT',
    STATE_UPDATE: 'STATE_UPDATE',
    BLOCK_PLACED: 'BLOCK_PLACED',
    PLACE_BLOCK_FAILED: 'PLACE_BLOCK_FAILED'
};

// Message creators for type safety

export function createJoinMessage(playerType) {
    return {
        type: MSG.JOIN,
        playerType: playerType // 'pc' or 'vr'
    };
}

export function createInputMessage(input, lookRotation) {
    return {
        type: MSG.INPUT,
        forward: input.forward,
        backward: input.backward,
        left: input.left,
        right: input.right,
        jump: input.jump,
        lookRotation: lookRotation
    };
}

export function createVRPoseMessage(head, leftHand, rightHand) {
    return {
        type: MSG.VR_POSE,
        head: head,
        leftHand: leftHand,
        rightHand: rightHand
    };
}

/**
 * Create a place block message (VR -> Server)
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @param {string} blockSize - '1x1' or '1x2'
 */
export function createPlaceBlockMessage(gridX, gridZ, blockSize) {
    return {
        type: MSG.PLACE_BLOCK,
        gridX: gridX,
        gridZ: gridZ,
        blockSize: blockSize
    };
}
