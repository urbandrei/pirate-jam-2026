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

// WebXR hand joint names
const JOINT_WRIST = 'wrist';
const JOINT_THUMB_TIP = 'thumb-tip';
const JOINT_INDEX_TIP = 'index-finger-tip';
const JOINT_MIDDLE_TIP = 'middle-finger-tip';
const JOINT_RING_TIP = 'ring-finger-tip';
const JOINT_PINKY_TIP = 'pinky-finger-tip';

// Full finger joint hierarchy for articulated bones
const FINGER_JOINTS = {
    thumb: ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
    index: ['index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip'],
    middle: ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip'],
    ring: ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip'],
    pinky: ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip']
};

// Bone rendering configuration
const BONE_RADIUS = 0.002; // 2mm - thin pill bones

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

        // Track which input mode is active per hand
        this.leftHandMode = null; // 'hand-tracking' or 'controller'
        this.rightHandMode = null;

        // Setup controllers for fallback
        this.setupControllers();
    }

    /**
     * Create pill-bone hand mesh structure:
     * - Wrist sphere
     * - Joint spheres at each finger joint
     * - 19 bone segments (4 per finger, 3 for thumb)
     * - Pinch indicator
     * - Grab range indicator
     *
     * All sizes are in real VR meters (1:1 scale with user's hands)
     */
    createHandMesh(side) {
        const group = new THREE.Group();
        group.name = side + 'Hand';

        const jointMaterial = new THREE.MeshStandardMaterial({
            color: COLORS.VR_HAND,
            roughness: 0.7,
            metalness: 0.1
        });

        const boneMaterial = new THREE.MeshStandardMaterial({
            color: COLORS.VR_HAND,
            roughness: 0.6,
            metalness: 0.2
        });

        // Wrist sphere - slightly larger
        const wrist = new THREE.Mesh(
            new THREE.SphereGeometry(0.012, 8, 8), // 12mm radius
            jointMaterial
        );
        wrist.name = 'wrist';
        group.add(wrist);

        // Create joint spheres and bone segments for each finger
        for (const [fingerName, joints] of Object.entries(FINGER_JOINTS)) {
            // Create a small sphere at each joint
            joints.forEach(jointName => {
                const joint = new THREE.Mesh(
                    new THREE.SphereGeometry(0.004, 6, 6), // 4mm radius - small joint spheres
                    jointMaterial
                );
                joint.name = 'joint-' + jointName;
                joint.visible = false;
                group.add(joint);
            });

            // Create bone segments between consecutive joints
            // Each finger has joints.length - 1 bones
            for (let i = 0; i < joints.length - 1; i++) {
                const bone = this.createBoneMesh(boneMaterial);
                bone.name = 'bone-' + joints[i] + '-to-' + joints[i + 1];
                bone.visible = false;
                group.add(bone);
            }
        }

        // Pinch indicator (shown when pinching)
        const pinchIndicator = new THREE.Mesh(
            new THREE.SphereGeometry(0.015, 8, 8), // 1.5cm radius
            new THREE.MeshBasicMaterial({
                color: 0xffff00,
                transparent: true,
                opacity: 0.9
            })
        );
        pinchIndicator.name = 'pinchIndicator';
        pinchIndicator.visible = false;
        group.add(pinchIndicator);

        // Grab range indicator - shows the grab radius in VR space
        // GRAB_RADIUS is 0.5m in world units, which is 0.05m in VR space (0.5 / GIANT_SCALE)
        const grabRangeVR = 0.5 / GIANT_SCALE; // 5cm in VR = 0.5m in world
        const grabRange = new THREE.Mesh(
            new THREE.SphereGeometry(grabRangeVR, 8, 8),
            new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: 0.3,
                wireframe: true
            })
        );
        grabRange.name = 'grabRange';
        group.add(grabRange);

        group.visible = false;
        return group;
    }

    /**
     * Create a bone mesh (cylinder that will be stretched between two points)
     */
    createBoneMesh(material) {
        // Create a unit cylinder along Y axis that we'll scale/rotate to connect points
        // Thin pill bones (2mm radius)
        const geometry = new THREE.CylinderGeometry(BONE_RADIUS, BONE_RADIUS, 1, 6);
        // Move origin to bottom of cylinder so we can position at start point
        geometry.translate(0, 0.5, 0);
        return new THREE.Mesh(geometry, material);
    }

    /**
     * Update a bone mesh to stretch between two points
     */
    updateBoneBetweenPoints(bone, start, end) {
        if (!bone || !start || !end) return;

        // Calculate direction and length
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();

        if (length < 0.001) {
            bone.visible = false;
            return;
        }

        bone.visible = true;

        // Position at start point
        bone.position.copy(start);

        // Scale to match length
        bone.scale.set(1, length, 1);

        // Rotate to point toward end
        bone.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction.normalize()
        );
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
        } catch (error) {
            console.warn('Error in hands update:', error.message);
        }
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
                        this.updateBoneBetweenPoints(bone, jointPositions[i], jointPositions[i + 1]);
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
                    const midpoint = thumbTipWorldPos.clone().lerp(indexTipWorldPos, 0.5);
                    const localMid = midpoint.sub(wristWorldPos);
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

    setGrabbing(hand, isGrabbing) {
        const mesh = hand === 'left' ? this.leftHandMesh : this.rightHandMesh;
        const grabRange = mesh.getObjectByName('grabRange');
        if (grabRange) {
            grabRange.material.color.setHex(isGrabbing ? 0xff0000 : 0x00ff00);
            grabRange.material.opacity = isGrabbing ? 0.5 : 0.3;
        }
    }
}
