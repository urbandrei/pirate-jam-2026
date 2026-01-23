/**
 * Chat Panel for VR client
 * Displays chat messages from PC players in a HUD sprite
 * Features: text wrapping, unlimited history, auto-scroll to newest
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 200;
const LINE_HEIGHT = 18;
const FONT_SIZE = 14;
const INDENT = '    '; // 4 spaces for continuation lines

export class ChatPanel {
    constructor() {
        this.sprite = null;
        this.canvas = null;
        this.ctx = null;

        // Message history (newest at end) - no limit
        this.messages = [];

        // Color cache: playerId -> hsl color string
        this.playerColors = new Map();

        this._init();
    }

    _init() {
        // Create canvas for text rendering
        this.canvas = document.createElement('canvas');
        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;
        this.ctx = this.canvas.getContext('2d');

        // Create texture and sprite
        const texture = new THREE.CanvasTexture(this.canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });
        this.sprite = new THREE.Sprite(material);
        // Smaller scale: 0.2 x 0.125 (maintains 320:200 aspect ratio)
        this.sprite.scale.set(0.2, 0.125, 1);

        // Initial render (empty state)
        this._render();
    }

    /**
     * Add a new chat message
     * @param {string} senderId - Sender's player ID
     * @param {string} senderName - Sender's display name
     * @param {string} text - Message text
     * @param {string} platform - Optional platform ('twitch', etc.) for stream messages
     * @param {string} platformColor - Optional platform-specific user color
     */
    addMessage(senderId, senderName, text, platform = null, platformColor = null) {
        // Get color for this sender
        let color;
        if (platform === 'twitch') {
            // Use Twitch user color or default Twitch purple
            color = platformColor || 'hsl(264, 100%, 64%)';
        } else {
            color = this._getPlayerColor(senderId);
        }

        // Prepend platform indicator for stream messages
        const displayName = platform ? `[${platform.toUpperCase().slice(0, 3)}] ${senderName}` : senderName;

        // Add message (no limit)
        this.messages.push({
            senderId,
            senderName: displayName,
            text,
            color,
            isStream: !!platform
        });

        // Re-render
        this._render();
    }

    /**
     * Get consistent color for a player ID
     * @param {string} playerId - Player ID to hash
     * @returns {string} HSL color string
     */
    _getPlayerColor(playerId) {
        if (this.playerColors.has(playerId)) {
            return this.playerColors.get(playerId);
        }

        // Hash player ID to get hue (0-360)
        let hash = 0;
        for (let i = 0; i < playerId.length; i++) {
            hash = playerId.charCodeAt(i) + ((hash << 5) - hash);
            hash = hash & hash; // Convert to 32-bit integer
        }
        const hue = Math.abs(hash % 360);

        // Use fixed saturation and lightness for readability
        const color = `hsl(${hue}, 70%, 65%)`;
        this.playerColors.set(playerId, color);
        return color;
    }

    /**
     * Wrap a message into multiple lines
     * @param {Object} msg - Message object with senderName, text, color
     * @returns {Array} Array of line objects { text, color, isName }
     */
    _wrapMessage(msg) {
        const ctx = this.ctx;
        const maxWidth = CANVAS_WIDTH - 20; // 10px padding each side
        const lines = [];

        ctx.font = `${FONT_SIZE}px Arial`;
        const nameText = msg.senderName + ': ';
        const nameWidth = ctx.measureText(nameText).width;
        const indentWidth = ctx.measureText(INDENT).width;

        // First line: "Name: text..."
        let remainingText = msg.text;
        let firstLineMaxWidth = maxWidth - nameWidth;

        // Get first line of text
        let firstLineText = this._fitText(remainingText, firstLineMaxWidth);
        lines.push({
            nameText: nameText,
            lineText: firstLineText,
            color: msg.color,
            isFirstLine: true
        });

        remainingText = remainingText.slice(firstLineText.length).trim();

        // Continuation lines (indented)
        while (remainingText.length > 0) {
            const contLineMaxWidth = maxWidth - indentWidth;
            const lineText = this._fitText(remainingText, contLineMaxWidth);
            lines.push({
                nameText: INDENT,
                lineText: lineText,
                color: msg.color,
                isFirstLine: false
            });
            remainingText = remainingText.slice(lineText.length).trim();
        }

        return lines;
    }

    /**
     * Fit text within a max width, breaking at word boundaries when possible
     * @param {string} text - Text to fit
     * @param {number} maxWidth - Maximum width in pixels
     * @returns {string} Text that fits
     */
    _fitText(text, maxWidth) {
        const ctx = this.ctx;

        // If it all fits, return it
        if (ctx.measureText(text).width <= maxWidth) {
            return text;
        }

        // Try to break at word boundary
        const words = text.split(' ');
        let fitted = '';

        for (const word of words) {
            const test = fitted ? fitted + ' ' + word : word;
            if (ctx.measureText(test).width <= maxWidth) {
                fitted = test;
            } else {
                break;
            }
        }

        // If we got at least one word, use it
        if (fitted.length > 0) {
            return fitted;
        }

        // Otherwise, break mid-word
        let result = '';
        for (const char of text) {
            if (ctx.measureText(result + char).width > maxWidth) {
                break;
            }
            result += char;
        }

        return result || text.charAt(0); // At least one character
    }

    /**
     * Render the chat panel to canvas
     */
    _render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Semi-transparent background with rounded corners
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.roundRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 8);
        ctx.fill();

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 16px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('Chat', CANVAS_WIDTH / 2, 22);

        // Draw separator line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(10, 32);
        ctx.lineTo(CANVAS_WIDTH - 10, 32);
        ctx.stroke();

        // Pre-calculate all wrapped lines for all messages
        ctx.font = `${FONT_SIZE}px Arial`;
        const allLines = [];
        for (const msg of this.messages) {
            const wrappedLines = this._wrapMessage(msg);
            allLines.push(...wrappedLines);
        }

        // Calculate how many lines fit in visible area
        const visibleTop = 40;
        const visibleHeight = CANVAS_HEIGHT - visibleTop - 5;
        const maxVisibleLines = Math.floor(visibleHeight / LINE_HEIGHT);

        // Take only the last N lines (auto-scroll to bottom)
        const visibleLines = allLines.slice(-maxVisibleLines);

        // Render visible lines from top to bottom
        ctx.textAlign = 'left';
        let y = visibleTop + LINE_HEIGHT - 4;

        for (const line of visibleLines) {
            // Draw name/indent in color (or white for continuation)
            if (line.isFirstLine) {
                ctx.fillStyle = line.color;
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            }
            const nameWidth = ctx.measureText(line.nameText).width;
            ctx.fillText(line.nameText, 10, y);

            // Draw message text in white
            ctx.fillStyle = '#ffffff';
            ctx.fillText(line.lineText, 10 + nameWidth, y);

            y += LINE_HEIGHT;
        }

        // Update texture
        this.sprite.material.map.needsUpdate = true;
    }

    /**
     * Cleanup resources
     */
    dispose() {
        if (this.sprite) {
            if (this.sprite.material && this.sprite.material.map) {
                this.sprite.material.map.dispose();
            }
            if (this.sprite.material) {
                this.sprite.material.dispose();
            }
            if (this.sprite.geometry) {
                this.sprite.geometry.dispose();
            }
            this.sprite = null;
        }
        this.canvas = null;
        this.ctx = null;
        this.messages = [];
        this.playerColors.clear();
    }
}
