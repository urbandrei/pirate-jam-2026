/**
 * Hand tracking and pinch detection for VR
 * Supports both WebXR Hand Tracking API and controller fallback
 *
 * COORDINATE SYSTEM:
 * - Hands are rendered at real VR scale (WebXR provides 1:1)
 * - Hand positions sent to server are multiplied by GIANT_SCALE
 * - This allows VR hands to interact with PC players in world units
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { COLORS, PINCH_THRESHOLD, GIANT_SCALE } from '../../pc/shared/constants.js';
import { FINGER_JOINTS, createVRHandMesh, updateBoneBetweenPoints } from '../../pc/shared/player-mesh.js';

// WebXR hand joint names
const JOINT_WRIST = 'wrist';
const JOINT_THUMB_TIP = 'thumb-tip';
const JOINT_INDEX_TIP = 'index-finger-tip';
const JOINT_MIDDLE_TIP = 'middle-finger-tip';
const JOINT_RING_TIP = 'ring-finger-tip';
const JOINT_PINKY_TIP = 'pinky-finger-tip';

export class Hands {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;

        // Controller-based hands (fallback)
        this.controller0 = null;
        this.controller1 = null;

        // Pinch state
        this.leftPinching = false;
        this.rightPinching = false;

        // Track previous pinch state for edge detection
        this.prevLeftPinching = false;
        this.prevRightPinching = false;

        // Callbacks
        this.onPinchStart = null;
        this.onPinchEnd = null;

        // Hand meshes
        this.leftHandMesh = this.createHandMesh('left');
        this.rightHandMesh = this.createHandMesh('right');
        scene.add(this.leftHandMesh);
        scene.add(this.rightHandMesh);

        // Store joint positions for network transmission (local space, unscaled)
        this.leftJointPositions = {};
        this.rightJointPositions = {};

        // Track which input mode is active per hand
        this.leftHandMode = null; // 'hand-tracking' or 'controller'
        this.rightHandMode = null;

        // Velocity tracking for throw mechanic
        this.leftHandPrevPos = null;
        this.rightHandPrevPos = null;
        this.leftHandVelocity = { x: 0, y: 0, z: 0 };
        this.rightHandVelocity = { x: 0, y: 0, z: 0 };
        this.lastVelocityUpdateTime = 0;

        // Pinch point positions (midpoint between thumb tip and index tip, in VR world coords)
        this.leftPinchPoint = null;
        this.rightPinchPoint = null;

        // Setup controllers for fallback
        this.setupControllers();
    }

    /**
     * Create pill-bone hand mesh structure using shared code.
     * All sizes are in real VR meters (1:1 scale with user's hands)
     */
    createHandMesh(side) {
        const group = createVRHandMesh({
            scale: 1, // VR scale (1:1 real world)
            includePinchIndicator: true,
            includeGrabRange: true
        });
        group.name = side + 'Hand';
        return group;
    }

    setupControllers() {
        // Controller-based input as fallback
        this.controller0 = this.renderer.xr.getController(0);
        this.controller1 = this.renderer.xr.getController(1);

        // Controller event listeners for squeeze (grip button)
        this.controller0.addEventListener('selectstart', () => {
            if (this.rightHandMode === 'controller') {
                this.handlePinchStart('right');
            }
        });
        this.controller0.addEventListener('selectend', () => {
            if (this.rightHandMode === 'controller') {
                this.handlePinchEnd('right');
            }
        });
        this.controller0.addEventListener('squeezestart', () => {
            if (this.rightHandMode === 'controller') {
                this.handlePinchStart('right');
            }
        });
        this.controller0.addEventListener('squeezeend', () => {
            if (this.rightHandMode === 'controller') {
                this.handlePinchEnd('right');
            }
        });

        this.controller1.addEventListener('selectstart', () => {
            if (this.leftHandMode === 'controller') {
                this.handlePinchStart('left');
            }
        });
        this.controller1.addEventListener('selectend', () => {
            if (this.leftHandMode === 'controller') {
                this.handlePinchEnd('left');
            }
        });
        this.controller1.addEventListener('squeezestart', () => {
            if (this.leftHandMode === 'controller') {
                this.handlePinchStart('left');
            }
        });
        this.controller1.addEventListener('squeezeend', () => {
            if (this.leftHandMode === 'controller') {
                this.handlePinchEnd('left');
            }
        });

        this.scene.add(this.controller0);
        this.scene.add(this.controller1);
    }

    handlePinchStart(hand) {
        if (hand === 'left') {
            this.leftPinching = true;
            const indicator = this.leftHandMesh.getObjectByName('pinchIndicator');
            if (indicator) indicator.visible = true;
        } else {
            this.rightPinching = true;
            const indicator = this.rightHandMesh.getObjectByName('pinchIndicator');
            if (indicator) indicator.visible = true;
        }

        if (this.onPinchStart) {
            this.onPinchStart(hand);
        }
    }

    handlePinchEnd(hand) {
        if (hand === 'left') {
            this.leftPinching = false;
            const indicator = this.leftHandMesh.getObjectByName('pinchIndicator');
            if (indicator) indicator.visible = false;
        } else {
            this.rightPinching = false;
            const indicator = this.rightHandMesh.getObjectByName('pinchIndicator');
            if (indicator) indicator.visible = false;
        }

        if (this.onPinchEnd) {
            this.onPinchEnd(hand);
        }
    }

    update(frame, referenceSpace) {
        if (!frame || !referenceSpace) return;

        try {
            const session = this.renderer.xr.getSession();
            if (!session) return;

            // Check for hand tracking input sources
            let leftHandSource = null;
            let rightHandSource = null;

            for (const source of session.inputSources) {
                if (source.hand) {
                    if (source.handedness === 'left') {
                        leftHandSource = source;
                    } else if (source.handedness === 'right') {
                        rightHandSource = source;
                    }
                }
            }

            // Update left hand
            if (leftHandSource && leftHandSource.hand) {
                this.leftHandMode = 'hand-tracking';
                this.updateHandTracking(leftHandSource, this.leftHandMesh, 'left', frame, referenceSpace);
            } else {
                this.leftHandMode = 'controller';
                this.updateControllerHand(this.controller1, this.leftHandMesh, frame, referenceSpace, 'left');
            }

            // Update right hand
            if (rightHandSource && rightHandSource.hand) {
                this.rightHandMode = 'hand-tracking';
                this.updateHandTracking(rightHandSource, this.rightHandMesh, 'right', frame, referenceSpace);
            } else {
                this.rightHandMode = 'controller';
                this.updateControllerHand(this.controller0, this.rightHandMesh, frame, referenceSpace, 'right');
            }

            // Update velocity tracking for throw mechanic
            this.updateVelocityTracking();
        } catch (error) {
            console.warn('Error in hands update:', error.message);
        }
    }

    /**
     * Track hand velocity for throw mechanic
     * Calculates velocity based on position change over time
     */
    updateVelocityTracking() {
        const now = performance.now();
        const deltaTime = (now - this.lastVelocityUpdateTime) / 1000; // Convert to seconds

        // Only update if we have a reasonable time delta (avoid division by zero or huge velocities)
        if (deltaTime > 0.001 && deltaTime < 0.5) {
            // Update left hand velocity
            if (this.leftHandMesh.visible) {
                const currentPos = this.leftHandMesh.position;
                if (this.leftHandPrevPos) {
                    // Calculate velocity in VR space, then scale to world units
                    this.leftHandVelocity = {
                        x: ((currentPos.x - this.leftHandPrevPos.x) / deltaTime) * GIANT_SCALE,
                        y: ((currentPos.y - this.leftHandPrevPos.y) / deltaTime) * GIANT_SCALE,
                        z: ((currentPos.z - this.leftHandPrevPos.z) / deltaTime) * GIANT_SCALE
                    };
                }
                this.leftHandPrevPos = { x: currentPos.x, y: currentPos.y, z: currentPos.z };
            }

            // Update right hand velocity
            if (this.rightHandMesh.visible) {
                const currentPos = this.rightHandMesh.position;
                if (this.rightHandPrevPos) {
                    // Calculate velocity in VR space, then scale to world units
                    this.rightHandVelocity = {
                        x: ((currentPos.x - this.rightHandPrevPos.x) / deltaTime) * GIANT_SCALE,
                        y: ((currentPos.y - this.rightHandPrevPos.y) / deltaTime) * GIANT_SCALE,
                        z: ((currentPos.z - this.rightHandPrevPos.z) / deltaTime) * GIANT_SCALE
                    };
                }
                this.rightHandPrevPos = { x: currentPos.x, y: currentPos.y, z: currentPos.z };
            }
        }

        this.lastVelocityUpdateTime = now;
    }

    /**
     * Get current hand velocity for throw mechanic
     * @param {string} hand - 'left' or 'right'
     * @returns {Object} Velocity in world units per second {x, y, z}
     */
    getHandVelocity(hand = 'right') {
        return hand === 'left' ? { ...this.leftHandVelocity } : { ...this.rightHandVelocity };
    }

    /**
     * Update hand mesh using WebXR Hand Tracking API
     * Renders all 19 bone segments with thin pills
     */
    updateHandTracking(inputSource, handMesh, handName, frame, referenceSpace) {
        if (!inputSource || !inputSource.hand) {
            handMesh.visible = false;
            return;
        }

        const hand = inputSource.hand;

        try {
            // Get wrist position
            const wristJoint = hand.get(JOINT_WRIST);
            if (!wristJoint) {
                handMesh.visible = false;
                return;
            }

            const wristPose = frame.getJointPose(wristJoint, referenceSpace);
            if (!wristPose) {
                handMesh.visible = false;
                return;
            }

            handMesh.visible = true;

            // Update hand mesh position/rotation from wrist
            const wristPos = wristPose.transform.position;
            const wristRot = wristPose.transform.orientation;
            handMesh.position.set(wristPos.x, wristPos.y, wristPos.z);
            handMesh.quaternion.set(wristRot.x, wristRot.y, wristRot.z, wristRot.w);

            // Wrist sphere stays at origin
            const wristMesh = handMesh.getObjectByName('wrist');
            if (wristMesh) {
                wristMesh.position.set(0, 0, 0);
                wristMesh.visible = true;
            }

            const wristWorldPos = new THREE.Vector3(wristPos.x, wristPos.y, wristPos.z);
            const invQuat = handMesh.quaternion.clone().invert();

            // Get the joint positions storage for this hand
            const jointPosStorage = handName === 'left' ? this.leftJointPositions : this.rightJointPositions;

            // Store joint positions for pinch detection
            let thumbTipWorldPos = null;
            let indexTipWorldPos = null;
            let thumbTipRealPos = null;
            let indexTipRealPos = null;

            // Update each finger's joints and bones
            for (const [fingerName, joints] of Object.entries(FINGER_JOINTS)) {
                const jointPositions = []; // Local positions of each joint

                // Get all joint positions for this finger
                for (const jointName of joints) {
                    const joint = hand.get(jointName);
                    if (!joint) {
                        jointPositions.push(null);
                        continue;
                    }

                    const jointPose = frame.getJointPose(joint, referenceSpace);
                    if (!jointPose) {
                        jointPositions.push(null);
                        continue;
                    }

                    const pos = jointPose.transform.position;
                    const worldPos = new THREE.Vector3(pos.x, pos.y, pos.z);

                    // Store tip positions for pinch detection
                    if (jointName === JOINT_THUMB_TIP) {
                        thumbTipWorldPos = worldPos.clone();
                        thumbTipRealPos = new THREE.Vector3(pos.x, pos.y, pos.z);
                    } else if (jointName === JOINT_INDEX_TIP) {
                        indexTipWorldPos = worldPos.clone();
                        indexTipRealPos = new THREE.Vector3(pos.x, pos.y, pos.z);
                    }

                    // Convert to local space
                    const localPos = worldPos.clone().sub(wristWorldPos);
                    localPos.applyQuaternion(invQuat);
                    jointPositions.push(localPos);

                    // Store joint position for network transmission (local space, unscaled)
                    jointPosStorage[jointName] = { x: localPos.x, y: localPos.y, z: localPos.z };

                    // Update joint sphere
                    const jointMesh = handMesh.getObjectByName('joint-' + jointName);
                    if (jointMesh) {
                        jointMesh.position.copy(localPos);
                        jointMesh.visible = true;
                    }
                }

                // Update bone segments between consecutive joints
                for (let i = 0; i < joints.length - 1; i++) {
                    const boneName = 'bone-' + joints[i] + '-to-' + joints[i + 1];
                    const bone = handMesh.getObjectByName(boneName);

                    if (bone && jointPositions[i] && jointPositions[i + 1]) {
                        updateBoneBetweenPoints(bone, jointPositions[i], jointPositions[i + 1]);
                    } else if (bone) {
                        bone.visible = false;
                    }
                }
            }

            // Pinch detection based on thumb-index distance
            if (thumbTipRealPos && indexTipRealPos) {
                const pinchDistance = thumbTipRealPos.distanceTo(indexTipRealPos);
                const isPinching = pinchDistance < PINCH_THRESHOLD;

                // Update pinch indicator position to midpoint between thumb and index
                const pinchIndicator = handMesh.getObjectByName('pinchIndicator');
                if (pinchIndicator && thumbTipWorldPos && indexTipWorldPos) {
                    // Calculate pinch point as midpoint between thumb and index tips
                    const pinchPointWorld = thumbTipWorldPos.clone().lerp(indexTipWorldPos, 0.5);

                    // Store the pinch point in VR world coordinates (unscaled)
                    if (handName === 'left') {
                        this.leftPinchPoint = { x: pinchPointWorld.x, y: pinchPointWorld.y, z: pinchPointWorld.z };
                    } else {
                        this.rightPinchPoint = { x: pinchPointWorld.x, y: pinchPointWorld.y, z: pinchPointWorld.z };
                    }

                    // Convert to local space for the indicator
                    const localMid = pinchPointWorld.clone().sub(wristWorldPos);
                    localMid.applyQuaternion(invQuat);
                    pinchIndicator.position.copy(localMid);
                    pinchIndicator.visible = isPinching;
                }

                // Detect pinch state changes
                const prevPinching = handName === 'left' ? this.prevLeftPinching : this.prevRightPinching;

                if (isPinching && !prevPinching) {
                    this.handlePinchStart(handName);
                } else if (!isPinching && prevPinching) {
                    this.handlePinchEnd(handName);
                }

                // Update state
                if (handName === 'left') {
                    this.leftPinching = isPinching;
                    this.prevLeftPinching = isPinching;
                } else {
                    this.rightPinching = isPinching;
                    this.prevRightPinching = isPinching;
                }
            }
        } catch (error) {
            console.warn('Error updating hand tracking:', error.message);
            handMesh.visible = false;
        }
    }

    /**
     * Update hand mesh using controller position (fallback mode)
     */
    updateControllerHand(controller, handMesh, frame, referenceSpace, handName) {
        if (!controller || !handMesh) return;

        // Hide all finger joints and bones in controller mode
        for (const [fingerName, joints] of Object.entries(FINGER_JOINTS)) {
            // Hide joint spheres
            joints.forEach(jointName => {
                const joint = handMesh.getObjectByName('joint-' + jointName);
                if (joint) joint.visible = false;
            });
            // Hide bone segments
            for (let i = 0; i < joints.length - 1; i++) {
                const boneName = 'bone-' + joints[i] + '-to-' + joints[i + 1];
                const bone = handMesh.getObjectByName(boneName);
                if (bone) bone.visible = false;
            }
        }

        // Make wrist sphere bigger in controller mode
        const wrist = handMesh.getObjectByName('wrist');
        if (wrist) {
            wrist.scale.set(3, 3, 3); // Larger sphere for controller
            wrist.visible = true;
        }

        try {
            // Check if controller has a valid space to get pose from
            const inputSpace = controller.gripSpace || controller.targetRaySpace;
            if (!inputSpace) {
                handMesh.visible = false;
                return;
            }

            // Try to get the pose from the XR frame
            let pose = null;
            try {
                pose = frame.getPose(inputSpace, referenceSpace);
            } catch (poseError) {
                console.debug('Could not get controller pose:', poseError.message);
                handMesh.visible = false;
                return;
            }

            if (pose && pose.transform) {
                handMesh.visible = true;

                const position = pose.transform.position;
                const orientation = pose.transform.orientation;

                // Real-world scale for local rendering
                handMesh.position.set(position.x, position.y, position.z);
                handMesh.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
            } else if (controller.position && controller.quaternion) {
                const hasValidPosition =
                    controller.position.x !== 0 ||
                    controller.position.y !== 0 ||
                    controller.position.z !== 0;

                if (hasValidPosition) {
                    handMesh.visible = true;
                    // Real-world scale for local rendering
                    handMesh.position.copy(controller.position);
                    handMesh.quaternion.copy(controller.quaternion);
                } else {
                    handMesh.visible = false;
                }
            } else {
                handMesh.visible = false;
            }
        } catch (error) {
            console.warn('Error updating controller hand:', error.message);
            handMesh.visible = false;
        }
    }

    getHandData() {
        const data = {
            leftHand: null,
            rightHand: null
        };

        // Scale positions by GIANT_SCALE to convert VR meters to world units
        // VR hand at 0.5m -> 5m in world units
        if (this.leftHandMesh.visible) {
            data.leftHand = {
                position: {
                    x: this.leftHandMesh.position.x * GIANT_SCALE,
                    y: this.leftHandMesh.position.y * GIANT_SCALE,
                    z: this.leftHandMesh.position.z * GIANT_SCALE
                },
                rotation: {
                    x: this.leftHandMesh.quaternion.x,
                    y: this.leftHandMesh.quaternion.y,
                    z: this.leftHandMesh.quaternion.z,
                    w: this.leftHandMesh.quaternion.w
                },
                pinching: this.leftPinching
            };

            // Include pinch point position for grab mechanics
            if (this.leftPinchPoint) {
                data.leftHand.pinchPoint = {
                    x: this.leftPinchPoint.x * GIANT_SCALE,
                    y: this.leftPinchPoint.y * GIANT_SCALE,
                    z: this.leftPinchPoint.z * GIANT_SCALE
                };
            }

            // Include joint positions only in hand tracking mode
            if (this.leftHandMode === 'hand-tracking' && Object.keys(this.leftJointPositions).length > 0) {
                data.leftHand.joints = {};
                for (const [jointName, pos] of Object.entries(this.leftJointPositions)) {
                    data.leftHand.joints[jointName] = {
                        x: pos.x * GIANT_SCALE,
                        y: pos.y * GIANT_SCALE,
                        z: pos.z * GIANT_SCALE
                    };
                }
            }
        }

        if (this.rightHandMesh.visible) {
            data.rightHand = {
                position: {
                    x: this.rightHandMesh.position.x * GIANT_SCALE,
                    y: this.rightHandMesh.position.y * GIANT_SCALE,
                    z: this.rightHandMesh.position.z * GIANT_SCALE
                },
                rotation: {
                    x: this.rightHandMesh.quaternion.x,
                    y: this.rightHandMesh.quaternion.y,
                    z: this.rightHandMesh.quaternion.z,
                    w: this.rightHandMesh.quaternion.w
                },
                pinching: this.rightPinching
            };

            // Include pinch point position for grab mechanics
            if (this.rightPinchPoint) {
                data.rightHand.pinchPoint = {
                    x: this.rightPinchPoint.x * GIANT_SCALE,
                    y: this.rightPinchPoint.y * GIANT_SCALE,
                    z: this.rightPinchPoint.z * GIANT_SCALE
                };
            }

            // Include joint positions only in hand tracking mode
            if (this.rightHandMode === 'hand-tracking' && Object.keys(this.rightJointPositions).length > 0) {
                data.rightHand.joints = {};
                for (const [jointName, pos] of Object.entries(this.rightJointPositions)) {
                    data.rightHand.joints[jointName] = {
                        x: pos.x * GIANT_SCALE,
                        y: pos.y * GIANT_SCALE,
                        z: pos.z * GIANT_SCALE
                    };
                }
            }
        }

        return data;
    }

    isPinching(hand = 'right') {
        return hand === 'left' ? this.leftPinching : this.rightPinching;
    }

    getHandPosition(hand = 'right') {
        const mesh = hand === 'left' ? this.leftHandMesh : this.rightHandMesh;
        if (!mesh.visible) return null;
        // Scale by GIANT_SCALE to get world-space position for gameplay comparisons
        return {
            x: mesh.position.x * GIANT_SCALE,
            y: mesh.position.y * GIANT_SCALE,
            z: mesh.position.z * GIANT_SCALE
        };
    }

    /**
     * Get the pinch point position (midpoint between thumb tip and index finger tip)
     * @param {string} hand - 'left' or 'right'
     * @returns {Object|null} Position in world units {x, y, z} or null if not available
     */
    getPinchPointPosition(hand = 'right') {
        const pinchPoint = hand === 'left' ? this.leftPinchPoint : this.rightPinchPoint;
        if (!pinchPoint) {
            // Fall back to wrist position if pinch point not available (e.g., controller mode)
            return this.getHandPosition(hand);
        }
        // Scale by GIANT_SCALE to get world-space position for gameplay
        return {
            x: pinchPoint.x * GIANT_SCALE,
            y: pinchPoint.y * GIANT_SCALE,
            z: pinchPoint.z * GIANT_SCALE
        };
    }

    setGrabbing(hand, isGrabbing) {
        const mesh = hand === 'left' ? this.leftHandMesh : this.rightHandMesh;
        const grabRange = mesh.getObjectByName('grabRange');
        if (grabRange) {
            grabRange.material.color.setHex(isGrabbing ? 0xff0000 : 0x00ff00);
            grabRange.material.opacity = isGrabbing ? 0.5 : 0.3;
        }
    }
}
