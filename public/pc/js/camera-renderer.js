/**
 * Camera Renderer - Visual representation of camera objects in the world
 *
 * Creates and manages camera meshes with body, lens, mount, and LED indicator.
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { CAMERA_COLORS, CAMERA_ITEM } from '../shared/constants.js';

// Shared materials (initialized once)
let sharedMaterials = null;

/**
 * Initialize shared materials for all camera meshes
 */
function initMaterials() {
    if (sharedMaterials) return sharedMaterials;

    sharedMaterials = {
        body: new THREE.MeshStandardMaterial({
            color: CAMERA_COLORS.BODY,
            roughness: 0.7,
            metalness: 0.3
        }),
        lens: new THREE.MeshStandardMaterial({
            color: CAMERA_COLORS.LENS,
            roughness: 0.2,
            metalness: 0.8
        }),
        ledActive: new THREE.MeshBasicMaterial({
            color: CAMERA_COLORS.LED_ACTIVE
        }),
        ledInactive: new THREE.MeshBasicMaterial({
            color: CAMERA_COLORS.LED_INACTIVE
        })
    };

    return sharedMaterials;
}

/**
 * Create a camera mesh
 * @param {Object} cameraData - Camera data {id, type, position, rotation}
 * @returns {THREE.Group} Camera mesh group
 */
export function createCameraMesh(cameraData) {
    const materials = initMaterials();
    const group = new THREE.Group();

    // Store camera data for reference
    group.userData.cameraId = cameraData.id;
    group.userData.cameraType = cameraData.type;

    // Camera body (box)
    const bodyGeometry = new THREE.BoxGeometry(
        CAMERA_ITEM.size.width,
        CAMERA_ITEM.size.height,
        CAMERA_ITEM.size.depth
    );
    const body = new THREE.Mesh(bodyGeometry, materials.body);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Lens (cylinder protruding from front)
    const lensRadius = CAMERA_ITEM.size.height * 0.35;
    const lensLength = CAMERA_ITEM.size.depth * 0.3;
    const lensGeometry = new THREE.CylinderGeometry(
        lensRadius,
        lensRadius * 0.8,  // Slight taper
        lensLength,
        16
    );
    const lens = new THREE.Mesh(lensGeometry, materials.lens);
    lens.rotation.x = Math.PI / 2;  // Point forward
    lens.position.z = -CAMERA_ITEM.size.depth / 2 - lensLength / 2;
    group.add(lens);

    // Lens glass (darker inner circle)
    const glassGeometry = new THREE.CircleGeometry(lensRadius * 0.6, 16);
    const glassMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.8
    });
    const glass = new THREE.Mesh(glassGeometry, glassMaterial);
    glass.position.z = -CAMERA_ITEM.size.depth / 2 - lensLength - 0.001;
    group.add(glass);

    // LED indicator (small sphere on top-front)
    const ledGeometry = new THREE.SphereGeometry(0.015, 8, 8);
    const led = new THREE.Mesh(ledGeometry, materials.ledActive);
    led.position.set(
        CAMERA_ITEM.size.width / 2 - 0.02,
        CAMERA_ITEM.size.height / 2 - 0.02,
        -CAMERA_ITEM.size.depth / 2 + 0.02
    );
    led.name = 'led';
    group.add(led);

    // Set position
    group.position.set(
        cameraData.position.x,
        cameraData.position.y,
        cameraData.position.z
    );

    // Set rotation
    if (cameraData.rotation) {
        group.rotation.order = 'YXZ';
        group.rotation.y = cameraData.rotation.yaw || 0;
        group.rotation.x = cameraData.rotation.pitch || 0;
        group.rotation.z = cameraData.rotation.roll || 0;
    }

    return group;
}

/**
 * Update camera mesh position and rotation
 * @param {THREE.Group} mesh - Camera mesh group
 * @param {Object} cameraData - Updated camera data
 */
export function updateCameraMesh(mesh, cameraData) {
    if (!mesh) return;

    // Update position
    mesh.position.set(
        cameraData.position.x,
        cameraData.position.y,
        cameraData.position.z
    );

    // Update rotation
    if (cameraData.rotation) {
        mesh.rotation.order = 'YXZ';
        mesh.rotation.y = cameraData.rotation.yaw || 0;
        mesh.rotation.x = cameraData.rotation.pitch || 0;
        mesh.rotation.z = cameraData.rotation.roll || 0;
    }
}

/**
 * Set camera LED state (active/inactive)
 * @param {THREE.Group} mesh - Camera mesh group
 * @param {boolean} active - Whether camera is active
 */
export function setCameraLedState(mesh, active) {
    if (!mesh) return;

    const led = mesh.getObjectByName('led');
    if (led && sharedMaterials) {
        led.material = active ? sharedMaterials.ledActive : sharedMaterials.ledInactive;
    }
}

/**
 * Create a held camera mesh (for when player is holding a camera item)
 * @returns {THREE.Group} Smaller camera mesh for held item display
 */
export function createHeldCameraMesh() {
    const materials = initMaterials();
    const group = new THREE.Group();

    // Smaller scale for held item
    const scale = 0.5;

    // Camera body
    const bodyGeometry = new THREE.BoxGeometry(
        CAMERA_ITEM.size.width * scale,
        CAMERA_ITEM.size.height * scale,
        CAMERA_ITEM.size.depth * scale
    );
    const body = new THREE.Mesh(bodyGeometry, materials.body);
    group.add(body);

    // Lens
    const lensRadius = CAMERA_ITEM.size.height * 0.35 * scale;
    const lensLength = CAMERA_ITEM.size.depth * 0.3 * scale;
    const lensGeometry = new THREE.CylinderGeometry(
        lensRadius,
        lensRadius * 0.8,
        lensLength,
        12
    );
    const lens = new THREE.Mesh(lensGeometry, materials.lens);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -CAMERA_ITEM.size.depth * scale / 2 - lensLength / 2;
    group.add(lens);

    return group;
}

/**
 * Dispose a camera mesh and its geometries
 * @param {THREE.Group} mesh - Camera mesh group
 */
export function disposeCameraMesh(mesh) {
    if (!mesh) return;

    mesh.traverse((child) => {
        if (child.geometry) {
            child.geometry.dispose();
        }
        // Don't dispose shared materials
    });
}

/**
 * Dispose all shared materials (call on cleanup)
 */
export function disposeSharedMaterials() {
    if (sharedMaterials) {
        Object.values(sharedMaterials).forEach(material => {
            if (material && material.dispose) {
                material.dispose();
            }
        });
        sharedMaterials = null;
    }
}

/**
 * Get camera type display name
 * @param {string} type - Camera type
 * @returns {string} Display name
 */
export function getCameraTypeName(type) {
    switch (type) {
        case 'security':
            return 'Security Camera';
        case 'stream':
            return 'Stream Camera';
        default:
            return 'Camera';
    }
}
