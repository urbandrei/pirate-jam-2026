/**
 * Network protocol message types and utilities
 */

// Message types
export const MSG = {
    // Client -> Server
    JOIN: 'JOIN',
    INPUT: 'INPUT',
    VR_POSE: 'VR_POSE',
    GRAB_ATTEMPT: 'GRAB_ATTEMPT',
    GRAB_RELEASE: 'GRAB_RELEASE',

    // Server -> Client
    JOINED: 'JOINED',
    PLAYER_JOINED: 'PLAYER_JOINED',
    PLAYER_LEFT: 'PLAYER_LEFT',
    STATE_UPDATE: 'STATE_UPDATE',
    GRABBED: 'GRABBED',
    RELEASED: 'RELEASED',
    GRAB_SUCCESS: 'GRAB_SUCCESS',
    RELEASE_SUCCESS: 'RELEASE_SUCCESS'
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

export function createGrabAttemptMessage(hand) {
    return {
        type: MSG.GRAB_ATTEMPT,
        hand: hand // 'left' or 'right'
    };
}

export function createGrabReleaseMessage() {
    return {
        type: MSG.GRAB_RELEASE
    };
}
