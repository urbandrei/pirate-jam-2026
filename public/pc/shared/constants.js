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
    waiting: { name: 'Waiting Room', color: 0x808080 },
    security: { name: 'Security', color: 0x1a1a3e }
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
    WAKE: 'wake',
    // Cafeteria appliance interactions
    LOAD_VENDING: 'load_vending',
    TAKE_VENDING: 'take_vending',
    GET_COFFEE: 'get_coffee',
    DRINK_WATER: 'drink_water',
    FILL_WATERING_CAN: 'fill_watering_can',
    // Consumable interactions (can be done anywhere)
    DRINK_COFFEE: 'drink_coffee',
    DRINK_CONTAINER: 'drink_container',
    // Camera interactions
    PICKUP_CAMERA: 'pickup_camera',
    PLACE_CAMERA: 'place_camera',
    ADJUST_CAMERA: 'adjust_camera',
    VIEW_CAMERA: 'view_camera'
};

export const INTERACTABLE_TYPES = {
    SOIL_PLOT: 'soil_plot',
    PLANT: 'plant',
    STATION: 'station',
    FOOD_COUNTER: 'food_counter',
    BED: 'bed',
    WORLD_ITEM: 'world_item',
    APPLIANCE: 'appliance',
    CAMERA: 'camera',
    MONITOR: 'monitor'
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
    washed_vegetable: {
        name: 'Washed Vegetable',
        color: 0x32CD32,  // Lime green (cleaner look)
        canStack: true,
        rotTime: 240  // 4 minutes in seconds
    },
    prepared_vegetable: {
        name: 'Prepared Vegetable',
        color: 0x98FB98,  // Pale green (cut appearance)
        canStack: true,
        rotTime: 180  // 3 minutes in seconds
    },
    basic_meal: {
        name: 'Basic Meal',
        color: 0xFFD700,
        canStack: true,
        rotTime: 180,  // 3 minutes in seconds
        hunger: 30
    },
    standard_meal: {
        name: 'Standard Meal',
        color: 0xFFA500,  // Orange
        canStack: true,
        rotTime: 180,
        hunger: 50
    },
    quality_meal: {
        name: 'Quality Meal',
        color: 0xFF4500,  // Orange red (premium)
        canStack: true,
        rotTime: 180,
        hunger: 75
    },
    trash: {
        name: 'Trash',
        color: 0x4a4a4a,
        canStack: false,
        rotTime: null
    },
    coffee: {
        name: 'Coffee',
        color: 0x4a2c2a,  // Dark brown
        canStack: true,
        rotTime: null,  // Coffee doesn't spoil
        rest: 25        // Restores 25 rest when consumed
    },
    water_container: {
        name: 'Water Container',
        color: 0x87CEEB,  // Sky blue
        canStack: false,
        rotTime: null,
        thirst: 40,       // Restores 40 thirst when consumed
        charges: 3        // Can be used 3 times
    },
    security_camera: {
        name: 'Security Camera',
        color: 0x333333,  // Dark gray
        canStack: false,
        rotTime: null,
        isCamera: true    // Special flag for camera items
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

// Processing station types
export const STATION_TYPES = {
    WASH: 'wash_station',
    CUT: 'cut_station',
    ASSEMBLY: 'assembly_station'
};

// Station configuration
export const STATIONS = {
    wash_station: {
        name: 'Wash Station',
        color: 0x4169E1,  // Royal blue (water)
        interactionTime: 4000,  // 4 seconds
        inputItem: 'raw_vegetable',
        outputItem: 'washed_vegetable'
    },
    cut_station: {
        name: 'Cutting Board',
        color: 0x8B4513,  // Saddle brown (wood)
        interactionTime: 5000,  // 5 seconds
        inputItem: 'washed_vegetable',
        outputItem: 'prepared_vegetable'
    },
    assembly_station: {
        name: 'Assembly Counter',
        color: 0xC0C0C0,  // Silver (metal counter)
        inputItem: 'prepared_vegetable'
    }
};

// Assembly recipes: ingredient count -> output meal
export const RECIPES = {
    1: 'basic_meal',
    2: 'standard_meal',
    3: 'quality_meal'
};

// Station layout for processing rooms (2x3 grid: 2 wash, 2 cut, 2 assembly)
export const STATIONS_PER_CELL = 6;
export const STATION_ROWS = 2;
export const STATION_COLS = 3;
export const STATION_SPACING_X = 2.5;  // Spacing between station centers (X)
export const STATION_SPACING_Z = 3.0;  // Spacing between station centers (Z)
export const STATION_INTERACTION_RANGE = 1.5;  // Range to find nearest station

// Cafeteria appliance types
export const APPLIANCE_TYPES = {
    VENDING_MACHINE: 'vending_machine',
    COFFEE_MACHINE: 'coffee_machine',
    WATER_STATION: 'water_station'
};

// Appliance configuration
export const APPLIANCES = {
    vending_machine: {
        name: 'Vending Machine',
        color: 0x808080,  // Gray metal
        slots: 6,         // Number of food slots
        width: 1.5,
        height: 2.0,
        depth: 0.8
    },
    coffee_machine: {
        name: 'Coffee Machine',
        color: 0x2F4F4F,  // Dark slate gray
        width: 0.8,
        height: 1.2,
        depth: 0.6
    },
    water_station: {
        name: 'Water Station',
        color: 0x4682B4,  // Steel blue
        width: 1.2,
        height: 1.0,
        depth: 0.8,
        thirstRestore: 30  // Direct thirst restoration
    }
};

// Cafeteria layout (appliances along one wall, tables in center)
export const CAFETERIA_APPLIANCE_SPACING = 3.0;  // Spacing between appliances
export const CAFETERIA_TABLE_COUNT = 2;
export const CAFETERIA_TABLE_SIZE = { width: 2.0, height: 0.75, depth: 1.2 };

// Dorm bed configuration
export const BED_ROWS = 2;
export const BED_COLS = 2;
export const BEDS_PER_CELL = BED_ROWS * BED_COLS;  // 4 beds
export const BED_SPACING_X = 3.5;
export const BED_SPACING_Z = 4.0;
export const BED_SIZE = { width: 1.0, height: 0.6, depth: 2.0 };  // Single bed dimensions (swap for better proportions)

// Sleep minigame constants
export const SLEEP_MINIGAME_DURATION = 30000;  // 30 seconds
export const SLEEP_MINIGAME_SQUARES = 25;      // Number of squares to spawn
export const SLEEP_BASE_MULTIPLIER = 5;        // Base rest restore rate (same as REST_RESTORE_RATE)
export const SLEEP_MAX_MULTIPLIER = 10;        // Perfect minigame multiplier
export const SLEEP_SQUARE_SIZE = 50;           // Square size in pixels
export const SLEEP_SQUARE_SPEED = 200;         // Pixels per second

// Waiting room constants
export const WAITING_ROOM = {
    CENTER: { x: 500, y: 0, z: 500 },
    SIZE: 10,  // 10m x 10m room
    DOOR_POSITION: { x: 500, y: 1.25, z: 495 },  // South wall door
    SPAWN_POSITION: { x: 500, y: 0.9, z: 502 },  // Spawn near back wall
    JOIN_TIMEOUT: 30000,   // 30 seconds to walk through door
    DEATH_COOLDOWN: 60000, // 1 minute before joining queue
};

// Player limit system
export const DEFAULT_PLAYER_LIMIT = 10;

// Camera system
export const CAMERA_TYPES = {
    SECURITY: 'security',
    STREAM: 'stream'
};

export const CAMERA_DEFAULTS = {
    RESOLUTION: { width: 1920, height: 1080 },
    FOV: 75,  // Same as player camera
    RENDER_RATE: 15,  // FPS for camera feeds
    SECURITY_LIMIT: 5,
    STREAM_LIMIT: 5
};

// Camera feed quality presets for performance settings
export const CAMERA_QUALITY_PRESETS = {
    low: { width: 320, height: 180, fps: 5 },      // Mobile/low-end
    medium: { width: 640, height: 360, fps: 10 },  // Laptops
    high: { width: 1280, height: 720, fps: 15 }    // Desktop (default)
};

// Camera item (physical object PC players pick up)
export const CAMERA_ITEM = {
    name: 'Security Camera',
    color: 0x333333,
    size: { width: 0.2, height: 0.15, depth: 0.25 }
};

// Camera mesh colors
export const CAMERA_COLORS = {
    BODY: 0x333333,      // Dark gray body
    LENS: 0x111111,      // Black lens
    MOUNT: 0x555555,     // Gray mount bracket
    LED_ACTIVE: 0x00ff00, // Green LED when active
    LED_INACTIVE: 0x440000 // Dim red when inactive
};
