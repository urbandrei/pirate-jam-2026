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
    CONVERT_ROOM: 'CONVERT_ROOM',
    INTERACT: 'INTERACT',
    TIMED_INTERACT_START: 'TIMED_INTERACT_START',
    TIMED_INTERACT_CANCEL: 'TIMED_INTERACT_CANCEL',

    // Server -> Client
    JOINED: 'JOINED',
    PLAYER_JOINED: 'PLAYER_JOINED',
    PLAYER_LEFT: 'PLAYER_LEFT',
    STATE_UPDATE: 'STATE_UPDATE',
    BLOCK_PLACED: 'BLOCK_PLACED',
    PLACE_BLOCK_FAILED: 'PLACE_BLOCK_FAILED',
    ROOM_CONVERTED: 'ROOM_CONVERTED',
    CONVERT_ROOM_FAILED: 'CONVERT_ROOM_FAILED',
    INTERACT_SUCCESS: 'INTERACT_SUCCESS',
    INTERACT_FAIL: 'INTERACT_FAIL',
    TIMED_INTERACT_PROGRESS: 'TIMED_INTERACT_PROGRESS',
    TIMED_INTERACT_COMPLETE: 'TIMED_INTERACT_COMPLETE',
    TIMED_INTERACT_CANCELLED: 'TIMED_INTERACT_CANCELLED'
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
 * @param {number} rotation - 0 for east-west, 1 for north-south (1x2 only)
 * @param {string} roomType - Room type (generic, farming, processing, cafeteria, dorm, waiting)
 */
export function createPlaceBlockMessage(gridX, gridZ, blockSize, rotation = 0, roomType = 'generic') {
    return {
        type: MSG.PLACE_BLOCK,
        gridX: gridX,
        gridZ: gridZ,
        blockSize: blockSize,
        rotation: rotation,
        roomType: roomType
    };
}

/**
 * Create a convert room message (VR -> Server)
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridZ - Grid Z coordinate
 * @param {string} roomType - Room type to convert to
 */
export function createConvertRoomMessage(gridX, gridZ, roomType) {
    return {
        type: MSG.CONVERT_ROOM,
        gridX: gridX,
        gridZ: gridZ,
        roomType: roomType
    };
}

/**
 * Create an interact message (PC -> Server)
 * @param {string} interactionType - Type of interaction (from INTERACTIONS constant)
 * @param {string} targetId - ID of the target object
 * @param {Object} targetPosition - World position {x, y, z} of target for range validation
 */
export function createInteractMessage(interactionType, targetId, targetPosition) {
    return {
        type: MSG.INTERACT,
        interactionType,
        targetId,
        targetPosition
    };
}

/**
 * Create a timed interact start message (PC -> Server)
 * Used for wash/cut stations that require holding interaction
 * @param {string} interactionType - 'wash' or 'cut'
 * @param {string} targetId - Station ID
 * @param {Object} targetPosition - World position {x, y, z} of station
 */
export function createTimedInteractStartMessage(interactionType, targetId, targetPosition) {
    return {
        type: MSG.TIMED_INTERACT_START,
        interactionType,
        targetId,
        targetPosition
    };
}

/**
 * Create a timed interact cancel message (PC -> Server)
 * Sent when player moves away during timed interaction
 */
export function createTimedInteractCancelMessage() {
    return {
        type: MSG.TIMED_INTERACT_CANCEL
    };
}
