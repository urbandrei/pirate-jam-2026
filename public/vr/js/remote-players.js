/**
 * Render PC players as tiny figures from VR perspective
 *
 * COORDINATE SYSTEM (VR "Tiny World"):
 * - PC player positions from server are in world units
 * - Render at 1/GIANT_SCALE to place them in the tiny world
 * - PC players appear as 18cm tall action figures (1.8m / 10)
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { createPCPlayerMesh, createVRPlayerMeshForVR } from '../../shared/player-mesh.js';
import { GIANT_SCALE } from '../../shared/constants.js';

export class RemotePlayers {
    constructor(scene) {
        this.scene = scene;
        this.players = new Map(); // playerId -> { mesh, type, data }
    }

    updatePlayers(state, localPlayerId) {
        if (!state || !state.players) return;

        const currentPlayerIds = new Set(Object.keys(state.players));

        // Remove players that left
        for (const [playerId, data] of this.players) {
            if (!currentPlayerIds.has(playerId)) {
                this.scene.remove(data.mesh);
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
                    ? createPCPlayerMesh({ includeGrabIndicator: true, includeLabel: true })
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
                    targetPosition: new THREE.Vector3()
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

        // Interpolate
        mesh.position.lerp(playerObj.targetPosition, 0.3);

        // Update rotation based on look direction
        if (data.lookRotation) {
            mesh.rotation.y = data.lookRotation.y;
        }

        // Update grabbed state visual
        const outline = mesh.getObjectByName('grabbedOutline');
        if (outline) {
            outline.visible = data.isGrabbed;
        }
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
            this.scene.remove(playerObj.mesh);
            this.players.delete(playerId);
        }
    }

    // Get list of PC players for grab detection
    getPCPlayerPositions() {
        const positions = [];
        for (const [playerId, data] of this.players) {
            if (data.type === 'pc') {
                positions.push({
                    id: playerId,
                    position: data.mesh.position.clone()
                });
            }
        }
        return positions;
    }
}
