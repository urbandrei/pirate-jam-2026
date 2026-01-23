/**
 * Player Name Label - Always visible name tag above players
 * Uses canvas texture on a Three.js sprite
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const LABEL_WIDTH = 256;
const LABEL_HEIGHT = 48;
const FONT_SIZE = 24;

export class PlayerNameLabel {
    constructor(scene, name = 'Player') {
        this.scene = scene;
        this.sprite = null;
        this.canvas = null;
        this.ctx = null;
        this.texture = null;
        this.material = null;
        this.currentName = name;

        this.createCanvas();
        this.createSprite();
        this.renderName(name);
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = LABEL_WIDTH;
        this.canvas.height = LABEL_HEIGHT;
        this.ctx = this.canvas.getContext('2d');
    }

    createSprite() {
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;

        this.material = new THREE.SpriteMaterial({
            map: this.texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });

        this.sprite = new THREE.Sprite(this.material);
        // Scale sprite to reasonable world size (about 1m wide)
        this.sprite.scale.set(1.0, 0.19, 1); // ~256:48 aspect ratio
        this.sprite.visible = true;

        this.scene.scene.add(this.sprite);
    }

    /**
     * Render the player name to the canvas
     * @param {string} name - Player's display name
     */
    renderName(name) {
        const ctx = this.ctx;
        this.currentName = name;

        // Clear canvas
        ctx.clearRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);

        // Draw text with shadow for visibility
        ctx.font = `bold ${FONT_SIZE}px 'Segoe UI', Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillText(name, LABEL_WIDTH / 2 + 2, LABEL_HEIGHT / 2 + 2);

        // Main text (white)
        ctx.fillStyle = '#ffffff';
        ctx.fillText(name, LABEL_WIDTH / 2, LABEL_HEIGHT / 2);

        // Update texture
        this.texture.needsUpdate = true;
    }

    /**
     * Update the displayed name if it changed
     * @param {string} name - New name to display
     */
    setName(name) {
        if (name !== this.currentName) {
            this.renderName(name);
        }
    }

    /**
     * Set the world position of the sprite
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    setPosition(x, y, z) {
        this.sprite.position.set(x, y, z);
    }

    /**
     * Show the label
     */
    show() {
        this.sprite.visible = true;
    }

    /**
     * Hide the label
     */
    hide() {
        this.sprite.visible = false;
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        if (this.sprite) {
            this.scene.scene.remove(this.sprite);
        }

        if (this.texture) {
            this.texture.dispose();
        }

        if (this.material) {
            this.material.dispose();
        }

        this.canvas = null;
        this.ctx = null;
    }
}
