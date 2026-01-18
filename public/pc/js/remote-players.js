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
import { GIANT_SCALE } from '../shared/constants.js';
import { createPCPlayerMesh, createVRPlayerMeshForPC, FINGER_JOINTS, updateBoneBetweenPoints } from '../shared/player-mesh.js';

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

            // Update articulated joints if available
            this.updateHandJoints(leftHand, data.leftHand);
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

            // Update articulated joints if available
            this.updateHandJoints(rightHand, data.rightHand);
        }
    }

    /**
     * Update articulated hand joints and bones from network data
     * Joint positions are in local space (relative to wrist), already scaled to GIANT_SCALE
     */
    updateHandJoints(handMesh, handData) {
        if (!handData.joints) {
            // No joint data (controller mode) - hide all joints and bones
            for (const [fingerName, joints] of Object.entries(FINGER_JOINTS)) {
                joints.forEach(jointName => {
                    const joint = handMesh.getObjectByName('joint-' + jointName);
                    if (joint) joint.visible = false;
                });
                for (let i = 0; i < joints.length - 1; i++) {
                    const boneName = 'bone-' + joints[i] + '-to-' + joints[i + 1];
                    const bone = handMesh.getObjectByName(boneName);
                    if (bone) bone.visible = false;
                }
            }
            // Make wrist visible and larger for controller mode
            const wrist = handMesh.getObjectByName('wrist');
            if (wrist) {
                wrist.scale.set(3, 3, 3);
                wrist.visible = true;
            }
            return;
        }

        // Reset wrist scale for hand tracking mode
        const wrist = handMesh.getObjectByName('wrist');
        if (wrist) {
            wrist.scale.set(1, 1, 1);
            wrist.visible = true;
        }

        // Update each finger's joints and bones
        for (const [fingerName, joints] of Object.entries(FINGER_JOINTS)) {
            const jointPositions = [];

            // Update joint positions
            for (const jointName of joints) {
                const jointData = handData.joints[jointName];
                if (!jointData) {
                    jointPositions.push(null);
                    continue;
                }

                const localPos = new THREE.Vector3(jointData.x, jointData.y, jointData.z);
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
                    updateBoneBetweenPoints(bone, jointPositions[i], jointPositions[i + 1]);
                } else if (bone) {
                    bone.visible = false;
                }
            }
        }

        // Update pinch indicator
        const pinchIndicator = handMesh.getObjectByName('pinchIndicator');
        if (pinchIndicator) {
            pinchIndicator.visible = handData.pinching === true;
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
