/* AreaTherm — 3D shelter preview (Vanilla Three.js, ES module, no build step).
   Loaded via an import map (see index.html) — no bundler, matching the rest
   of this project's zero-build-step architecture. Renders a parametric box
   shelter with door/window placeholders and a sun that orbits the building
   on a fixed-elevation circle driven by `sunAngle`.

   Usage from any classic (non-module) script, once this module has loaded:
     const view = new window.AreaTherm3D.Shelter3D(canvasEl);
     view.update({ width, length, height, doorCount, windowCount, wallColor, sunAngle });
     // ...later, e.g. on navigating away from the page:
     view.dispose();

   Deliberately excludes shadow mapping entirely (no renderer.shadowMap,
   no castShadow/receiveShadow anywhere) — ambient + directional light only,
   per the performance constraint this was built against. */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const DOOR_SIZE = { w: 0.9, h: 2.0 };   // metres — clamped down for small/crowded walls
const WINDOW_SIZE = { w: 1.1, h: 1.2 };
const SUN_ELEVATION_DEG = 38;            // fixed height angle the sun orbits at

export class Shelter3D {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    if (!canvas) throw new Error("Shelter3D: a <canvas> element is required.");
    this.canvas = canvas;
    this.params = { width: 6, length: 4, height: 3, doorCount: 1, windowCount: 2, windowFace: "FRONT", wallColor: "#dfeef2", sunAngle: 135 };

    this._initScene();
    this._initLights();
    this._initShelter();
    this._initSun();
    this._initControls();
    this._initResizeHandling();

    this.update(this.params);
    this._startRenderLoop();
  }

  // ---- setup -------------------------------------------------------------

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdfeef6);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.camera.position.set(7, 7, -9); // overwritten by _frameCamera() on first update(); set here only as a sane pre-update default

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // Shadow mapping intentionally left disabled — high-performance constraint.
    // (No `this.renderer.shadowMap.enabled = true` anywhere in this file.)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshLambertMaterial({ color: 0xbfd9b8 })
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    this.scene.add(new THREE.GridHelper(60, 60, 0x88a888, 0xa9c7a3));
  }

  _initLights() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(this.ambientLight);

    // The "sun" — no shadow casting configured anywhere on this light.
    this.sunLight = new THREE.DirectionalLight(0xfff3d6, 1.15);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target); // target stays at the shelter's centre, moved in update()
  }

  _initShelter() {
    this.shelterGroup = new THREE.Group();
    this.scene.add(this.shelterGroup);

    this.wallMaterial = new THREE.MeshLambertMaterial({ color: 0xdfeef2 });
    this.wallMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.wallMaterial);
    this.shelterGroup.add(this.wallMesh);

    // DoubleSide: these sit just outside the wall face, and OrbitControls
    // lets the camera go anywhere — without this they'd be invisible from
    // outside the building (PlaneGeometry only renders its front face by
    // default, and that face points inward here).
    this.doorMaterial = new THREE.MeshLambertMaterial({ color: 0x5a3d2b, side: THREE.DoubleSide });
    this.windowMaterial = new THREE.MeshLambertMaterial({ color: 0x2fb8cf, side: THREE.DoubleSide });
    this.openingsGroup = new THREE.Group();
    this.shelterGroup.add(this.openingsGroup);
  }

  _initSun() {
    // Small, self-illuminated marker at the light's position — Basic
    // material ignores scene lighting, so it always reads as "glowing"
    // regardless of ambient/directional intensity.
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffd54a })
    );
    this.scene.add(this.sunMesh);

    // Dynamic pointer from the sun to the shelter's centre — rebuilt each
    // update() since ArrowHelper has no cheap "reposition" API for both
    // origin and direction+length changing together.
    this.sunArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 0), 1, 0xffb400, 0.6, 0.35
    );
    this.scene.add(this.sunArrow);
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 120;
    this.controls.maxPolarAngle = Math.PI * 0.49; // stop just short of going under the ground plane
  }

  _initResizeHandling() {
    this._resizeObserver = new ResizeObserver(() => this._resizeToContainer());
    this._resizeObserver.observe(this.canvas);
    this._resizeToContainer();
  }

  _resizeToContainer() {
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- public API ----------------------------------------------------------

  /**
   * @param {{width:number, length:number, height:number, doorCount:number,
   *          windowCount:number, windowFace:('FRONT'|'BACK'|'LEFT'|'RIGHT'),
   *          wallColor:string, sunAngle:number}} params
   */
  update(params) {
    this.params = { ...this.params, ...params };
    const { width, length, height, doorCount, windowCount, windowFace, wallColor, sunAngle } = this.params;

    this._rebuildBox(width, length, height);
    this.wallMaterial.color.set(wallColor);
    this._rebuildOpenings(width, length, height, doorCount, windowCount, windowFace || "FRONT");
    this._positionSun(sunAngle, width, length, height);

    const maxDim = Math.max(width, length, height);
    this.controls.target.set(0, height / 2, 0);
    if (!this._cameraFramed) { this._frameCamera(maxDim); this._cameraFramed = true; }
  }

  dispose() {
    this._resizeObserver.disconnect();
    cancelAnimationFrame(this._rafId);
    this.controls.dispose();
    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
    });
    this.renderer.dispose();
  }

  // ---- internals -----------------------------------------------------------

  _rebuildBox(width, length, height) {
    this.wallMesh.geometry.dispose();
    this.wallMesh.geometry = new THREE.BoxGeometry(width, height, length);
    this.wallMesh.position.set(0, height / 2, 0); // sits on the ground plane, not centred through it
  }

  // Doors always sit on the front (−Z) wall — this app's door data has no
  // per-face field anywhere (the 2D preview discloses doors as "face not
  // modeled" too), so front is a reasonable, consistent default. Windows
  // use the same FRONT/BACK/LEFT/RIGHT face as the rest of the app (the
  // Shelter Designer's "Window face" control and the 2D preview), evenly
  // spaced along whichever wall that face maps to.
  _rebuildOpenings(width, length, height, doorCount, windowCount, windowFace) {
    while (this.openingsGroup.children.length) {
      const child = this.openingsGroup.children.pop();
      child.geometry.dispose();
    }

    if (doorCount > 0) {
      const slotW = width / (doorCount + 1);
      const doorW = Math.min(DOOR_SIZE.w, slotW * 0.7), doorH = Math.min(DOOR_SIZE.h, height * 0.85);
      const z = -length / 2 - 0.02; // a hair proud of the wall face to avoid z-fighting
      for (let i = 1; i <= doorCount; i++) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(doorW, doorH), this.doorMaterial);
        mesh.position.set(-width / 2 + slotW * i, doorH / 2, z);
        this.openingsGroup.add(mesh);
      }
    }

    if (windowCount > 0) {
      // Front/back walls run along X (span = width); left/right walls run
      // along Z (span = length) and need the plane rotated 90° about Y so
      // its face points outward (±X) instead of the default ±Z.
      const onSideWall = windowFace === "LEFT" || windowFace === "RIGHT";
      const span = onSideWall ? length : width;
      const slotW = span / (windowCount + 1);
      const winW = Math.min(WINDOW_SIZE.w, slotW * 0.7), winH = Math.min(WINDOW_SIZE.h, height * 0.35);
      const winY = height * 0.55;
      for (let i = 1; i <= windowCount; i++) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), this.windowMaterial);
        const along = -span / 2 + slotW * i;
        if (windowFace === "BACK") {
          mesh.position.set(along, winY, length / 2 + 0.02);
        } else if (windowFace === "LEFT") {
          mesh.rotation.y = Math.PI / 2;
          mesh.position.set(-width / 2 - 0.02, winY, along);
        } else if (windowFace === "RIGHT") {
          mesh.rotation.y = Math.PI / 2;
          mesh.position.set(width / 2 + 0.02, winY, along);
        } else { // FRONT
          mesh.position.set(along, winY, -length / 2 - 0.02);
        }
        this.openingsGroup.add(mesh);
      }
    }
  }

  _positionSun(sunAngleDeg, width, length, height) {
    const maxDim = Math.max(width, length, height);
    const radius = maxDim * 2.2;
    const elevRad = THREE.MathUtils.degToRad(SUN_ELEVATION_DEG);
    const azRad = THREE.MathUtils.degToRad(sunAngleDeg);

    const horizR = radius * Math.cos(elevRad);
    const sunPos = new THREE.Vector3(
      horizR * Math.sin(azRad),
      radius * Math.sin(elevRad) + height / 2,
      horizR * Math.cos(azRad)
    );
    const center = new THREE.Vector3(0, height / 2, 0);

    this.sunLight.position.copy(sunPos);
    this.sunLight.target.position.copy(center);
    this.sunMesh.position.copy(sunPos);

    const dir = center.clone().sub(sunPos);
    const dist = dir.length();
    dir.normalize();
    this.sunArrow.position.copy(sunPos);
    this.sunArrow.setDirection(dir);
    this.sunArrow.setLength(dist, Math.min(0.6, dist * 0.08), Math.min(0.35, dist * 0.05));
  }

  _frameCamera(maxDim) {
    const d = maxDim * 2.4;
    // Negative Z so the initial view faces the front (door/window) wall,
    // rather than the blank back wall.
    this.camera.position.set(d * 0.8, d * 0.75, -d);
  }

  _startRenderLoop() {
    const tick = () => {
      this._rafId = requestAnimationFrame(tick);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }
}

window.AreaTherm3D = { Shelter3D };
