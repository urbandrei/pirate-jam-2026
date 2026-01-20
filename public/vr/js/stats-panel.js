/**
 * Stats Panel for VR client
 * Displays aggregate population statistics for the VR overseer
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class StatsPanel {
    constructor(scene) {
        this.scene = scene;
        this.sprite = null;
        this.canvas = null;
        this.ctx = null;

        // Cache last values to avoid unnecessary updates
        this._lastStats = null;

        this._init();
    }

    _init() {
        // Create canvas for text rendering
        this.canvas = document.createElement('canvas');
        this.canvas.width = 300;
        this.canvas.height = 180;
        this.ctx = this.canvas.getContext('2d');

        // Create texture and sprite
        const texture = new THREE.CanvasTexture(this.canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });
        this.sprite = new THREE.Sprite(material);
        this.sprite.scale.set(0.25, 0.15, 1);

        // Add to scene (position will be updated each frame by main.js)
        this.scene.add(this.sprite);

        // Initial render
        this._render({
            alivePlayers: 0,
            deadPlayers: 0,
            averageHunger: 100,
            averageThirst: 100,
            averageRest: 100,
            criticalCount: 0
        });
    }

    /**
     * Update the stats panel with current game state
     * @param {Object} state - The full game state from server
     */
    update(state) {
        if (!state || !state.players) return;

        // Calculate aggregate stats
        const stats = this._calculateStats(state.players);

        // Skip update if nothing changed
        if (this._lastStats &&
            stats.alivePlayers === this._lastStats.alivePlayers &&
            stats.deadPlayers === this._lastStats.deadPlayers &&
            stats.averageHunger === this._lastStats.averageHunger &&
            stats.averageThirst === this._lastStats.averageThirst &&
            stats.averageRest === this._lastStats.averageRest &&
            stats.criticalCount === this._lastStats.criticalCount) {
            return;
        }

        this._lastStats = stats;
        this._render(stats);
    }

    /**
     * Calculate aggregate statistics from players
     * @param {Object} players - Players object from state
     * @returns {Object} Aggregate statistics
     */
    _calculateStats(players) {
        const playerArray = Object.values(players);
        const pcPlayers = playerArray.filter(p => p.type === 'pc');
        const alivePCPlayers = pcPlayers.filter(p => p.alive);

        if (alivePCPlayers.length === 0) {
            return {
                alivePlayers: 0,
                deadPlayers: pcPlayers.filter(p => !p.alive).length,
                averageHunger: 0,
                averageThirst: 0,
                averageRest: 0,
                criticalCount: 0
            };
        }

        let totalHunger = 0;
        let totalThirst = 0;
        let totalRest = 0;
        let criticalCount = 0;

        for (const player of alivePCPlayers) {
            if (player.needs) {
                totalHunger += player.needs.hunger;
                totalThirst += player.needs.thirst;
                totalRest += player.needs.rest;

                // Count players with any critical need
                if (player.needs.hunger < 20 || player.needs.thirst < 20 || player.needs.rest < 20) {
                    criticalCount++;
                }
            }
        }

        return {
            alivePlayers: alivePCPlayers.length,
            deadPlayers: pcPlayers.filter(p => !p.alive).length,
            averageHunger: Math.round(totalHunger / alivePCPlayers.length),
            averageThirst: Math.round(totalThirst / alivePCPlayers.length),
            averageRest: Math.round(totalRest / alivePCPlayers.length),
            criticalCount
        };
    }

    /**
     * Render the stats to the canvas
     * @param {Object} stats - Aggregate statistics
     */
    _render(stats) {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, 300, 180);

        // Semi-transparent background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.roundRect(0, 0, 300, 180, 10);
        ctx.fill();

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Population Stats', 150, 25);

        // Stats text
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';

        // Alive/Dead counts
        ctx.fillStyle = '#44ff44';
        ctx.fillText(`Alive: ${stats.alivePlayers}`, 20, 50);
        ctx.fillStyle = '#ff4444';
        ctx.fillText(`Dead: ${stats.deadPlayers}`, 150, 50);

        // Average needs with color coding
        const y = 75;
        const barWidth = 80;
        const barHeight = 12;

        // Hunger
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Hunger:', 20, y);
        this._drawBar(ctx, 90, y - 10, barWidth, barHeight, stats.averageHunger, '#f7931e');

        // Thirst
        ctx.fillText('Thirst:', 20, y + 25);
        this._drawBar(ctx, 90, y + 15, barWidth, barHeight, stats.averageThirst, '#0077b6');

        // Rest
        ctx.fillText('Rest:', 20, y + 50);
        this._drawBar(ctx, 90, y + 40, barWidth, barHeight, stats.averageRest, '#8338ec');

        // Critical warning
        if (stats.criticalCount > 0) {
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${stats.criticalCount} player(s) critical!`, 150, 165);
        }

        // Update texture
        this.sprite.material.map.needsUpdate = true;
    }

    /**
     * Draw a horizontal bar
     */
    _drawBar(ctx, x, y, width, height, value, color) {
        // Background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(x, y, width, height);

        // Fill
        ctx.fillStyle = value < 20 ? '#ff4444' : color;
        ctx.fillRect(x, y, (width * value) / 100, height);

        // Value text
        ctx.fillStyle = '#ffffff';
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`${value}%`, x + width + 5, y + 10);
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
            if (this.scene) {
                this.scene.remove(this.sprite);
            }
            this.sprite = null;
        }
        this.canvas = null;
        this.ctx = null;
    }
}
