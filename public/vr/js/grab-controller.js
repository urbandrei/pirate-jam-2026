/**
 * VR grab controller - handles grab state and visual feedback
 *
 * Grab detection happens on the server in world units.
 * This controller just manages the grab state and sends messages.
 */

import { GRAB_RADIUS, GIANT_SCALE } from '../../pc/shared/constants.js';

export class GrabController {
    constructor(hands, network) {
        this.hands = hands;
        this.network = network;

        // State
        this.isGrabbing = false;
        this.grabbedPlayerId = null;
        this.activeHand = null;

        // Setup pinch callbacks
        this.hands.onPinchStart = (hand) => this.handlePinchStart(hand);
        this.hands.onPinchEnd = (hand) => this.handlePinchEnd(hand);
    }

    handlePinchStart(hand) {
        if (this.isGrabbing) return; // Already grabbing

        console.log('Pinch started:', hand);

        // Get pinch point position (midpoint between thumb and index finger tips)
        // This is where the grab should occur, not at the wrist
        const pinchPosition = this.hands.getPinchPointPosition(hand);
        console.log('Pinch point for grab:', pinchPosition);

        // Send grab attempt to server with pinch point position
        this.network.sendGrabAttempt(hand, pinchPosition);
        this.activeHand = hand;
    }

    handlePinchEnd(hand) {
        if (!this.isGrabbing) return;
        if (hand !== this.activeHand) return; // Different hand

        console.log('Pinch ended:', hand);

        // Get hand velocity for throw mechanic
        const velocity = this.hands.getHandVelocity(hand);
        console.log('Throw velocity:', velocity);

        // Send release to server with velocity for throw
        this.network.sendGrabRelease(velocity);
    }

    onGrabSuccess(playerId) {
        this.isGrabbing = true;
        this.grabbedPlayerId = playerId;
        this.hands.setGrabbing(this.activeHand, true);
        console.log('Grab successful:', playerId);
    }

    onReleaseSuccess(playerId) {
        this.isGrabbing = false;
        this.grabbedPlayerId = null;
        this.hands.setGrabbing(this.activeHand, false);
        this.activeHand = null;
        console.log('Release successful:', playerId);
    }

    update() {
        // Visual feedback is handled by hands class
    }

    isHoldingPlayer() {
        return this.isGrabbing;
    }

    getGrabbedPlayerId() {
        return this.grabbedPlayerId;
    }
}
