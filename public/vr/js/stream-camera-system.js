/**
 * Stream Camera System - VR camera placement via pinch gestures
 *
 * VR players can grab cameras from a palette and place them in the world.
 * Stream cameras are always level with the horizon (no roll), but can pitch and yaw.
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { GIANT_SCALE } from '../../pc/shared/constants.js';

// Camera mesh dimensions (VR scale)
const CAMERA_SIZE = {
    width: 0.02,   // 2cm in VR = 20cm in world
    height: 0.015, // 1.5cm in VR = 15cm in world
    depth: 0.025   // 2.5cm in VR = 25cm in world
};

// Palette position (relative to pedestal)
const PALETTE_OFFSET = {
    x: -0.15,  // Left of building palette
    y: 0.72,   // Same height as building palette
    z: 0.0
};

// Grab detection radius (smaller to allow easier handle grab)
const GRAB_RADIUS = 0.08;  // 8cm in VR space

// Rotation handle settings
const HANDLE_LENGTH = 0.15;      // 15cm in VR scale (1.5m world)
const HANDLE_RADIUS = 0.02;      // 2cm sphere at end
const HANDLE_GRAB_RADIUS = 0.05; // 5cm grab radius for handle

export class StreamCameraSystem {
    constructor(scene, hands, network) {
        this.scene = scene;
        this.hands = hands;
        this.network = network;

        // Currently grabbed camera
        this.grabbedCamera = null;
        this.grabbedHand = null;
        this.isGrabbingFromPalette = false;

        // Rotation mode state (when grabbing rotation handle)
        this.isRotating = false;
        this.rotatingCameraId = null;
        this.rotatingHand = null;

        // Track recently rotated camera to prevent server state from overwriting
        this.recentlyRotatedCameraId = null;
        this.rotationCooldownEnd = 0;

        // Track camera being moved for continuous updates
        this.movingCameraId = null;
        this.lastUpdateTime = 0;
        this.lastRotationUpdateTime = 0;

        // Placed cameras (id -> mesh)
        this.placedCameras = new Map();

        // Camera palette
        this.palette = null;
        this.paletteCamera = null;

        // Materials
        this.materials = {
            body: new THREE.MeshStandardMaterial({
                color: 0x333333,
                roughness: 0.7,
                metalness: 0.3
            }),
            lens: new THREE.MeshStandardMaterial({
                color: 0x111111,
                roughness: 0.2,
                metalness: 0.8
            }),
            ledActive: new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
            ledInactive: new THREE.MeshBasicMaterial({ color: 0x440000 }),
            ghost: new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: 0.5,
                wireframe: true
            }),
            handleLine: new THREE.LineBasicMaterial({
                color: 0x00ffff,
                linewidth: 2
            }),
            handle: new THREE.MeshBasicMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: 0.8
            }),
            handleActive: new THREE.MeshBasicMaterial({
                color: 0xffff00,
                transparent: true,
                opacity: 0.9
            })
        };

        // Limits
        this.currentCount = 0;
        this.maxCount = 5;

        // Create palette
        this.createPalette();
    }

    /**
     * Create the camera palette (template that VR player can grab)
     */
    createPalette() {
        this.palette = new THREE.Group();
        this.palette.position.set(PALETTE_OFFSET.x, PALETTE_OFFSET.y, PALETTE_OFFSET.z);

        // Background panel (larger for visibility)
        const panelGeometry = new THREE.PlaneGeometry(0.15, 0.12);
        const panelMaterial = new THREE.MeshBasicMaterial({
            color: 0x004400,  // Green tint to distinguish from building palette
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });
        const panel = new THREE.Mesh(panelGeometry, panelMaterial);
        panel.rotation.x = -Math.PI / 6;  // Tilt toward user
        this.palette.add(panel);

        // Camera template (scaled up 2x for visibility)
        this.paletteCamera = this.createCameraMesh();
        this.paletteCamera.scale.set(2, 2, 2);
        this.paletteCamera.position.set(0, 0.02, 0.02);
        this.paletteCamera.rotation.x = -Math.PI / 6;
        this.palette.add(this.paletteCamera);

        // Label (larger)
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#00ff00';  // Bright green text
        ctx.font = 'bold 32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('STREAM CAM', 128, 44);

        const labelTexture = new THREE.CanvasTexture(canvas);
        const labelMaterial = new THREE.MeshBasicMaterial({
            map: labelTexture,
            transparent: true
        });
        const labelGeometry = new THREE.PlaneGeometry(0.12, 0.03);
        const label = new THREE.Mesh(labelGeometry, labelMaterial);
        label.position.set(0, -0.04, 0.03);
        label.rotation.x = -Math.PI / 6;
        this.palette.add(label);

        // Add to scene (will be positioned by building system's pedestal)
        this.scene.add(this.palette);

        console.log(`[StreamCameraSystem] Palette created at (${PALETTE_OFFSET.x}, ${PALETTE_OFFSET.y}, ${PALETTE_OFFSET.z})`);
    }

    /**
     * Create a camera mesh
     * @param {boolean} isGhost - Whether this is a ghost/preview mesh
     * @returns {THREE.Group}
     */
    createCameraMesh(isGhost = false) {
        const group = new THREE.Group();

        // Camera body
        const bodyGeometry = new THREE.BoxGeometry(
            CAMERA_SIZE.width,
            CAMERA_SIZE.height,
            CAMERA_SIZE.depth
        );
        const body = new THREE.Mesh(
            bodyGeometry,
            isGhost ? this.materials.ghost : this.materials.body
        );
        group.add(body);

        // Lens
        const lensRadius = CAMERA_SIZE.height * 0.35;
        const lensLength = CAMERA_SIZE.depth * 0.3;
        const lensGeometry = new THREE.CylinderGeometry(
            lensRadius,
            lensRadius * 0.8,
            lensLength,
            12
        );
        const lens = new THREE.Mesh(
            lensGeometry,
            isGhost ? this.materials.ghost : this.materials.lens
        );
        lens.rotation.x = Math.PI / 2;
        lens.position.z = -CAMERA_SIZE.depth / 2 - lensLength / 2;
        group.add(lens);

        // LED indicator
        if (!isGhost) {
            const ledGeometry = new THREE.SphereGeometry(0.002, 8, 8);
            const led = new THREE.Mesh(ledGeometry, this.materials.ledActive);
            led.position.set(
                CAMERA_SIZE.width / 2 - 0.003,
                CAMERA_SIZE.height / 2 - 0.003,
                -CAMERA_SIZE.depth / 2 + 0.003
            );
            led.name = 'led';
            group.add(led);

            // Rotation handle - line extending from camera front
            const lineGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, -CAMERA_SIZE.depth / 2),
                new THREE.Vector3(0, 0, -CAMERA_SIZE.depth / 2 - HANDLE_LENGTH)
            ]);
            const line = new THREE.Line(lineGeometry, this.materials.handleLine);
            line.name = 'rotationLine';
            group.add(line);

            // Grabbable endpoint sphere
            const handleGeometry = new THREE.SphereGeometry(HANDLE_RADIUS, 8, 8);
            const handle = new THREE.Mesh(handleGeometry, this.materials.handle.clone());
            handle.position.set(0, 0, -CAMERA_SIZE.depth / 2 - HANDLE_LENGTH);
            handle.name = 'rotationHandle';
            group.add(handle);
        }

        return group;
    }

    /**
     * Handle pinch start
     * @param {string} hand - 'left' or 'right'
     * @returns {boolean} Whether this system handled the pinch
     */
    handlePinchStart(hand) {
        const pinchPoint = this.hands.getPinchPointPosition(hand);
        if (!pinchPoint) {
            this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: 'handlePinchStart: no pinchPoint, returning false' });
            return false;
        }

        // Convert to VR local space (undo giant scale)
        const pinchVR = new THREE.Vector3(
            pinchPoint.x / GIANT_SCALE,
            pinchPoint.y / GIANT_SCALE,
            pinchPoint.z / GIANT_SCALE
        );

        // Debug logging - send to server so we can see it in server console
        const paletteWorldPos = new THREE.Vector3();
        if (this.paletteCamera) {
            this.paletteCamera.getWorldPosition(paletteWorldPos);
            const dist = pinchVR.distanceTo(paletteWorldPos);
            const debugMsg = `Pinch VR(${pinchVR.x.toFixed(2)}, ${pinchVR.y.toFixed(2)}, ${pinchVR.z.toFixed(2)}), palette(${paletteWorldPos.x.toFixed(2)}, ${paletteWorldPos.y.toFixed(2)}, ${paletteWorldPos.z.toFixed(2)}), dist=${dist.toFixed(2)}, grab=${GRAB_RADIUS}`;
            console.log(`[StreamCameraSystem] ${debugMsg}`);
            // Send debug to server
            this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: debugMsg });
        }

        // Priority 1: Check rotation handle (most precise grab target)
        const handleHit = this.checkRotationHandleHit(pinchVR);
        if (handleHit) {
            this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `Hit rotation handle: ${handleHit.id}` });
            this.startRotating(handleHit.id, hand);
            return true;
        }

        // Priority 2: Check palette camera
        const paletteHit = this.checkPaletteHit(pinchVR);
        this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `checkPaletteHit returned: ${paletteHit}` });

        if (paletteHit) {
            if (this.currentCount >= this.maxCount) {
                this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `Camera limit reached: ${this.currentCount}/${this.maxCount}` });
                return false;
            }

            this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `Calling grabCameraFromPalette(${hand})` });
            this.grabCameraFromPalette(hand);
            this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `grabCameraFromPalette completed, returning true` });
            return true;
        }

        // Priority 3: Check placed camera body (for moving)
        const hitCamera = this.checkPlacedCameraHit(pinchVR);
        if (hitCamera) {
            this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `Hit placed camera body: ${hitCamera.id}` });
            this.grabPlacedCamera(hitCamera, hand);
            return true;
        }

        this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: 'No hit, returning false' });
        return false;
    }

    /**
     * Handle pinch end
     * @param {string} hand - 'left' or 'right'
     * @returns {boolean} Whether this system handled the release
     */
    handlePinchEnd(hand) {
        this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `handlePinchEnd(${hand}), grabbedCamera=${!!this.grabbedCamera}, grabbedHand=${this.grabbedHand}, isRotating=${this.isRotating}` });

        // Check rotation mode first
        if (this.isRotating && this.rotatingHand === hand) {
            this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: 'Calling stopRotating()' });
            this.stopRotating();
            return true;
        }

        // Check camera grab mode
        if (this.grabbedCamera && this.grabbedHand === hand) {
            this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: 'Calling placeCamera()' });
            this.placeCamera();
            return true;
        } else if (this.grabbedCamera) {
            // Hand mismatch - log for debugging
            this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `Hand mismatch! Released ${hand} but holding with ${this.grabbedHand}` });
        }
        return false;
    }

    /**
     * Check if pinch point is near palette camera
     * @param {THREE.Vector3} pinchVR - Pinch point in VR space
     * @returns {boolean}
     */
    checkPaletteHit(pinchVR) {
        if (!this.paletteCamera) {
            console.log('[StreamCameraSystem] checkPaletteHit: paletteCamera is null!');
            return false;
        }

        const paletteWorldPos = new THREE.Vector3();
        this.paletteCamera.getWorldPosition(paletteWorldPos);

        const distance = pinchVR.distanceTo(paletteWorldPos);
        const hit = distance < GRAB_RADIUS;

        // Debug: log the actual check result
        this.network.send({
            type: 'DEBUG_LOG',
            source: 'StreamCamera',
            message: `checkPaletteHit: dist=${distance.toFixed(3)}, radius=${GRAB_RADIUS}, hit=${hit}`
        });

        return hit;
    }

    /**
     * Check if pinch point is near any placed camera
     * @param {THREE.Vector3} pinchVR - Pinch point in VR space
     * @returns {Object|null} Camera data if hit, null otherwise
     */
    checkPlacedCameraHit(pinchVR) {
        for (const [cameraId, mesh] of this.placedCameras) {
            const cameraWorldPos = new THREE.Vector3();
            mesh.getWorldPosition(cameraWorldPos);

            // mesh.getWorldPosition() returns position in scene space (VR scale)
            // pinchVR is also in VR scale, so compare directly without conversion
            const distance = pinchVR.distanceTo(cameraWorldPos);
            if (distance < GRAB_RADIUS) {
                return { id: cameraId, mesh };
            }
        }
        return null;
    }

    /**
     * Check if pinch point is near any rotation handle
     * @param {THREE.Vector3} pinchVR - Pinch point in VR space
     * @returns {Object|null} Camera data if hit, null otherwise
     */
    checkRotationHandleHit(pinchVR) {
        for (const [cameraId, mesh] of this.placedCameras) {
            const handle = mesh.getObjectByName('rotationHandle');
            if (!handle) continue;

            // Get handle world position
            const handleWorldPos = new THREE.Vector3();
            handle.getWorldPosition(handleWorldPos);

            const distance = pinchVR.distanceTo(handleWorldPos);
            if (distance < HANDLE_GRAB_RADIUS) {
                return { id: cameraId, mesh, handle };
            }
        }
        return null;
    }

    /**
     * Grab a new camera from the palette
     * @param {string} hand
     */
    grabCameraFromPalette(hand) {
        this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `grabCameraFromPalette START, hand=${hand}` });

        this.grabbedCamera = this.createCameraMesh(true);  // Ghost mesh
        this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `Created ghost mesh: ${this.grabbedCamera ? 'success' : 'null'}` });

        this.grabbedHand = hand;
        this.isGrabbingFromPalette = true;

        this.scene.add(this.grabbedCamera);

        this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `grabCameraFromPalette COMPLETE, grabbedCamera=${!!this.grabbedCamera}, grabbedHand=${this.grabbedHand}` });
        console.log(`[StreamCameraSystem] Grabbed camera from palette with ${hand} hand`);
    }

    /**
     * Grab an existing placed camera
     * @param {Object} cameraData - { id, mesh }
     * @param {string} hand
     */
    grabPlacedCamera(cameraData, hand) {
        // Store the camera ID for continuous updates
        this.movingCameraId = cameraData.id;

        // Remove from placed cameras (local only - server still has it)
        this.scene.remove(cameraData.mesh);
        this.placedCameras.delete(cameraData.id);
        this.currentCount--;

        // Create ghost mesh for dragging
        this.grabbedCamera = this.createCameraMesh(true);
        this.grabbedCamera.position.copy(cameraData.mesh.position);
        this.grabbedCamera.rotation.copy(cameraData.mesh.rotation);
        this.grabbedHand = hand;
        this.isGrabbingFromPalette = false;
        this.grabbedCamera.userData.originalId = cameraData.id;

        this.scene.add(this.grabbedCamera);

        // Dispose old mesh
        this.disposeCameraMesh(cameraData.mesh);

        console.log(`[StreamCameraSystem] Grabbed placed camera ${cameraData.id} with ${hand} hand`);
    }

    /**
     * Start rotating a placed camera via its handle
     * @param {string} cameraId
     * @param {string} hand
     */
    startRotating(cameraId, hand) {
        this.isRotating = true;
        this.rotatingCameraId = cameraId;
        this.rotatingHand = hand;

        // Visual feedback - highlight handle
        const mesh = this.placedCameras.get(cameraId);
        const handle = mesh?.getObjectByName('rotationHandle');
        if (handle) {
            handle.material.color.setHex(0xffff00);  // Yellow when grabbed
        }

        this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `Started rotating camera ${cameraId}` });
        console.log(`[StreamCameraSystem] Started rotating camera ${cameraId}`);
    }

    /**
     * Stop rotating and save the rotation to server
     */
    stopRotating() {
        if (!this.isRotating) return;

        // Set cooldown to prevent server state from overwriting local rotation
        this.recentlyRotatedCameraId = this.rotatingCameraId;
        this.rotationCooldownEnd = Date.now() + 500; // 500ms grace period

        // Send final rotation to server
        const mesh = this.placedCameras.get(this.rotatingCameraId);
        if (mesh) {
            this.network.send({
                type: 'ADJUST_CAMERA',
                cameraId: this.rotatingCameraId,
                rotation: {
                    pitch: mesh.rotation.x,
                    yaw: mesh.rotation.y,
                    roll: 0
                }
            });

            // Reset handle color
            const handle = mesh.getObjectByName('rotationHandle');
            if (handle) {
                handle.material.color.setHex(0x00ffff);  // Back to cyan
            }
        }

        this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `Stopped rotating camera ${this.rotatingCameraId}` });
        console.log(`[StreamCameraSystem] Stopped rotating camera ${this.rotatingCameraId}`);

        this.isRotating = false;
        this.rotatingCameraId = null;
        this.rotatingHand = null;
    }

    /**
     * Send continuous position/rotation update to server (throttled to 20Hz)
     * Used when moving a placed camera
     */
    sendCameraUpdate() {
        const now = Date.now();
        if (this.lastUpdateTime && now - this.lastUpdateTime < 50) return; // 20Hz max
        this.lastUpdateTime = now;

        if (!this.grabbedCamera || !this.movingCameraId) return;

        const pos = this.grabbedCamera.position;
        const rot = this.grabbedCamera.rotation;

        this.network.send({
            type: 'UPDATE_CAMERA',
            cameraId: this.movingCameraId,
            position: {
                x: pos.x * GIANT_SCALE,
                y: pos.y * GIANT_SCALE,
                z: pos.z * GIANT_SCALE
            },
            rotation: {
                pitch: rot.x,
                yaw: rot.y,
                roll: 0
            }
        });
    }

    /**
     * Send continuous rotation update to server (throttled to 20Hz)
     * Used when rotating a camera via handle
     */
    sendRotationUpdate(yaw, pitch) {
        const now = Date.now();
        if (this.lastRotationUpdateTime && now - this.lastRotationUpdateTime < 50) return;
        this.lastRotationUpdateTime = now;

        if (!this.rotatingCameraId) return;

        this.network.send({
            type: 'UPDATE_CAMERA',
            cameraId: this.rotatingCameraId,
            rotation: {
                pitch: pitch,
                yaw: yaw,
                roll: 0
            }
        });
    }

    /**
     * Place the currently grabbed camera
     */
    placeCamera() {
        if (!this.grabbedCamera) {
            this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: 'placeCamera: no grabbedCamera!' });
            return;
        }

        try {
            // Get final position - convert from VR scale to world coordinates
            const pos = this.grabbedCamera.position;
            this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `placeCamera: raw pos (${pos.x}, ${pos.y}, ${pos.z})` });

            const position = {
                x: pos.x * GIANT_SCALE,
                y: pos.y * GIANT_SCALE,
                z: pos.z * GIANT_SCALE
            };

            // Check if we're repositioning an existing camera or placing a new one
            if (this.movingCameraId) {
                // Repositioning existing camera - send final UPDATE_CAMERA
                // Use the camera's current rotation (preserved from original placement)
                this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `placeCamera: repositioning ${this.movingCameraId}` });

                const rot = this.grabbedCamera.rotation;
                this.network.send({
                    type: 'UPDATE_CAMERA',
                    cameraId: this.movingCameraId,
                    position: position,
                    rotation: {
                        pitch: rot.x,  // Use current rotation, not hand rotation
                        yaw: rot.y,
                        roll: 0
                    }
                });

                // Clear the moving camera ID
                this.movingCameraId = null;
            } else {
                // New camera from palette - send PLACE_CAMERA
                // Calculate rotation from hand orientation for new cameras
                const rotation = this.calculateRotation();
                this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `placeCamera: sending to server pos=(${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})` });

                this.network.send({
                    type: 'PLACE_CAMERA',
                    cameraType: 'stream',
                    position: position,
                    rotation: rotation
                });
            }

            // Clean up ghost
            this.scene.remove(this.grabbedCamera);
            this.disposeCameraMesh(this.grabbedCamera);

            this.grabbedCamera = null;
            this.grabbedHand = null;
            this.isGrabbingFromPalette = false;

            this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: 'placeCamera: complete, camera placed!' });
        } catch (error) {
            this.network.send({ type: 'DEBUG_LOG', source: 'StreamCamera', message: `placeCamera ERROR: ${error.message}` });
            // Still try to clean up to prevent repeated calls
            this.grabbedCamera = null;
            this.grabbedHand = null;
            this.isGrabbingFromPalette = false;
            this.movingCameraId = null;
        }
    }

    /**
     * Calculate camera rotation from hand orientation
     * Stream cameras have no roll (always level with horizon)
     * @returns {Object} {pitch, yaw, roll}
     */
    calculateRotation() {
        if (!this.grabbedHand) {
            return { pitch: 0, yaw: 0, roll: 0 };
        }

        // Get hand rotation from hands system
        const handRotation = this.hands.getHandRotation(this.grabbedHand);
        if (!handRotation) {
            return { pitch: 0, yaw: 0, roll: 0 };
        }

        // Extract pitch and yaw from hand rotation, force roll to 0
        // The camera should point in the direction the palm is facing
        const euler = new THREE.Euler().setFromQuaternion(
            new THREE.Quaternion(
                handRotation.x,
                handRotation.y,
                handRotation.z,
                handRotation.w
            ),
            'YXZ'
        );

        return {
            pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x)),
            yaw: euler.y,
            roll: 0  // Always level
        };
    }

    /**
     * Update - called each frame
     */
    update() {
        // Handle rotation mode (grabbing rotation handle)
        if (this.isRotating && this.rotatingCameraId) {
            const pinchPoint = this.hands.getPinchPointPosition(this.rotatingHand);
            if (!pinchPoint) return;

            const mesh = this.placedCameras.get(this.rotatingCameraId);
            if (!mesh) return;

            // Calculate direction from camera to pinch point
            // Both need to be in the same coordinate space (VR scale)
            const cameraPos = mesh.position.clone();
            const pinchVR = new THREE.Vector3(
                pinchPoint.x / GIANT_SCALE,
                pinchPoint.y / GIANT_SCALE,
                pinchPoint.z / GIANT_SCALE
            );

            // Direction vector from camera to hand
            const direction = pinchVR.clone().sub(cameraPos).normalize();

            // Calculate yaw (horizontal angle) and pitch (vertical angle)
            // Camera looks in -Z direction, so we use atan2(-x, -z) for yaw
            const yaw = Math.atan2(-direction.x, -direction.z);
            // Positive direction.y (hand above) = positive pitch (look up)
            const pitch = Math.asin(Math.max(-1, Math.min(1, direction.y)));

            // Clamp pitch to ±90°
            const clampedPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));

            // Apply rotation (level with horizon - no roll)
            mesh.rotation.order = 'YXZ';
            mesh.rotation.y = yaw;
            mesh.rotation.x = clampedPitch;
            mesh.rotation.z = 0;

            // Send continuous rotation update to server for live viewer updates
            this.sendRotationUpdate(yaw, clampedPitch);

            return;
        }

        // Handle camera body movement (grabbing camera body)
        if (!this.grabbedCamera || !this.grabbedHand) return;

        // Move grabbed camera to follow hand
        const pinchPoint = this.hands.getPinchPointPosition(this.grabbedHand);
        if (pinchPoint) {
            // Position needs to be in VR scale, not world scale
            // pinchPoint is in world coordinates (scaled by GIANT_SCALE)
            // But the scene is in VR scale, so we need to divide
            this.grabbedCamera.position.set(
                pinchPoint.x / GIANT_SCALE,
                pinchPoint.y / GIANT_SCALE,
                pinchPoint.z / GIANT_SCALE
            );

            // Only update rotation for new cameras from palette
            // Repositioned cameras keep their original rotation
            if (this.isGrabbingFromPalette) {
                const rotation = this.calculateRotation();
                this.grabbedCamera.rotation.order = 'YXZ';
                this.grabbedCamera.rotation.y = rotation.yaw;
                this.grabbedCamera.rotation.x = rotation.pitch;
                this.grabbedCamera.rotation.z = 0;  // No roll
            }

            // Send continuous updates if moving an existing camera (not new from palette)
            if (this.movingCameraId && !this.isGrabbingFromPalette) {
                this.sendCameraUpdate();
            }
        }
    }

    /**
     * Handle camera placed confirmation from server
     * @param {Object} camera - Camera data from server
     */
    onCameraPlaced(camera) {
        if (camera.type !== 'stream') return;

        // Create mesh for placed camera
        const mesh = this.createCameraMesh(false);

        // Server sends world coordinates, convert to VR scale for display
        mesh.position.set(
            camera.position.x / GIANT_SCALE,
            camera.position.y / GIANT_SCALE,
            camera.position.z / GIANT_SCALE
        );
        mesh.rotation.order = 'YXZ';
        mesh.rotation.y = camera.rotation.yaw || 0;
        mesh.rotation.x = camera.rotation.pitch || 0;
        mesh.rotation.z = 0;  // No roll

        mesh.userData.cameraId = camera.id;

        this.placedCameras.set(camera.id, mesh);
        this.scene.add(mesh);
        this.currentCount++;

        console.log(`[StreamCameraSystem] Camera placed: ${camera.id} at VR pos (${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)})`);
    }

    /**
     * Handle camera removed
     * @param {string} cameraId
     */
    onCameraRemoved(cameraId) {
        const mesh = this.placedCameras.get(cameraId);
        if (mesh) {
            this.scene.remove(mesh);
            this.disposeCameraMesh(mesh);
            this.placedCameras.delete(cameraId);
            this.currentCount--;

            console.log(`[StreamCameraSystem] Camera removed: ${cameraId}`);
        }
    }

    /**
     * Update camera limits
     * @param {Object} limits - { security, stream }
     */
    updateLimits(limits) {
        if (limits.stream !== undefined) {
            this.maxCount = limits.stream;
        }
    }

    /**
     * Update cameras from state update
     * @param {Array} cameras - Array of camera data from server
     */
    updateFromState(cameras) {
        const streamCameras = cameras.filter(c => c.type === 'stream');
        const serverIds = new Set(streamCameras.map(c => c.id));

        // Remove cameras no longer on server
        for (const [cameraId, mesh] of this.placedCameras) {
            if (!serverIds.has(cameraId)) {
                this.scene.remove(mesh);
                this.disposeCameraMesh(mesh);
                this.placedCameras.delete(cameraId);
            }
        }

        // Add/update cameras from server
        for (const camera of streamCameras) {
            // Skip cameras that are currently being moved locally
            if (camera.id === this.movingCameraId) {
                continue;
            }

            if (!this.placedCameras.has(camera.id)) {
                this.onCameraPlaced(camera);
            } else {
                // Update position/rotation (convert from world to VR scale)
                const mesh = this.placedCameras.get(camera.id);
                mesh.position.set(
                    camera.position.x / GIANT_SCALE,
                    camera.position.y / GIANT_SCALE,
                    camera.position.z / GIANT_SCALE
                );

                // Skip rotation update if this camera was recently rotated locally
                // This prevents server state from overwriting before ADJUST_CAMERA is processed
                const isInCooldown = camera.id === this.recentlyRotatedCameraId &&
                                     Date.now() < this.rotationCooldownEnd;
                if (!isInCooldown) {
                    mesh.rotation.y = camera.rotation.yaw || 0;
                    mesh.rotation.x = camera.rotation.pitch || 0;
                }
            }
        }

        this.currentCount = this.placedCameras.size;
    }

    /**
     * Set palette position (called when pedestal position is known)
     * @param {THREE.Vector3} pedestalPosition
     */
    setPalettePosition(pedestalPosition) {
        if (this.palette) {
            this.palette.position.set(
                pedestalPosition.x + PALETTE_OFFSET.x,
                pedestalPosition.y + PALETTE_OFFSET.y,
                pedestalPosition.z + PALETTE_OFFSET.z
            );
        }
    }

    /**
     * Dispose a camera mesh
     * @param {THREE.Group} mesh
     */
    disposeCameraMesh(mesh) {
        if (!mesh) return;

        mesh.traverse((child) => {
            if (child.geometry) {
                child.geometry.dispose();
            }
        });
    }

    /**
     * Dispose all resources
     */
    dispose() {
        // Dispose grabbed camera
        if (this.grabbedCamera) {
            this.scene.remove(this.grabbedCamera);
            this.disposeCameraMesh(this.grabbedCamera);
            this.grabbedCamera = null;
        }

        // Dispose placed cameras
        for (const [, mesh] of this.placedCameras) {
            this.scene.remove(mesh);
            this.disposeCameraMesh(mesh);
        }
        this.placedCameras.clear();

        // Dispose palette
        if (this.palette) {
            this.scene.remove(this.palette);
            this.palette.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });
            this.palette = null;
        }

        // Dispose shared materials
        Object.values(this.materials).forEach(material => {
            if (material && material.dispose) {
                material.dispose();
            }
        });

        console.log('[StreamCameraSystem] Disposed');
    }
}
