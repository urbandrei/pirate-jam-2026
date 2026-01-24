/**
 * Camera Feed System - Render-to-texture for in-game monitors
 *
 * Renders scene from camera perspectives to WebGLRenderTarget textures.
 * Used exclusively for in-game security room monitors (no JPEG streaming).
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { CAMERA_DEFAULTS, CAMERA_QUALITY_PRESETS } from '../shared/constants.js';

export class CameraFeedSystem {
    constructor(renderer, scene, getCameraMeshes = null) {
        this.renderer = renderer;
        this.scene = scene;
        this.getCameraMeshes = getCameraMeshes;  // Optional getter for camera meshes (for hiding during render)

        // Map of cameraId -> WebGLRenderTarget
        this.renderTargets = new Map();

        // Map of cameraId -> THREE.PerspectiveCamera
        this.feedCameras = new Map();

        // Resolution (configurable)
        this.resolution = { ...CAMERA_DEFAULTS.RESOLUTION };

        // Track last render time for throttling
        this.lastRenderTime = 0;
        this.minRenderInterval = 1000 / CAMERA_DEFAULTS.RENDER_RATE;  // ~66ms for 15fps

        // Callbacks for player visibility during rendering
        this.getLocalPlayerMesh = null;      // () => THREE.Group
        this.getLocalPlayerPosition = null;  // () => {x, y, z}
        this.getRemotePlayers = null;        // () => RemotePlayers instance
        this.getCameraData = null;           // (cameraId) => camera data with ownerId
    }

    /**
     * Create a feed for a camera
     * @param {string} cameraId - Camera ID
     * @param {Object} position - Camera position {x, y, z}
     * @param {Object} rotation - Camera rotation {pitch, yaw, roll}
     */
    createFeed(cameraId, position, rotation) {
        // Don't create duplicate feeds
        if (this.renderTargets.has(cameraId)) {
            this.updateFeedPosition(cameraId, position, rotation);
            return;
        }

        // Create render target
        const renderTarget = new THREE.WebGLRenderTarget(
            this.resolution.width,
            this.resolution.height,
            {
                format: THREE.RGBAFormat,
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter
            }
        );

        // Create camera for this feed
        const camera = new THREE.PerspectiveCamera(
            CAMERA_DEFAULTS.FOV,
            this.resolution.width / this.resolution.height,
            0.1,
            1000
        );

        // Enable feed camera to see both layer 0 (world) and layer 1 (player mesh)
        camera.layers.enable(0);
        camera.layers.enable(1);

        // Set position and rotation
        camera.position.set(position.x, position.y, position.z);
        camera.rotation.order = 'YXZ';
        camera.rotation.y = rotation.yaw || 0;
        camera.rotation.x = rotation.pitch || 0;
        camera.rotation.z = rotation.roll || 0;

        this.renderTargets.set(cameraId, renderTarget);
        this.feedCameras.set(cameraId, camera);

        console.log(`[CameraFeedSystem] Created feed for camera: ${cameraId}`);
    }

    /**
     * Update feed camera position and rotation
     * @param {string} cameraId - Camera ID
     * @param {Object} position - New position {x, y, z}
     * @param {Object} rotation - New rotation {pitch, yaw, roll}
     */
    updateFeedPosition(cameraId, position, rotation) {
        const camera = this.feedCameras.get(cameraId);
        if (!camera) return;

        camera.position.set(position.x, position.y, position.z);
        camera.rotation.y = rotation.yaw || 0;
        camera.rotation.x = rotation.pitch || 0;
        camera.rotation.z = rotation.roll || 0;
    }

    /**
     * Render all camera feeds to their render targets (throttled at 15fps)
     * @param {boolean} force - Skip throttle check
     */
    renderAllFeeds(force = false) {
        // Throttle rendering
        const now = performance.now();
        if (!force && now - this.lastRenderTime < this.minRenderInterval) {
            return;
        }
        this.lastRenderTime = now;

        // Save current render target
        const currentTarget = this.renderer.getRenderTarget();

        // Get camera meshes map (if available)
        const cameraMeshes = this.getCameraMeshes ? this.getCameraMeshes() : null;

        // Add local player mesh to scene so cameras can see the player
        let localPlayerMesh = null;
        let localPlayerWasInScene = false;
        if (this.getLocalPlayerMesh) {
            localPlayerMesh = this.getLocalPlayerMesh();
            if (localPlayerMesh) {
                localPlayerWasInScene = localPlayerMesh.parent === this.scene;
                if (!localPlayerWasInScene) {
                    this.scene.add(localPlayerMesh);
                }
                // Update position
                if (this.getLocalPlayerPosition) {
                    const pos = this.getLocalPlayerPosition();
                    if (pos) {
                        localPlayerMesh.position.set(pos.x, pos.y, pos.z);
                    }
                }
            }
        }

        // Get remote players for hiding carriers
        const remotePlayers = this.getRemotePlayers ? this.getRemotePlayers() : null;

        // Render each camera feed
        for (const [cameraId, renderTarget] of this.renderTargets) {
            const camera = this.feedCameras.get(cameraId);
            if (!camera) continue;

            // Hide this camera's mesh before rendering its feed (camera can't see itself)
            let cameraMesh = null;
            let wasVisible = false;
            if (cameraMeshes) {
                cameraMesh = cameraMeshes.get(cameraId);
                if (cameraMesh) {
                    wasVisible = cameraMesh.visible;
                    cameraMesh.visible = false;
                }
            }

            // Check if this camera is being held - if so, hide the carrier
            let carrierId = null;
            let carrierVisibility = null;
            if (this.getCameraData) {
                const cameraData = this.getCameraData(cameraId);
                if (cameraData && cameraData.ownerId && cameraData.ownerId.startsWith('held_')) {
                    carrierId = cameraData.ownerId.replace('held_', '');
                    carrierVisibility = this._hidePlayer(remotePlayers, carrierId);
                }
            }

            this.renderer.setRenderTarget(renderTarget);
            this.renderer.render(this.scene, camera);

            // Restore carrier visibility
            if (carrierId && carrierVisibility) {
                this._restorePlayer(remotePlayers, carrierId, carrierVisibility);
            }

            // Restore camera mesh visibility
            if (cameraMesh) {
                cameraMesh.visible = wasVisible;
            }
        }

        // Remove local player mesh if we added it
        if (localPlayerMesh && !localPlayerWasInScene) {
            this.scene.remove(localPlayerMesh);
        }

        // Restore original target
        this.renderer.setRenderTarget(currentTarget);
    }

    /**
     * Hide a remote player's mesh, held item, and name label
     * @param {RemotePlayers} remotePlayers - RemotePlayers instance
     * @param {string} playerId - Player ID to hide
     * @returns {Object|null} Visibility state to restore later
     */
    _hidePlayer(remotePlayers, playerId) {
        if (!remotePlayers) return null;

        const playerData = remotePlayers.players.get(playerId);
        const nameLabel = remotePlayers.nameLabels.get(playerId);

        if (!playerData) return null;

        const state = {
            meshVisible: playerData.mesh.visible,
            heldItemVisible: playerData.heldItemMesh ? playerData.heldItemMesh.visible : false,
            nameLabelVisible: nameLabel && nameLabel.sprite ? nameLabel.sprite.visible : false
        };

        // Hide everything
        playerData.mesh.visible = false;
        if (playerData.heldItemMesh) {
            playerData.heldItemMesh.visible = false;
        }
        if (nameLabel && nameLabel.sprite) {
            nameLabel.sprite.visible = false;
        }

        return state;
    }

    /**
     * Restore a remote player's visibility state
     * @param {RemotePlayers} remotePlayers - RemotePlayers instance
     * @param {string} playerId - Player ID to restore
     * @param {Object} state - Visibility state from _hidePlayer
     */
    _restorePlayer(remotePlayers, playerId, state) {
        if (!remotePlayers || !state) return;

        const playerData = remotePlayers.players.get(playerId);
        const nameLabel = remotePlayers.nameLabels.get(playerId);

        if (!playerData) return;

        playerData.mesh.visible = state.meshVisible;
        if (playerData.heldItemMesh) {
            playerData.heldItemMesh.visible = state.heldItemVisible;
        }
        if (nameLabel && nameLabel.sprite) {
            nameLabel.sprite.visible = state.nameLabelVisible;
        }
    }

    /**
     * Get the texture from a camera feed (for displaying on monitors)
     * @param {string} cameraId - Camera ID
     * @returns {THREE.Texture|null} The feed texture, or null if not found
     */
    getTexture(cameraId) {
        const renderTarget = this.renderTargets.get(cameraId);
        return renderTarget ? renderTarget.texture : null;
    }

    /**
     * Check if a feed exists for a camera
     * @param {string} cameraId - Camera ID
     * @returns {boolean}
     */
    hasFeed(cameraId) {
        return this.renderTargets.has(cameraId);
    }

    /**
     * Dispose a camera feed
     * @param {string} cameraId - Camera ID
     */
    disposeFeed(cameraId) {
        const renderTarget = this.renderTargets.get(cameraId);
        if (renderTarget) {
            renderTarget.dispose();
            this.renderTargets.delete(cameraId);
        }

        this.feedCameras.delete(cameraId);

        console.log(`[CameraFeedSystem] Disposed feed for camera: ${cameraId}`);
    }

    /**
     * Get all feed camera IDs
     * @returns {Array<string>}
     */
    getFeedIds() {
        return Array.from(this.renderTargets.keys());
    }

    /**
     * Update resolution for all feeds (requires recreating render targets)
     * @param {number} width - New width
     * @param {number} height - New height
     */
    setResolution(width, height) {
        this.resolution.width = width;
        this.resolution.height = height;

        // Recreate all render targets
        for (const [cameraId, oldTarget] of this.renderTargets) {
            const camera = this.feedCameras.get(cameraId);

            // Create new render target
            const newTarget = new THREE.WebGLRenderTarget(width, height, {
                format: THREE.RGBAFormat,
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter
            });

            // Update camera aspect ratio
            if (camera) {
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }

            // Replace
            oldTarget.dispose();
            this.renderTargets.set(cameraId, newTarget);
        }

        console.log(`[CameraFeedSystem] Resolution changed to ${width}x${height}`);
    }

    /**
     * Set quality preset (adjusts resolution and frame rate)
     * @param {string} preset - 'low', 'medium', or 'high'
     */
    setQuality(preset) {
        const config = CAMERA_QUALITY_PRESETS[preset];
        if (!config) {
            console.warn(`[CameraFeedSystem] Unknown quality preset: ${preset}`);
            return;
        }

        // Update resolution
        this.setResolution(config.width, config.height);

        // Update frame rate
        this.minRenderInterval = 1000 / config.fps;

        console.log(`[CameraFeedSystem] Quality set to ${preset}: ${config.width}x${config.height} @ ${config.fps}fps`);
    }

    /**
     * Get current quality settings
     * @returns {Object} { width, height, fps }
     */
    getQuality() {
        return {
            width: this.resolution.width,
            height: this.resolution.height,
            fps: Math.round(1000 / this.minRenderInterval)
        };
    }

    /**
     * Dispose all resources
     */
    dispose() {
        for (const [cameraId] of this.renderTargets) {
            this.disposeFeed(cameraId);
        }

        this.renderTargets.clear();
        this.feedCameras.clear();

        console.log('[CameraFeedSystem] Disposed all feeds');
    }
}
