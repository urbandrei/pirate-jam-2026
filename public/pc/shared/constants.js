/**
 * Shared constants for client and server
 *
 * COORDINATE SYSTEM:
 * - Server stores all positions in "world units" (1 unit = 1 meter at PC scale)
 * - PC client renders at 1:1 scale (world units = meters)
 * - VR client renders world at 1/GIANT_SCALE (tiny tabletop view)
 * - VR hands send positions × GIANT_SCALE to server
 *
 * VISUAL RESULT:
 * - PC view: VR players appear as 18m tall giants
 * - VR view: PC players appear as 18cm tall action figures
 */

// Single scale factor for the "Giants vs Tiny" mechanic
// VR player is at normal human scale (~1.8m), PC world appears tiny
// PC player sees VR player as a giant (10x larger)
export const GIANT_SCALE = 10;

// Player dimensions (PC scale, in meters)
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_RADIUS = 0.3;
export const PLAYER_EYE_HEIGHT = 1.6;

// Physics constants
export const MOVE_SPEED = 5.0;
export const JUMP_VELOCITY = 5.0;
export const GRAVITY = -15.0;
export const GROUND_LEVEL = 0.9; // Capsule center when standing

// Network
export const SERVER_PEER_ID = 'game-server';
export const NETWORK_RATE = 20; // Hz
export const INPUT_RATE = 60; // Hz

// Pinch detection
export const PINCH_THRESHOLD = 0.02; // 2cm (VR scale)

// World
export const WORLD_SIZE = 100; // Total size of the play area
export const WORLD_HALF = 50;

// Room constants
export const ROOM_SIZE = 20; // 20m × 20m × 20m (4x original size)
export const SMALL_ROOM_SIZE = 10; // 10m grid cells (1.5x scale)
export const WALL_THICKNESS = 0.2; // 0.2m thin walls
export const DOORWAY_HEIGHT = PLAYER_HEIGHT * 1.3; // ~2.34m
export const DOORWAY_WIDTH = 1.2; // 1.2m wide doorways

// Needs system
export const HUNGER_DECAY_RATE = 100 / (10 * 60);  // 0-100 over 10 min
export const THIRST_DECAY_RATE = 100 / (8 * 60);   // 0-100 over 8 min
export const REST_DECAY_RATE = 100 / (15 * 60);    // 0-100 over 15 min
export const REST_RESTORE_RATE = REST_DECAY_RATE * 5;  // 5x faster when sleeping
export const NEED_MAX = 100;
export const NEED_CRITICAL = 20;  // Red warning threshold
export const NEED_LOW = 50;       // Yellow warning threshold

// Colors
export const COLORS = {
    GROUND: 0x3d5c3d,
    SKY: 0x000000,
    PC_PLAYER: 0x4488ff,
    VR_PLAYER: 0xff4444,
    VR_HAND: 0xffcc88,
    GRABBED_OVERLAY: 0xff0000,
    BLOCK_RED: 0xff4444,
    BLOCK_GREEN: 0x44ff44,
    BLOCK_BLUE: 0x4444ff,
    BLOCK_YELLOW: 0xffff44,
    BLOCK_PURPLE: 0xff44ff
};
