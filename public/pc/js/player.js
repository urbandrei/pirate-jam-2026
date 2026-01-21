/**
 * Local player representation (capsule)
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { COLORS, PLAYER_HEIGHT, PLAYER_RADIUS, GROUND_LEVEL } from '../shared/constants.js';

export class Player {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Position state (received from server)
        this.position = { x: 0, y: GROUND_LEVEL, z: 0 };
        this.serverPosition = { x: 0, y: GROUND_LEVEL, z: 0 };

        // For interpolation
        this.targetPosition = { x: 0, y: GROUND_LEVEL, z: 0 };

        // Held item state
        this.heldItem = null;
        this.heldItemMesh = null;

        // Create visual representation (capsule)
        this.mesh = this.createCapsuleMesh();
        // Don't add to scene - first person view doesn't show own body
        // But we'll use it for debugging if needed
    }

    createCapsuleMesh() {
        // Capsule = cylinder + two hemispheres
        const group = new THREE.Group();

        // Cylinder body
        const cylinderHeight = PLAYER_HEIGHT - PLAYER_RADIUS * 2;
        const cylinderGeometry = new THREE.CylinderGeometry(
            PLAYER_RADIUS,
            PLAYER_RADIUS,
            cylinderHeight,
            16
        );
        const material = new THREE.MeshStandardMaterial({
            color: COLORS.PC_PLAYER,
            roughness: 0.6,
            metalness: 0.2
        });
        const cylinder = new THREE.Mesh(cylinderGeometry, material);
        group.add(cylinder);

        // Top hemisphere
        const topSphere = new THREE.Mesh(
            new THREE.SphereGeometry(PLAYER_RADIUS, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
            material
        );
        topSphere.position.y = cylinderHeight / 2;
        group.add(topSphere);

        // Bottom hemisphere
        const bottomSphere = new THREE.Mesh(
            new THREE.SphereGeometry(PLAYER_RADIUS, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
            material
        );
        bottomSphere.position.y = -cylinderHeight / 2;
        group.add(bottomSphere);

        return group;
    }

    updateFromServer(serverState) {
        if (!serverState) return;

        this.serverPosition = { ...serverState.position };
        this.targetPosition = { ...serverState.position };
    }

    update(deltaTime) {
        // Smooth interpolation to server position
        const lerpFactor = 0.3;
        this.position.x += (this.targetPosition.x - this.position.x) * lerpFactor;
        this.position.y += (this.targetPosition.y - this.position.y) * lerpFactor;
        this.position.z += (this.targetPosition.z - this.position.z) * lerpFactor;

        // Update mesh position (if visible)
        this.mesh.position.set(this.position.x, this.position.y, this.position.z);
    }

    getPosition() {
        return this.position;
    }

    setPosition(pos) {
        this.position = { ...pos };
        this.targetPosition = { ...pos };
        this.serverPosition = { ...pos };
    }

    /**
     * Update held item display based on server state
     * @param {Object|null} heldItem - Held item data from server, or null if not holding
     */
    updateHeldItem(heldItem) {
        // If same item (or both null), no change needed
        if (this.heldItem?.id === heldItem?.id) return;

        this.heldItem = heldItem;

        // Remove existing held item mesh
        if (this.heldItemMesh) {
            this.camera.remove(this.heldItemMesh);
            if (this.heldItemMesh.geometry) this.heldItemMesh.geometry.dispose();
            if (this.heldItemMesh.material) this.heldItemMesh.material.dispose();
            this.heldItemMesh = null;
        }

        // Create new mesh if holding something
        if (heldItem) {
            this.heldItemMesh = this.createHeldItemMesh(heldItem);
            // Position in front of camera, lower edge of view
            this.heldItemMesh.position.set(0, -0.4, -0.6);
            // Slightly smaller when held
            this.heldItemMesh.scale.setScalar(0.6);
            this.camera.add(this.heldItemMesh);
        }
    }

    /**
     * Create a mesh for the held item
     * @param {Object} item - Item data
     * @returns {THREE.Mesh}
     */
    createHeldItemMesh(item) {
        let geometry;
        if (item.type === 'cube') {
            geometry = new THREE.BoxGeometry(item.size || 0.5, item.size || 0.5, item.size || 0.5);
        } else {
            geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        }

        const material = new THREE.MeshStandardMaterial({
            color: item.color || 0xffff00,
            roughness: 0.5,
            metalness: 0.1
        });

        const mesh = new THREE.Mesh(geometry, material);
        return mesh;
    }

    /**
     * Check if player is holding an item
     * @returns {boolean}
     */
    isHoldingItem() {
        return this.heldItem !== null;
    }

    /**
     * Get the held item data
     * @returns {Object|null}
     */
    getHeldItem() {
        return this.heldItem;
    }
}
