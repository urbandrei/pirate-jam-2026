/**
 * Security Room Renderer - In-game monitor display system
 *
 * Creates and manages wall-mounted monitor meshes that display camera feeds.
 * Monitors show live render-to-texture camera feeds.
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// Monitor configuration
const MONITOR_CONFIG = {
    width: 1.6,          // 16:9 aspect ratio monitors
    height: 0.9,
    depth: 0.05,
    bezelWidth: 0.02,
    screenEmissive: 0.3, // Slight glow effect
    frameColor: 0x222222,
    screenColor: 0x111111
};

export class SecurityRoomRenderer {
    constructor(scene) {
        this.scene = scene;

        // Array of { mesh, screenMesh, cameraId, material, monitorId }
        this.monitors = [];

        // Map of monitorId -> monitor object for quick lookup
        this.monitorById = new Map();

        // Shared geometries for performance
        this.frameGeometry = null;
        this.screenGeometry = null;

        // Shared materials
        this.frameMaterial = new THREE.MeshStandardMaterial({
            color: MONITOR_CONFIG.frameColor,
            roughness: 0.8
        });

        // "No signal" texture for disconnected monitors
        this.noSignalTexture = this.createNoSignalTexture();

        this.initGeometries();
    }

    /**
     * Initialize shared geometries
     */
    initGeometries() {
        // Frame (back box)
        this.frameGeometry = new THREE.BoxGeometry(
            MONITOR_CONFIG.width + MONITOR_CONFIG.bezelWidth * 2,
            MONITOR_CONFIG.height + MONITOR_CONFIG.bezelWidth * 2,
            MONITOR_CONFIG.depth
        );

        // Screen (front plane)
        this.screenGeometry = new THREE.PlaneGeometry(
            MONITOR_CONFIG.width,
            MONITOR_CONFIG.height
        );
    }

    /**
     * Create a "No Signal" texture for monitors without assigned cameras
     * @returns {THREE.CanvasTexture}
     */
    createNoSignalTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 144;

        const ctx = canvas.getContext('2d');

        // Dark background with static noise
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Add static noise
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < imageData.data.length; i += 4) {
            const noise = Math.random() * 30;
            imageData.data[i] = noise;     // R
            imageData.data[i + 1] = noise; // G
            imageData.data[i + 2] = noise; // B
        }
        ctx.putImageData(imageData, 0, 0);

        // "NO SIGNAL" text
        ctx.fillStyle = '#666';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NO SIGNAL', canvas.width / 2, canvas.height / 2 + 8);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Create monitors at a specified position
     * @param {Object} position - Base position {x, y, z}
     * @param {Object} rotation - Wall rotation in radians (y-axis)
     * @param {number} count - Number of monitors to create
     * @param {string} layout - 'horizontal' or 'grid'
     * @param {Object} roomCell - Room cell {x, z} for generating monitor IDs
     * @returns {Array} Array of created monitor objects
     */
    createMonitors(position, rotation = 0, count = 4, layout = 'horizontal', roomCell = null) {
        const created = [];
        const spacing = MONITOR_CONFIG.width + 0.1;

        if (layout === 'horizontal') {
            // Single row of monitors
            const startX = -(count - 1) * spacing / 2;

            for (let i = 0; i < count; i++) {
                const offset = new THREE.Vector3(startX + i * spacing, 0, 0);
                offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);

                // Generate monitor ID matching server format
                const monitorId = roomCell ? `monitor_${roomCell.x}_${roomCell.z}_${i}` : null;

                const monitor = this.createSingleMonitor(
                    {
                        x: position.x + offset.x,
                        y: position.y,
                        z: position.z + offset.z
                    },
                    rotation,
                    monitorId
                );
                created.push(monitor);
            }
        } else if (layout === 'grid') {
            // 2x2 grid
            const cols = 2;
            const rows = Math.ceil(count / cols);
            const verticalSpacing = MONITOR_CONFIG.height + 0.1;

            let idx = 0;
            for (let row = 0; row < rows && idx < count; row++) {
                for (let col = 0; col < cols && idx < count; col++) {
                    const offsetX = (col - (cols - 1) / 2) * spacing;
                    const offsetY = ((rows - 1) / 2 - row) * verticalSpacing;

                    const offset = new THREE.Vector3(offsetX, offsetY, 0);
                    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);

                    // Generate monitor ID matching server format
                    const monitorId = roomCell ? `monitor_${roomCell.x}_${roomCell.z}_${idx}` : null;

                    const monitor = this.createSingleMonitor(
                        {
                            x: position.x + offset.x,
                            y: position.y + offset.y,
                            z: position.z + offset.z
                        },
                        rotation,
                        monitorId
                    );
                    created.push(monitor);
                    idx++;
                }
            }
        }

        return created;
    }

    /**
     * Create a single monitor
     * @param {Object} position - Monitor position {x, y, z}
     * @param {number} rotation - Y-axis rotation in radians
     * @param {string} monitorId - Optional server-assigned monitor ID
     * @returns {Object} Monitor object { mesh, screenMesh, cameraId, material, monitorId }
     */
    createSingleMonitor(position, rotation, monitorId = null) {
        // Create frame mesh
        const frameMesh = new THREE.Mesh(this.frameGeometry, this.frameMaterial);
        frameMesh.position.set(position.x, position.y, position.z);
        frameMesh.rotation.y = rotation;

        // Create screen material (unique per monitor for different textures)
        const screenMaterial = new THREE.MeshBasicMaterial({
            map: this.noSignalTexture,
            side: THREE.FrontSide
        });

        // Create screen mesh (slightly in front of frame)
        const screenMesh = new THREE.Mesh(this.screenGeometry, screenMaterial);
        screenMesh.position.set(position.x, position.y, position.z);
        screenMesh.rotation.y = rotation;

        // Offset screen forward from frame
        const forwardOffset = new THREE.Vector3(0, 0, MONITOR_CONFIG.depth / 2 + 0.001);
        forwardOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
        screenMesh.position.add(forwardOffset);

        // Add to scene
        this.scene.add(frameMesh);
        this.scene.add(screenMesh);

        // Generate monitorId if not provided
        const idx = this.monitors.length;
        const actualMonitorId = monitorId || `local_monitor_${idx}`;

        // Store monitor data
        const monitor = {
            mesh: frameMesh,
            screenMesh: screenMesh,
            material: screenMaterial,
            cameraId: null,
            position: { ...position },
            rotation: rotation,
            monitorId: actualMonitorId
        };

        this.monitors.push(monitor);
        this.monitorById.set(actualMonitorId, monitor);

        console.log(`[SecurityRoomRenderer] Created monitor ${actualMonitorId} at (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`);

        return monitor;
    }

    /**
     * Assign a camera to a monitor by index
     * @param {number} monitorIndex - Monitor index
     * @param {string} cameraId - Camera ID to display
     */
    assignCamera(monitorIndex, cameraId) {
        if (monitorIndex < 0 || monitorIndex >= this.monitors.length) {
            console.warn(`[SecurityRoomRenderer] Invalid monitor index: ${monitorIndex}`);
            return;
        }

        this.monitors[monitorIndex].cameraId = cameraId;
        console.log(`[SecurityRoomRenderer] Assigned camera ${cameraId} to monitor ${monitorIndex}`);
    }

    /**
     * Update a monitor's camera assignment by monitor ID
     * @param {string} monitorId - Server-assigned monitor ID
     * @param {string} cameraId - Camera ID to display (null for no signal)
     * @param {CameraFeedSystem} cameraFeedSystem - Optional camera feed system to update texture immediately
     */
    updateMonitorCamera(monitorId, cameraId, cameraFeedSystem = null) {
        const monitor = this.monitorById.get(monitorId);
        if (!monitor) {
            // Monitor might not exist yet (scene not rebuilt)
            return;
        }

        // Skip if assignment hasn't changed
        if (monitor.cameraId === cameraId) {
            return;
        }

        const oldCameraId = monitor.cameraId;
        monitor.cameraId = cameraId;

        // Immediately update texture if feed system provided
        if (cameraFeedSystem && cameraId) {
            const texture = cameraFeedSystem.getTexture(cameraId);
            if (texture) {
                monitor.material.map = texture;
                monitor.material.needsUpdate = true;
            }
        } else if (!cameraId) {
            monitor.material.map = this.noSignalTexture;
            monitor.material.needsUpdate = true;
        }

        console.log(`[SecurityRoomRenderer] Updated monitor ${monitorId}: ${oldCameraId} -> ${cameraId}`);
    }

    /**
     * Get a monitor by its ID
     * @param {string} monitorId - Monitor ID
     * @returns {Object|null} Monitor object or null
     */
    getMonitorById(monitorId) {
        return this.monitorById.get(monitorId) || null;
    }

    /**
     * Update monitor displays with camera feed textures
     * @param {CameraFeedSystem} cameraFeedSystem - The camera feed system
     */
    update(cameraFeedSystem) {
        for (const monitor of this.monitors) {
            if (monitor.cameraId) {
                const texture = cameraFeedSystem.getTexture(monitor.cameraId);
                if (texture) {
                    monitor.material.map = texture;
                    monitor.material.needsUpdate = true;
                } else {
                    // Camera feed not available - show no signal
                    monitor.material.map = this.noSignalTexture;
                    monitor.material.needsUpdate = true;
                }
            } else {
                // No camera assigned
                monitor.material.map = this.noSignalTexture;
            }
        }
    }

    /**
     * Get monitor at a given index
     * @param {number} index - Monitor index
     * @returns {Object|null} Monitor object or null
     */
    getMonitor(index) {
        return this.monitors[index] || null;
    }

    /**
     * Get all monitors
     * @returns {Array} Array of monitor objects
     */
    getAllMonitors() {
        return this.monitors;
    }

    /**
     * Find the nearest monitor to a position
     * @param {Object} position - Position {x, y, z}
     * @param {number} maxDistance - Maximum distance to search
     * @returns {Object|null} { monitor, index, distance } or null
     */
    findNearestMonitor(position, maxDistance = 3) {
        let nearest = null;
        let nearestDist = maxDistance;
        let nearestIdx = -1;

        for (let i = 0; i < this.monitors.length; i++) {
            const monitor = this.monitors[i];
            const dx = position.x - monitor.position.x;
            const dy = position.y - monitor.position.y;
            const dz = position.z - monitor.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < nearestDist) {
                nearest = monitor;
                nearestDist = dist;
                nearestIdx = i;
            }
        }

        if (nearest) {
            return { monitor: nearest, index: nearestIdx, distance: nearestDist };
        }
        return null;
    }

    /**
     * Clear all monitors without disposing shared resources
     * Use this when rebuilding rooms, not when fully disposing
     */
    clear() {
        for (const monitor of this.monitors) {
            this.scene.remove(monitor.mesh);
            this.scene.remove(monitor.screenMesh);
            monitor.material.dispose();
        }
        this.monitors = [];
        this.monitorById.clear();
        console.log('[SecurityRoomRenderer] Cleared all monitors');
    }

    /**
     * Dispose all resources
     */
    dispose() {
        for (const monitor of this.monitors) {
            this.scene.remove(monitor.mesh);
            this.scene.remove(monitor.screenMesh);
            monitor.material.dispose();
        }

        this.monitors = [];
        this.monitorById.clear();

        if (this.frameGeometry) this.frameGeometry.dispose();
        if (this.screenGeometry) this.screenGeometry.dispose();
        if (this.frameMaterial) this.frameMaterial.dispose();
        if (this.noSignalTexture) this.noSignalTexture.dispose();

        console.log('[SecurityRoomRenderer] Disposed all monitors');
    }
}
