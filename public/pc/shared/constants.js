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

// Grab mechanics
export const GRAB_RADIUS = 0.5; // meters (PC scale)
export const PINCH_THRESHOLD = 0.02; // 2cm (VR scale)

// World
export const WORLD_SIZE = 100; // Total size of the play area
export const WORLD_HALF = 50;

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
