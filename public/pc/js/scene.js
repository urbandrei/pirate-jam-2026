/**
 * Three.js scene setup for PC client
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { COLORS, WORLD_SIZE, ROOM_SIZE, WALL_THICKNESS, DOORWAY_HEIGHT, DOORWAY_WIDTH } from '../shared/constants.js';

export class Scene {
    constructor(container) {
        this.container = container;

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

        // Setup scene elements
        this.setupLighting();
        this.setupGround();
        this.setupReferenceBlocks();

        // Handle window resize
        window.addEventListener('resize', () => this.onResize());
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

    setupReferenceBlocks() {
        // Replace colored blocks with concrete room
        this.setupRoom();
    }

    /**
     * Create a concrete room with doorways around spawn point
     * All dimensions at full PC scale (1:1 meters)
     */
    setupRoom() {
        // Room dimensions at PC scale (full meters)
        const roomSize = ROOM_SIZE;           // 5m
        const wallHeight = ROOM_SIZE;         // 5m
        const wallThickness = WALL_THICKNESS; // 0.2m
        const doorwayHeight = DOORWAY_HEIGHT; // ~2.34m
        const doorwayWidth = DOORWAY_WIDTH;   // 1.2m

        // Concrete material for walls
        const wallMaterial = new THREE.MeshStandardMaterial({
            map: this.createConcreteTexture(),
            roughness: 0.95,
            metalness: 0.05
        });

        // Calculate wall segment dimensions
        const sideSegmentWidth = (roomSize - doorwayWidth) / 2;
        const aboveDoorHeight = wallHeight - doorwayHeight;
        const halfRoom = roomSize / 2;

        // Create wall segments for each side (with doorway cutouts)

        // North wall (z = -halfRoom)
        this.createWallWithDoorway(
            wallMaterial,
            { x: 0, z: -halfRoom },
            'z',
            wallHeight, wallThickness,
            doorwayWidth, doorwayHeight, sideSegmentWidth, aboveDoorHeight
        );

        // South wall (z = +halfRoom)
        this.createWallWithDoorway(
            wallMaterial,
            { x: 0, z: halfRoom },
            'z',
            wallHeight, wallThickness,
            doorwayWidth, doorwayHeight, sideSegmentWidth, aboveDoorHeight
        );

        // East wall (x = +halfRoom)
        this.createWallWithDoorway(
            wallMaterial,
            { x: halfRoom, z: 0 },
            'x',
            wallHeight, wallThickness,
            doorwayWidth, doorwayHeight, sideSegmentWidth, aboveDoorHeight
        );

        // West wall (x = -halfRoom)
        this.createWallWithDoorway(
            wallMaterial,
            { x: -halfRoom, z: 0 },
            'x',
            wallHeight, wallThickness,
            doorwayWidth, doorwayHeight, sideSegmentWidth, aboveDoorHeight
        );
    }

    /**
     * Create a wall with a doorway cutout
     */
    createWallWithDoorway(material, position, axis, wallHeight, wallThickness, doorwayWidth, doorwayHeight, sideSegmentWidth, aboveDoorHeight) {
        const halfDoorway = doorwayWidth / 2;
        const sideOffset = halfDoorway + sideSegmentWidth / 2;

        if (axis === 'z') {
            // Wall along X-axis (North/South walls)
            // Left segment
            const leftGeom = new THREE.BoxGeometry(sideSegmentWidth, wallHeight, wallThickness);
            const leftWall = new THREE.Mesh(leftGeom, material);
            leftWall.position.set(position.x - sideOffset, wallHeight / 2, position.z);
            leftWall.castShadow = true;
            leftWall.receiveShadow = true;
            this.scene.add(leftWall);

            // Right segment
            const rightGeom = new THREE.BoxGeometry(sideSegmentWidth, wallHeight, wallThickness);
            const rightWall = new THREE.Mesh(rightGeom, material);
            rightWall.position.set(position.x + sideOffset, wallHeight / 2, position.z);
            rightWall.castShadow = true;
            rightWall.receiveShadow = true;
            this.scene.add(rightWall);

            // Above door segment
            const aboveGeom = new THREE.BoxGeometry(doorwayWidth, aboveDoorHeight, wallThickness);
            const aboveWall = new THREE.Mesh(aboveGeom, material);
            aboveWall.position.set(position.x, doorwayHeight + aboveDoorHeight / 2, position.z);
            aboveWall.castShadow = true;
            aboveWall.receiveShadow = true;
            this.scene.add(aboveWall);
        } else {
            // Wall along Z-axis (East/West walls)
            // Left segment (negative Z)
            const leftGeom = new THREE.BoxGeometry(wallThickness, wallHeight, sideSegmentWidth);
            const leftWall = new THREE.Mesh(leftGeom, material);
            leftWall.position.set(position.x, wallHeight / 2, position.z - sideOffset);
            leftWall.castShadow = true;
            leftWall.receiveShadow = true;
            this.scene.add(leftWall);

            // Right segment (positive Z)
            const rightGeom = new THREE.BoxGeometry(wallThickness, wallHeight, sideSegmentWidth);
            const rightWall = new THREE.Mesh(rightGeom, material);
            rightWall.position.set(position.x, wallHeight / 2, position.z + sideOffset);
            rightWall.castShadow = true;
            rightWall.receiveShadow = true;
            this.scene.add(rightWall);

            // Above door segment
            const aboveGeom = new THREE.BoxGeometry(wallThickness, aboveDoorHeight, doorwayWidth);
            const aboveWall = new THREE.Mesh(aboveGeom, material);
            aboveWall.position.set(position.x, doorwayHeight + aboveDoorHeight / 2, position.z);
            aboveWall.castShadow = true;
            aboveWall.receiveShadow = true;
            this.scene.add(aboveWall);
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
}
