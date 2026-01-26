/**
 * Sleep Minigame - 2D overlay minigame during sleep
 *
 * Player clicks squares that move across the screen.
 * Better performance = faster rest restoration.
 */

import {
    SLEEP_MINIGAME_DURATION,
    SLEEP_MINIGAME_SQUARES,
    SLEEP_BASE_MULTIPLIER,
    SLEEP_MAX_MULTIPLIER,
    SLEEP_SQUARE_SIZE,
    SLEEP_SQUARE_SPEED
} from '../shared/constants.js';

/**
 * Sleep Minigame class
 */
export class SleepMinigame {
    /**
     * @param {function} onComplete - Callback when minigame ends: (score, multiplier) => void
     */
    constructor(onComplete) {
        this.onComplete = onComplete;
        this.isActive = false;

        // Game state
        this.squares = [];
        this.score = 0;
        this.totalSquares = 0;
        this.hits = 0;
        this.misses = 0;

        // Timing
        this.startTime = 0;
        this.lastSpawnTime = 0;
        this.spawnInterval = SLEEP_MINIGAME_DURATION / SLEEP_MINIGAME_SQUARES;

        // DOM elements
        this.overlay = null;
        this.canvas = null;
        this.ctx = null;
        this.progressBar = null;

        // Animation frame
        this.animationFrame = null;
        this.lastFrameTime = 0;

        // Bind methods
        this.update = this.update.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
    }

    /**
     * Start the minigame
     */
    start() {
        if (this.isActive) return;

        this.isActive = true;
        this.squares = [];
        this.score = 0;
        this.totalSquares = 0;
        this.hits = 0;
        this.misses = 0;
        this.startTime = performance.now();
        this.lastSpawnTime = this.startTime;
        this.lastFrameTime = this.startTime;

        this._createOverlay();
        this._startAnimation();
    }

    /**
     * Stop the minigame and clean up
     */
    stop() {
        if (!this.isActive) return;

        this.isActive = false;
        this._stopAnimation();
        this._removeOverlay();
    }

    /**
     * Create DOM overlay
     */
    _createOverlay() {
        // Main overlay container - full screen canvas, no header/score bar
        this.overlay = document.createElement('div');
        this.overlay.id = 'sleep-minigame-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 30, 0.7);
            z-index: 1000;
            cursor: crosshair;
        `;

        // Progress bar container - positioned at bottom center
        const progressContainer = document.createElement('div');
        progressContainer.style.cssText = `
            position: absolute;
            bottom: 40px;
            left: 50%;
            transform: translateX(-50%);
            width: 300px;
            height: 20px;
            background: rgba(0, 0, 0, 0.5);
            border: 2px solid #4169E1;
            border-radius: 10px;
            overflow: hidden;
        `;

        this.progressBar = document.createElement('div');
        this.progressBar.style.cssText = `
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #4169E1, #6495ED);
            transition: width 0.1s linear;
        `;
        progressContainer.appendChild(this.progressBar);
        this.overlay.appendChild(progressContainer);

        // Canvas for squares - full screen
        this.canvas = document.createElement('canvas');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
        `;
        this.ctx = this.canvas.getContext('2d');
        this.overlay.appendChild(this.canvas);

        // Use mousedown for immediate response on click (not release)
        this.canvas.addEventListener('mousedown', this.onMouseDown);

        // Add to document
        document.body.appendChild(this.overlay);

        // Handle resize
        this._onResize = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', this._onResize);
    }

    /**
     * Remove DOM overlay
     */
    _removeOverlay() {
        if (this.overlay) {
            if (this.canvas) {
                this.canvas.removeEventListener('mousedown', this.onMouseDown);
            }
            window.removeEventListener('resize', this._onResize);
            document.body.removeChild(this.overlay);
            this.overlay = null;
            this.canvas = null;
            this.ctx = null;
            this.progressBar = null;
        }
    }

    /**
     * Start animation loop
     */
    _startAnimation() {
        this.animationFrame = requestAnimationFrame(this.update);
    }

    /**
     * Stop animation loop
     */
    _stopAnimation() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    /**
     * Main update loop
     */
    update(currentTime) {
        if (!this.isActive) return;

        const deltaTime = (currentTime - this.lastFrameTime) / 1000;
        this.lastFrameTime = currentTime;

        const elapsed = currentTime - this.startTime;
        const progress = elapsed / SLEEP_MINIGAME_DURATION;

        // Update progress bar
        this.progressBar.style.width = `${Math.min(progress * 100, 100)}%`;

        // Spawn new squares
        if (elapsed - (this.lastSpawnTime - this.startTime) >= this.spawnInterval && this.totalSquares < SLEEP_MINIGAME_SQUARES) {
            this._spawnSquare();
            this.lastSpawnTime = currentTime;
        }

        // Update squares
        this._updateSquares(deltaTime);

        // Draw
        this._draw();

        // Check if game is over
        if (elapsed >= SLEEP_MINIGAME_DURATION && this.squares.length === 0) {
            this._endGame();
            return;
        }

        this.animationFrame = requestAnimationFrame(this.update);
    }

    /**
     * Spawn a new square
     */
    _spawnSquare() {
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;

        // Randomly choose left or right side
        const fromLeft = Math.random() > 0.5;
        const startX = fromLeft ? -SLEEP_SQUARE_SIZE : canvasWidth + SLEEP_SQUARE_SIZE;
        const endX = fromLeft ? canvasWidth + SLEEP_SQUARE_SIZE : -SLEEP_SQUARE_SIZE;

        // Random Y position within middle 70% of screen
        const minY = canvasHeight * 0.15;
        const maxY = canvasHeight * 0.85;
        const y = minY + Math.random() * (maxY - minY);

        // Simple linear movement - 2-4 seconds to cross
        const duration = 2 + Math.random() * 2;

        this.squares.push({
            x: startX,
            y: y,
            startX: startX,
            endX: endX,
            duration: duration,
            elapsed: 0,
            size: SLEEP_SQUARE_SIZE,
            color: this._getRandomColor(),
            hit: false,
            missed: false,
            fadeOut: 0
        });

        this.totalSquares++;
    }

    /**
     * Get a random bright color
     */
    _getRandomColor() {
        const colors = [
            '#FF6B6B',  // Coral red
            '#4ECDC4',  // Turquoise
            '#FFE66D',  // Yellow
            '#95E1D3',  // Mint
            '#F38181',  // Pink
            '#AA96DA',  // Lavender
            '#FCE38A',  // Light yellow
            '#95E1D3'   // Light teal
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    /**
     * Update all squares
     */
    _updateSquares(deltaTime) {
        for (let i = this.squares.length - 1; i >= 0; i--) {
            const sq = this.squares[i];

            if (sq.hit || sq.missed) {
                // Fade out animation
                sq.fadeOut += deltaTime * 3;
                if (sq.fadeOut >= 1) {
                    this.squares.splice(i, 1);
                }
                continue;
            }

            // Update position - simple linear movement
            sq.elapsed += deltaTime;
            const t = sq.elapsed / sq.duration;

            if (t >= 1) {
                // Square reached the end without being clicked
                sq.missed = true;
                this.misses++;
                sq.color = '#FF0000';  // Turn red
                continue;
            }

            // Linear interpolation for x, y stays constant
            sq.x = sq.startX + (sq.endX - sq.startX) * t;
        }
    }

    /**
     * Draw all elements
     */
    _draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (const sq of this.squares) {
            ctx.save();

            // Apply fade out
            if (sq.fadeOut > 0) {
                ctx.globalAlpha = 1 - sq.fadeOut;
            }

            ctx.fillStyle = sq.color;

            // Draw simple square
            const x = sq.x - sq.size / 2;
            const y = sq.y - sq.size / 2;
            ctx.fillRect(x, y, sq.size, sq.size);

            // Draw border for hit squares
            if (sq.hit) {
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, sq.size, sq.size);
            }

            ctx.restore();
        }
    }

    /**
     * Handle mousedown events (fires on click, not release)
     */
    onMouseDown(event) {
        if (!this.isActive) return;

        // Get click position relative to canvas
        const rect = this.canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        // Check if click hit any square
        for (const sq of this.squares) {
            if (sq.hit || sq.missed) continue;

            const dx = clickX - sq.x;
            const dy = clickY - sq.y;
            const hitRadius = sq.size * 0.78;  // Covers full square + 10% bonus

            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                // Hit!
                sq.hit = true;
                sq.color = '#00FF00';  // Turn green
                this.hits++;
                this.score += 10;
                break;  // Only hit one square per click
            }
        }
    }

    /**
     * End the game and calculate results
     */
    _endGame() {
        this.isActive = false;
        this._stopAnimation();

        // Calculate score percentage
        const maxScore = SLEEP_MINIGAME_SQUARES * 10;
        const scorePercent = Math.round((this.score / maxScore) * 100);

        // Calculate multiplier (linear interpolation between base and max)
        const multiplier = SLEEP_BASE_MULTIPLIER +
            (SLEEP_MAX_MULTIPLIER - SLEEP_BASE_MULTIPLIER) * (scorePercent / 100);

        // Remove overlay immediately - no stats screen
        this._removeOverlay();

        // Call completion callback immediately
        if (this.onComplete) {
            this.onComplete(scorePercent, multiplier);
        }
    }
}
