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
import { COLORS, WORLD_SIZE, GIANT_SCALE } from '../../pc/shared/constants.js';

export class VRScene {
    constructor(container) {
        this.container = container;
        this.xrSession = null;

        // Session state callbacks
        this.onSessionStart = null;
        this.onSessionEnd = null;

        // Create renderer with WebXR support
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = false;
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

        // Handle window resize
        window.addEventListener('resize', () => this.onResize());
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

    setupGround() {
        // Ground plane at 1/GIANT_SCALE (tiny world)
        // 100m world / 10 = 10m visual (tabletop-sized)
        const groundSize = WORLD_SIZE / GIANT_SCALE;
        const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: COLORS.GROUND,
            roughness: 0.8,
            metalness: 0.1
        });
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.scene.add(this.ground);

        // Grid helper - 10m with 10 divisions = 1m cells (reduced for Quest 2 performance)
        const grid = new THREE.GridHelper(groundSize, 10, 0x000000, 0x444444);
        grid.position.y = 0.001; // Slight offset to prevent z-fighting
        grid.material.opacity = 0.2;
        grid.material.transparent = true;
        this.scene.add(grid);
    }

    setupReferenceBlocks() {
        const blockColors = [
            COLORS.BLOCK_RED,
            COLORS.BLOCK_GREEN,
            COLORS.BLOCK_BLUE,
            COLORS.BLOCK_YELLOW,
            COLORS.BLOCK_PURPLE
        ];

        // Positions in world units / GIANT_SCALE (tiny world)
        // 10m in world = 1m visual in VR
        const positions = [
            { x: 10 / GIANT_SCALE, z: 0 },      // 1m in VR
            { x: -10 / GIANT_SCALE, z: 0 },
            { x: 0, z: 10 / GIANT_SCALE },
            { x: 0, z: -10 / GIANT_SCALE },
            { x: 0, z: 0 }
        ];

        positions.forEach((pos, i) => {
            // Blocks: 2m x 3m x 2m in world = 0.2m x 0.3m x 0.2m in VR (toy blocks)
            const geometry = new THREE.BoxGeometry(
                2 / GIANT_SCALE,
                3 / GIANT_SCALE,
                2 / GIANT_SCALE
            );
            const material = new THREE.MeshStandardMaterial({
                color: blockColors[i],
                roughness: 0.7,
                metalness: 0.1
            });
            const block = new THREE.Mesh(geometry, material);
            block.position.set(pos.x, 1.5 / GIANT_SCALE, pos.z);
            this.scene.add(block);
        });

        // Scattered blocks - smaller toy-sized blocks (reduced count for Quest 2 performance)
        for (let i = 0; i < 5; i++) {
            const worldSize = 0.5 + Math.random() * 1.5; // 0.5-2m in world
            const vrSize = worldSize / GIANT_SCALE; // 0.05-0.2m in VR
            const geometry = new THREE.BoxGeometry(vrSize, vrSize * 2, vrSize);
            const material = new THREE.MeshStandardMaterial({
                color: blockColors[Math.floor(Math.random() * blockColors.length)],
                roughness: 0.7,
                metalness: 0.1
            });
            const block = new THREE.Mesh(geometry, material);
            block.position.set(
                (Math.random() - 0.5) * 40 / GIANT_SCALE, // ±2m in VR
                vrSize,
                (Math.random() - 0.5) * 40 / GIANT_SCALE
            );
            block.rotation.y = Math.random() * Math.PI;
            this.scene.add(block);
        }
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
                });
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
}
