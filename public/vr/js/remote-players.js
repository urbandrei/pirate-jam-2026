/**
 * Render PC players as tiny figures from VR perspective
 *
 * COORDINATE SYSTEM (VR "Tiny World"):
 * - PC player positions from server are in world units
 * - Render at 1/GIANT_SCALE to place them in the tiny world
 * - PC players appear as 18cm tall action figures (1.8m / 10)
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { createPCPlayerMesh, createVRPlayerMeshForVR } from '../../pc/shared/player-mesh.js';
import { GIANT_SCALE, ITEMS } from '../../pc/shared/constants.js';

export class RemotePlayers {
    constructor(scene) {
        this.scene = scene;
        this.players = new Map(); // playerId -> { mesh, type, data }
    }

    /**
     * Properly dispose of a player mesh and all its resources to prevent memory leaks.
     * Must be called before removing a mesh from the scene.
     */
    disposePlayerMesh(playerObj) {
        // Clean up held item mesh first
        if (playerObj.heldItemMesh) {
            playerObj.mesh.remove(playerObj.heldItemMesh);
            if (playerObj.heldItemMesh.geometry) playerObj.heldItemMesh.geometry.dispose();
            if (playerObj.heldItemMesh.material) playerObj.heldItemMesh.material.dispose();
            playerObj.heldItemMesh = null;
        }

        // Dispose main player mesh
        playerObj.mesh.traverse((child) => {
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => {
                        if (m.map) m.map.dispose();
                        m.dispose();
                    });
                } else {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            }
        });
    }

    updatePlayers(state, localPlayerId) {
        if (!state || !state.players) return;

        // Remove players that left - iterate directly without creating Set
        for (const [playerId, playerObj] of this.players) {
            if (!(playerId in state.players)) {
                this.disposePlayerMesh(playerObj);
                this.scene.remove(playerObj.mesh);
                this.players.delete(playerId);
            }
        }

        // Update or add players
        for (const [playerId, playerData] of Object.entries(state.players)) {
            // Skip local player
            if (playerId === localPlayerId) continue;

            let playerObj = this.players.get(playerId);

            if (!playerObj) {
                // Create new player using shared mesh functions
                const mesh = playerData.type === 'pc'
                    ? createPCPlayerMesh({ includeLabel: true })
                    : createVRPlayerMeshForVR();

                // Scale PC player mesh to 1/GIANT_SCALE for tiny world
                // 1.8m tall PC player becomes 0.18m (18cm) action figure
                if (playerData.type === 'pc') {
                    const scale = 1 / GIANT_SCALE;
                    mesh.scale.set(scale, scale, scale);
                }

                this.scene.add(mesh);
                playerObj = {
                    mesh,
                    type: playerData.type,
                    targetPosition: new THREE.Vector3(),
                    heldItemMesh: null,
                    lastHeldItemKey: null
                };
                this.players.set(playerId, playerObj);
            }

            // Update based on player type
            if (playerData.type === 'pc') {
                this.updatePCPlayer(playerObj, playerData);
            } else {
                this.updateVRPlayer(playerObj, playerData);
            }
        }
    }

    updatePCPlayer(playerObj, data) {
        const mesh = playerObj.mesh;

        // PC player positions are in world units
        // Divide by GIANT_SCALE to place them in the tiny VR world
        // Example: PC player at (5, 0.9, 5) world -> (0.5, 0.09, 0.5) in VR
        playerObj.targetPosition.set(
            data.position.x / GIANT_SCALE,
            data.position.y / GIANT_SCALE,
            data.position.z / GIANT_SCALE
        );

        mesh.position.lerp(playerObj.targetPosition, 0.3);

        // Update rotation based on look direction
        if (data.lookRotation) {
            mesh.rotation.y = data.lookRotation.y;
        }

        // Update held item display
        this.updateHeldItem(playerObj, data.heldItem);
    }

    /**
     * Update held item display for a PC player
     * @param {Object} playerObj - Player object from this.players
     * @param {Object|null} heldItem - Held item data from server
     */
    updateHeldItem(playerObj, heldItem) {
        // Generate key for change detection
        const itemKey = heldItem
            ? `${heldItem.id}-${heldItem.stackCount || 1}-${heldItem.type}`
            : null;

        // Skip if nothing changed
        if (playerObj.lastHeldItemKey === itemKey) return;
        playerObj.lastHeldItemKey = itemKey;

        // Remove existing held item mesh
        if (playerObj.heldItemMesh) {
            playerObj.mesh.remove(playerObj.heldItemMesh);
            if (playerObj.heldItemMesh.geometry) playerObj.heldItemMesh.geometry.dispose();
            if (playerObj.heldItemMesh.material) playerObj.heldItemMesh.material.dispose();
            playerObj.heldItemMesh = null;
        }

        // Create new mesh if holding something
        if (heldItem) {
            playerObj.heldItemMesh = this.createHeldItemMesh(heldItem);
            // Position relative to tiny player mesh (already scaled to 1/GIANT_SCALE)
            // Use local coordinates: in front at hand height
            // PC uses (0, 0.3, -0.4), scale that down for tiny player
            playerObj.heldItemMesh.position.set(0, 0.3, -0.4);
            playerObj.mesh.add(playerObj.heldItemMesh);
        }
    }

    /**
     * Create a mesh for a held item (at PC player scale, will be scaled by parent)
     * @param {Object} item - Item data
     * @returns {THREE.Mesh}
     */
    createHeldItemMesh(item) {
        const itemDef = ITEMS[item.type];

        // Size based on stack count (same scale as PC client)
        const baseSize = 0.3;
        const stackCount = item.stackCount || 1;
        const stackBonus = stackCount > 1 ? Math.min((stackCount - 1) * 0.04, 0.15) : 0;
        const size = baseSize + stackBonus;

        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshStandardMaterial({
            color: itemDef ? itemDef.color : 0xffff00,
            roughness: 0.5,
            metalness: 0.1
        });

        return new THREE.Mesh(geometry, material);
    }

    updateVRPlayer(playerObj, data) {
        const mesh = playerObj.mesh;

        // Other VR players - positions are in world units (VR client sends position * GIANT_SCALE)
        // Divide by GIANT_SCALE to place them in the tiny VR world
        if (data.position) {
            playerObj.targetPosition.set(
                data.position.x / GIANT_SCALE,
                data.position.y / GIANT_SCALE + 0.5, // Offset marker above their position
                data.position.z / GIANT_SCALE
            );
            mesh.position.lerp(playerObj.targetPosition, 0.3);
        }
    }

    removePlayer(playerId) {
        const playerObj = this.players.get(playerId);
        if (playerObj) {
            this.disposePlayerMesh(playerObj);
            this.scene.remove(playerObj.mesh);
            this.players.delete(playerId);
        }
    }

    /**
     * Cleanup all player meshes to prevent memory leaks
     * Called when VR session ends
     */
    dispose() {
        console.log('[RemotePlayers] Disposing all player meshes...');
        for (const [playerId, playerObj] of this.players) {
            this.disposePlayerMesh(playerObj);
            this.scene.remove(playerObj.mesh);
        }
        this.players.clear();
        console.log('[RemotePlayers] All player meshes disposed');
    }
}
