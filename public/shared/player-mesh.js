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

/**
 * Create a PC player mesh (capsule body with face indicator)
 * @param {Object} options
 * @param {boolean} options.includeGrabIndicator - Add grabbedOutline for VR grab visualization
 * @param {boolean} options.includeLabel - Add floating label above player
 * @returns {THREE.Group}
 */
export function createPCPlayerMesh(options = {}) {
    const { includeGrabIndicator = false, includeLabel = false } = options;
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

    // Grabbed indicator (glowing outline when grabbed) - for VR view
    if (includeGrabIndicator) {
        const outline = new THREE.Mesh(
            new THREE.CylinderGeometry(PLAYER_RADIUS * 1.2, PLAYER_RADIUS * 1.2, PLAYER_HEIGHT, 16),
            new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.4,
                side: THREE.BackSide
            })
        );
        outline.name = 'grabbedOutline';
        outline.visible = false;
        group.add(outline);
    }

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
 * Create VR player mesh for PC view (giant head and hands)
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
    const handMaterial = new THREE.MeshStandardMaterial({
        color: COLORS.VR_HAND,
        roughness: 0.7,
        metalness: 0.1
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

    // Giant hands - VR hand is ~0.08m radius, scaled up by GIANT_SCALE = 0.8m radius
    const handRadius = 0.08 * GIANT_SCALE; // 0.8m in world units
    const leftHand = new THREE.Mesh(
        new THREE.SphereGeometry(handRadius, 12, 12),
        handMaterial
    );
    leftHand.name = 'leftHand';
    group.add(leftHand);

    const rightHand = new THREE.Mesh(
        new THREE.SphereGeometry(handRadius, 12, 12),
        handMaterial
    );
    rightHand.name = 'rightHand';
    group.add(rightHand);

    // Grab indicator spheres (visible when pinching)
    const grabIndicatorRadius = 0.05 * GIANT_SCALE; // 0.5m
    const grabIndicatorMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5
    });

    const leftGrabIndicator = new THREE.Mesh(
        new THREE.SphereGeometry(grabIndicatorRadius, 8, 8),
        grabIndicatorMaterial
    );
    leftGrabIndicator.name = 'leftGrabIndicator';
    leftGrabIndicator.visible = false;
    leftHand.add(leftGrabIndicator);

    const rightGrabIndicator = new THREE.Mesh(
        new THREE.SphereGeometry(grabIndicatorRadius, 8, 8),
        grabIndicatorMaterial
    );
    rightGrabIndicator.name = 'rightGrabIndicator';
    rightGrabIndicator.visible = false;
    rightHand.add(rightGrabIndicator);

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
