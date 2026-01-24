/**
 * Camera Placement System - Wall-mounted security camera placement
 *
 * Handles wall detection via raycast, translucent preview mesh,
 * picture-in-picture camera view preview, and placement confirmation.
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { PLAYER_HEIGHT, CAMERA_DEFAULTS } from '../shared/constants.js';
import * as CameraRenderer from './camera-renderer.js';

export class CameraPlacementSystem {
    constructor(scene, camera, getWalls, renderer = null) {
        this.scene = scene;
        this.camera = camera;
        this.getWalls = getWalls;  // Function that returns current walls array
        this.renderer = renderer;  // WebGL renderer for preview

        // Constants
        this.MOUNT_HEIGHT = PLAYER_HEIGHT * 1.5;  // ~2.7m
        this.MAX_RANGE = PLAYER_HEIGHT * 3;       // ~5.4m
        this.WALL_OFFSET = 0.15;                  // Offset from wall surface

        // State
        this.isActive = false;
        this.previewMesh = null;
        this.validPlacement = false;
        this.placementPosition = new THREE.Vector3();
        this.placementRotation = { pitch: 0, yaw: 0, roll: 0 };
        this.wallNormal = new THREE.Vector3();

        // Raycaster for wall detection
        this.raycaster = new THREE.Raycaster();

        // Callbacks
        this.onPlaced = null;   // (position, rotation) => void
        this.onCancel = null;   // () => void

        // External references for preview rendering
        this.getPlayerMesh = null;     // () => THREE.Group
        this.getPlayerPosition = null; // () => {x, y, z}

        // Preview camera for picture-in-picture
        this.previewCamera = new THREE.PerspectiveCamera(
            CAMERA_DEFAULTS?.FOV || 60,
            16 / 9,
            0.1,
            1000
        );

        // Enable preview camera to see both layer 0 (world) and layer 1 (player mesh)
        this.previewCamera.layers.enable(0);
        this.previewCamera.layers.enable(1);

        // Render target for preview
        this.previewRenderTarget = null;
        this.previewOverlay = null;
        this.previewCanvas = null;

        // Player mesh visibility state
        this._playerMeshWasInScene = false;

        // Bind ESC handler
        this._onKeyDown = this._handleKeyDown.bind(this);
    }

    _handleKeyDown(event) {
        if (event.code === 'Escape' && this.isActive) {
            event.preventDefault();
            this.deactivate();
            if (this.onCancel) this.onCancel();
        }
    }

    activate() {
        if (this.isActive) return;

        this.isActive = true;
        this._createPreviewMesh();
        this._createPreviewOverlay();
        this._showPlayerMesh();
        document.addEventListener('keydown', this._onKeyDown);

        const walls = this.getWalls();
        console.log(`[CameraPlacement] Activated - look at a wall to place camera (${walls?.length || 0} walls available)`);
    }

    deactivate() {
        if (!this.isActive) return;

        this.isActive = false;
        this._removePreviewMesh();
        this._removePreviewOverlay();
        this._hidePlayerMesh();
        document.removeEventListener('keydown', this._onKeyDown);

        console.log('[CameraPlacement] Deactivated');
    }

    _createPreviewMesh() {
        const mesh = CameraRenderer.createCameraMesh({
            id: 'preview',
            type: 'security',
            position: { x: 0, y: 0, z: 0 },
            rotation: { pitch: 0, yaw: 0, roll: 0 }
        });

        // Make translucent
        mesh.traverse(child => {
            if (child.material) {
                child.material = child.material.clone();
                child.material.transparent = true;
                child.material.opacity = 0.5;
            }
        });

        mesh.visible = false;
        this.scene.add(mesh);
        this.previewMesh = mesh;
    }

    _removePreviewMesh() {
        if (this.previewMesh) {
            this.scene.remove(this.previewMesh);
            CameraRenderer.disposeCameraMesh(this.previewMesh);
            this.previewMesh = null;
        }
    }

    /**
     * Update preview position based on current view direction
     * Call this every frame while placement is active
     */
    update() {
        if (!this.isActive || !this.previewMesh) return;

        // Update player mesh position
        this._updatePlayerMeshPosition();

        // Raycast from camera center
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const walls = this.getWalls();
        if (!walls || walls.length === 0) {
            this.validPlacement = false;
            this.previewMesh.visible = false;
            this._hidePreviewOverlay();
            return;
        }
        const intersects = this.raycaster.intersectObjects(walls, false);

        if (intersects.length > 0) {
            const hit = intersects[0];

            // Check range
            if (hit.distance > this.MAX_RANGE) {
                this.validPlacement = false;
                this.previewMesh.visible = false;
                this._hidePreviewOverlay();
                return;
            }

            // Check if wall is vertical (normal.y close to 0)
            const normal = hit.face.normal.clone();
            normal.transformDirection(hit.object.matrixWorld);

            if (Math.abs(normal.y) > 0.3) {
                // Not vertical enough (ceiling/floor)
                this.validPlacement = false;
                this.previewMesh.visible = false;
                this._hidePreviewOverlay();
                return;
            }

            // Calculate camera position at mount height
            this.wallNormal.copy(normal);
            this.placementPosition.set(
                hit.point.x + normal.x * this.WALL_OFFSET,
                this.MOUNT_HEIGHT,
                hit.point.z + normal.z * this.WALL_OFFSET
            );

            // Camera faces opposite direction of wall normal (into room)
            this.placementRotation.yaw = Math.atan2(-normal.x, -normal.z);
            this.placementRotation.pitch = 0;
            this.placementRotation.roll = 0;

            // Update preview mesh
            this.previewMesh.position.copy(this.placementPosition);
            this.previewMesh.rotation.order = 'YXZ';
            this.previewMesh.rotation.y = this.placementRotation.yaw;
            this.previewMesh.visible = true;
            this.validPlacement = true;

            // Update and render the picture-in-picture preview
            this._updatePreviewCamera();
            this._renderPreview();
            this._showPreviewOverlay();
        } else {
            this.validPlacement = false;
            this.previewMesh.visible = false;
            this._hidePreviewOverlay();
        }
    }

    /**
     * Confirm placement at current preview position
     * @returns {boolean} True if placement was successful
     */
    confirmPlacement() {
        if (!this.validPlacement) return false;

        if (this.onPlaced) {
            this.onPlaced(
                {
                    x: this.placementPosition.x,
                    y: this.placementPosition.y,
                    z: this.placementPosition.z
                },
                { ...this.placementRotation }
            );
        }

        this.deactivate();
        return true;
    }

    /**
     * Check if placement system is active
     * @returns {boolean}
     */
    isPlacementActive() {
        return this.isActive;
    }

    /**
     * Dispose resources
     */
    dispose() {
        this.deactivate();
        if (this.previewRenderTarget) {
            this.previewRenderTarget.dispose();
            this.previewRenderTarget = null;
        }
    }

    // ==================== Preview Overlay Methods ====================

    _createPreviewOverlay() {
        if (!this.renderer) return;

        // Create render target for preview
        this.previewRenderTarget = new THREE.WebGLRenderTarget(320, 180, {
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter
        });

        // Create overlay container
        this.previewOverlay = document.createElement('div');
        this.previewOverlay.id = 'camera-preview-overlay';
        this.previewOverlay.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 320px;
            height: 180px;
            border: 3px solid #00ff00;
            border-radius: 4px;
            background: #000;
            z-index: 100;
            display: none;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
        `;

        // Create canvas for displaying the preview
        this.previewCanvas = document.createElement('canvas');
        this.previewCanvas.width = 320;
        this.previewCanvas.height = 180;
        this.previewCanvas.style.cssText = 'width: 100%; height: 100%;';
        this.previewOverlay.appendChild(this.previewCanvas);

        // Add label
        const label = document.createElement('div');
        label.style.cssText = `
            position: absolute;
            top: -24px;
            left: 0;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            padding: 2px 8px;
            font-family: monospace;
            font-size: 12px;
            border-radius: 2px;
        `;
        label.textContent = 'CAMERA PREVIEW';
        this.previewOverlay.appendChild(label);

        document.body.appendChild(this.previewOverlay);
    }

    _removePreviewOverlay() {
        if (this.previewOverlay && this.previewOverlay.parentNode) {
            this.previewOverlay.parentNode.removeChild(this.previewOverlay);
        }
        this.previewOverlay = null;
        this.previewCanvas = null;

        if (this.previewRenderTarget) {
            this.previewRenderTarget.dispose();
            this.previewRenderTarget = null;
        }
    }

    _showPreviewOverlay() {
        if (this.previewOverlay) {
            this.previewOverlay.style.display = 'block';
        }
    }

    _hidePreviewOverlay() {
        if (this.previewOverlay) {
            this.previewOverlay.style.display = 'none';
        }
    }

    _updatePreviewCamera() {
        // Position preview camera at placement position
        this.previewCamera.position.copy(this.placementPosition);

        // Apply rotation
        this.previewCamera.rotation.order = 'YXZ';
        this.previewCamera.rotation.y = this.placementRotation.yaw;
        this.previewCamera.rotation.x = this.placementRotation.pitch;
        this.previewCamera.rotation.z = this.placementRotation.roll;
    }

    _renderPreview() {
        if (!this.renderer || !this.previewRenderTarget || !this.previewCanvas) return;

        // Save current render target
        const currentTarget = this.renderer.getRenderTarget();

        // Hide the preview mesh so it doesn't appear in its own view
        const previewWasVisible = this.previewMesh?.visible;
        if (this.previewMesh) this.previewMesh.visible = false;

        // Render to our target
        this.renderer.setRenderTarget(this.previewRenderTarget);
        this.renderer.render(this.scene, this.previewCamera);

        // Restore preview mesh visibility
        if (this.previewMesh) this.previewMesh.visible = previewWasVisible;

        // Restore original target
        this.renderer.setRenderTarget(currentTarget);

        // Copy to canvas for display
        const ctx = this.previewCanvas.getContext('2d');
        if (ctx) {
            // Read pixels from render target
            const pixels = new Uint8Array(320 * 180 * 4);
            this.renderer.readRenderTargetPixels(
                this.previewRenderTarget,
                0, 0, 320, 180,
                pixels
            );

            // Create ImageData and flip vertically (WebGL is upside down)
            const imageData = ctx.createImageData(320, 180);
            for (let y = 0; y < 180; y++) {
                for (let x = 0; x < 320; x++) {
                    const srcIdx = ((179 - y) * 320 + x) * 4;
                    const dstIdx = (y * 320 + x) * 4;
                    imageData.data[dstIdx] = pixels[srcIdx];
                    imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
                    imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
                    imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
                }
            }
            ctx.putImageData(imageData, 0, 0);
        }
    }

    // ==================== Player Mesh Methods ====================

    _showPlayerMesh() {
        if (!this.getPlayerMesh) return;

        const playerMesh = this.getPlayerMesh();
        if (!playerMesh) return;

        // Check if already in scene
        this._playerMeshWasInScene = playerMesh.parent === this.scene;

        if (!this._playerMeshWasInScene) {
            this.scene.add(playerMesh);
        }

        this._updatePlayerMeshPosition();
    }

    _hidePlayerMesh() {
        if (!this.getPlayerMesh) return;

        const playerMesh = this.getPlayerMesh();
        if (!playerMesh) return;

        // Only remove if we added it
        if (!this._playerMeshWasInScene && playerMesh.parent === this.scene) {
            this.scene.remove(playerMesh);
        }
    }

    _updatePlayerMeshPosition() {
        if (!this.getPlayerMesh || !this.getPlayerPosition) return;

        const playerMesh = this.getPlayerMesh();
        const playerPos = this.getPlayerPosition();
        if (!playerMesh || !playerPos) return;

        playerMesh.position.set(playerPos.x, playerPos.y, playerPos.z);
    }
}
