/**
 * Three.js + WebXR scene setup for VR client
 *
 * COORDINATE SYSTEM (VR VIEW - "Tiny World"):
 * - VR player is at real-world scale (WebXR provides 1:1 tracking)
 * - World geometry is rendered at 1/GIANT_SCALE
 * - A 100m world becomes 10m visual (tabletop sized)
 * - PC players appear as tiny 18cm figures (1.8m / 10)
 * - VR player at ~1.6m eye height towers over the tiny world
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { COLORS, WORLD_SIZE, GIANT_SCALE, ROOM_SIZE, SMALL_ROOM_SIZE, WALL_THICKNESS, DOORWAY_HEIGHT, DOORWAY_WIDTH } from '../../pc/shared/constants.js';

export class VRScene {
    constructor(container) {
        try {
            this.container = container;
            this.xrSession = null;

            // Session state callbacks
            this.onSessionStart = null;
            this.onSessionEnd = null;

            // Create renderer with WebXR support
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.shadowMap.enabled = false; // Disabled for VR performance
            this.renderer.xr.enabled = true;
            container.insertBefore(this.renderer.domElement, container.firstChild);

            // Create scene
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(COLORS.SKY);

            // Create camera (controlled by XR)
            this.camera = new THREE.PerspectiveCamera(
                75,
                window.innerWidth / window.innerHeight,
                0.01,
                1000
            );

            // Camera rig for VR (allows us to move the user)
            this.cameraRig = new THREE.Group();
            this.cameraRig.add(this.camera);
            this.scene.add(this.cameraRig);

            // Setup scene at VR scale (10x PC scale)
            this.setupLighting();
            this.setupGround();
            this.setupReferenceBlocks();

            // Setup VR button
            this.setupVRButton();

            // Handle window resize (store reference for cleanup)
            this.onResizeHandler = () => this.onResize();
            window.addEventListener('resize', this.onResizeHandler);
        } catch (err) {
            console.error('[VRScene] Failed to initialize:', err);
            throw err;
        }
    }

    setupLighting() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        // Directional light (sun) - positioned for tiny world
        // World is 10m visual, so light at reasonable VR-scale height
        const sun = new THREE.DirectionalLight(0xffffff, 1);
        sun.position.set(5, 10, 5);
        this.scene.add(sun);

        // Hemisphere light
        const hemi = new THREE.HemisphereLight(0x000000, 0x3d5c3d, 0.3);
        this.scene.add(hemi);
    }

    /**
     * Create procedural rough concrete texture
     */
    createConcreteTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Base gray
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, 256, 256);

        // Add noise for rough texture
        const imageData = ctx.getImageData(0, 0, 256, 256);
        for (let i = 0; i < imageData.data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 40;
            imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
            imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
            imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
        }
        ctx.putImageData(imageData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        return texture;
    }

    setupGround() {
        // Ground plane at 1/GIANT_SCALE (tiny world)
        // 100m world / 10 = 10m visual (tabletop-sized)
        const groundSize = WORLD_SIZE / GIANT_SCALE;
        const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);

        // Concrete material for ground
        const groundMaterial = new THREE.MeshStandardMaterial({
            map: this.createConcreteTexture(),
            roughness: 0.95,
            metalness: 0.05
        });
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.scene.add(this.ground);

        // Grid helper - 10m with 10 divisions = 1m cells (reduced for VR performance)
        const grid = new THREE.GridHelper(groundSize, 10, 0x000000, 0x444444);
        grid.position.y = 0.001; // Slight offset to prevent z-fighting
        grid.material.opacity = 0.2;
        grid.material.transparent = true;
        this.scene.add(grid);
    }

    setupReferenceBlocks() {
        // Replace colored blocks with concrete room
        this.setupRoom();
    }

    /**
     * Create a concrete room with doorways around spawn point
     * All dimensions scaled by 1/GIANT_SCALE for VR "tiny world" view
     */
    setupRoom() {
        const scale = 1 / GIANT_SCALE;

        // Room dimensions in VR scale
        const roomSize = ROOM_SIZE * scale;        // 0.5m in VR
        const wallHeight = ROOM_SIZE * scale;      // 0.5m in VR
        const wallThickness = WALL_THICKNESS * scale; // 0.02m in VR
        const doorwayHeight = DOORWAY_HEIGHT * scale; // ~0.234m in VR
        const doorwayWidth = DOORWAY_WIDTH * scale;   // 0.12m in VR

        // Concrete material for walls
        const wallMaterial = new THREE.MeshStandardMaterial({
            map: this.createConcreteTexture(),
            roughness: 0.95,
            metalness: 0.05
        });

        // Calculate wall segment dimensions
        const sideSegmentWidth = (roomSize - doorwayWidth) / 2;
        const aboveDoorHeight = wallHeight - doorwayHeight;
        const halfRoom = roomSize / 2;

        // Create wall segments for each side (with doorway cutouts)
        // Each wall needs: left segment, right segment, above-door segment

        // North wall (z = -halfRoom)
        this.createWallWithDoorway(
            wallMaterial,
            { x: 0, z: -halfRoom },
            'z',
            wallHeight, wallThickness,
            doorwayWidth, doorwayHeight, sideSegmentWidth, aboveDoorHeight
        );

        // South wall (z = +halfRoom)
        this.createWallWithDoorway(
            wallMaterial,
            { x: 0, z: halfRoom },
            'z',
            wallHeight, wallThickness,
            doorwayWidth, doorwayHeight, sideSegmentWidth, aboveDoorHeight
        );

        // East wall (x = +halfRoom)
        this.createWallWithDoorway(
            wallMaterial,
            { x: halfRoom, z: 0 },
            'x',
            wallHeight, wallThickness,
            doorwayWidth, doorwayHeight, sideSegmentWidth, aboveDoorHeight
        );

        // West wall (x = -halfRoom)
        this.createWallWithDoorway(
            wallMaterial,
            { x: -halfRoom, z: 0 },
            'x',
            wallHeight, wallThickness,
            doorwayWidth, doorwayHeight, sideSegmentWidth, aboveDoorHeight
        );

        // Add surrounding rooms
        this.setupSurroundingRooms(wallMaterial, scale);
    }

    /**
     * Create a wall with a doorway cutout
     */
    createWallWithDoorway(material, position, axis, wallHeight, wallThickness, doorwayWidth, doorwayHeight, sideSegmentWidth, aboveDoorHeight) {
        const halfDoorway = doorwayWidth / 2;
        const sideOffset = halfDoorway + sideSegmentWidth / 2;

        if (axis === 'z') {
            // Wall along X-axis (North/South walls)
            // Left segment
            const leftGeom = new THREE.BoxGeometry(sideSegmentWidth, wallHeight, wallThickness);
            const leftWall = new THREE.Mesh(leftGeom, material);
            leftWall.position.set(position.x - sideOffset, wallHeight / 2, position.z);
            this.scene.add(leftWall);

            // Right segment
            const rightGeom = new THREE.BoxGeometry(sideSegmentWidth, wallHeight, wallThickness);
            const rightWall = new THREE.Mesh(rightGeom, material);
            rightWall.position.set(position.x + sideOffset, wallHeight / 2, position.z);
            this.scene.add(rightWall);

            // Above door segment
            const aboveGeom = new THREE.BoxGeometry(doorwayWidth, aboveDoorHeight, wallThickness);
            const aboveWall = new THREE.Mesh(aboveGeom, material);
            aboveWall.position.set(position.x, doorwayHeight + aboveDoorHeight / 2, position.z);
            this.scene.add(aboveWall);
        } else {
            // Wall along Z-axis (East/West walls)
            // Left segment (negative Z)
            const leftGeom = new THREE.BoxGeometry(wallThickness, wallHeight, sideSegmentWidth);
            const leftWall = new THREE.Mesh(leftGeom, material);
            leftWall.position.set(position.x, wallHeight / 2, position.z - sideOffset);
            this.scene.add(leftWall);

            // Right segment (positive Z)
            const rightGeom = new THREE.BoxGeometry(wallThickness, wallHeight, sideSegmentWidth);
            const rightWall = new THREE.Mesh(rightGeom, material);
            rightWall.position.set(position.x, wallHeight / 2, position.z + sideOffset);
            this.scene.add(rightWall);

            // Above door segment
            const aboveGeom = new THREE.BoxGeometry(wallThickness, aboveDoorHeight, doorwayWidth);
            const aboveWall = new THREE.Mesh(aboveGeom, material);
            aboveWall.position.set(position.x, doorwayHeight + aboveDoorHeight / 2, position.z);
            this.scene.add(aboveWall);
        }
    }

    /**
     * Create 16 surrounding rooms around the main room
     * Layout: 5 rooms on top/bottom rows, 3 rooms on left/right sides
     * All dimensions already in VR scale (1/GIANT_SCALE)
     */
    setupSurroundingRooms(wallMaterial, scale) {
        const smallSize = SMALL_ROOM_SIZE * scale;    // ~0.667m in VR
        const halfMain = ROOM_SIZE * scale / 2;      // 1m in VR
        const halfSmall = smallSize / 2;             // ~0.333m in VR
        const smallHeight = smallSize;               // Same height as width

        // Positions for each small room center (in VR scale)
        const positions = [
            // Top row (5 rooms, z = -halfMain - halfSmall)
            { x: -smallSize * 2, z: -halfMain - halfSmall },
            { x: -smallSize, z: -halfMain - halfSmall },
            { x: 0, z: -halfMain - halfSmall },
            { x: smallSize, z: -halfMain - halfSmall },
            { x: smallSize * 2, z: -halfMain - halfSmall },

            // Left side (3 rooms, x = -halfMain - halfSmall)
            { x: -halfMain - halfSmall, z: -smallSize },
            { x: -halfMain - halfSmall, z: 0 },
            { x: -halfMain - halfSmall, z: smallSize },

            // Right side (3 rooms, x = halfMain + halfSmall)
            { x: halfMain + halfSmall, z: -smallSize },
            { x: halfMain + halfSmall, z: 0 },
            { x: halfMain + halfSmall, z: smallSize },

            // Bottom row (5 rooms, z = halfMain + halfSmall)
            { x: -smallSize * 2, z: halfMain + halfSmall },
            { x: -smallSize, z: halfMain + halfSmall },
            { x: 0, z: halfMain + halfSmall },
            { x: smallSize, z: halfMain + halfSmall },
            { x: smallSize * 2, z: halfMain + halfSmall },
        ];

        // Create each small room (4 solid walls, no doorways)
        positions.forEach(pos => {
            this.createSmallRoom(wallMaterial, pos, smallSize, smallHeight, scale);
        });
    }

    /**
     * Create a small room with 4 solid walls (no doorways)
     * All dimensions already in VR scale
     */
    createSmallRoom(material, center, size, height, scale) {
        const half = size / 2;
        const thickness = WALL_THICKNESS * scale;

        // North wall (z = center.z - half)
        this.createSolidWall(material, center.x, center.z - half, size, height, thickness, 'z');
        // South wall (z = center.z + half)
        this.createSolidWall(material, center.x, center.z + half, size, height, thickness, 'z');
        // East wall (x = center.x + half)
        this.createSolidWall(material, center.x + half, center.z, size, height, thickness, 'x');
        // West wall (x = center.x - half)
        this.createSolidWall(material, center.x - half, center.z, size, height, thickness, 'x');
    }

    /**
     * Create a solid wall (no doorway)
     */
    createSolidWall(material, x, z, length, height, thickness, axis) {
        let geometry;
        if (axis === 'z') {
            // Wall along X-axis
            geometry = new THREE.BoxGeometry(length, height, thickness);
        } else {
            // Wall along Z-axis
            geometry = new THREE.BoxGeometry(thickness, height, length);
        }

        const wall = new THREE.Mesh(geometry, material);
        wall.position.set(x, height / 2, z);
        this.scene.add(wall);
    }

    async setupVRButton() {
        const button = document.getElementById('vr-button');
        const status = document.getElementById('status');

        if (!navigator.xr) {
            console.warn('[VRScene] WebXR not available');
            button.textContent = 'WebXR Not Supported';
            status.textContent = 'WebXR is not available in this browser';
            return;
        }

        let isSupported = false;
        try {
            isSupported = await navigator.xr.isSessionSupported('immersive-vr');
        } catch (err) {
            console.error('[VRScene] Error checking XR support:', err);
            button.textContent = 'VR Check Failed';
            status.textContent = 'Error checking VR support: ' + err.message;
            return;
        }

        if (!isSupported) {
            console.warn('[VRScene] Immersive VR not supported');
            button.textContent = 'VR Not Available';
            status.textContent = 'No VR headset detected';
            return;
        }

        console.log('[VRScene] VR is supported, ready to start');
        button.textContent = 'Enter VR';
        button.disabled = false;
        status.textContent = 'Ready - Click to enter VR';

        button.addEventListener('click', async () => {
            try {
                if (this.xrSession) {
                    console.log('[VRScene] Ending existing XR session');
                    await this.xrSession.end();
                    return;
                }

                console.log('[VRScene] Requesting immersive-vr session...');
                status.textContent = 'Starting VR session...';

                this.xrSession = await navigator.xr.requestSession('immersive-vr', {
                    optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
                });

                console.log('[VRScene] XR session created, setting up renderer...');

                // Set up the session with the renderer
                try {
                    await this.renderer.xr.setSession(this.xrSession);
                    console.log('[VRScene] Renderer XR session set successfully');
                } catch (sessionErr) {
                    console.error('[VRScene] Failed to set XR session on renderer:', sessionErr);
                    status.textContent = 'Failed to initialize VR renderer: ' + sessionErr.message;
                    this.xrSession = null;
                    return;
                }

                button.textContent = 'Exit VR';
                status.textContent = 'In VR - Pinch to grab tiny players';

                // Notify listeners that session started
                console.log('[VRScene] XR session started successfully');
                if (this.onSessionStart) {
                    try {
                        this.onSessionStart(this.xrSession);
                    } catch (callbackErr) {
                        console.warn('[VRScene] onSessionStart callback error:', callbackErr);
                    }
                }

                // Use { once: true } to prevent listener accumulation across sessions
                this.xrSession.addEventListener('end', () => {
                    console.log('[VRScene] XR session ended');
                    this.xrSession = null;
                    button.textContent = 'Enter VR';
                    status.textContent = 'VR session ended';

                    // Notify listeners that session ended
                    if (this.onSessionEnd) {
                        try {
                            this.onSessionEnd();
                        } catch (callbackErr) {
                            console.warn('[VRScene] onSessionEnd callback error:', callbackErr);
                        }
                    }
                }, { once: true });
            } catch (err) {
                console.error('[VRScene] Failed to start XR session:', err);
                status.textContent = 'Failed to start VR: ' + err.message;
                this.xrSession = null;
            }
        });
    }

    onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    setAnimationLoop(callback) {
        this.renderer.setAnimationLoop(callback);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    add(object) {
        this.scene.add(object);
    }

    remove(object) {
        this.scene.remove(object);
    }

    getXRSession() {
        return this.xrSession;
    }

    isInVR() {
        return this.renderer.xr.isPresenting;
    }

    /**
     * Cleanup all resources to prevent memory leaks
     * Must be called when VR session ends or scene is no longer needed
     */
    dispose() {
        console.log('[VRScene] Disposing all resources...');

        // Remove event listeners
        if (this.onResizeHandler) {
            window.removeEventListener('resize', this.onResizeHandler);
            this.onResizeHandler = null;
        }

        // Dispose ground
        if (this.ground) {
            if (this.ground.geometry) this.ground.geometry.dispose();
            if (this.ground.material) this.ground.material.dispose();
            this.ground = null;
        }

        // Traverse scene and dispose all geometries and materials
        this.scene.traverse((obj) => {
            if (obj.geometry) {
                obj.geometry.dispose();
            }
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => {
                        if (m.map) m.map.dispose();
                        m.dispose();
                    });
                } else {
                    if (obj.material.map) obj.material.map.dispose();
                    obj.material.dispose();
                }
            }
        });

        // Dispose renderer
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement && this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
            this.renderer = null;
        }

        // Clear scene
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }

        console.log('[VRScene] All resources disposed');
    }
}
