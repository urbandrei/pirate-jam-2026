/**
 * Camera Feed System - Render-to-texture for in-game monitors
 *
 * Renders scene from camera perspectives to WebGLRenderTarget textures.
 * Used exclusively for in-game security room monitors (no JPEG streaming).
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { CAMERA_DEFAULTS } from '../shared/constants.js';

export class CameraFeedSystem {
    constructor(renderer, scene) {
        this.renderer = renderer;
        this.scene = scene;

        // Map of cameraId -> WebGLRenderTarget
        this.renderTargets = new Map();

        // Map of cameraId -> THREE.PerspectiveCamera
        this.feedCameras = new Map();

        // Resolution (configurable)
        this.resolution = { ...CAMERA_DEFAULTS.RESOLUTION };

        // Track last render time for throttling
        this.lastRenderTime = 0;
        this.minRenderInterval = 1000 / CAMERA_DEFAULTS.RENDER_RATE;  // ~66ms for 15fps
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

        // Render each camera feed
        for (const [cameraId, renderTarget] of this.renderTargets) {
            const camera = this.feedCameras.get(cameraId);
            if (!camera) continue;

            this.renderer.setRenderTarget(renderTarget);
            this.renderer.render(this.scene, camera);
        }

        // Restore original target
        this.renderer.setRenderTarget(currentTarget);
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
