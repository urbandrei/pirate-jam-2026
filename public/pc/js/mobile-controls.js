/**
 * Mobile touch controls for PC client
 * Left joystick: WASD movement
 * Right joystick: Camera look
 * Buttons: Jump, Interact
 */

export class MobileControls {
    constructor(controls) {
        this.controls = controls;
        this.enabled = false;

        // Joystick state
        this.leftJoystick = { active: false, x: 0, y: 0, touchId: null, startX: 0, startY: 0 };
        this.rightJoystick = { active: false, x: 0, y: 0, touchId: null, startX: 0, startY: 0 };

        // Configuration
        this.deadZone = 10;
        this.maxRadius = 35;
        this.movementThreshold = 0.3;
        this.lookSensitivity = 0.03;

        // DOM elements
        this.container = null;
        this.leftBase = null;
        this.leftKnob = null;
        this.rightBase = null;
        this.rightKnob = null;
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
        console.log('[MobileControls] Initialized, toggle button visible');
    }

    cacheElements() {
        this.container = document.getElementById('mobile-controls');
        this.leftBase = document.querySelector('#mobile-joystick-left .joystick-base');
        this.leftKnob = document.querySelector('#mobile-joystick-left .joystick-knob');
        this.rightBase = document.querySelector('#mobile-joystick-right .joystick-base');
        this.rightKnob = document.querySelector('#mobile-joystick-right .joystick-knob');

        this.jumpButton = document.getElementById('mobile-jump-btn');
        this.interactButton = document.getElementById('mobile-interact-btn');
        this.toggleButton = document.getElementById('mobile-toggle-btn');

        console.log('[MobileControls] Elements found:', {
            container: !!this.container,
            leftBase: !!this.leftBase,
            rightBase: !!this.rightBase,
            toggleButton: !!this.toggleButton
        });
    }

    setupEventListeners() {
        // Left joystick touch events
        if (this.leftBase) {
            this.leftBase.addEventListener('touchstart', (e) => this.handleJoystickStart(e, 'left'), { passive: false });
            this.leftBase.addEventListener('touchmove', (e) => this.handleJoystickMove(e, 'left'), { passive: false });
            this.leftBase.addEventListener('touchend', (e) => this.handleJoystickEnd(e, 'left'), { passive: false });
            this.leftBase.addEventListener('touchcancel', (e) => this.handleJoystickEnd(e, 'left'), { passive: false });
        }

        // Right joystick touch events
        if (this.rightBase) {
            this.rightBase.addEventListener('touchstart', (e) => this.handleJoystickStart(e, 'right'), { passive: false });
            this.rightBase.addEventListener('touchmove', (e) => this.handleJoystickMove(e, 'right'), { passive: false });
            this.rightBase.addEventListener('touchend', (e) => this.handleJoystickEnd(e, 'right'), { passive: false });
            this.rightBase.addEventListener('touchcancel', (e) => this.handleJoystickEnd(e, 'right'), { passive: false });
        }

        // Button events
        if (this.jumpButton) {
            this.jumpButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.handleJumpPress();
            }, { passive: false });
        }

        if (this.interactButton) {
            this.interactButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
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

    handleJoystickStart(e, side) {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const joystick = side === 'left' ? this.leftJoystick : this.rightJoystick;
        const base = side === 'left' ? this.leftBase : this.rightBase;

        if (joystick.active) return;

        const rect = base.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        joystick.active = true;
        joystick.touchId = touch.identifier;
        joystick.startX = centerX;
        joystick.startY = centerY;

        this.updateJoystickPosition(touch.clientX, touch.clientY, side);
        base.classList.add('active');
    }

    handleJoystickMove(e, side) {
        e.preventDefault();
        const joystick = side === 'left' ? this.leftJoystick : this.rightJoystick;

        if (!joystick.active) return;

        for (const touch of e.changedTouches) {
            if (touch.identifier === joystick.touchId) {
                this.updateJoystickPosition(touch.clientX, touch.clientY, side);
                break;
            }
        }
    }

    handleJoystickEnd(e, side) {
        e.preventDefault();
        const joystick = side === 'left' ? this.leftJoystick : this.rightJoystick;
        const base = side === 'left' ? this.leftBase : this.rightBase;
        const knob = side === 'left' ? this.leftKnob : this.rightKnob;

        for (const touch of e.changedTouches) {
            if (touch.identifier === joystick.touchId) {
                joystick.active = false;
                joystick.touchId = null;
                joystick.x = 0;
                joystick.y = 0;

                // Reset knob to center
                if (knob) {
                    knob.style.transform = 'translate(-50%, -50%)';
                }
                base.classList.remove('active');

                // Clear movement inputs for left joystick
                if (side === 'left') {
                    this.controls.input.forward = false;
                    this.controls.input.backward = false;
                    this.controls.input.left = false;
                    this.controls.input.right = false;
                }
                break;
            }
        }
    }

    updateJoystickPosition(clientX, clientY, side) {
        const joystick = side === 'left' ? this.leftJoystick : this.rightJoystick;
        const knob = side === 'left' ? this.leftKnob : this.rightKnob;

        let dx = clientX - joystick.startX;
        let dy = clientY - joystick.startY;

        const magnitude = Math.sqrt(dx * dx + dy * dy);

        // Clamp to max radius for visual
        if (magnitude > this.maxRadius) {
            dx = (dx / magnitude) * this.maxRadius;
            dy = (dy / magnitude) * this.maxRadius;
        }

        // Update knob visual position
        if (knob) {
            knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        }

        // Calculate normalized values (-1 to 1)
        if (magnitude > this.deadZone) {
            joystick.x = Math.max(-1, Math.min(1, (clientX - joystick.startX) / this.maxRadius));
            joystick.y = Math.max(-1, Math.min(1, (clientY - joystick.startY) / this.maxRadius));
        } else {
            joystick.x = 0;
            joystick.y = 0;
        }
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
        if (!this.enabled) return;

        // Check if chat input is focused - disable movement
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            return;
        }

        // Left joystick -> WASD movement
        if (this.leftJoystick.active) {
            const lx = this.leftJoystick.x;
            const ly = this.leftJoystick.y;

            this.controls.input.forward = ly < -this.movementThreshold;
            this.controls.input.backward = ly > this.movementThreshold;
            this.controls.input.left = lx < -this.movementThreshold;
            this.controls.input.right = lx > this.movementThreshold;
        }

        // Right joystick -> Camera look
        if (this.rightJoystick.active) {
            const rx = this.rightJoystick.x;
            const ry = this.rightJoystick.y;

            this.controls.yaw -= rx * this.lookSensitivity;
            this.controls.pitch -= ry * this.lookSensitivity;

            // Clamp pitch (same as Controls.js)
            this.controls.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.controls.pitch));
        }
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

        // Clear any active inputs
        this.leftJoystick.active = false;
        this.leftJoystick.x = 0;
        this.leftJoystick.y = 0;
        this.rightJoystick.active = false;
        this.rightJoystick.x = 0;
        this.rightJoystick.y = 0;

        this.controls.input.forward = false;
        this.controls.input.backward = false;
        this.controls.input.left = false;
        this.controls.input.right = false;
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
