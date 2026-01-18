/**
 * VR grab controller - handles grab state and visual feedback
 *
 * Grab detection happens on the server in world units.
 * This controller just manages the grab state and sends messages.
 */

import { GRAB_RADIUS, GIANT_SCALE } from '../../shared/constants.js';

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

        // Send grab attempt to server
        this.network.sendGrabAttempt(hand);
        this.activeHand = hand;
    }

    handlePinchEnd(hand) {
        if (!this.isGrabbing) return;
        if (hand !== this.activeHand) return; // Different hand

        console.log('Pinch ended:', hand);

        // Send release to server
        this.network.sendGrabRelease();
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
