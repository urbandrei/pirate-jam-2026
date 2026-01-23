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
import { GIANT_SCALE, ITEMS } from '../shared/constants.js';
import { createPCPlayerMesh, createVRPlayerMeshForPC, FINGER_JOINTS, updateBoneBetweenPoints } from '../shared/player-mesh.js';
import { SpeechBubble } from './speech-bubble.js';
import { PlayerNameLabel } from './player-label.js';

export class RemotePlayers {
    constructor(scene) {
        this.scene = scene;
        this.players = new Map(); // playerId -> { mesh, type, data }
        this.speechBubbles = new Map(); // playerId -> SpeechBubble
        this.nameLabels = new Map(); // playerId -> PlayerNameLabel
        this.camera = null; // Set by main.js for billboard facing
    }

    /**
     * Set the camera reference for billboard speech bubbles
     * @param {THREE.Camera} camera
     */
    setCamera(camera) {
        this.camera = camera;
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

            // Skip dead/waiting players - they should be invisible (in local waiting room)
            // Server already filters these out, but this is defensive
            if (playerData.playerState === 'dead' || playerData.playerState === 'waiting') {
                // Remove mesh if it exists (player just died)
                if (this.players.has(playerId)) {
                    const data = this.players.get(playerId);
                    this.scene.remove(data.mesh);
                    // Dispose held item mesh if any
                    if (data.heldItemMesh) {
                        this.scene.remove(data.heldItemMesh);
                        if (data.heldItemMesh.geometry) data.heldItemMesh.geometry.dispose();
                        if (data.heldItemMesh.material) data.heldItemMesh.material.dispose();
                    }
                    this.players.delete(playerId);
                }
                continue;
            }

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
                    targetRotation: 0,
                    heldItemMesh: null,
                    lastHeldItemKey: null
                };
                this.players.set(playerId, playerObj);

                // Create name label for new player
                const displayName = playerData.displayName || 'Player';
                const nameLabel = new PlayerNameLabel(this.scene, displayName);
                this.nameLabels.set(playerId, nameLabel);
            }

            // Update name label if player's display name changed
            const nameLabel = this.nameLabels.get(playerId);
            if (nameLabel && playerData.displayName) {
                nameLabel.setName(playerData.displayName);
            }

            // Update target position for interpolation (reuse existing object)
            playerObj.targetPosition.x = playerData.position.x;
            playerObj.targetPosition.y = playerData.position.y;
            playerObj.targetPosition.z = playerData.position.z;

            if (playerData.type === 'vr') {
                this.updateVRPlayer(playerObj, playerData);
            } else {
                this.updatePCPlayer(playerObj, playerData);
            }
        }
    }

    updatePCPlayer(playerObj, data) {
        const mesh = playerObj.mesh;

        // Track sleeping state for pose changes
        const wasSleeping = playerObj.isSleeping || false;
        const isSleeping = data.playerState === 'sleeping';
        playerObj.isSleeping = isSleeping;

        // Skip interpolation when grabbed - follow hand position immediately
        if (data.isGrabbed) {
            mesh.position.set(
                playerObj.targetPosition.x,
                playerObj.targetPosition.y,
                playerObj.targetPosition.z
            );
        } else {
            // Lerp requires a Vector3, so set target then lerp back
            const tx = playerObj.targetPosition.x;
            const ty = playerObj.targetPosition.y;
            const tz = playerObj.targetPosition.z;
            mesh.position.x += (tx - mesh.position.x) * 0.3;
            mesh.position.y += (ty - mesh.position.y) * 0.3;
            mesh.position.z += (tz - mesh.position.z) * 0.3;
        }

        // Handle sleeping pose
        if (isSleeping && !wasSleeping) {
            // Transition to sleeping: lie down on the bed
            // Player capsule is vertical (Y-up). To lie on back:
            // - Rotate X by +90° to tilt backward (face up, head toward -Z where pillow is)
            mesh.rotation.x = Math.PI / 2;
            mesh.rotation.y = 0;
            mesh.rotation.z = 0;
        } else if (!isSleeping && wasSleeping) {
            // Transition from sleeping: stand up
            mesh.rotation.x = 0;
            mesh.rotation.z = 0;
        }

        // Update rotation based on look direction (only when not sleeping)
        if (data.lookRotation && !isSleeping) {
            mesh.rotation.y = data.lookRotation.y;
        }

        // Update held item display (hide when sleeping)
        if (isSleeping) {
            this.updateRemoteHeldItem(playerObj, null);
        } else {
            this.updateRemoteHeldItem(playerObj, data.heldItem);
        }
    }

    /**
     * Update held item display for a remote player
     * @param {Object} playerObj - Player object from this.players
     * @param {Object|null} heldItem - Held item data from server
     */
    updateRemoteHeldItem(playerObj, heldItem) {
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
            playerObj.heldItemMesh = this.createRemoteHeldItemMesh(heldItem);
            // Position in front of player, at hand height
            // Negative Z is forward in Three.js when player rotates with lookRotation.y
            playerObj.heldItemMesh.position.set(0, 0.3, -0.4);
            playerObj.mesh.add(playerObj.heldItemMesh);
        }
    }

    /**
     * Create a mesh for a remote player's held item
     * @param {Object} item - Item data
     * @returns {THREE.Mesh}
     */
    createRemoteHeldItemMesh(item) {
        // Get item definition for color
        const itemDef = ITEMS[item.type];

        // Size based on stack count
        const baseSize = 0.3;
        const stackCount = item.stackCount || 1;
        const stackBonus = stackCount > 1 ? Math.min((stackCount - 1) * 0.04, 0.15) : 0;
        const size = baseSize + stackBonus;

        const geometry = new THREE.BoxGeometry(size, size, size);

        // Use item definition color, fall back to item.color or default yellow
        const color = itemDef ? itemDef.color : (item.color || 0xffff00);

        const material = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.5,
            metalness: 0.1
        });

        return new THREE.Mesh(geometry, material);
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
            // Clean up held item mesh
            if (playerObj.heldItemMesh) {
                playerObj.mesh.remove(playerObj.heldItemMesh);
                if (playerObj.heldItemMesh.geometry) playerObj.heldItemMesh.geometry.dispose();
                if (playerObj.heldItemMesh.material) playerObj.heldItemMesh.material.dispose();
            }
            this.scene.remove(playerObj.mesh);
            this.players.delete(playerId);
        }

        // Clean up speech bubble
        const bubble = this.speechBubbles.get(playerId);
        if (bubble) {
            bubble.dispose();
            this.speechBubbles.delete(playerId);
        }

        // Clean up name label
        const label = this.nameLabels.get(playerId);
        if (label) {
            label.dispose();
            this.nameLabels.delete(playerId);
        }
    }

    /**
     * Show a speech bubble above a player
     * @param {string} playerId - ID of the player
     * @param {string} text - Message text to display
     */
    showSpeechBubble(playerId, text) {
        let bubble = this.speechBubbles.get(playerId);

        // Create bubble if it doesn't exist
        if (!bubble) {
            bubble = new SpeechBubble(this.scene);
            this.speechBubbles.set(playerId, bubble);
        }

        // Show the message
        bubble.show(text);

        // Position immediately if we have the player
        const playerObj = this.players.get(playerId);
        if (playerObj) {
            const pos = playerObj.mesh.position;
            // Position above player head (mesh center at 0.9m + 1.5m = 2.4m above ground)
            bubble.setPosition(pos.x, pos.y + 1.5, pos.z);
        }
    }

    /**
     * Update speech bubbles and name labels (call each frame for animations and positioning)
     * @param {number} deltaTime - Time since last frame in seconds
     */
    update(deltaTime) {
        // Update each speech bubble
        for (const [playerId, bubble] of this.speechBubbles) {
            // Update fade animation
            bubble.update(deltaTime);

            // Update position to follow player
            const playerObj = this.players.get(playerId);
            if (playerObj && bubble.isVisible) {
                const pos = playerObj.mesh.position;
                bubble.setPosition(pos.x, pos.y + 1.5, pos.z);
            }
        }

        // Update name label positions
        for (const [playerId, label] of this.nameLabels) {
            const playerObj = this.players.get(playerId);
            if (playerObj) {
                const pos = playerObj.mesh.position;
                // Position name label above player head (mesh center at 0.9m + 1.1m = 2.0m above ground)
                label.setPosition(pos.x, pos.y + 1.1, pos.z);
            }
        }
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        // Clean up all players
        for (const [playerId] of this.players) {
            this.removePlayer(playerId);
        }

        // Clean up any remaining speech bubbles
        for (const [playerId, bubble] of this.speechBubbles) {
            bubble.dispose();
        }
        this.speechBubbles.clear();

        // Clean up any remaining name labels
        for (const [playerId, label] of this.nameLabels) {
            label.dispose();
        }
        this.nameLabels.clear();
    }
}
