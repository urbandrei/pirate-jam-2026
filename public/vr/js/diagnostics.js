/**
 * Floating HUD diagnostic display for VR performance monitoring
 * Shows FPS, frame time, JS heap memory, and Three.js renderer stats
 * Attaches to camera rig so it follows head movement (always visible)
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class DiagnosticsDisplay {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.visible = true;

        // Update interval (500ms to minimize overhead)
        this.updateInterval = 500;
        this.lastUpdateTime = 0;

        // FPS tracking
        this.frameCount = 0;
        this.lastFPSTime = 0;
        this.currentFPS = 0;
        this.frameTime = 0;
        this.lastFrameTime = 0;

        // Create canvas for text rendering (256x256 for sharp text)
        this.canvas = document.createElement('canvas');
        this.canvas.width = 256;
        this.canvas.height = 256;
        this.ctx = this.canvas.getContext('2d');

        // Create texture and material
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;

        const material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false
        });

        // Create plane geometry (sized for HUD viewing ~10cm x 10cm)
        const geometry = new THREE.PlaneGeometry(0.10, 0.10);
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.visible = true;

        // Will be attached to camera rig in attachToCamera()
        this.attachedToCamera = false;

        scene.add(this.mesh);

        // Initial render
        this.renderDisplay();
    }

    /**
     * Attach the diagnostic display to the camera rig (floating HUD)
     * @param {THREE.Object3D} cameraRig - The camera rig to attach to
     */
    attachToCamera(cameraRig) {
        if (!cameraRig) return;

        // Remove from scene and add to camera rig
        this.scene.remove(this.mesh);
        cameraRig.add(this.mesh);

        // Position in lower-left of view (opposite from player count in upper-right)
        // Player count is at (0.3, 0.2, -0.5), so we go to (-0.3, -0.15, -0.5)
        this.mesh.position.set(-0.25, -0.15, -0.5);

        // Face the camera (no rotation needed since it's a child of cameraRig)
        this.mesh.rotation.set(0, 0, 0);

        this.attachedToCamera = true;
        this.visible = true;
        this.mesh.visible = true;
    }

    /**
     * Toggle visibility of the diagnostic display
     */
    toggle() {
        this.visible = !this.visible;
        this.mesh.visible = this.visible;

        if (this.visible) {
            // Force immediate update when shown
            this.renderDisplay();
        }
    }

    /**
     * Show the diagnostic display
     */
    show() {
        this.visible = true;
        this.mesh.visible = true;
        this.renderDisplay();
    }

    /**
     * Hide the diagnostic display
     */
    hide() {
        this.visible = false;
        this.mesh.visible = false;
    }

    /**
     * Update the diagnostic display (call each frame)
     * @param {number} time - Current time from animation loop
     */
    update(time) {
        // Track frame for FPS calculation
        this.frameCount++;

        // Calculate frame time
        if (this.lastFrameTime > 0) {
            this.frameTime = time - this.lastFrameTime;
        }
        this.lastFrameTime = time;

        // Update FPS every second
        if (time - this.lastFPSTime >= 1000) {
            this.currentFPS = this.frameCount;
            this.frameCount = 0;
            this.lastFPSTime = time;
        }

        // Only update display at interval and when visible
        if (!this.visible) return;
        if (time - this.lastUpdateTime < this.updateInterval) return;

        this.lastUpdateTime = time;
        this.renderDisplay();
    }

    /**
     * Render the diagnostic information to the canvas
     */
    renderDisplay() {
        const ctx = this.ctx;

        // Clear canvas
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, 256, 256);

        // Border
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, 252, 252);

        // Title
        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DIAGNOSTICS', 128, 24);

        // Divider line
        ctx.beginPath();
        ctx.moveTo(10, 32);
        ctx.lineTo(246, 32);
        ctx.stroke();

        // Stats text
        ctx.font = '14px monospace';
        ctx.textAlign = 'left';

        let y = 54;
        const lineHeight = 22;

        // FPS and Frame Time
        const fpsColor = this.currentFPS >= 72 ? '#00ff00' :
                         this.currentFPS >= 60 ? '#ffff00' : '#ff0000';
        ctx.fillStyle = fpsColor;
        ctx.fillText(`FPS: ${this.currentFPS}`, 12, y);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`Frame: ${this.frameTime.toFixed(1)}ms`, 130, y);
        y += lineHeight;

        // Memory (if available)
        if (performance.memory) {
            const usedMB = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1);
            const totalMB = (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(1);
            const limitMB = (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(0);

            // Color based on heap usage percentage
            const usagePercent = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;
            const memColor = usagePercent < 0.5 ? '#00ff00' :
                            usagePercent < 0.75 ? '#ffff00' : '#ff0000';

            ctx.fillStyle = '#aaaaaa';
            ctx.fillText('JS Heap:', 12, y);
            y += lineHeight;

            ctx.fillStyle = memColor;
            ctx.fillText(`  ${usedMB} / ${totalMB} MB`, 12, y);
            y += lineHeight;

            ctx.fillStyle = '#888888';
            ctx.fillText(`  Limit: ${limitMB} MB`, 12, y);
            y += lineHeight;
        } else {
            ctx.fillStyle = '#888888';
            ctx.fillText('Memory: N/A', 12, y);
            y += lineHeight;
        }

        // Three.js renderer stats
        y += 6;
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText('Renderer:', 12, y);
        y += lineHeight;

        const info = this.renderer.info;

        ctx.fillStyle = '#ffffff';
        ctx.fillText(`  Draw calls: ${info.render.calls}`, 12, y);
        y += lineHeight;

        ctx.fillText(`  Triangles: ${info.render.triangles}`, 12, y);
        y += lineHeight;

        ctx.fillText(`  Textures: ${info.memory.textures}`, 12, y);
        y += lineHeight;

        ctx.fillText(`  Geometries: ${info.memory.geometries}`, 12, y);
        y += lineHeight;

        // Update texture
        this.texture.needsUpdate = true;
    }

    /**
     * Clean up resources
     */
    dispose() {
        if (this.mesh) {
            if (this.mesh.parent) {
                this.mesh.parent.remove(this.mesh);
            }
            if (this.mesh.geometry) {
                this.mesh.geometry.dispose();
            }
            if (this.mesh.material) {
                this.mesh.material.dispose();
            }
        }
        if (this.texture) {
            this.texture.dispose();
        }
        this.canvas = null;
        this.ctx = null;
    }
}
