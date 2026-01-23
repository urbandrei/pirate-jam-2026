/**
 * Speech Bubble renderer for chat messages above players
 * Uses canvas texture on a Three.js sprite
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const BUBBLE_WIDTH = 256;
const BUBBLE_HEIGHT = 96;
const FONT_SIZE = 18;
const PADDING = 12;
const CORNER_RADIUS = 10;
const MAX_LINE_LENGTH = 28;
const DEFAULT_DURATION = 5000; // 5 seconds

export class SpeechBubble {
    constructor(scene) {
        this.scene = scene;
        this.sprite = null;
        this.canvas = null;
        this.ctx = null;
        this.texture = null;
        this.material = null;

        this.fadeTimer = null;
        this.fadeStart = 0;
        this.fadeDuration = 500; // 0.5 second fade
        this.isVisible = false;

        this.createCanvas();
        this.createSprite();
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = BUBBLE_WIDTH;
        this.canvas.height = BUBBLE_HEIGHT;
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
        // Scale sprite to match canvas aspect ratio (in world units)
        this.sprite.scale.set(1.5, 0.56, 1); // ~256:96 aspect ratio
        this.sprite.visible = false;

        this.scene.scene.add(this.sprite);
    }

    /**
     * Render text to the canvas with word wrapping
     * @param {string} text - Message text
     */
    renderText(text) {
        const ctx = this.ctx;

        // Clear canvas
        ctx.clearRect(0, 0, BUBBLE_WIDTH, BUBBLE_HEIGHT);

        // Draw rounded rectangle background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.beginPath();
        this.roundRect(ctx, 2, 2, BUBBLE_WIDTH - 4, BUBBLE_HEIGHT - 4, CORNER_RADIUS);
        ctx.fill();

        // Draw border
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Setup text
        ctx.font = `${FONT_SIZE}px 'Segoe UI', Arial, sans-serif`;
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Word wrap
        const lines = this.wrapText(text, MAX_LINE_LENGTH);
        const lineHeight = FONT_SIZE + 4;
        const totalHeight = lines.length * lineHeight;
        const startY = (BUBBLE_HEIGHT - totalHeight) / 2 + lineHeight / 2;

        lines.forEach((line, i) => {
            ctx.fillText(line, BUBBLE_WIDTH / 2, startY + i * lineHeight);
        });

        // Update texture
        this.texture.needsUpdate = true;
    }

    /**
     * Draw a rounded rectangle path
     */
    roundRect(ctx, x, y, width, height, radius) {
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
    }

    /**
     * Wrap text to fit within max characters per line
     * @param {string} text - Text to wrap
     * @param {number} maxChars - Max characters per line
     * @returns {string[]} - Array of lines
     */
    wrapText(text, maxChars) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        words.forEach(word => {
            // Handle very long words
            if (word.length > maxChars) {
                if (currentLine) {
                    lines.push(currentLine);
                    currentLine = '';
                }
                // Split long word
                for (let i = 0; i < word.length; i += maxChars) {
                    lines.push(word.slice(i, i + maxChars));
                }
                return;
            }

            const testLine = currentLine ? `${currentLine} ${word}` : word;
            if (testLine.length <= maxChars) {
                currentLine = testLine;
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            }
        });

        if (currentLine) lines.push(currentLine);

        // Limit to 3 lines max
        if (lines.length > 3) {
            lines.length = 3;
            lines[2] = lines[2].slice(0, -3) + '...';
        }

        return lines;
    }

    /**
     * Show the speech bubble with text
     * @param {string} text - Message text
     * @param {number} duration - Duration in ms before fading (default 5000)
     */
    show(text, duration = DEFAULT_DURATION) {
        // Clear any existing timer
        if (this.fadeTimer) {
            clearTimeout(this.fadeTimer);
            this.fadeTimer = null;
        }

        // Render text to canvas
        this.renderText(text);

        // Show sprite at full opacity
        this.sprite.visible = true;
        this.material.opacity = 1;
        this.isVisible = true;

        // Set timer for fade
        this.fadeTimer = setTimeout(() => {
            this.startFade();
        }, duration);
    }

    /**
     * Start the fade out animation
     */
    startFade() {
        this.fadeStart = performance.now();
        this.fadeTimer = null;
    }

    /**
     * Immediately hide the bubble
     */
    hide() {
        if (this.fadeTimer) {
            clearTimeout(this.fadeTimer);
            this.fadeTimer = null;
        }
        this.sprite.visible = false;
        this.isVisible = false;
    }

    /**
     * Update fade animation
     * @param {number} deltaTime - Time since last frame (unused, we use performance.now)
     */
    update(deltaTime) {
        // Handle fade animation
        if (this.fadeStart > 0) {
            const elapsed = performance.now() - this.fadeStart;
            const progress = Math.min(elapsed / this.fadeDuration, 1);
            this.material.opacity = 1 - progress;

            if (progress >= 1) {
                this.sprite.visible = false;
                this.isVisible = false;
                this.fadeStart = 0;
            }
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
     * Dispose of all resources
     */
    dispose() {
        if (this.fadeTimer) {
            clearTimeout(this.fadeTimer);
            this.fadeTimer = null;
        }

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
