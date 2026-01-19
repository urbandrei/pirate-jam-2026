/**
 * Shared player mesh creation functions
 * Consolidates duplicated mesh code from VR and PC remote-players.js
 *
 * SIZING CONVENTION:
 * - PC player mesh: Created at natural size (1.8m tall)
 * - VR player mesh for PC view: Created at GIANT_SCALE (giants)
 * - Scaling for VR "tiny world" view is done at render time
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { COLORS, PLAYER_HEIGHT, PLAYER_RADIUS, GIANT_SCALE } from './constants.js';

// Full finger joint hierarchy for articulated bones (shared with VR hands)
export const FINGER_JOINTS = {
    thumb: ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
    index: ['index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip'],
    middle: ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip'],
    ring: ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip'],
    pinky: ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip']
};

// Bone rendering configuration
const BONE_RADIUS = 0.002; // 2mm - thin pill bones (VR scale)

// Pre-allocated vectors for updateBoneBetweenPoints to avoid per-frame allocations
const _tempDir = new THREE.Vector3();
const _upVector = new THREE.Vector3(0, 1, 0);

/**
 * Create a bone mesh (cylinder that will be stretched between two points)
 * @param {THREE.Material} material
 * @param {number} scale - Scale factor (1 for VR, GIANT_SCALE for PC view)
 * @returns {THREE.Mesh}
 */
export function createBoneMesh(material, scale = 1) {
    const radius = BONE_RADIUS * scale;
    const geometry = new THREE.CylinderGeometry(radius, radius, 1, 6);
    // Move origin to bottom of cylinder so we can position at start point
    geometry.translate(0, 0.5, 0);
    return new THREE.Mesh(geometry, material);
}

/**
 * Update a bone mesh to stretch between two points
 * Uses pre-allocated vectors to avoid per-frame allocations
 * @param {THREE.Mesh} bone
 * @param {THREE.Vector3} start
 * @param {THREE.Vector3} end
 */
export function updateBoneBetweenPoints(bone, start, end) {
    if (!bone || !start || !end) return;

    // Calculate direction and length using pre-allocated vector
    _tempDir.subVectors(end, start);
    const length = _tempDir.length();

    if (length < 0.001) {
        bone.visible = false;
        return;
    }

    bone.visible = true;

    // Position at start point
    bone.position.copy(start);

    // Scale to match length
    bone.scale.set(1, length, 1);

    // Rotate to point toward end using pre-allocated up vector
    bone.quaternion.setFromUnitVectors(
        _upVector,
        _tempDir.normalize()
    );
}

/**
 * Create articulated hand mesh with bones and joints
 * Used by both VR (local hands) and PC (remote VR player hands)
 * @param {Object} options
 * @param {number} options.scale - Scale factor (1 for VR, GIANT_SCALE for PC view)
 * @param {boolean} options.includePinchIndicator - Add pinch indicator sphere
 * @returns {THREE.Group}
 */
export function createVRHandMesh(options = {}) {
    const {
        scale = 1,
        includePinchIndicator = true
    } = options;

    const group = new THREE.Group();

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

    // Wrist sphere - slightly larger (12mm in VR scale)
    const wristRadius = 0.012 * scale;
    const wrist = new THREE.Mesh(
        new THREE.SphereGeometry(wristRadius, 8, 8),
        jointMaterial
    );
    wrist.name = 'wrist';
    group.add(wrist);

    // Create joint spheres and bone segments for each finger
    const jointRadius = 0.004 * scale; // 4mm in VR scale
    for (const [fingerName, joints] of Object.entries(FINGER_JOINTS)) {
        // Create a small sphere at each joint
        joints.forEach(jointName => {
            const joint = new THREE.Mesh(
                new THREE.SphereGeometry(jointRadius, 6, 6),
                jointMaterial
            );
            joint.name = 'joint-' + jointName;
            joint.visible = false;
            group.add(joint);
        });

        // Create bone segments between consecutive joints
        for (let i = 0; i < joints.length - 1; i++) {
            const bone = createBoneMesh(boneMaterial, scale);
            bone.name = 'bone-' + joints[i] + '-to-' + joints[i + 1];
            bone.visible = false;
            group.add(bone);
        }
    }

    // Pinch indicator (shown when pinching)
    if (includePinchIndicator) {
        const pinchRadius = 0.015 * scale; // 1.5cm in VR scale
        const pinchIndicator = new THREE.Mesh(
            new THREE.SphereGeometry(pinchRadius, 8, 8),
            new THREE.MeshBasicMaterial({
                color: 0xffff00,
                transparent: true,
                opacity: 0.9
            })
        );
        pinchIndicator.name = 'pinchIndicator';
        pinchIndicator.visible = false;
        group.add(pinchIndicator);
    }

    group.visible = false;
    return group;
}

/**
 * Create a PC player mesh (capsule body with face indicator)
 * @param {Object} options
 * @param {boolean} options.includeLabel - Add floating label above player
 * @returns {THREE.Group}
 */
export function createPCPlayerMesh(options = {}) {
    const { includeLabel = false } = options;
    const group = new THREE.Group();

    // Capsule body
    const cylinderHeight = PLAYER_HEIGHT - PLAYER_RADIUS * 2;
    const material = new THREE.MeshStandardMaterial({
        color: COLORS.PC_PLAYER,
        roughness: 0.6,
        metalness: 0.2
    });

    const cylinder = new THREE.Mesh(
        new THREE.CylinderGeometry(PLAYER_RADIUS, PLAYER_RADIUS, cylinderHeight, 16),
        material
    );
    group.add(cylinder);

    const topSphere = new THREE.Mesh(
        new THREE.SphereGeometry(PLAYER_RADIUS, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        material
    );
    topSphere.position.y = cylinderHeight / 2;
    group.add(topSphere);

    const bottomSphere = new THREE.Mesh(
        new THREE.SphereGeometry(PLAYER_RADIUS, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
        material
    );
    bottomSphere.position.y = -cylinderHeight / 2;
    group.add(bottomSphere);

    // Face indicator (so we can see which way they're looking)
    const face = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    face.position.set(0, cylinderHeight / 2 + 0.1, -PLAYER_RADIUS);
    group.add(face);

    // Label (floating text above player) - for VR view
    if (includeLabel) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('PC Player', 128, 40);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const label = new THREE.Sprite(spriteMaterial);
        label.name = 'label';
        label.position.y = PLAYER_HEIGHT / 2 + 0.5;
        label.scale.set(1, 0.25, 1);
        group.add(label);
    }

    group.castShadow = true;
    return group;
}

/**
 * Create VR player mesh for PC view (giant head and articulated hands)
 * VR players appear as giants from PC perspective
 * All sizes are in world units (meters) at GIANT_SCALE
 * @returns {THREE.Group}
 */
export function createVRPlayerMeshForPC() {
    const group = new THREE.Group();

    const headMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.VR_PLAYER,
        roughness: 0.5,
        metalness: 0.3
    });

    // Giant head - VR head is ~0.2m radius, scaled up by GIANT_SCALE = 2m radius
    // This makes the VR player's head appear as a 4m diameter sphere
    const headRadius = 0.2 * GIANT_SCALE; // 2m in world units
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius, 16, 16),
        headMaterial
    );
    head.name = 'head';
    group.add(head);

    // Eyes - proportional to head size
    const eyeRadius = 0.03 * GIANT_SCALE; // 0.3m
    const pupilRadius = 0.015 * GIANT_SCALE; // 0.15m
    const eyeGeometry = new THREE.SphereGeometry(eyeRadius, 8, 8);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilGeometry = new THREE.SphereGeometry(pupilRadius, 8, 8);
    const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });

    const eyeOffset = 0.06 * GIANT_SCALE; // Horizontal offset
    const eyeDepth = 0.18 * GIANT_SCALE; // Depth into head
    const pupilDepth = 0.20 * GIANT_SCALE;

    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-eyeOffset, eyeRadius, -eyeDepth);
    const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    leftPupil.position.set(-eyeOffset, eyeRadius, -pupilDepth);
    head.add(leftEye);
    head.add(leftPupil);

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(eyeOffset, eyeRadius, -eyeDepth);
    const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    rightPupil.position.set(eyeOffset, eyeRadius, -pupilDepth);
    head.add(rightEye);
    head.add(rightPupil);

    // Articulated hands - scaled to GIANT_SCALE for PC view
    const leftHand = createVRHandMesh({
        scale: GIANT_SCALE,
        includePinchIndicator: true
    });
    leftHand.name = 'leftHand';
    leftHand.visible = true; // Make visible by default
    group.add(leftHand);

    const rightHand = createVRHandMesh({
        scale: GIANT_SCALE,
        includePinchIndicator: true
    });
    rightHand.name = 'rightHand';
    rightHand.visible = true; // Make visible by default
    group.add(rightHand);

    group.castShadow = true;
    return group;
}

/**
 * Create VR player mesh for VR view (position marker)
 * Other VR players shown as simple markers in VR view
 * Note: This is rendered in VR space where everything is at 1/GIANT_SCALE
 * @returns {THREE.Group}
 */
export function createVRPlayerMeshForVR() {
    const group = new THREE.Group();

    // Marker for other VR players - sized for the "tiny world" view
    // In VR, the world is 1/GIANT_SCALE, so this cone is effectively 0.1m base, 0.3m tall
    const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.3, 8),
        new THREE.MeshStandardMaterial({
            color: COLORS.VR_PLAYER,
            roughness: 0.5,
            metalness: 0.3
        })
    );
    marker.rotation.x = Math.PI; // Point down
    marker.position.y = 0.5; // Hover above their position
    group.add(marker);

    return group;
}
