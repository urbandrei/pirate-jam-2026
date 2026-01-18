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
import { COLORS, PINCH_THRESHOLD, GIANT_SCALE } from '../../shared/constants.js';

// WebXR hand joint names for fingertips
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

        // Track which input mode is active per hand
        this.leftHandMode = null; // 'hand-tracking' or 'controller'
        this.rightHandMode = null;

        // Setup controllers for fallback
        this.setupControllers();
    }

    /**
     * Create pill-bone hand mesh structure:
     * - Palm sphere at wrist
     * - 5 fingertip spheres
     * - 5 capsule bones connecting palm to fingertips
     * - Pinch indicator
     * - Grab range indicator
     *
     * All sizes are in real VR meters (1:1 scale with user's hands)
     */
    createHandMesh(side) {
        const group = new THREE.Group();
        group.name = side + 'Hand';

        const handMaterial = new THREE.MeshStandardMaterial({
            color: COLORS.VR_HAND,
            roughness: 0.7,
            metalness: 0.1
        });

        const boneMaterial = new THREE.MeshStandardMaterial({
            color: COLORS.VR_HAND,
            roughness: 0.6,
            metalness: 0.2
        });

        // Palm sphere (at wrist joint) - real hand scale
        const palm = new THREE.Mesh(
            new THREE.SphereGeometry(0.025, 12, 12), // 2.5cm radius
            handMaterial
        );
        palm.name = 'palm';
        group.add(palm);

        // Fingertip spheres - real hand scale
        const fingerNames = ['thumb', 'index', 'middle', 'ring', 'pinky'];
        fingerNames.forEach(finger => {
            const tip = new THREE.Mesh(
                new THREE.SphereGeometry(0.01, 8, 8), // 1cm radius
                handMaterial
            );
            tip.name = finger + 'Tip';
            tip.visible = false;
            group.add(tip);
        });

        // Bone capsules (palm to each fingertip)
        fingerNames.forEach(finger => {
            const bone = this.createBoneMesh(boneMaterial);
            bone.name = finger + 'Bone';
            bone.visible = false;
            group.add(bone);
        });

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
        // Real VR scale (6mm radius for finger bones)
        const geometry = new THREE.CylinderGeometry(0.006, 0.006, 1, 8);
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
     */
    updateHandTracking(inputSource, handMesh, handName, frame, referenceSpace) {
        if (!inputSource || !inputSource.hand) {
            handMesh.visible = false;
            return;
        }

        const hand = inputSource.hand;

        try {
            // Get wrist (palm) position
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

            // Update palm position (hand mesh group position) - real-world scale for local rendering
            const wristPos = wristPose.transform.position;
            const wristRot = wristPose.transform.orientation;
            handMesh.position.set(wristPos.x, wristPos.y, wristPos.z);
            handMesh.quaternion.set(wristRot.x, wristRot.y, wristRot.z, wristRot.w);

            // Palm sphere stays at origin (wrist position)
            const palm = handMesh.getObjectByName('palm');
            if (palm) {
                palm.position.set(0, 0, 0);
                palm.visible = true;
            }

            // Joint mappings
            const fingerJoints = {
                thumb: JOINT_THUMB_TIP,
                index: JOINT_INDEX_TIP,
                middle: JOINT_MIDDLE_TIP,
                ring: JOINT_RING_TIP,
                pinky: JOINT_PINKY_TIP
            };

            const palmWorldPos = new THREE.Vector3(wristPos.x, wristPos.y, wristPos.z);
            let thumbTipWorldPos = null;  // Scaled position for visuals
            let indexTipWorldPos = null;  // Scaled position for visuals
            let thumbTipRealPos = null;   // Unscaled position for pinch detection
            let indexTipRealPos = null;   // Unscaled position for pinch detection

            // Update each finger
            for (const [fingerName, jointName] of Object.entries(fingerJoints)) {
                const joint = hand.get(jointName);
                if (!joint) continue;

                const jointPose = frame.getJointPose(joint, referenceSpace);
                if (!jointPose) continue;

                const tipPos = jointPose.transform.position;
                const tipWorldPos = new THREE.Vector3(tipPos.x, tipPos.y, tipPos.z);

                // Store thumb and index tip positions for pinch detection (unscaled for real distance)
                if (fingerName === 'thumb') {
                    thumbTipWorldPos = tipWorldPos.clone();
                    thumbTipRealPos = new THREE.Vector3(tipPos.x, tipPos.y, tipPos.z);
                } else if (fingerName === 'index') {
                    indexTipWorldPos = tipWorldPos.clone();
                    indexTipRealPos = new THREE.Vector3(tipPos.x, tipPos.y, tipPos.z);
                }

                // Convert to local space relative to hand mesh
                const tipLocalPos = tipWorldPos.clone().sub(palmWorldPos);
                // Transform to hand mesh local coordinates
                const invQuat = handMesh.quaternion.clone().invert();
                tipLocalPos.applyQuaternion(invQuat);

                // Update fingertip sphere
                const tipMesh = handMesh.getObjectByName(fingerName + 'Tip');
                if (tipMesh) {
                    tipMesh.position.copy(tipLocalPos);
                    tipMesh.visible = true;
                }

                // Update bone between palm and fingertip
                const bone = handMesh.getObjectByName(fingerName + 'Bone');
                if (bone) {
                    this.updateBoneBetweenPoints(
                        bone,
                        new THREE.Vector3(0, 0, 0), // Palm is at local origin
                        tipLocalPos
                    );
                }
            }

            // Pinch detection based on thumb-index distance (use unscaled real positions)
            if (thumbTipRealPos && indexTipRealPos) {
                const pinchDistance = thumbTipRealPos.distanceTo(indexTipRealPos);
                const isPinching = pinchDistance < PINCH_THRESHOLD;

                // Update pinch indicator position to midpoint between thumb and index
                const pinchIndicator = handMesh.getObjectByName('pinchIndicator');
                if (pinchIndicator) {
                    const midpoint = thumbTipWorldPos.clone().lerp(indexTipWorldPos, 0.5);
                    const localMid = midpoint.sub(palmWorldPos);
                    const invQuat = handMesh.quaternion.clone().invert();
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

        // Hide finger bones/tips in controller mode - just show palm sphere
        const fingerNames = ['thumb', 'index', 'middle', 'ring', 'pinky'];
        fingerNames.forEach(finger => {
            const tip = handMesh.getObjectByName(finger + 'Tip');
            const bone = handMesh.getObjectByName(finger + 'Bone');
            if (tip) tip.visible = false;
            if (bone) bone.visible = false;
        });

        // Make palm sphere bigger in controller mode
        const palm = handMesh.getObjectByName('palm');
        if (palm) {
            palm.scale.set(3, 3, 3); // 0.075m radius
            palm.visible = true;
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
