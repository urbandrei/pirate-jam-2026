/**
 * Three.js scene setup for PC client
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { COLORS, WORLD_SIZE, SMALL_ROOM_SIZE, WALL_THICKNESS, DOORWAY_HEIGHT, DOORWAY_WIDTH, ROOM_TYPES, DEFAULT_ROOM_TYPE, ITEMS, STATIONS } from '../shared/constants.js';
import * as FarmingRenderer from './farming-renderer.js';
import * as StationRenderer from './station-renderer.js';
import * as ApplianceRenderer from './appliance-renderer.js';
import * as BedRenderer from './bed-renderer.js';
import * as CameraRenderer from './camera-renderer.js';
import { WaitingRoomRenderer } from './waiting-room-renderer.js';

export class Scene {
    constructor(container) {
        this.container = container;

        // Dynamic wall meshes for cleanup
        this.dynamicWalls = [];
        this.dynamicFloors = [];
        this.roomLabels = [];
        this.lastWorldVersion = -1;

        // World objects (pickable items, etc.)
        this.worldObjectMeshes = new Map(); // id -> mesh

        // Farming system meshes
        this.soilPlotMeshes = new Map(); // plotId -> mesh
        this.plantMeshes = new Map(); // plantId -> group

        // Processing station meshes
        this.stationMeshes = new Map(); // stationId -> group

        // Cafeteria appliance and table meshes
        this.applianceMeshes = new Map(); // applianceId -> group
        this.tableMeshes = new Map(); // tableId -> group

        // Dorm bed meshes
        this.bedMeshes = new Map(); // bedId -> group

        // Player body meshes (dead players)
        this.bodyMeshes = new Map(); // bodyId -> mesh

        // Camera meshes (placed cameras in the world)
        this.cameraMeshes = new Map(); // cameraId -> THREE.Group

        // Wall material (shared)
        this.wallMaterial = null;

        // Waiting room renderer
        this.waitingRoomRenderer = null;

        // Security room renderer (set by main.js)
        this.securityRoomRenderer = null;

        // Miniature replica (same as VR players see)
        // VR uses miniatureScale = 0.005 at 1/10 world scale
        // PC is at real-world scale, so we need 0.005 * GIANT_SCALE = 0.05
        this.miniatureGroup = null;
        this.miniatureMeshes = [];
        this.miniatureScale = 0.05; // Matches VR: 0.005 * GIANT_SCALE (5cm per 10m cell)

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.insertBefore(this.renderer.domElement, container.firstChild);

        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(COLORS.SKY);
        this.scene.fog = new THREE.Fog(COLORS.SKY, 50, 200);

        // Create camera (first person)
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 1.6, 0); // Eye height

        // Add camera to scene - required for camera-attached objects (held items) to render
        this.scene.add(this.camera);

        // Setup scene elements
        this.setupLighting();
        this.setupGround();
        this.setupWallMaterial();
        this.setupMiniature();
        // Don't setup static rooms - wait for world state from server

        // Handle window resize
        window.addEventListener('resize', () => this.onResize());
    }

    setupWallMaterial() {
        this.wallMaterial = new THREE.MeshStandardMaterial({
            map: this.createConcreteTexture(),
            roughness: 0.95,
            metalness: 0.05
        });
    }

    /**
     * Setup the floating miniature replica (same as VR players see)
     */
    setupMiniature() {
        this.miniatureGroup = new THREE.Group();
        // Position to match VR: pedestalHeight (0.7) * GIANT_SCALE (10) = 7.0m
        this.miniatureGroup.position.set(0, 7.0, 0);
        this.scene.add(this.miniatureGroup);

        // Materials for miniature
        this.miniRoomMaterial = new THREE.MeshBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.4
        });
        this.miniDoorwayMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.8
        });
    }

    setupLighting() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        // Directional light (sun)
        const sun = new THREE.DirectionalLight(0xffffff, 1);
        sun.position.set(50, 100, 50);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 300;
        sun.shadow.camera.left = -100;
        sun.shadow.camera.right = 100;
        sun.shadow.camera.top = 100;
        sun.shadow.camera.bottom = -100;
        this.scene.add(sun);

        // Hemisphere light for better ambient
        const hemi = new THREE.HemisphereLight(0x000000, 0x3d5c3d, 0.3);
        this.scene.add(hemi);
    }

    /**
     * Create procedural rough concrete texture
     */
    createConcreteTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Base gray
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, 256, 256);

        // Add noise for rough texture
        const imageData = ctx.getImageData(0, 0, 256, 256);
        for (let i = 0; i < imageData.data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 40;
            imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
            imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
            imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
        }
        ctx.putImageData(imageData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 4); // More tiling for larger PC ground
        return texture;
    }

    setupGround() {
        // Ground plane with concrete texture
        const groundGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
        const groundMaterial = new THREE.MeshStandardMaterial({
            map: this.createConcreteTexture(),
            roughness: 0.95,
            metalness: 0.05
        });
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);

        // Grid helper for reference
        const grid = new THREE.GridHelper(WORLD_SIZE, 50, 0x000000, 0x444444);
        grid.position.y = 0.01;
        grid.material.opacity = 0.2;
        grid.material.transparent = true;
        this.scene.add(grid);
    }

    /**
     * Rebuild world geometry from server world state
     * @param {Object} worldState - World state from server
     */
    rebuildFromWorldState(worldState) {
        if (!worldState) return;

        // Skip if version hasn't changed
        if (worldState.version === this.lastWorldVersion) return;

        console.log(`[Scene] Rebuilding walls from world state, version=${worldState.version}`);
        this.lastWorldVersion = worldState.version;

        // Clear existing dynamic elements
        this.clearDynamicWalls();
        this.clearDynamicFloors();
        this.clearRoomLabels();
        this.clearSoilPlots();
        this.clearStations();
        this.clearAppliances();
        this.clearBeds();
        this.clearSecurityMonitors();

        // Build walls and floors for each cell in the grid
        for (const cell of worldState.grid) {
            this.createCellWalls(cell, worldState);
            this.createCellFloor(cell);

            // Create soil plots for farming rooms
            if (cell.roomType === 'farming') {
                this.createSoilPlotsForCell(cell);
            }

            // Create stations for processing rooms
            if (cell.roomType === 'processing') {
                this.createStationsForCell(cell);
            }

            // Create appliances and tables for cafeteria rooms
            if (cell.roomType === 'cafeteria') {
                this.createAppliancesForCell(cell);
            }

            // Create beds for dorm rooms
            if (cell.roomType === 'dorm') {
                this.createBedsForCell(cell);
            }

            // Create monitors for security rooms
            if (cell.roomType === 'security') {
                this.createMonitorsForCell(cell);
            }
        }

        // Create room labels (one per mergeGroup)
        this.createRoomLabels(worldState);

        // Rebuild miniature replica
        this.rebuildMiniature(worldState);
    }

    /**
     * Clear all dynamic wall meshes
     */
    clearDynamicWalls() {
        for (const mesh of this.dynamicWalls) {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
        }
        this.dynamicWalls = [];
    }

    /**
     * Clear all dynamic floor meshes
     */
    clearDynamicFloors() {
        for (const mesh of this.dynamicFloors) {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        }
        this.dynamicFloors = [];
    }

    /**
     * Clear all room label sprites
     */
    clearRoomLabels() {
        for (const sprite of this.roomLabels) {
            this.scene.remove(sprite);
            if (sprite.material.map) sprite.material.map.dispose();
            if (sprite.material) sprite.material.dispose();
        }
        this.roomLabels = [];
    }

    /**
     * Clear all soil plot meshes
     */
    clearSoilPlots() {
        for (const [id, mesh] of this.soilPlotMeshes) {
            this.scene.remove(mesh);
            FarmingRenderer.disposeSoilPlotMesh(mesh);
        }
        this.soilPlotMeshes.clear();
    }

    /**
     * Clear all station meshes
     */
    clearStations() {
        for (const [id, group] of this.stationMeshes) {
            this.scene.remove(group);
            StationRenderer.disposeStationMesh(group);
        }
        this.stationMeshes.clear();
    }

    /**
     * Clear all appliance meshes
     */
    clearAppliances() {
        for (const [id, group] of this.applianceMeshes) {
            this.scene.remove(group);
            ApplianceRenderer.disposeApplianceMesh(group);
        }
        this.applianceMeshes.clear();

        for (const [id, group] of this.tableMeshes) {
            this.scene.remove(group);
            ApplianceRenderer.disposeApplianceMesh(group);
        }
        this.tableMeshes.clear();
    }

    /**
     * Clear all bed meshes
     */
    clearBeds() {
        for (const [id, group] of this.bedMeshes) {
            this.scene.remove(group);
            BedRenderer.disposeBedMesh(group);
        }
        this.bedMeshes.clear();
    }

    /**
     * Clear all security room monitors
     */
    clearSecurityMonitors() {
        if (this.securityRoomRenderer) {
            this.securityRoomRenderer.clear();
        }
    }

    /**
     * Set the security room renderer (called by main.js)
     * @param {SecurityRoomRenderer} renderer - The security room renderer
     */
    setSecurityRoomRenderer(renderer) {
        this.securityRoomRenderer = renderer;
    }

    /**
     * Create stations for a processing cell
     * @param {Object} cell - Cell data with x, z coordinates
     */
    createStationsForCell(cell) {
        const stations = StationRenderer.getStationPositions(cell.x, cell.z);

        for (const stationData of stations) {
            const group = StationRenderer.createStationMesh(stationData);
            group.userData.gridX = stationData.gridX;
            group.userData.gridZ = stationData.gridZ;

            this.stationMeshes.set(stationData.id, group);
            this.scene.add(group);
        }

        console.log(`[Scene] Created ${stations.length} stations for cell (${cell.x}, ${cell.z})`);
    }

    /**
     * Create appliances and tables for a cafeteria cell
     * @param {Object} cell - Cell data with x, z coordinates
     */
    createAppliancesForCell(cell) {
        // Create appliances
        const appliances = ApplianceRenderer.getAppliancePositions(cell.x, cell.z);
        for (const applianceData of appliances) {
            const group = ApplianceRenderer.createApplianceMesh(applianceData);
            group.userData.gridX = applianceData.gridX;
            group.userData.gridZ = applianceData.gridZ;

            this.applianceMeshes.set(applianceData.id, group);
            this.scene.add(group);
        }

        // Create tables
        const tables = ApplianceRenderer.getTablePositions(cell.x, cell.z);
        for (const tableData of tables) {
            const group = ApplianceRenderer.createTableMesh(tableData);
            group.userData.gridX = tableData.gridX;
            group.userData.gridZ = tableData.gridZ;

            this.tableMeshes.set(tableData.id, group);
            this.scene.add(group);
        }

        console.log(`[Scene] Created ${appliances.length} appliances and ${tables.length} tables for cell (${cell.x}, ${cell.z})`);
    }

    /**
     * Create beds for a dorm cell
     * @param {Object} cell - Cell data with x, z coordinates
     */
    createBedsForCell(cell) {
        const beds = BedRenderer.getBedPositions(cell.x, cell.z);

        for (const bedData of beds) {
            const group = BedRenderer.createBedMesh(bedData);
            group.userData.gridX = bedData.gridX;
            group.userData.gridZ = bedData.gridZ;

            this.bedMeshes.set(bedData.id, group);
            this.scene.add(group);
        }

        console.log(`[Scene] Created ${beds.length} beds for cell (${cell.x}, ${cell.z})`);
    }

    /**
     * Create monitors for a security room cell
     * @param {Object} cell - Cell data with x, z coordinates
     */
    createMonitorsForCell(cell) {
        if (!this.securityRoomRenderer) {
            console.warn('[Scene] SecurityRoomRenderer not set, skipping monitors for security room');
            return;
        }

        const cellSize = SMALL_ROOM_SIZE;
        const centerX = cell.x * cellSize;
        const centerZ = cell.z * cellSize;

        // Position monitors on north wall (back of cell)
        const wallOffset = cellSize / 2 - 0.2;  // Slight inset from wall

        const position = {
            x: centerX,
            y: 1.5,  // Eye height for comfortable viewing
            z: centerZ - wallOffset
        };

        // Monitors face south (toward room center), rotation = 0
        const rotation = 0;

        // Create 2x2 grid of monitors
        this.securityRoomRenderer.createMonitors(position, rotation, 4, 'grid');

        console.log(`[Scene] Created 4 monitors for security room at cell (${cell.x}, ${cell.z})`);
    }

    /**
     * Update station interactions based on player's held item
     * @param {Object} interactionSystem - Interaction system
     * @param {Object|null} heldItem - Player's currently held item
     * @param {Array} stations - Array of station data from server (worldObjects with objectType='station')
     */
    updateStationInteractions(interactionSystem, heldItem, stations) {
        if (!interactionSystem) return;

        for (const [stationId, group] of this.stationMeshes) {
            const stationType = group.userData.stationType;
            const interaction = StationRenderer.getStationInteraction(stationType, heldItem);

            if (interaction) {
                interactionSystem.registerInteractable(
                    group,
                    'STATION',
                    stationId,
                    [interaction]
                );
            } else {
                interactionSystem.unregisterInteractable(group);
            }
        }

        // Update assembly stations with their current ingredients
        if (stations) {
            for (const station of stations) {
                if (station.stationType === 'assembly_station') {
                    const group = this.stationMeshes.get(station.id);
                    if (group) {
                        StationRenderer.updateStationMesh(group, station);
                    }
                }
            }
        }
    }

    /**
     * Update appliance interactions based on player's held item
     * @param {Object} interactionSystem - Interaction system
     * @param {Object|null} heldItem - Player's currently held item
     * @param {Array} appliances - Array of appliance data from server
     */
    updateApplianceInteractions(interactionSystem, heldItem, appliances) {
        if (!interactionSystem) return;

        for (const [applianceId, group] of this.applianceMeshes) {
            const applianceType = group.userData.applianceType;
            const interactions = ApplianceRenderer.getApplianceInteractions(applianceType, heldItem);

            if (interactions.length > 0) {
                // Register or update interactions
                interactionSystem.registerInteractable(
                    group,
                    'APPLIANCE',
                    applianceId,
                    interactions
                );
                // Also update prompt if this is currently targeted
                interactionSystem.updateInteractablePrompt(group, interactions);
            } else {
                interactionSystem.unregisterInteractable(group);
            }
        }

        // Update vending machines with their current slot contents
        if (appliances) {
            for (const appliance of appliances) {
                if (appliance.applianceType === 'vending_machine') {
                    const group = this.applianceMeshes.get(appliance.id);
                    if (group) {
                        ApplianceRenderer.updateApplianceMesh(group, appliance);
                    }
                }
            }
        }
    }

    /**
     * Update bed interactions based on player state and bed occupancy
     * @param {Object} interactionSystem - Interaction system
     * @param {Object} player - Current player data
     * @param {Array} beds - Array of bed data from server
     */
    updateBedInteractions(interactionSystem, player, beds) {
        if (!interactionSystem || !player) return;

        for (const [bedId, group] of this.bedMeshes) {
            // Find this bed's data from server
            const bedData = beds ? beds.find(b => b.id === bedId) : null;

            if (bedData) {
                // Update bed mesh occupancy visual
                BedRenderer.updateBedMesh(group, bedData);

                // Get interaction based on bed state and player state
                const interaction = BedRenderer.getBedInteraction(bedData, player);

                if (interaction) {
                    interactionSystem.registerInteractable(
                        group,
                        'BED',
                        bedId,
                        [interaction]
                    );
                } else {
                    interactionSystem.unregisterInteractable(group);
                }
            }
        }
    }

    /**
     * Create soil plots for a farming cell
     * @param {Object} cell - Cell data with x, z coordinates
     */
    createSoilPlotsForCell(cell) {
        const plots = FarmingRenderer.getSoilPlotPositions(cell.x, cell.z);

        for (const plot of plots) {
            const mesh = FarmingRenderer.createSoilPlotMesh(plot.position);
            mesh.userData.plotId = plot.id;
            mesh.userData.gridX = plot.gridX;
            mesh.userData.gridZ = plot.gridZ;

            this.soilPlotMeshes.set(plot.id, mesh);
            this.scene.add(mesh);
        }
    }

    /**
     * Register soil plots with interaction system
     * Call this after rebuildFromWorldState and after getting player's held item
     * @param {Object} interactionSystem - Interaction system
     * @param {Object} heldItem - Player's currently held item (or null)
     * @param {Array} plants - Array of plant data from server
     */
    updateSoilPlotInteractions(interactionSystem, heldItem, plants) {
        if (!interactionSystem) return;

        // Build a set of occupied plot IDs
        const occupiedPlots = new Set();
        if (plants) {
            for (const plant of plants) {
                if (plant.soilPlotId) {
                    occupiedPlots.add(plant.soilPlotId);
                }
            }
        }

        // Update each soil plot's interactions
        for (const [plotId, mesh] of this.soilPlotMeshes) {
            const isOccupied = occupiedPlots.has(plotId);

            if (isOccupied) {
                // Plot has a plant - unregister soil plot interaction
                interactionSystem.unregisterInteractable(mesh);
            } else {
                // Plot is empty
                if (heldItem && heldItem.type === 'seed') {
                    // Player has seeds - can plant
                    interactionSystem.registerInteractable(
                        mesh,
                        'SOIL_PLOT',
                        plotId,
                        [{ type: 'plant_seed', prompt: 'Plant seed' }]
                    );
                } else {
                    // No seeds - unregister
                    interactionSystem.unregisterInteractable(mesh);
                }
            }
        }
    }

    /**
     * Create a colored floor for a single cell based on room type
     */
    createCellFloor(cell) {
        const cellSize = SMALL_ROOM_SIZE;
        const x = cell.x * cellSize;
        const z = cell.z * cellSize;

        const roomType = cell.roomType || DEFAULT_ROOM_TYPE;
        const roomConfig = ROOM_TYPES[roomType] || ROOM_TYPES[DEFAULT_ROOM_TYPE];

        const geometry = new THREE.PlaneGeometry(cellSize * 0.95, cellSize * 0.95);
        const material = new THREE.MeshBasicMaterial({
            color: roomConfig.color,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });

        const floor = new THREE.Mesh(geometry, material);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(x, 0.02, z);

        this.scene.add(floor);
        this.dynamicFloors.push(floor);
    }

    /**
     * Create room type labels (one per mergeGroup, positioned at center)
     */
    createRoomLabels(worldState) {
        if (!worldState || !worldState.grid) return;

        // Group cells by mergeGroup to find room centers
        const roomGroups = new Map();
        for (const cell of worldState.grid) {
            const group = cell.mergeGroup;
            if (!roomGroups.has(group)) roomGroups.set(group, []);
            roomGroups.get(group).push(cell);
        }

        const cellSize = SMALL_ROOM_SIZE;

        for (const [mergeGroup, cells] of roomGroups) {
            // Get room type from first cell (all cells in same mergeGroup have same type)
            const roomType = cells[0].roomType || DEFAULT_ROOM_TYPE;

            // Skip labels for generic rooms
            if (roomType === 'generic') continue;

            const roomConfig = ROOM_TYPES[roomType];
            if (!roomConfig) continue;

            // Calculate center of room
            const centerX = cells.reduce((sum, c) => sum + c.x, 0) / cells.length * cellSize;
            const centerZ = cells.reduce((sum, c) => sum + c.z, 0) / cells.length * cellSize;

            // Create canvas for text
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');

            // Semi-transparent background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.beginPath();
            ctx.roundRect(8, 8, 240, 48, 8);
            ctx.fill();

            // Text
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(roomConfig.name, 128, 32);

            // Create sprite
            const texture = new THREE.CanvasTexture(canvas);
            const material = new THREE.SpriteMaterial({
                map: texture,
                transparent: true
            });
            const sprite = new THREE.Sprite(material);

            // Position above room center
            sprite.position.set(centerX, 3.5, centerZ);
            sprite.scale.set(3, 0.75, 1);

            this.scene.add(sprite);
            this.roomLabels.push(sprite);
        }
    }

    /**
     * Rebuild the floating miniature replica from world state
     * @param {Object} worldState - World state from server
     */
    rebuildMiniature(worldState) {
        // Clear existing miniature meshes
        for (const mesh of this.miniatureMeshes) {
            this.miniatureGroup.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
        }
        this.miniatureMeshes = [];

        if (!worldState || !worldState.grid) return;

        // Group cells by mergeGroup (rooms)
        const roomGroups = new Map();
        for (const cell of worldState.grid) {
            const group = cell.mergeGroup;
            if (!roomGroups.has(group)) roomGroups.set(group, []);
            roomGroups.get(group).push(cell);
        }

        const gridCellSize = SMALL_ROOM_SIZE * this.miniatureScale;
        const gapFactor = 0.8; // Slight gap between blocks

        // Create room blocks
        for (const [mergeGroup, cells] of roomGroups) {
            this.createMiniRoomBlock(cells, gridCellSize, gapFactor);
        }

        // Create doorway indicators (red rods)
        if (worldState.doorways) {
            for (const doorway of worldState.doorways) {
                this.createMiniDoorwayIndicator(doorway, gridCellSize);
            }
        }
    }

    /**
     * Create a room block in the miniature
     */
    createMiniRoomBlock(cells, gridCellSize, gapFactor) {
        // Get room type from first cell (all cells in same mergeGroup have same type)
        const roomType = cells[0].roomType || DEFAULT_ROOM_TYPE;
        const roomConfig = ROOM_TYPES[roomType] || ROOM_TYPES[DEFAULT_ROOM_TYPE];

        // Find bounding box of this room
        const minX = Math.min(...cells.map(c => c.x));
        const maxX = Math.max(...cells.map(c => c.x));
        const minZ = Math.min(...cells.map(c => c.z));
        const maxZ = Math.max(...cells.map(c => c.z));

        const width = (maxX - minX + 1) * gridCellSize * gapFactor;
        const depth = (maxZ - minZ + 1) * gridCellSize * gapFactor;
        const height = gridCellSize * 0.5;

        const centerX = ((minX + maxX) / 2) * gridCellSize;
        const centerZ = ((minZ + maxZ) / 2) * gridCellSize;

        // Use room type color instead of fixed blue
        const material = new THREE.MeshBasicMaterial({
            color: roomConfig.color,
            transparent: true,
            opacity: 0.5
        });

        const geometry = new THREE.BoxGeometry(width, height, depth);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(centerX, height / 2, centerZ);
        this.miniatureGroup.add(mesh);
        this.miniatureMeshes.push(mesh);
    }

    /**
     * Create a doorway indicator (red rod) in the miniature
     */
    createMiniDoorwayIndicator(doorway, gridCellSize) {
        // Calculate positions of the two cells
        const x1 = doorway.cell1.x * gridCellSize;
        const z1 = doorway.cell1.z * gridCellSize;
        const x2 = doorway.cell2.x * gridCellSize;
        const z2 = doorway.cell2.z * gridCellSize;

        // Midpoint between cells
        const midX = (x1 + x2) / 2;
        const midZ = (z1 + z2) / 2;

        // Create horizontal rod
        const rodLength = gridCellSize * 0.6;
        const rodRadius = gridCellSize * 0.05;
        const geometry = new THREE.CylinderGeometry(rodRadius, rodRadius, rodLength, 8);

        const mesh = new THREE.Mesh(geometry, this.miniDoorwayMaterial);

        // Position at midpoint, slightly elevated
        const height = gridCellSize * 0.25;
        mesh.position.set(midX, height, midZ);

        // Rotate to be horizontal and point toward the connection
        if (doorway.cell1.x !== doorway.cell2.x) {
            // East-West connection
            mesh.rotation.z = Math.PI / 2;
        } else {
            // North-South connection
            mesh.rotation.x = Math.PI / 2;
        }

        this.miniatureGroup.add(mesh);
        this.miniatureMeshes.push(mesh);
    }

    /**
     * Create walls for a single grid cell
     * Uses mergeGroup to determine if walls should be skipped (same room)
     * Uses doorways list from server to determine which walls get doorways (MST)
     */
    createCellWalls(cell, worldState) {
        const cellSize = SMALL_ROOM_SIZE;
        const half = cellSize / 2;

        // Main room (spawn) gets 3x wall height
        const isMainRoom = cell.mergeGroup === 'spawn';
        const wallHeight = isMainRoom ? cellSize * 3 : cellSize;

        const x = cell.x * cellSize;
        const z = cell.z * cellSize;

        // Helper to check if there's a doorway between this cell and neighbor
        const hasDoorwayTo = (nx, nz) => {
            if (!worldState.doorways) return false;
            return worldState.doorways.some(d =>
                (d.cell1.x === cell.x && d.cell1.z === cell.z && d.cell2.x === nx && d.cell2.z === nz) ||
                (d.cell2.x === cell.x && d.cell2.z === cell.z && d.cell1.x === nx && d.cell1.z === nz)
            );
        };

        // Helper to check neighbor and merge status
        const checkNeighbor = (dx, dz) => {
            const nx = cell.x + dx;
            const nz = cell.z + dz;
            const neighbor = worldState.grid.find(c => c.x === nx && c.z === nz);
            if (!neighbor) return { exists: false, merged: false, hasDoorway: false };
            // Same mergeGroup means no wall between them (open space)
            const merged = neighbor.mergeGroup === cell.mergeGroup;
            const doorway = hasDoorwayTo(nx, nz);
            return { exists: true, merged, hasDoorway: doorway };
        };

        const neighbors = {
            north: checkNeighbor(0, -1),
            south: checkNeighbor(0, 1),
            east: checkNeighbor(1, 0),
            west: checkNeighbor(-1, 0)
        };

        // Wall logic:
        // - No neighbor → solid wall
        // - Neighbor with same mergeGroup → no wall (open space)
        // - Neighbor with different mergeGroup AND doorway → wall with doorway
        // - Neighbor with different mergeGroup AND no doorway → solid wall

        // North wall
        if (!neighbors.north.exists) {
            this.addDynamicSolidWall(x, z - half, cellSize, wallHeight, WALL_THICKNESS, 'z');
        } else if (!neighbors.north.merged) {
            if (neighbors.north.hasDoorway) {
                this.addDynamicWallWithDoorway(x, z - half, cellSize, wallHeight, WALL_THICKNESS, 'z');
            } else {
                this.addDynamicSolidWall(x, z - half, cellSize, wallHeight, WALL_THICKNESS, 'z');
            }
        }
        // If merged, skip wall (open space)

        // South wall
        if (!neighbors.south.exists) {
            this.addDynamicSolidWall(x, z + half, cellSize, wallHeight, WALL_THICKNESS, 'z');
        } else if (!neighbors.south.merged) {
            if (neighbors.south.hasDoorway) {
                this.addDynamicWallWithDoorway(x, z + half, cellSize, wallHeight, WALL_THICKNESS, 'z');
            } else {
                this.addDynamicSolidWall(x, z + half, cellSize, wallHeight, WALL_THICKNESS, 'z');
            }
        }

        // East wall
        if (!neighbors.east.exists) {
            this.addDynamicSolidWall(x + half, z, cellSize, wallHeight, WALL_THICKNESS, 'x');
        } else if (!neighbors.east.merged) {
            if (neighbors.east.hasDoorway) {
                this.addDynamicWallWithDoorway(x + half, z, cellSize, wallHeight, WALL_THICKNESS, 'x');
            } else {
                this.addDynamicSolidWall(x + half, z, cellSize, wallHeight, WALL_THICKNESS, 'x');
            }
        }

        // West wall
        if (!neighbors.west.exists) {
            this.addDynamicSolidWall(x - half, z, cellSize, wallHeight, WALL_THICKNESS, 'x');
        } else if (!neighbors.west.merged) {
            if (neighbors.west.hasDoorway) {
                this.addDynamicWallWithDoorway(x - half, z, cellSize, wallHeight, WALL_THICKNESS, 'x');
            } else {
                this.addDynamicSolidWall(x - half, z, cellSize, wallHeight, WALL_THICKNESS, 'x');
            }
        }
    }

    /**
     * Add a solid wall (no doorway) and track for cleanup
     */
    addDynamicSolidWall(x, z, length, height, thickness, axis) {
        let geometry;
        if (axis === 'z') {
            geometry = new THREE.BoxGeometry(length, height, thickness);
        } else {
            geometry = new THREE.BoxGeometry(thickness, height, length);
        }

        const wall = new THREE.Mesh(geometry, this.wallMaterial);
        wall.position.set(x, height / 2, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        this.scene.add(wall);
        this.dynamicWalls.push(wall);
    }

    /**
     * Add a wall with doorway and track for cleanup
     */
    addDynamicWallWithDoorway(x, z, length, height, thickness, axis) {
        const doorwayWidth = DOORWAY_WIDTH;
        const doorwayHeight = DOORWAY_HEIGHT;
        const sideWidth = (length - doorwayWidth) / 2;
        const aboveHeight = height - doorwayHeight;
        const halfDoorway = doorwayWidth / 2;
        const sideOffset = halfDoorway + sideWidth / 2;

        if (axis === 'z') {
            // Wall along X-axis
            // Left segment
            const leftGeom = new THREE.BoxGeometry(sideWidth, height, thickness);
            const leftWall = new THREE.Mesh(leftGeom, this.wallMaterial);
            leftWall.position.set(x - sideOffset, height / 2, z);
            leftWall.castShadow = true;
            leftWall.receiveShadow = true;
            this.scene.add(leftWall);
            this.dynamicWalls.push(leftWall);

            // Right segment
            const rightGeom = new THREE.BoxGeometry(sideWidth, height, thickness);
            const rightWall = new THREE.Mesh(rightGeom, this.wallMaterial);
            rightWall.position.set(x + sideOffset, height / 2, z);
            rightWall.castShadow = true;
            rightWall.receiveShadow = true;
            this.scene.add(rightWall);
            this.dynamicWalls.push(rightWall);

            // Above doorway
            if (aboveHeight > 0) {
                const aboveGeom = new THREE.BoxGeometry(doorwayWidth, aboveHeight, thickness);
                const aboveWall = new THREE.Mesh(aboveGeom, this.wallMaterial);
                aboveWall.position.set(x, doorwayHeight + aboveHeight / 2, z);
                aboveWall.castShadow = true;
                aboveWall.receiveShadow = true;
                this.scene.add(aboveWall);
                this.dynamicWalls.push(aboveWall);
            }
        } else {
            // Wall along Z-axis
            // Left segment
            const leftGeom = new THREE.BoxGeometry(thickness, height, sideWidth);
            const leftWall = new THREE.Mesh(leftGeom, this.wallMaterial);
            leftWall.position.set(x, height / 2, z - sideOffset);
            leftWall.castShadow = true;
            leftWall.receiveShadow = true;
            this.scene.add(leftWall);
            this.dynamicWalls.push(leftWall);

            // Right segment
            const rightGeom = new THREE.BoxGeometry(thickness, height, sideWidth);
            const rightWall = new THREE.Mesh(rightGeom, this.wallMaterial);
            rightWall.position.set(x, height / 2, z + sideOffset);
            rightWall.castShadow = true;
            rightWall.receiveShadow = true;
            this.scene.add(rightWall);
            this.dynamicWalls.push(rightWall);

            // Above doorway
            if (aboveHeight > 0) {
                const aboveGeom = new THREE.BoxGeometry(thickness, aboveHeight, doorwayWidth);
                const aboveWall = new THREE.Mesh(aboveGeom, this.wallMaterial);
                aboveWall.position.set(x, doorwayHeight + aboveHeight / 2, z);
                aboveWall.castShadow = true;
                aboveWall.receiveShadow = true;
                this.scene.add(aboveWall);
                this.dynamicWalls.push(aboveWall);
            }
        }
    }

    onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    add(object) {
        this.scene.add(object);
    }

    remove(object) {
        this.scene.remove(object);
    }

    /**
     * Update world objects from server state
     * @param {Array} worldObjects - Array of world object data from server
     * @param {Object} interactionSystem - Interaction system to register objects with
     * @param {Object} player - Current player data (for bed interactions)
     * @param {Object|null} heldItem - Player's currently held item
     */
    updateWorldObjects(worldObjects, interactionSystem, player, heldItem) {
        if (!worldObjects) return;

        // Separate different object types
        const items = worldObjects.filter(obj =>
            obj.objectType !== 'plant' &&
            obj.objectType !== 'station' &&
            obj.objectType !== 'appliance' &&
            obj.objectType !== 'table' &&
            obj.objectType !== 'bed' &&
            obj.type !== 'player_body'
        );
        const plants = worldObjects.filter(obj => obj.objectType === 'plant');
        const stations = worldObjects.filter(obj => obj.objectType === 'station');
        const appliances = worldObjects.filter(obj => obj.objectType === 'appliance');
        const beds = worldObjects.filter(obj => obj.objectType === 'bed');
        const bodies = worldObjects.filter(obj => obj.type === 'player_body');

        // Update items
        this._updateItems(items, interactionSystem);

        // Update player bodies
        this._updateBodies(bodies);

        // Update plants
        this._updatePlants(plants, interactionSystem);

        // Update station interactions and visuals
        this.updateStationInteractions(interactionSystem, heldItem, stations);

        // Update appliance interactions and visuals
        this.updateApplianceInteractions(interactionSystem, heldItem, appliances);

        // Update bed interactions and visuals
        this.updateBedInteractions(interactionSystem, player, beds);
    }

    /**
     * Update camera meshes in the scene from server state
     * @param {Array} cameras - Array of camera entities from server
     * @param {string} localPlayerId - Local player's socket ID (to skip held camera meshes)
     */
    updateCameras(cameras, localPlayerId = null) {
        if (!cameras) return;

        const currentIds = new Set(cameras.map(c => c.id));

        // Remove deleted cameras
        for (const [id, mesh] of this.cameraMeshes) {
            if (!currentIds.has(id)) {
                this.scene.remove(mesh);
                CameraRenderer.disposeCameraMesh(mesh);
                this.cameraMeshes.delete(id);
            }
        }

        // Add/update cameras
        for (const camera of cameras) {
            // Skip ALL held cameras (they're rendered as part of the player mesh instead)
            if (camera.ownerId && camera.ownerId.startsWith('held_')) {
                // Remove mesh if it exists (camera was just picked up)
                if (this.cameraMeshes.has(camera.id)) {
                    this.scene.remove(this.cameraMeshes.get(camera.id));
                    CameraRenderer.disposeCameraMesh(this.cameraMeshes.get(camera.id));
                    this.cameraMeshes.delete(camera.id);
                }
                continue;
            }

            if (!this.cameraMeshes.has(camera.id)) {
                const mesh = CameraRenderer.createCameraMesh(camera);
                this.cameraMeshes.set(camera.id, mesh);
                this.scene.add(mesh);
            } else {
                CameraRenderer.updateCameraMesh(
                    this.cameraMeshes.get(camera.id),
                    camera
                );
            }
        }
    }

    /**
     * Update item meshes (non-plant world objects)
     * @private
     */
    _updateItems(items, interactionSystem) {
        // Track which IDs are in the new state
        const newIds = new Set(items.map(obj => obj.id));

        // Remove meshes for objects no longer in state
        for (const [id, mesh] of this.worldObjectMeshes) {
            if (!newIds.has(id)) {
                this.scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
                if (interactionSystem) {
                    interactionSystem.unregisterInteractable(mesh);
                }
                this.worldObjectMeshes.delete(id);
            }
        }

        // Create or update meshes for objects in state
        for (const obj of items) {
            // Skip security_camera items with linked cameras - they have their own camera mesh
            if (obj.type === 'security_camera' && obj.linkedCameraId) {
                // Clean up any existing mesh for this item
                if (this.worldObjectMeshes.has(obj.id)) {
                    const oldMesh = this.worldObjectMeshes.get(obj.id);
                    this.scene.remove(oldMesh);
                    if (oldMesh.geometry) oldMesh.geometry.dispose();
                    if (oldMesh.material) oldMesh.material.dispose();
                    if (interactionSystem) {
                        interactionSystem.unregisterInteractable(oldMesh);
                    }
                    this.worldObjectMeshes.delete(obj.id);
                }
                continue;
            }

            if (!this.worldObjectMeshes.has(obj.id)) {
                // Create new mesh
                const mesh = this.createWorldObjectMesh(obj);
                this.worldObjectMeshes.set(obj.id, mesh);
                this.scene.add(mesh);

                // Register with interaction system
                if (interactionSystem) {
                    const itemDef = ITEMS[obj.type];
                    const itemName = itemDef ? itemDef.name : obj.type;
                    interactionSystem.registerInteractable(
                        mesh,
                        'WORLD_ITEM',
                        obj.id,
                        [{ type: 'pickup_item', prompt: `Pick up ${itemName}` }]
                    );
                }
            } else {
                // Update existing mesh
                const mesh = this.worldObjectMeshes.get(obj.id);
                mesh.position.set(obj.position.x, obj.position.y, obj.position.z);

                // Check if item type changed (e.g., rotted to trash)
                if (mesh.userData.itemType !== obj.type) {
                    // Update color for new type
                    const itemDef = ITEMS[obj.type];
                    if (itemDef) {
                        mesh.material.color.setHex(itemDef.color);
                    }
                    mesh.userData.itemType = obj.type;

                    // Update interaction prompt if registered
                    if (interactionSystem) {
                        const itemName = itemDef ? itemDef.name : obj.type;
                        interactionSystem.updateInteractablePrompt(
                            mesh,
                            [{ type: 'pickup_item', prompt: `Pick up ${itemName}` }]
                        );
                    }
                }
            }
        }
    }

    /**
     * Update player body meshes (dead players)
     * @private
     */
    _updateBodies(bodies) {
        // Track which body IDs are in the new state
        const newIds = new Set(bodies.map(b => b.id));

        // Remove meshes for bodies no longer in state
        for (const [id, mesh] of this.bodyMeshes) {
            if (!newIds.has(id)) {
                this.scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
                this.bodyMeshes.delete(id);
            }
        }

        // Create meshes for new bodies
        for (const body of bodies) {
            if (!this.bodyMeshes.has(body.id)) {
                // Create body mesh (dark gray flat cube)
                const geometry = new THREE.BoxGeometry(0.6, 0.2, 0.8);
                const material = new THREE.MeshLambertMaterial({ color: 0x333333 });
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(body.position.x, body.position.y, body.position.z);
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                this.bodyMeshes.set(body.id, mesh);
                this.scene.add(mesh);
            }
        }
    }

    /**
     * Update plant meshes
     * @private
     */
    _updatePlants(plants, interactionSystem) {
        // Track which plant IDs are in the new state
        const newIds = new Set(plants.map(p => p.id));

        // Remove meshes for plants no longer in state
        for (const [id, group] of this.plantMeshes) {
            if (!newIds.has(id)) {
                this.scene.remove(group);
                FarmingRenderer.disposePlantMesh(group);
                if (interactionSystem) {
                    interactionSystem.unregisterInteractable(group);
                }
                this.plantMeshes.delete(id);
            }
        }

        // Create or update meshes for plants in state
        for (const plant of plants) {
            if (!this.plantMeshes.has(plant.id)) {
                // Create new plant mesh
                const group = FarmingRenderer.createPlantMesh(plant);
                this.plantMeshes.set(plant.id, group);
                this.scene.add(group);

                // Register with interaction system
                if (interactionSystem) {
                    const interactions = this._getPlantInteractions(plant);
                    if (interactions.length > 0) {
                        interactionSystem.registerInteractable(
                            group,
                            'PLANT',
                            plant.id,
                            interactions
                        );
                    }
                }
            } else {
                // Update existing plant mesh
                const group = this.plantMeshes.get(plant.id);
                const changed = FarmingRenderer.updatePlantMesh(group, plant);

                // Update interactions if state changed
                if (changed && interactionSystem) {
                    const interactions = this._getPlantInteractions(plant);
                    interactionSystem.updateInteractablePrompt(group, interactions);
                }
            }
        }
    }

    /**
     * Get available interactions for a plant based on its state
     * @private
     */
    _getPlantInteractions(plant) {
        const interactions = [];

        if (plant.hasWeeds) {
            interactions.push({ type: 'weed', prompt: 'Remove weeds' });
        }

        if (plant.stage === 'harvestable') {
            interactions.push({ type: 'harvest', prompt: 'Harvest' });
        }

        // Water interaction is handled by the interaction system based on held item
        // We always allow water_plant as an option, client-side will filter
        interactions.push({ type: 'water_plant', prompt: 'Water' });

        return interactions;
    }

    /**
     * Create a mesh for a world object
     * @param {Object} obj - World object data
     * @returns {THREE.Mesh}
     */
    createWorldObjectMesh(obj) {
        // Get item definition for color
        const itemDef = ITEMS[obj.type];

        // Size based on stack count (subtle growth)
        const baseSize = 0.4;
        const stackBonus = obj.stackCount > 1 ? Math.min((obj.stackCount - 1) * 0.05, 0.2) : 0;
        const size = baseSize + stackBonus;

        const geometry = new THREE.BoxGeometry(size, size, size);

        // Use item color if available, otherwise fallback
        let color = obj.color || 0xffff00;
        if (itemDef) {
            color = itemDef.color;
        }

        const material = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.5,
            metalness: 0.1
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Store item data for interaction system
        mesh.userData.itemType = obj.type;
        mesh.userData.stackCount = obj.stackCount || 1;

        return mesh;
    }

    // ============================================
    // Waiting Room Methods
    // ============================================

    /**
     * Show the waiting room (creates renderer if needed)
     */
    showWaitingRoom() {
        if (!this.waitingRoomRenderer) {
            this.waitingRoomRenderer = new WaitingRoomRenderer(this.scene);
            console.log('[Scene] Waiting room created');
        }
    }

    /**
     * Hide the waiting room (disposes renderer)
     */
    hideWaitingRoom() {
        if (this.waitingRoomRenderer) {
            this.waitingRoomRenderer.dispose();
            this.waitingRoomRenderer = null;
            console.log('[Scene] Waiting room disposed');
        }
    }

    /**
     * Update waiting room state from server
     * @param {Object} state - WAITING_ROOM_STATE message data
     */
    updateWaitingRoomState(state) {
        if (this.waitingRoomRenderer) {
            this.waitingRoomRenderer.updateState(state);
        }
    }

    /**
     * Get door interaction from waiting room (for interaction system)
     * @returns {Object|null}
     */
    getWaitingRoomDoorInteraction() {
        if (this.waitingRoomRenderer) {
            return this.waitingRoomRenderer.getDoorInteraction();
        }
        return null;
    }
}
