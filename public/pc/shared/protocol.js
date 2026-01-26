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
    SLEEP_MINIGAME_COMPLETE: 'SLEEP_MINIGAME_COMPLETE',
    REVIVE: 'REVIVE',

    // Camera (Client -> Server)
    PLACE_CAMERA: 'PLACE_CAMERA',
    PICKUP_CAMERA: 'PICKUP_CAMERA',
    ADJUST_CAMERA: 'ADJUST_CAMERA',
    ENTER_CAMERA_VIEW: 'ENTER_CAMERA_VIEW',
    EXIT_CAMERA_VIEW: 'EXIT_CAMERA_VIEW',
    SET_CAMERA_LIMITS: 'SET_CAMERA_LIMITS',

    // Chat (Client -> Server)
    CHAT_MESSAGE: 'CHAT_MESSAGE',
    SET_NAME: 'SET_NAME',
    MODERATE_PLAYER: 'MODERATE_PLAYER',

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
    TIMED_INTERACT_CANCELLED: 'TIMED_INTERACT_CANCELLED',
    SLEEP_MINIGAME_RESULT: 'SLEEP_MINIGAME_RESULT',
    PLAYER_DIED: 'PLAYER_DIED',
    PLAYER_REVIVED: 'PLAYER_REVIVED',

    // Camera (Server -> Client)
    CAMERA_PLACED: 'CAMERA_PLACED',
    CAMERA_PICKED_UP: 'CAMERA_PICKED_UP',
    CAMERA_ADJUSTED: 'CAMERA_ADJUSTED',
    CAMERA_LIMITS_UPDATED: 'CAMERA_LIMITS_UPDATED',
    CAMERA_NOT_FOUND: 'CAMERA_NOT_FOUND',
    PLACE_CAMERA_FAILED: 'PLACE_CAMERA_FAILED',

    // Chat (Server -> Client)
    CHAT_RECEIVED: 'CHAT_RECEIVED',
    CHAT_DELETED: 'CHAT_DELETED',
    CHAT_FAILED: 'CHAT_FAILED',
    NAME_UPDATED: 'NAME_UPDATED',
    NAME_UPDATE_FAILED: 'NAME_UPDATE_FAILED',
    MODERATION_APPLIED: 'MODERATION_APPLIED',
    PLAYER_MUTED: 'PLAYER_MUTED',
    PLAYER_UNMUTED: 'PLAYER_UNMUTED',
    PLAYER_KICKED: 'PLAYER_KICKED',
    BANNED: 'BANNED',

    // Stream Chat (Server -> Client)
    STREAM_CHAT_RECEIVED: 'STREAM_CHAT_RECEIVED',
    STREAM_STATUS: 'STREAM_STATUS',

    // Voice (uses separate socket events, not message type routing)
    // VR -> Server: 'voice' event with binary audio data
    // Server -> PC: 'voice' event with { senderId, data }
    VOICE_DATA: 'VOICE_DATA',
    VOICE_BROADCAST: 'VOICE_BROADCAST'
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

/**
 * Create a sleep minigame complete message (PC -> Server)
 * Sent when player finishes the sleep minigame
 * @param {number} score - Score percentage (0-100)
 * @param {number} multiplier - Rest restoration multiplier earned
 */
export function createSleepMinigameCompleteMessage(score, multiplier) {
    return {
        type: MSG.SLEEP_MINIGAME_COMPLETE,
        score,
        multiplier
    };
}

/**
 * Create a chat message (PC/VR -> Server)
 * @param {string} text - Message text (max 200 chars)
 */
export function createChatMessage(text) {
    return {
        type: MSG.CHAT_MESSAGE,
        text: text
    };
}

/**
 * Create a set name message (PC/VR -> Server)
 * @param {string} name - Display name (1-20 chars, alphanumeric + spaces)
 */
export function createSetNameMessage(name) {
    return {
        type: MSG.SET_NAME,
        name: name
    };
}

/**
 * Create a moderation action message (VR -> Server)
 * @param {string} action - 'mute', 'unmute', 'kick', 'tempban', 'delete_msg'
 * @param {string} targetId - Player ID to moderate (or null for delete_msg)
 * @param {Object} options - Optional: { duration, messageId }
 */
export function createModeratePlayerMessage(action, targetId, options = {}) {
    return {
        type: MSG.MODERATE_PLAYER,
        action: action,
        targetId: targetId,
        duration: options.duration || 0,
        messageId: options.messageId || null
    };
}

// Camera message creators

/**
 * Create a place camera message (PC/VR -> Server)
 * @param {string} cameraType - 'security' or 'stream'
 * @param {Object} position - World position {x, y, z}
 * @param {Object} rotation - Camera rotation {pitch, yaw, roll}
 */
export function createPlaceCameraMessage(cameraType, position, rotation) {
    return {
        type: MSG.PLACE_CAMERA,
        cameraType,
        position,
        rotation
    };
}

/**
 * Create a pickup camera message (PC -> Server)
 * @param {string} cameraId - ID of the camera to pick up
 */
export function createPickupCameraMessage(cameraId) {
    return {
        type: MSG.PICKUP_CAMERA,
        cameraId
    };
}

/**
 * Create an adjust camera message (PC -> Server)
 * @param {string} cameraId - ID of the camera to adjust
 * @param {Object} rotation - New rotation {pitch, yaw, roll}
 */
export function createAdjustCameraMessage(cameraId, rotation) {
    return {
        type: MSG.ADJUST_CAMERA,
        cameraId,
        rotation
    };
}

/**
 * Create an enter camera view message (PC -> Server)
 * @param {string} cameraId - ID of the camera to view through
 */
export function createEnterCameraViewMessage(cameraId) {
    return {
        type: MSG.ENTER_CAMERA_VIEW,
        cameraId
    };
}

/**
 * Create an exit camera view message (PC -> Server)
 */
export function createExitCameraViewMessage() {
    return {
        type: MSG.EXIT_CAMERA_VIEW
    };
}

/**
 * Create a set camera limits message (VR -> Server)
 * @param {number} securityLimit - Max security cameras
 * @param {number} streamLimit - Max stream cameras
 */
export function createSetCameraLimitsMessage(securityLimit, streamLimit) {
    return {
        type: MSG.SET_CAMERA_LIMITS,
        securityLimit,
        streamLimit
    };
}

