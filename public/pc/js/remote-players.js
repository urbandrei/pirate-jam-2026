/**
 * Render other players (both PC and VR)
 *
 * COORDINATE SYSTEM (PC VIEW):
 * - All positions from server are in world units (1 unit = 1 meter)
 * - PC players: rendered at 1:1 scale (1.8m tall)
 * - VR players: mesh is pre-scaled to GIANT_SCALE (appear as giants)
 * - VR positions from server are in world units (already scaled by GIANT_SCALE on VR side)
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { GIANT_SCALE } from '../../shared/constants.js';
import { createPCPlayerMesh, createVRPlayerMeshForPC } from '../../shared/player-mesh.js';

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
                const mesh = playerData.type === 'vr'
                    ? createVRPlayerMeshForPC()
                    : createPCPlayerMesh();
                this.scene.add(mesh);
                playerObj = {
                    mesh,
                    type: playerData.type,
                    targetPosition: { x: 0, y: 0, z: 0 },
                    targetRotation: 0
                };
                this.players.set(playerId, playerObj);
            }

            // Update target position for interpolation
            playerObj.targetPosition = { ...playerData.position };

            if (playerData.type === 'vr') {
                this.updateVRPlayer(playerObj, playerData);
            } else {
                this.updatePCPlayer(playerObj, playerData);
            }
        }
    }

    updatePCPlayer(playerObj, data) {
        // Interpolate position
        const mesh = playerObj.mesh;
        mesh.position.lerp(
            new THREE.Vector3(
                playerObj.targetPosition.x,
                playerObj.targetPosition.y,
                playerObj.targetPosition.z
            ),
            0.3
        );

        // Update rotation based on look direction
        if (data.lookRotation) {
            mesh.rotation.y = data.lookRotation.y;
        }
    }

    updateVRPlayer(playerObj, data) {
        const mesh = playerObj.mesh;
        const head = mesh.getObjectByName('head');
        const leftHand = mesh.getObjectByName('leftHand');
        const rightHand = mesh.getObjectByName('rightHand');

        // VR positions from server are in world units (VR client sends position * GIANT_SCALE)
        // Render directly - the VR player mesh is already sized at GIANT_SCALE
        if (data.headPosition) {
            head.position.set(
                data.headPosition.x,
                data.headPosition.y,
                data.headPosition.z
            );
        }
        if (data.headRotation) {
            head.quaternion.set(
                data.headRotation.x,
                data.headRotation.y,
                data.headRotation.z,
                data.headRotation.w
            );
        }

        // Update hands - positions already in world units
        if (data.leftHand && data.leftHand.position) {
            leftHand.position.set(
                data.leftHand.position.x,
                data.leftHand.position.y,
                data.leftHand.position.z
            );
            if (data.leftHand.rotation) {
                leftHand.quaternion.set(
                    data.leftHand.rotation.x,
                    data.leftHand.rotation.y,
                    data.leftHand.rotation.z,
                    data.leftHand.rotation.w
                );
            }
        }

        if (data.rightHand && data.rightHand.position) {
            rightHand.position.set(
                data.rightHand.position.x,
                data.rightHand.position.y,
                data.rightHand.position.z
            );
            if (data.rightHand.rotation) {
                rightHand.quaternion.set(
                    data.rightHand.rotation.x,
                    data.rightHand.rotation.y,
                    data.rightHand.rotation.z,
                    data.rightHand.rotation.w
                );
            }
        }
    }

    removePlayer(playerId) {
        const playerObj = this.players.get(playerId);
        if (playerObj) {
            this.scene.remove(playerObj.mesh);
            this.players.delete(playerId);
        }
    }
}
