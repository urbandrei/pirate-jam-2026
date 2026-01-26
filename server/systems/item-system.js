/**
 * Item System - Server-side item management
 *
 * Handles item creation, stacking, and rot mechanics.
 */

// Item definitions (mirror of client-side constants)
const ITEMS = {
    seed: {
        name: 'Seed',
        color: 0x8B4513,
        canStack: true,
        rotTime: null
    },
    raw_vegetable: {
        name: 'Raw Vegetable',
        color: 0x228B22,
        canStack: true,
        rotTime: 300
    },
    washed_vegetable: {
        name: 'Washed Vegetable',
        color: 0x32CD32,
        canStack: true,
        rotTime: 240
    },
    prepared_vegetable: {
        name: 'Prepared Vegetable',
        color: 0x98FB98,
        canStack: true,
        rotTime: 180
    },
    basic_meal: {
        name: 'Basic Meal',
        color: 0xFFD700,
        canStack: true,
        rotTime: 180,
        hunger: 30
    },
    standard_meal: {
        name: 'Standard Meal',
        color: 0xFFA500,
        canStack: true,
        rotTime: 180,
        hunger: 50
    },
    quality_meal: {
        name: 'Quality Meal',
        color: 0xFF4500,
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
    security_camera: {
        name: 'Security Camera',
        color: 0x333333,
        canStack: false,
        rotTime: null,
        isCamera: true
    }
};

/**
 * Create a new item instance
 * @param {string} type - Item type from ITEMS
 * @param {Object} position - World position {x, y, z}
 * @returns {Object} Item instance
 */
function createItem(type, position = { x: 0, y: 0.25, z: 0 }) {
    if (!ITEMS[type]) {
        console.warn(`[ItemSystem] Unknown item type: ${type}`);
        type = 'trash';
    }

    return {
        id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: type,
        position: { ...position },
        createdAt: Date.now(),
        stackCount: 1
    };
}

/**
 * Check if two items can be stacked together
 * @param {Object} item1 - First item
 * @param {Object} item2 - Second item
 * @returns {boolean} Whether items can stack
 */
function canStackItems(item1, item2) {
    if (!item1 || !item2) return false;
    if (item1.type !== item2.type) return false;

    const definition = ITEMS[item1.type];
    return definition && definition.canStack;
}

/**
 * Stack two items together, creating a combined item
 * @param {Object} item1 - First item (typically held item)
 * @param {Object} item2 - Second item (typically picked up item)
 * @returns {Object} New stacked item
 */
function stackItems(item1, item2) {
    if (!canStackItems(item1, item2)) {
        return null;
    }

    return {
        id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: item1.type,
        position: { ...item1.position },
        createdAt: Math.min(item1.createdAt, item2.createdAt), // Use older timestamp
        stackCount: (item1.stackCount || 1) + (item2.stackCount || 1)
    };
}

/**
 * Process item rot for all world objects
 * Converts rotten items to trash
 * @param {Map} worldObjects - Map of world objects
 * @param {number} currentTime - Current timestamp in ms
 * @returns {Array} Array of item IDs that rotted
 */
function updateItemRot(worldObjects, currentTime) {
    const rottedItems = [];

    for (const [id, obj] of worldObjects) {
        // Skip non-item objects (like cubes)
        if (!obj.type || !ITEMS[obj.type]) continue;

        const definition = ITEMS[obj.type];

        // Skip items that don't rot
        if (!definition.rotTime) continue;

        // Check if item has rotted
        const ageSeconds = (currentTime - obj.createdAt) / 1000;

        if (ageSeconds >= definition.rotTime) {
            // Convert to trash
            obj.type = 'trash';
            obj.stackCount = 1; // Trash doesn't stack
            rottedItems.push(id);
        }
    }

    return rottedItems;
}

/**
 * Get item definition
 * @param {string} type - Item type
 * @returns {Object|null} Item definition or null
 */
function getItemDefinition(type) {
    return ITEMS[type] || null;
}

/**
 * Calculate rot progress (0 = fresh, 1 = about to rot)
 * @param {Object} item - Item object
 * @param {number} currentTime - Current timestamp in ms
 * @returns {number} Rot progress 0-1, or null if doesn't rot
 */
function getRotProgress(item, currentTime) {
    if (!item || !item.type) return null;

    const definition = ITEMS[item.type];
    if (!definition || !definition.rotTime) return null;

    const ageSeconds = (currentTime - item.createdAt) / 1000;
    return Math.min(1, ageSeconds / definition.rotTime);
}

module.exports = {
    ITEMS,
    createItem,
    canStackItems,
    stackItems,
    updateItemRot,
    getItemDefinition,
    getRotProgress
};
