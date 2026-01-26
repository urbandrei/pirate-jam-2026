/**
 * Camera System - Server-side camera management
 *
 * Handles camera entity creation, removal, positioning, and limits.
 * Supports two camera types:
 * - Security cameras: placed by PC players, found as world objects
 * - Stream cameras: placed by VR players via pinch gestures
 */

// Camera types
const CAMERA_TYPES = {
    SECURITY: 'security',
    STREAM: 'stream'
};

// Default limits (can be changed by VR player)
const DEFAULT_LIMITS = {
    security: 5,
    stream: 5
};

// Default resolution (1080p)
const DEFAULT_RESOLUTION = {
    width: 1920,
    height: 1080
};

class CameraSystem {
    constructor() {
        // Map of camera ID -> camera entity
        this.cameras = new Map();

        // Current limits (session-only, not persisted)
        this.limits = { ...DEFAULT_LIMITS };

        // Counter for generating unique IDs
        this.cameraCounter = 0;

        // Track which players are viewing which cameras (for frame routing)
        // Map of playerId -> cameraId they're viewing
        this.activeViewers = new Map();

        // Track web viewers requesting frames
        // Map of socketId -> { cameraId, lastRequestTime }
        this.webViewers = new Map();

        // Track cameras being adjusted (locked from interaction)
        // Map of cameraId -> playerId adjusting it
        this.adjustingCameras = new Map();
    }

    /**
     * Start adjusting a camera (locks it from other interactions)
     * @param {string} cameraId - Camera being adjusted
     * @param {string} playerId - Player adjusting it
     * @returns {boolean} True if lock acquired
     */
    startAdjusting(cameraId, playerId) {
        // Check if already being adjusted by someone else
        const existingAdjuster = this.adjustingCameras.get(cameraId);
        if (existingAdjuster && existingAdjuster !== playerId) {
            return false;
        }
        this.adjustingCameras.set(cameraId, playerId);
        return true;
    }

    /**
     * Stop adjusting a camera (unlocks it)
     * @param {string} cameraId - Camera to unlock
     * @param {string} playerId - Player releasing the lock
     */
    stopAdjusting(cameraId, playerId) {
        const adjuster = this.adjustingCameras.get(cameraId);
        if (adjuster === playerId) {
            this.adjustingCameras.delete(cameraId);
        }
    }

    /**
     * Check if a camera is being adjusted
     * @param {string} cameraId - Camera to check
     * @returns {string|null} Player ID adjusting it, or null
     */
    getAdjustingPlayer(cameraId) {
        return this.adjustingCameras.get(cameraId) || null;
    }

    /**
     * Clear all adjustments by a player (on disconnect/death)
     * @param {string} playerId - Player who disconnected/died
     * @returns {Array} Array of camera IDs that were being adjusted
     */
    clearPlayerAdjustments(playerId) {
        const clearedIds = [];
        for (const [cameraId, adjusterId] of this.adjustingCameras) {
            if (adjusterId === playerId) {
                this.adjustingCameras.delete(cameraId);
                clearedIds.push(cameraId);
            }
        }
        return clearedIds;
    }

    /**
     * Generate a unique camera ID
     * @returns {string} Unique camera ID
     */
    generateCameraId() {
        this.cameraCounter++;
        return `cam_${this.cameraCounter}`;
    }

    /**
     * Create a new camera entity
     * @param {string} type - 'security' or 'stream'
     * @param {Object} position - World position {x, y, z}
     * @param {Object} rotation - Camera rotation {pitch, yaw, roll}
     * @param {string} ownerId - Player ID who created the camera
     * @returns {Object|null} Created camera entity or null if failed
     */
    createCamera(type, position, rotation, ownerId) {
        // Validate camera type
        if (type !== CAMERA_TYPES.SECURITY && type !== CAMERA_TYPES.STREAM) {
            console.warn(`[CameraSystem] Invalid camera type: ${type}`);
            return null;
        }

        // Check limits
        if (!this.canCreateCamera(type)) {
            return null;
        }

        // For stream cameras, force roll to 0 (level with horizon)
        const finalRotation = { ...rotation };
        if (type === CAMERA_TYPES.STREAM) {
            finalRotation.roll = 0;
        }

        const camera = {
            id: this.generateCameraId(),
            type: type,
            ownerId: ownerId,
            position: { ...position },
            rotation: finalRotation,
            resolution: { ...DEFAULT_RESOLUTION },
            createdAt: Date.now()
        };

        this.cameras.set(camera.id, camera);

        return camera;
    }

    /**
     * Remove a camera
     * @param {string} cameraId - Camera ID to remove
     * @returns {boolean} Whether removal was successful
     */
    removeCamera(cameraId) {
        const camera = this.cameras.get(cameraId);
        if (!camera) {
            console.warn(`[CameraSystem] Camera not found: ${cameraId}`);
            return false;
        }

        this.cameras.delete(cameraId);

        // Clear any viewers of this camera
        for (const [playerId, viewedCameraId] of this.activeViewers.entries()) {
            if (viewedCameraId === cameraId) {
                this.activeViewers.delete(playerId);
            }
        }

        return true;
    }

    /**
     * Update camera position
     * @param {string} cameraId - Camera ID
     * @param {Object} position - New position {x, y, z}
     * @returns {boolean} Whether update was successful
     */
    updatePosition(cameraId, position) {
        const camera = this.cameras.get(cameraId);
        if (!camera) {
            return false;
        }

        camera.position = { ...position };
        return true;
    }

    /**
     * Update camera rotation
     * @param {string} cameraId - Camera ID
     * @param {Object} rotation - New rotation {pitch, yaw, roll}
     * @returns {boolean} Whether update was successful
     */
    updateRotation(cameraId, rotation) {
        const camera = this.cameras.get(cameraId);
        if (!camera) {
            return false;
        }

        // For stream cameras, force roll to 0
        const finalRotation = { ...rotation };
        if (camera.type === CAMERA_TYPES.STREAM) {
            finalRotation.roll = 0;
        }

        camera.rotation = finalRotation;
        return true;
    }

    /**
     * Get a camera by ID
     * @param {string} cameraId - Camera ID
     * @returns {Object|null} Camera entity or null
     */
    getCamera(cameraId) {
        return this.cameras.get(cameraId) || null;
    }

    /**
     * Get all cameras of a specific type
     * @param {string} type - Camera type ('security' or 'stream')
     * @returns {Array} Array of camera entities
     */
    getCamerasByType(type) {
        const result = [];
        for (const camera of this.cameras.values()) {
            if (camera.type === type) {
                result.push(camera);
            }
        }
        return result;
    }

    /**
     * Get all cameras
     * @returns {Array} Array of all camera entities
     */
    getAllCameras() {
        return Array.from(this.cameras.values());
    }

    /**
     * Check if a new camera of the given type can be created
     * @param {string} type - Camera type
     * @returns {boolean} Whether a new camera can be created
     */
    canCreateCamera(type) {
        const currentCount = this.getCamerasByType(type).length;
        const limit = this.limits[type] || 0;
        return currentCount < limit;
    }

    /**
     * Get current camera counts and limits
     * @returns {Object} { security: { count, limit }, stream: { count, limit } }
     */
    getCameraStats() {
        return {
            security: {
                count: this.getCamerasByType(CAMERA_TYPES.SECURITY).length,
                limit: this.limits.security
            },
            stream: {
                count: this.getCamerasByType(CAMERA_TYPES.STREAM).length,
                limit: this.limits.stream
            }
        };
    }

    /**
     * Set camera limits (VR player only)
     * @param {number} securityLimit - New security camera limit
     * @param {number} streamLimit - New stream camera limit
     */
    setLimits(securityLimit, streamLimit) {
        // Clamp limits to reasonable values (1-20)
        this.limits.security = Math.max(1, Math.min(20, securityLimit));
        this.limits.stream = Math.max(1, Math.min(20, streamLimit));
    }

    /**
     * Get current limits
     * @returns {Object} { security, stream }
     */
    getLimits() {
        return { ...this.limits };
    }

    /**
     * Set a player as viewing a camera (for camera view mode)
     * @param {string} playerId - Player ID
     * @param {string} cameraId - Camera ID being viewed
     */
    setViewer(playerId, cameraId) {
        if (cameraId && !this.cameras.has(cameraId)) {
            console.warn(`[CameraSystem] Cannot view non-existent camera: ${cameraId}`);
            return false;
        }

        if (cameraId) {
            this.activeViewers.set(playerId, cameraId);
        } else {
            this.activeViewers.delete(playerId);
        }
        return true;
    }

    /**
     * Get which camera a player is viewing
     * @param {string} playerId - Player ID
     * @returns {string|null} Camera ID or null
     */
    getViewedCamera(playerId) {
        return this.activeViewers.get(playerId) || null;
    }

    /**
     * Check if a player is viewing any camera
     * @param {string} playerId - Player ID
     * @returns {boolean}
     */
    isViewing(playerId) {
        return this.activeViewers.has(playerId);
    }

    /**
     * Register a web viewer requesting frames
     * @param {string} socketId - Web viewer socket ID
     * @param {string} cameraId - Camera ID to view
     */
    registerWebViewer(socketId, cameraId) {
        this.webViewers.set(socketId, {
            cameraId,
            lastRequestTime: Date.now()
        });
    }

    /**
     * Unregister a web viewer
     * @param {string} socketId - Web viewer socket ID
     */
    unregisterWebViewer(socketId) {
        this.webViewers.delete(socketId);
    }

    /**
     * Get cameras data for state updates
     * @returns {Array} Array of camera data for network transmission
     */
    getCamerasForStateUpdate() {
        return this.getAllCameras().map(camera => ({
            id: camera.id,
            type: camera.type,
            ownerId: camera.ownerId,
            position: camera.position,
            rotation: camera.rotation
        }));
    }

    /**
     * Clean up cameras owned by a disconnected player
     * @param {string} playerId - Disconnected player ID
     * @returns {Array} Array of removed camera IDs
     */
    cleanupPlayerCameras(playerId) {
        const removedIds = [];

        for (const [cameraId, camera] of this.cameras.entries()) {
            if (camera.ownerId === playerId) {
                this.cameras.delete(cameraId);
                removedIds.push(cameraId);
            }
        }

        // Also remove from active viewers
        this.activeViewers.delete(playerId);

        return removedIds;
    }

    /**
     * Initialize dev mode cameras - 4 security cameras in spawn room
     * Called when server starts in dev mode
     */
    initializeDevCameras() {
        // Place 4 cameras in the center of the spawn room (at origin)
        // Arranged in a 2x2 grid on the floor, facing outward
        const devCameras = [
            { x: -1, z: -1, yaw: Math.PI * 0.75 },   // NW corner, facing SE
            { x: 1, z: -1, yaw: Math.PI * 0.25 },    // NE corner, facing SW
            { x: -1, z: 1, yaw: -Math.PI * 0.75 },   // SW corner, facing NE
            { x: 1, z: 1, yaw: -Math.PI * 0.25 }     // SE corner, facing NW
        ];

        for (const cam of devCameras) {
            const camera = this.createCamera(
                CAMERA_TYPES.SECURITY,
                { x: cam.x, y: 0.3, z: cam.z },  // y=0.3 for floor level
                { pitch: 0, yaw: cam.yaw, roll: 0 },
                'floor_item'  // ownerId indicates it's on the floor
            );
        }
    }

    /**
     * Get a numeric camera ID from the full camera ID (for web routes)
     * @param {string} cameraId - Full camera ID (e.g., 'cam_1')
     * @returns {number} Numeric ID
     */
    static getNumericId(cameraId) {
        const match = cameraId.match(/cam_(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    }

    /**
     * Get full camera ID from numeric ID
     * @param {number} numericId - Numeric ID
     * @returns {string} Full camera ID
     */
    static getFullId(numericId) {
        return `cam_${numericId}`;
    }
}

// Export singleton instance and class
module.exports = {
    CameraSystem,
    CAMERA_TYPES,
    DEFAULT_LIMITS,
    DEFAULT_RESOLUTION
};
