/**
 * Three.js scene setup for PC client
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { COLORS, WORLD_SIZE } from '../shared/constants.js';

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

    setupGround() {
        // Ground plane
        const groundGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: COLORS.GROUND,
            roughness: 0.8,
            metalness: 0.1
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
        const blockColors = [
            COLORS.BLOCK_RED,
            COLORS.BLOCK_GREEN,
            COLORS.BLOCK_BLUE,
            COLORS.BLOCK_YELLOW,
            COLORS.BLOCK_PURPLE
        ];

        const positions = [
            { x: 10, z: 0 },
            { x: -10, z: 0 },
            { x: 0, z: 10 },
            { x: 0, z: -10 },
            { x: 0, z: 0 }
        ];

        positions.forEach((pos, i) => {
            const geometry = new THREE.BoxGeometry(2, 3, 2);
            const material = new THREE.MeshStandardMaterial({
                color: blockColors[i],
                roughness: 0.7,
                metalness: 0.1
            });
            const block = new THREE.Mesh(geometry, material);
            block.position.set(pos.x, 1.5, pos.z);
            block.castShadow = true;
            block.receiveShadow = true;
            this.scene.add(block);
        });

        // Add some scattered blocks for visual interest
        for (let i = 0; i < 20; i++) {
            const size = 0.5 + Math.random() * 1.5;
            const geometry = new THREE.BoxGeometry(size, size * 2, size);
            const material = new THREE.MeshStandardMaterial({
                color: blockColors[Math.floor(Math.random() * blockColors.length)],
                roughness: 0.7,
                metalness: 0.1
            });
            const block = new THREE.Mesh(geometry, material);
            block.position.set(
                (Math.random() - 0.5) * 40,
                size,
                (Math.random() - 0.5) * 40
            );
            block.rotation.y = Math.random() * Math.PI;
            block.castShadow = true;
            block.receiveShadow = true;
            this.scene.add(block);
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
