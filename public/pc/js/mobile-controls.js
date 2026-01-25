/**
 * Mobile touch controls for PC client
 * Left half: Dynamic joystick spawns at touch location for movement
 * Right half: Direct swipe for camera look
 * Buttons: Jump, Interact (always visible at bottom-right)
 */

export class MobileControls {
    constructor(controls) {
        this.controls = controls;
        this.enabled = false;

        // Touch tracking for movement (left half)
        this.movementTouch = {
            active: false,
            id: null,
            startX: 0,
            startY: 0
        };

        // Touch tracking for camera look (right half)
        this.lookTouch = {
            active: false,
            id: null,
            lastX: 0,
            lastY: 0
        };

        // Configuration
        this.deadZone = 10;
        this.maxRadius = 35;
        this.movementThreshold = 0.3;
        this.lookSensitivity = 0.005;

        // DOM elements
        this.container = null;
        this.dynamicJoystick = null;
        this.joystickBase = null;
        this.joystickKnob = null;
        this.jumpButton = null;
        this.interactButton = null;
        this.toggleButton = null;

        // Callbacks
        this.onLeftClick = null;

        this.init();
    }

    init() {
        this.cacheElements();

        if (!this.toggleButton) {
            console.error('[MobileControls] Toggle button not found');
            return;
        }

        this.setupEventListeners();

        // Auto-enable on touch devices or load saved preference
        if (this.shouldAutoEnable()) {
            this.enable();
        }

        // Always show toggle button (allows desktop testing too)
        this.toggleButton.classList.remove('hidden');
        console.log('[MobileControls] Initialized with touch zones');
    }

    cacheElements() {
        this.container = document.getElementById('mobile-controls');
        this.dynamicJoystick = document.getElementById('dynamic-joystick');
        this.joystickBase = this.dynamicJoystick?.querySelector('.joystick-base');
        this.joystickKnob = this.dynamicJoystick?.querySelector('.joystick-knob');
        this.jumpButton = document.getElementById('mobile-jump-btn');
        this.interactButton = document.getElementById('mobile-interact-btn');
        this.toggleButton = document.getElementById('mobile-toggle-btn');

        console.log('[MobileControls] Elements found:', {
            container: !!this.container,
            dynamicJoystick: !!this.dynamicJoystick,
            toggleButton: !!this.toggleButton
        });
    }

    setupEventListeners() {
        // Touch events on the full container for zone-based input
        if (this.container) {
            this.container.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
            this.container.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
            this.container.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
            this.container.addEventListener('touchcancel', (e) => this.handleTouchEnd(e), { passive: false });
        }

        // Button events
        if (this.jumpButton) {
            this.jumpButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleJumpPress();
            }, { passive: false });
        }

        if (this.interactButton) {
            this.interactButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleInteractPress();
            }, { passive: false });
        }

        // Toggle button
        if (this.toggleButton) {
            this.toggleButton.addEventListener('click', () => this.toggle());
            this.toggleButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.toggle();
            }, { passive: false });
        }
    }

    handleTouchStart(e) {
        if (!this.enabled) return;
        e.preventDefault();

        // Check if on home screen
        const homePage = document.getElementById('home-page');
        if (homePage && homePage.style.display !== 'none') {
            return;
        }

        // Check if chat input is focused
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            return;
        }

        for (const touch of e.changedTouches) {
            const isLeftHalf = touch.clientX < window.innerWidth / 2;

            if (isLeftHalf && !this.movementTouch.active) {
                // Start movement touch - spawn joystick at touch location
                this.movementTouch = {
                    active: true,
                    id: touch.identifier,
                    startX: touch.clientX,
                    startY: touch.clientY
                };
                this.showDynamicJoystick(touch.clientX, touch.clientY);
            } else if (!isLeftHalf && !this.lookTouch.active) {
                // Start look touch
                this.lookTouch = {
                    active: true,
                    id: touch.identifier,
                    lastX: touch.clientX,
                    lastY: touch.clientY
                };
            }
        }
    }

    handleTouchMove(e) {
        if (!this.enabled) return;
        e.preventDefault();

        for (const touch of e.changedTouches) {
            // Handle movement touch
            if (this.movementTouch.active && touch.identifier === this.movementTouch.id) {
                this.updateMovement(touch.clientX, touch.clientY);
            }

            // Handle look touch
            if (this.lookTouch.active && touch.identifier === this.lookTouch.id) {
                this.updateLook(touch);
            }
        }
    }

    handleTouchEnd(e) {
        if (!this.enabled) return;
        e.preventDefault();

        for (const touch of e.changedTouches) {
            // End movement touch
            if (this.movementTouch.active && touch.identifier === this.movementTouch.id) {
                this.movementTouch.active = false;
                this.movementTouch.id = null;
                this.hideDynamicJoystick();
                this.clearMovementInput();
            }

            // End look touch
            if (this.lookTouch.active && touch.identifier === this.lookTouch.id) {
                this.lookTouch.active = false;
                this.lookTouch.id = null;
            }
        }
    }

    showDynamicJoystick(x, y) {
        if (!this.dynamicJoystick) return;

        // Position joystick centered on touch point
        this.dynamicJoystick.style.left = `${x - 60}px`;
        this.dynamicJoystick.style.top = `${y - 60}px`;
        this.dynamicJoystick.classList.remove('hidden');

        // Reset knob to center
        if (this.joystickKnob) {
            this.joystickKnob.style.transform = 'translate(-50%, -50%)';
        }
    }

    hideDynamicJoystick() {
        if (!this.dynamicJoystick) return;
        this.dynamicJoystick.classList.add('hidden');
    }

    updateMovement(clientX, clientY) {
        const dx = clientX - this.movementTouch.startX;
        const dy = clientY - this.movementTouch.startY;
        const magnitude = Math.sqrt(dx * dx + dy * dy);

        // Clamp visual position to max radius
        let clampedDx = dx;
        let clampedDy = dy;
        if (magnitude > this.maxRadius) {
            clampedDx = (dx / magnitude) * this.maxRadius;
            clampedDy = (dy / magnitude) * this.maxRadius;
        }

        // Update knob visual position
        if (this.joystickKnob) {
            this.joystickKnob.style.transform = `translate(calc(-50% + ${clampedDx}px), calc(-50% + ${clampedDy}px))`;
        }

        // Calculate normalized values (-1 to 1) for input
        if (magnitude > this.deadZone) {
            const normalizedX = Math.max(-1, Math.min(1, dx / this.maxRadius));
            const normalizedY = Math.max(-1, Math.min(1, dy / this.maxRadius));

            this.controls.input.forward = normalizedY < -this.movementThreshold;
            this.controls.input.backward = normalizedY > this.movementThreshold;
            this.controls.input.left = normalizedX < -this.movementThreshold;
            this.controls.input.right = normalizedX > this.movementThreshold;
        } else {
            this.clearMovementInput();
        }
    }

    updateLook(touch) {
        const deltaX = touch.clientX - this.lookTouch.lastX;
        const deltaY = touch.clientY - this.lookTouch.lastY;

        // Apply camera rotation (like mouse movement)
        this.controls.yaw -= deltaX * this.lookSensitivity;
        this.controls.pitch -= deltaY * this.lookSensitivity;

        // Clamp pitch (same as Controls.js)
        this.controls.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.controls.pitch));

        // Update last position for next delta
        this.lookTouch.lastX = touch.clientX;
        this.lookTouch.lastY = touch.clientY;
    }

    clearMovementInput() {
        this.controls.input.forward = false;
        this.controls.input.backward = false;
        this.controls.input.left = false;
        this.controls.input.right = false;
    }

    handleJumpPress() {
        if (!this.enabled) return;
        this.controls.input.jump = true;
    }

    handleInteractPress() {
        if (!this.enabled) return;
        if (this.onLeftClick) {
            this.onLeftClick();
        }
    }

    update() {
        // Movement and look are now handled directly in touch events
        // This method kept for compatibility with game loop
    }

    isTouchDevice() {
        return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    }

    shouldAutoEnable() {
        const saved = localStorage.getItem('pirate-jam-mobile-controls');
        if (saved !== null) {
            return saved === 'enabled';
        }
        return this.isTouchDevice();
    }

    savePreference() {
        localStorage.setItem('pirate-jam-mobile-controls', this.enabled ? 'enabled' : 'disabled');
    }

    enable() {
        this.enabled = true;
        if (this.container) {
            this.container.classList.remove('hidden');
        }
        if (this.toggleButton) {
            this.toggleButton.classList.add('active');
        }
    }

    disable() {
        this.enabled = false;
        if (this.container) {
            this.container.classList.add('hidden');
        }
        if (this.toggleButton) {
            this.toggleButton.classList.remove('active');
        }

        // Clear any active touches
        this.movementTouch.active = false;
        this.lookTouch.active = false;
        this.hideDynamicJoystick();
        this.clearMovementInput();
    }

    toggle() {
        if (this.enabled) {
            this.disable();
        } else {
            this.enable();
        }
        this.savePreference();
    }
}
