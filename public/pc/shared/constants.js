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
export const HUNGER_DECAY_RATE = 100 / 600;  // 0-100 over 10 minutes
export const THIRST_DECAY_RATE = 100 / 480;  // 0-100 over 8 minutes
export const REST_DECAY_RATE = 100 / 900;    // 0-100 over 15 minutes
export const REST_RESTORE_RATE = REST_DECAY_RATE * 5;  // 5x faster when sleeping
export const NEED_MAX = 100;
export const NEED_CRITICAL = 20;  // Red warning threshold
export const NEED_LOW = 50;       // Yellow warning threshold

// Room types with display names and colors
export const ROOM_TYPES = {
    generic: { name: 'Generic', color: 0x888888 },
    farming: { name: 'Farm', color: 0x228B22 },
    processing: { name: 'Kitchen', color: 0xCD853F },
    cafeteria: { name: 'Cafeteria', color: 0xFFD700 },
    dorm: { name: 'Dormitory', color: 0x4169E1 },
    waiting: { name: 'Waiting Room', color: 0x808080 }
};
export const DEFAULT_ROOM_TYPE = 'generic';

// Interaction system
export const INTERACTION_RANGE = 2.0;  // meters from camera

export const INTERACTIONS = {
    PLANT_SEED: 'plant_seed',
    WATER_PLANT: 'water_plant',
    HARVEST: 'harvest',
    WEED: 'weed',
    WASH: 'wash',
    CUT: 'cut',
    ASSEMBLE: 'assemble',
    PICKUP_FOOD: 'pickup_food',
    PICKUP_ITEM: 'pickup_item',
    DROP_ITEM: 'drop_item',
    EAT: 'eat',
    SLEEP: 'sleep',
    WAKE: 'wake'
};

export const INTERACTABLE_TYPES = {
    SOIL_PLOT: 'soil_plot',
    PLANT: 'plant',
    STATION: 'station',
    FOOD_COUNTER: 'food_counter',
    BED: 'bed',
    WORLD_ITEM: 'world_item'
};

// Item definitions
export const ITEMS = {
    seed: {
        name: 'Seed',
        color: 0x8B4513,
        canStack: true,
        rotTime: null  // doesn't rot
    },
    raw_vegetable: {
        name: 'Raw Vegetable',
        color: 0x228B22,
        canStack: true,
        rotTime: 300  // 5 minutes in seconds
    },
    basic_meal: {
        name: 'Basic Meal',
        color: 0xFFD700,
        canStack: true,
        rotTime: 180,  // 3 minutes in seconds
        hunger: 30
    },
    trash: {
        name: 'Trash',
        color: 0x4a4a4a,
        canStack: false,
        rotTime: null
    }
};

export const ITEM_ROT_CHECK_INTERVAL = 1000; // ms between rot checks

// Plant/Farming system
export const PLANT_STAGES = ['seed', 'sprout', 'growing', 'mature', 'harvestable'];
export const PLANT_STAGE_THRESHOLDS = [0, 20, 40, 60, 80]; // Progress % for each stage
export const PLANT_GROWTH_RATE = 100 / 180; // Full growth in ~3 minutes
export const PLANT_WATER_DECAY_RATE = 100 / 120; // Water depletes over 2 minutes
export const PLANT_WEED_SPAWN_CHANCE = 0.02; // Per second chance (2%)
export const PLANT_WATER_GROWTH_MULTIPLIER = 1.5; // Bonus when watered
export const PLANT_DRY_GROWTH_MULTIPLIER = 0.3; // Penalty when dry
export const PLANT_WEED_GROWTH_MULTIPLIER = 0.5; // Penalty when weeds present
export const PLANT_UPDATE_INTERVAL = 1000; // 1 second between plant updates
export const PLANT_WATER_THRESHOLD = 20; // Below this = "dry"

// Soil plot layout (2x3 grid per farming cell)
export const SOIL_PLOTS_PER_CELL = 6;
export const SOIL_PLOT_ROWS = 2;
export const SOIL_PLOT_COLS = 3;
export const SOIL_PLOT_SIZE = 1.5; // 1.5m x 1.5m plot
export const SOIL_PLOT_SPACING_X = 2.5; // Spacing between plot centers (X)
export const SOIL_PLOT_SPACING_Z = 3.0; // Spacing between plot centers (Z)

// Plant colors by stage
export const PLANT_COLORS = {
    seed: 0x8B4513,      // Brown mound
    sprout: 0x90EE90,    // Light green
    growing: 0x32CD32,   // Lime green
    mature: 0x228B22,    // Forest green
    harvestable: 0x006400, // Dark green
    fruit: 0xFF6347,     // Tomato red (fruit/vegetable on plant)
    weed: 0x8B7355      // Tan/brown weeds
};

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
