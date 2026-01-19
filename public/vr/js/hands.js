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

// Cache Object.entries(FINGER_JOINTS) to avoid per-frame allocation
const FINGER_JOINTS_ENTRIES = Object.entries(FINGER_JOINTS);

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

        // Cache mesh references to avoid getObjectByName() calls per frame
        // These are O(n) tree traversals - cache them once after mesh creation
        this._leftWrist = this.leftHandMesh.getObjectByName('wrist');
        this._rightWrist = this.rightHandMesh.getObjectByName('wrist');
        this._leftPinchIndicator = this.leftHandMesh.getObjectByName('pinchIndicator');
        this._rightPinchIndicator = this.rightHandMesh.getObjectByName('pinchIndicator');
        this._leftGrabRange = this.leftHandMesh.getObjectByName('grabRange');
        this._rightGrabRange = this.rightHandMesh.getObjectByName('grabRange');

        // Cache joint and bone meshes per hand
        this._leftJointMeshes = {};
        this._rightJointMeshes = {};
        this._leftBoneMeshes = {};
        this._rightBoneMeshes = {};
        for (const [fingerName, joints] of Object.entries(FINGER_JOINTS)) {
            for (const jointName of joints) {
                this._leftJointMeshes[jointName] = this.leftHandMesh.getObjectByName('joint-' + jointName);
                this._rightJointMeshes[jointName] = this.rightHandMesh.getObjectByName('joint-' + jointName);
            }
            for (let i = 0; i < joints.length - 1; i++) {
                const boneName = 'bone-' + joints[i] + '-to-' + joints[i + 1];
                this._leftBoneMeshes[boneName] = this.leftHandMesh.getObjectByName(boneName);
                this._rightBoneMeshes[boneName] = this.rightHandMesh.getObjectByName(boneName);
            }
        }

        // Store joint positions for network transmission (local space, unscaled)
        this.leftJointPositions = {};
        this.rightJointPositions = {};
        // Flags to avoid Object.keys().length > 0 checks per frame
        this._hasLeftJoints = false;
        this._hasRightJoints = false;

        // Track which input mode is active per hand
        this.leftHandMode = null; // 'hand-tracking' or 'controller'
        this.rightHandMode = null;

        // Velocity tracking for throw mechanic
        // Pre-allocate objects to avoid per-frame allocations
        this.leftHandPrevPos = { x: 0, y: 0, z: 0 };
        this.rightHandPrevPos = { x: 0, y: 0, z: 0 };
        this._hasLeftPrevPos = false;
        this._hasRightPrevPos = false;
        this.leftHandVelocity = { x: 0, y: 0, z: 0 };
        this.rightHandVelocity = { x: 0, y: 0, z: 0 };
        this.lastVelocityUpdateTime = 0;

        // Pinch point positions (midpoint between thumb tip and index tip, in VR world coords)
        // Pre-allocate to avoid per-frame allocation
        this._leftPinchPointCache = { x: 0, y: 0, z: 0 };
        this._rightPinchPointCache = { x: 0, y: 0, z: 0 };
        this.leftPinchPoint = null;
        this.rightPinchPoint = null;

        // Reusable objects to avoid allocation in update loop
        this._wristWorldPos = new THREE.Vector3();
        this._invQuat = new THREE.Quaternion();
        this._tempVec3 = new THREE.Vector3();
        this._thumbTipPos = new THREE.Vector3();
        this._indexTipPos = new THREE.Vector3();
        this._pinchPoint = new THREE.Vector3();

        // Pre-allocated joint position arrays to avoid per-frame allocation
        // Each finger needs up to 5 joint positions (max joints in a finger)
        this._fingerJointPositions = {};
        this._fingerJointValid = {}; // Track which joints are valid per finger
        for (const [fingerName, joints] of Object.entries(FINGER_JOINTS)) {
            this._fingerJointPositions[fingerName] = joints.map(() => new THREE.Vector3());
            this._fingerJointValid[fingerName] = joints.map(() => false);
        }

        // Pre-allocate joint position storage objects for network transmission
        this._leftJointPosObjects = {};
        this._rightJointPosObjects = {};
        for (const [fingerName, joints] of Object.entries(FINGER_JOINTS)) {
            for (const jointName of joints) {
                this._leftJointPosObjects[jointName] = { x: 0, y: 0, z: 0 };
                this._rightJointPosObjects[jointName] = { x: 0, y: 0, z: 0 };
            }
        }

        // Reusable hand data structures for getHandData()
        this._handData = {
            leftHand: null,
            rightHand: null
        };
        this._leftHandData = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            pinching: false,
            pinchPoint: null,
            joints: null
        };
        this._rightHandData = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            pinching: false,
            pinchPoint: null,
            joints: null
        };
        this._leftPinchPointData = { x: 0, y: 0, z: 0 };
        this._rightPinchPointData = { x: 0, y: 0, z: 0 };
        this._leftJointsData = {};
        this._rightJointsData = {};

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

        // Store listener references for cleanup in dispose()
        this._controller0Listeners = {
            selectstart: () => {
                if (this.rightHandMode === 'controller') {
                    this.handlePinchStart('right');
                }
            },
            selectend: () => {
                if (this.rightHandMode === 'controller') {
                    this.handlePinchEnd('right');
                }
            },
            squeezestart: () => {
                if (this.rightHandMode === 'controller') {
                    this.handlePinchStart('right');
                }
            },
            squeezeend: () => {
                if (this.rightHandMode === 'controller') {
                    this.handlePinchEnd('right');
                }
            }
        };

        this._controller1Listeners = {
            selectstart: () => {
                if (this.leftHandMode === 'controller') {
                    this.handlePinchStart('left');
                }
            },
            selectend: () => {
                if (this.leftHandMode === 'controller') {
                    this.handlePinchEnd('left');
                }
            },
            squeezestart: () => {
                if (this.leftHandMode === 'controller') {
                    this.handlePinchStart('left');
                }
            },
            squeezeend: () => {
                if (this.leftHandMode === 'controller') {
                    this.handlePinchEnd('left');
                }
            }
        };

        // Add controller event listeners
        for (const [event, handler] of Object.entries(this._controller0Listeners)) {
            this.controller0.addEventListener(event, handler);
        }
        for (const [event, handler] of Object.entries(this._controller1Listeners)) {
            this.controller1.addEventListener(event, handler);
        }

        this.scene.add(this.controller0);
        this.scene.add(this.controller1);
    }

    handlePinchStart(hand) {
        if (hand === 'left') {
            this.leftPinching = true;
            if (this._leftPinchIndicator) this._leftPinchIndicator.visible = true;
        } else {
            this.rightPinching = true;
            if (this._rightPinchIndicator) this._rightPinchIndicator.visible = true;
        }

        if (this.onPinchStart) {
            this.onPinchStart(hand);
        }
    }

    handlePinchEnd(hand) {
        if (hand === 'left') {
            this.leftPinching = false;
            if (this._leftPinchIndicator) this._leftPinchIndicator.visible = false;
        } else {
            this.rightPinching = false;
            if (this._rightPinchIndicator) this._rightPinchIndicator.visible = false;
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
     * Uses pre-allocated objects - mutates in place to avoid GC pressure
     */
    updateVelocityTracking() {
        const now = performance.now();
        const deltaTime = (now - this.lastVelocityUpdateTime) / 1000; // Convert to seconds

        // Only update if we have a reasonable time delta (avoid division by zero or huge velocities)
        if (deltaTime > 0.001 && deltaTime < 0.5) {
            // Update left hand velocity
            if (this.leftHandMesh.visible) {
                const currentPos = this.leftHandMesh.position;
                if (this._hasLeftPrevPos) {
                    // Calculate velocity in VR space, then scale to world units - mutate in place
                    this.leftHandVelocity.x = ((currentPos.x - this.leftHandPrevPos.x) / deltaTime) * GIANT_SCALE;
                    this.leftHandVelocity.y = ((currentPos.y - this.leftHandPrevPos.y) / deltaTime) * GIANT_SCALE;
                    this.leftHandVelocity.z = ((currentPos.z - this.leftHandPrevPos.z) / deltaTime) * GIANT_SCALE;
                }
                // Update prevPos in place
                this.leftHandPrevPos.x = currentPos.x;
                this.leftHandPrevPos.y = currentPos.y;
                this.leftHandPrevPos.z = currentPos.z;
                this._hasLeftPrevPos = true;
            }

            // Update right hand velocity
            if (this.rightHandMesh.visible) {
                const currentPos = this.rightHandMesh.position;
                if (this._hasRightPrevPos) {
                    // Calculate velocity in VR space, then scale to world units - mutate in place
                    this.rightHandVelocity.x = ((currentPos.x - this.rightHandPrevPos.x) / deltaTime) * GIANT_SCALE;
                    this.rightHandVelocity.y = ((currentPos.y - this.rightHandPrevPos.y) / deltaTime) * GIANT_SCALE;
                    this.rightHandVelocity.z = ((currentPos.z - this.rightHandPrevPos.z) / deltaTime) * GIANT_SCALE;
                }
                // Update prevPos in place
                this.rightHandPrevPos.x = currentPos.x;
                this.rightHandPrevPos.y = currentPos.y;
                this.rightHandPrevPos.z = currentPos.z;
                this._hasRightPrevPos = true;
            }
        }

        this.lastVelocityUpdateTime = now;
    }

    /**
     * Get current hand velocity for throw mechanic
     * @param {string} hand - 'left' or 'right'
     * @returns {Object} Velocity in world units per second {x, y, z}
     * NOTE: Returns internal reference - do not mutate!
     */
    getHandVelocity(hand = 'right') {
        return hand === 'left' ? this.leftHandVelocity : this.rightHandVelocity;
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

            // Wrist sphere stays at origin - use cached reference
            const wristMesh = handName === 'left' ? this._leftWrist : this._rightWrist;
            if (wristMesh) {
                wristMesh.position.set(0, 0, 0);
                wristMesh.visible = true;
            }

            this._wristWorldPos.set(wristPos.x, wristPos.y, wristPos.z);
            this._invQuat.copy(handMesh.quaternion).invert();

            // Get the joint positions storage for this hand
            const jointPosStorage = handName === 'left' ? this.leftJointPositions : this.rightJointPositions;
            const jointMeshes = handName === 'left' ? this._leftJointMeshes : this._rightJointMeshes;
            const boneMeshes = handName === 'left' ? this._leftBoneMeshes : this._rightBoneMeshes;

            // Track whether we found thumb and index tips for pinch detection
            let hasThumbTip = false;
            let hasIndexTip = false;

            // Get pre-allocated joint position objects for this hand
            const jointPosObjects = handName === 'left' ? this._leftJointPosObjects : this._rightJointPosObjects;

            // Track if any joints were found for this hand (used to avoid Object.keys check later)
            let foundAnyJoint = false;

            // Update each finger's joints and bones - use cached entries to avoid allocation
            for (const [fingerName, joints] of FINGER_JOINTS_ENTRIES) {
                // Use pre-allocated arrays for this finger
                const jointPositions = this._fingerJointPositions[fingerName];
                const validFlags = this._fingerJointValid[fingerName];

                // Reset valid flags
                for (let i = 0; i < validFlags.length; i++) {
                    validFlags[i] = false;
                }

                // Get all joint positions for this finger
                for (let i = 0; i < joints.length; i++) {
                    const jointName = joints[i];
                    const joint = hand.get(jointName);
                    if (!joint) {
                        continue;
                    }

                    const jointPose = frame.getJointPose(joint, referenceSpace);
                    if (!jointPose) {
                        continue;
                    }

                    const pos = jointPose.transform.position;

                    // Store tip positions for pinch detection (reusing cached Vector3s)
                    if (jointName === JOINT_THUMB_TIP) {
                        this._thumbTipPos.set(pos.x, pos.y, pos.z);
                        hasThumbTip = true;
                    } else if (jointName === JOINT_INDEX_TIP) {
                        this._indexTipPos.set(pos.x, pos.y, pos.z);
                        hasIndexTip = true;
                    }

                    // Convert to local space using pre-allocated Vector3
                    const localPos = jointPositions[i];
                    localPos.set(pos.x, pos.y, pos.z);
                    localPos.sub(this._wristWorldPos);
                    localPos.applyQuaternion(this._invQuat);
                    validFlags[i] = true;

                    // Update pre-allocated joint position object for network transmission
                    const jointPosObj = jointPosObjects[jointName];
                    jointPosObj.x = localPos.x;
                    jointPosObj.y = localPos.y;
                    jointPosObj.z = localPos.z;
                    jointPosStorage[jointName] = jointPosObj;
                    foundAnyJoint = true;

                    // Update joint sphere using cached reference
                    const jointMesh = jointMeshes[jointName];
                    if (jointMesh) {
                        jointMesh.position.copy(localPos);
                        jointMesh.visible = true;
                    }
                }

                // Update bone segments between consecutive joints using cached references
                for (let i = 0; i < joints.length - 1; i++) {
                    const boneName = 'bone-' + joints[i] + '-to-' + joints[i + 1];
                    const bone = boneMeshes[boneName];

                    if (bone && validFlags[i] && validFlags[i + 1]) {
                        updateBoneBetweenPoints(bone, jointPositions[i], jointPositions[i + 1]);
                    } else if (bone) {
                        bone.visible = false;
                    }
                }
            }

            // Update the hasJoints flag to avoid Object.keys().length check in getHandData
            if (handName === 'left') {
                this._hasLeftJoints = foundAnyJoint;
            } else {
                this._hasRightJoints = foundAnyJoint;
            }

            // Pinch detection based on thumb-index distance
            if (hasThumbTip && hasIndexTip) {
                const pinchDistance = this._thumbTipPos.distanceTo(this._indexTipPos);
                const isPinching = pinchDistance < PINCH_THRESHOLD;

                // Update pinch indicator position to midpoint between thumb and index - use cached reference
                const pinchIndicator = handName === 'left' ? this._leftPinchIndicator : this._rightPinchIndicator;
                if (pinchIndicator) {
                    // Calculate pinch point as midpoint between thumb and index tips (reusing _pinchPoint)
                    this._pinchPoint.copy(this._thumbTipPos).lerp(this._indexTipPos, 0.5);

                    // Store the pinch point in VR world coordinates (unscaled)
                    // Use pre-allocated cache objects to avoid per-frame allocation
                    if (handName === 'left') {
                        this._leftPinchPointCache.x = this._pinchPoint.x;
                        this._leftPinchPointCache.y = this._pinchPoint.y;
                        this._leftPinchPointCache.z = this._pinchPoint.z;
                        this.leftPinchPoint = this._leftPinchPointCache;
                    } else {
                        this._rightPinchPointCache.x = this._pinchPoint.x;
                        this._rightPinchPointCache.y = this._pinchPoint.y;
                        this._rightPinchPointCache.z = this._pinchPoint.z;
                        this.rightPinchPoint = this._rightPinchPointCache;
                    }

                    // Convert to local space for the indicator (reusing _tempVec3)
                    this._tempVec3.copy(this._pinchPoint).sub(this._wristWorldPos);
                    this._tempVec3.applyQuaternion(this._invQuat);
                    pinchIndicator.position.copy(this._tempVec3);
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

        // Get cached mesh references for this hand
        const jointMeshes = handName === 'left' ? this._leftJointMeshes : this._rightJointMeshes;
        const boneMeshes = handName === 'left' ? this._leftBoneMeshes : this._rightBoneMeshes;
        const wrist = handName === 'left' ? this._leftWrist : this._rightWrist;

        // Hide all finger joints and bones in controller mode using cached references
        for (const joints of Object.values(FINGER_JOINTS)) {
            // Hide joint spheres
            for (const jointName of joints) {
                const joint = jointMeshes[jointName];
                if (joint) joint.visible = false;
            }
            // Hide bone segments
            for (let i = 0; i < joints.length - 1; i++) {
                const boneName = 'bone-' + joints[i] + '-to-' + joints[i + 1];
                const bone = boneMeshes[boneName];
                if (bone) bone.visible = false;
            }
        }

        // Make wrist sphere bigger in controller mode - use cached reference
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
        // Reuse cached data structures to avoid allocation each frame
        this._handData.leftHand = null;
        this._handData.rightHand = null;

        // Scale positions by GIANT_SCALE to convert VR meters to world units
        // VR hand at 0.5m -> 5m in world units
        if (this.leftHandMesh.visible) {
            // Update left hand data in place
            this._leftHandData.position.x = this.leftHandMesh.position.x * GIANT_SCALE;
            this._leftHandData.position.y = this.leftHandMesh.position.y * GIANT_SCALE;
            this._leftHandData.position.z = this.leftHandMesh.position.z * GIANT_SCALE;
            this._leftHandData.rotation.x = this.leftHandMesh.quaternion.x;
            this._leftHandData.rotation.y = this.leftHandMesh.quaternion.y;
            this._leftHandData.rotation.z = this.leftHandMesh.quaternion.z;
            this._leftHandData.rotation.w = this.leftHandMesh.quaternion.w;
            this._leftHandData.pinching = this.leftPinching;

            // Include pinch point position for grab mechanics
            if (this.leftPinchPoint) {
                this._leftPinchPointData.x = this.leftPinchPoint.x * GIANT_SCALE;
                this._leftPinchPointData.y = this.leftPinchPoint.y * GIANT_SCALE;
                this._leftPinchPointData.z = this.leftPinchPoint.z * GIANT_SCALE;
                this._leftHandData.pinchPoint = this._leftPinchPointData;
            } else {
                this._leftHandData.pinchPoint = null;
            }

            // Include joint positions only in hand tracking mode - use flag to avoid Object.keys allocation
            if (this.leftHandMode === 'hand-tracking' && this._hasLeftJoints) {
                // Use for...in instead of Object.entries() to avoid per-frame array allocation
                for (const jointName in this.leftJointPositions) {
                    const pos = this.leftJointPositions[jointName];
                    if (!this._leftJointsData[jointName]) {
                        this._leftJointsData[jointName] = { x: 0, y: 0, z: 0 };
                    }
                    this._leftJointsData[jointName].x = pos.x * GIANT_SCALE;
                    this._leftJointsData[jointName].y = pos.y * GIANT_SCALE;
                    this._leftJointsData[jointName].z = pos.z * GIANT_SCALE;
                }
                this._leftHandData.joints = this._leftJointsData;
            } else {
                this._leftHandData.joints = null;
            }

            this._handData.leftHand = this._leftHandData;
        }

        if (this.rightHandMesh.visible) {
            // Update right hand data in place
            this._rightHandData.position.x = this.rightHandMesh.position.x * GIANT_SCALE;
            this._rightHandData.position.y = this.rightHandMesh.position.y * GIANT_SCALE;
            this._rightHandData.position.z = this.rightHandMesh.position.z * GIANT_SCALE;
            this._rightHandData.rotation.x = this.rightHandMesh.quaternion.x;
            this._rightHandData.rotation.y = this.rightHandMesh.quaternion.y;
            this._rightHandData.rotation.z = this.rightHandMesh.quaternion.z;
            this._rightHandData.rotation.w = this.rightHandMesh.quaternion.w;
            this._rightHandData.pinching = this.rightPinching;

            // Include pinch point position for grab mechanics
            if (this.rightPinchPoint) {
                this._rightPinchPointData.x = this.rightPinchPoint.x * GIANT_SCALE;
                this._rightPinchPointData.y = this.rightPinchPoint.y * GIANT_SCALE;
                this._rightPinchPointData.z = this.rightPinchPoint.z * GIANT_SCALE;
                this._rightHandData.pinchPoint = this._rightPinchPointData;
            } else {
                this._rightHandData.pinchPoint = null;
            }

            // Include joint positions only in hand tracking mode - use flag to avoid Object.keys allocation
            if (this.rightHandMode === 'hand-tracking' && this._hasRightJoints) {
                // Use for...in instead of Object.entries() to avoid per-frame array allocation
                for (const jointName in this.rightJointPositions) {
                    const pos = this.rightJointPositions[jointName];
                    if (!this._rightJointsData[jointName]) {
                        this._rightJointsData[jointName] = { x: 0, y: 0, z: 0 };
                    }
                    this._rightJointsData[jointName].x = pos.x * GIANT_SCALE;
                    this._rightJointsData[jointName].y = pos.y * GIANT_SCALE;
                    this._rightJointsData[jointName].z = pos.z * GIANT_SCALE;
                }
                this._rightHandData.joints = this._rightJointsData;
            } else {
                this._rightHandData.joints = null;
            }

            this._handData.rightHand = this._rightHandData;
        }

        return this._handData;
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
        // Use cached grab range reference
        const grabRange = hand === 'left' ? this._leftGrabRange : this._rightGrabRange;
        if (grabRange) {
            grabRange.material.color.setHex(isGrabbing ? 0xff0000 : 0x00ff00);
            grabRange.material.opacity = isGrabbing ? 0.5 : 0.3;
        }
    }

    /**
     * Get the left wrist mesh for attaching objects (e.g., diagnostics display)
     * @returns {THREE.Object3D|null} The left wrist mesh or null if not available
     */
    getLeftWristMesh() {
        return this._leftWrist;
    }

    /**
     * Clean up all resources to prevent memory leaks.
     * Call this when the VR session ends or on disconnect.
     */
    dispose() {
        // Remove controller event listeners
        if (this.controller0 && this._controller0Listeners) {
            for (const [event, handler] of Object.entries(this._controller0Listeners)) {
                this.controller0.removeEventListener(event, handler);
            }
        }
        if (this.controller1 && this._controller1Listeners) {
            for (const [event, handler] of Object.entries(this._controller1Listeners)) {
                this.controller1.removeEventListener(event, handler);
            }
        }

        // Remove controllers from scene
        if (this.controller0) {
            this.scene.remove(this.controller0);
        }
        if (this.controller1) {
            this.scene.remove(this.controller1);
        }

        // Remove hand meshes from scene and dispose of their resources
        if (this.leftHandMesh) {
            this.scene.remove(this.leftHandMesh);
            this.leftHandMesh.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
        if (this.rightHandMesh) {
            this.scene.remove(this.rightHandMesh);
            this.rightHandMesh.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }

        // Clear cached references
        this._leftWrist = null;
        this._rightWrist = null;
        this._leftPinchIndicator = null;
        this._rightPinchIndicator = null;
        this._leftGrabRange = null;
        this._rightGrabRange = null;
        this._leftJointMeshes = null;
        this._rightJointMeshes = null;
        this._leftBoneMeshes = null;
        this._rightBoneMeshes = null;
    }
}
