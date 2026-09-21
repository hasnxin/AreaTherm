/* AreaTherm — 3D shelter preview (Vanilla Three.js, ES module, no build step).
   Loaded via an import map (see index.html) — no bundler, matching the rest
   of this project's zero-build-step architecture. Renders a parametric
   shelter — box, cylinder, dome, or L-shaped extrusion, matching whichever
   shape engine.js's computeGeometry() actually computes for — with door/
   window placeholders on their configured face, and a sun that orbits the
   building on a fixed-elevation circle driven by `sunAngle`.

   Usage from any classic (non-module) script, once this module has loaded:
     const view = new window.AreaTherm3D.Shelter3D(canvasEl);
     view.update({ shape, width, length, height, diameter, lengthA, widthA,
                    lengthB, widthB, doorCount, doorFace, windowCount,
                    windowFace, wallColor, sunAngle });
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
const ROUND_ARC_DEG = 70;                // arc a round shape's openings are allowed to spread across, per face
const FACE_ANGLE_DEG = { FRONT: 0, RIGHT: 90, BACK: 180, LEFT: 270 }; // matches ui-1.js's edgeOf() convention

export class Shelter3D {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    if (!canvas) throw new Error("Shelter3D: a <canvas> element is required.");
    this.canvas = canvas;
    this.params = {
      shape: "RECTANGULAR", width: 6, length: 4, height: 3, diameter: 5,
      lengthA: 4, widthA: 4, lengthB: 3, widthB: 3,
      doorCount: 1, doorFace: "FRONT", windowCount: 2, windowFace: "FRONT",
      wallColor: "#dfeef2", sunAngle: 135
    };

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

    // DoubleSide: a hand-built L-shape extrusion's winding direction isn't
    // worth fighting to get pixel-perfect, and OrbitControls lets the
    // camera go anywhere regardless of shape — this guarantees every wall
    // stays visible (and correctly lit — MeshLambertMaterial flips the
    // normal for back-facing fragments automatically) no matter which way
    // a given face happens to wind.
    this.wallMaterial = new THREE.MeshLambertMaterial({ color: 0xdfeef2, side: THREE.DoubleSide });
    this.wallGroup = new THREE.Group(); // holds whichever geometry the current shape needs (1 mesh for box/cylinder, 2 for dome, 1 extrusion for L-shape)
    this.shelterGroup.add(this.wallGroup);

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
   * @param {{shape:('RECTANGULAR'|'SQUARE'|'CIRCULAR'|'DOME'|'SEMI_CIRCULAR'|'L_SHAPE'|'CUSTOM'),
   *          width:number, length:number, height:number, diameter:number,
   *          lengthA:number, widthA:number, lengthB:number, widthB:number,
   *          doorCount:number, doorFace:('FRONT'|'BACK'|'LEFT'|'RIGHT'),
   *          windowCount:number, windowFace:('FRONT'|'BACK'|'LEFT'|'RIGHT'),
   *          wallColor:string, sunAngle:number}} params
   */
  update(params) {
    this.params = { ...this.params, ...params };
    const p = this.params;
    const shape = p.shape || "RECTANGULAR";
    const isRound = shape === "CIRCULAR" || shape === "DOME" || shape === "SEMI_CIRCULAR";
    const isLShape = shape === "L_SHAPE";

    this._rebuildGeometry(shape, p.width, p.length, p.height, p.diameter, p.lengthA, p.widthA, p.lengthB, p.widthB);
    this.wallMaterial.color.set(p.wallColor);
    this._rebuildOpenings(shape, p.width, p.length, p.height, p.diameter, p.lengthA, p.widthA, p.lengthB, p.widthB,
      p.doorCount, p.windowCount, p.doorFace || "FRONT", p.windowFace || "FRONT");
    this._positionSun(p.sunAngle, p.width, p.length, p.height);

    // Camera framing needs the shelter's actual footprint extent, which
    // depends on the shape (a round footprint is diameter-wide in every
    // direction; an L-shape's Z extent is widthA+lengthB, not just width).
    let extentX = p.width, extentZ = p.length;
    if (isRound) { extentX = extentZ = p.diameter; }
    else if (isLShape) { extentX = p.lengthA; extentZ = (p.widthA || 4) + (p.lengthB || 3); }
    const maxDim = Math.max(extentX, extentZ, p.height);
    this.controls.target.set(0, p.height / 2, 0);
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

  // ---- internals: shelter geometry ------------------------------------------

  _clearWallGroup() {
    while (this.wallGroup.children.length) {
      const child = this.wallGroup.children.pop();
      child.geometry.dispose();
    }
  }

  _rebuildGeometry(shape, width, length, height, diameter, lengthA, widthA, lengthB, widthB) {
    this._clearWallGroup();
    if (shape === "CIRCULAR" || shape === "SEMI_CIRCULAR") {
      this._addCylinder(diameter, height);
    } else if (shape === "DOME") {
      this._addCylinder(diameter, height);
      this._addDomeCap(diameter, height);
    } else if (shape === "L_SHAPE") {
      this._addLShapeExtrusion(lengthA, widthA, lengthB, widthB, height);
    } else { // RECTANGULAR / SQUARE / CUSTOM
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), this.wallMaterial);
      mesh.position.set(0, height / 2, 0); // sits on the ground plane, not centred through it
      this.wallGroup.add(mesh);
    }
  }

  // Flat-roofed cylinder — matches engine.js's computeGeometry(), which
  // gives CIRCULAR and SEMI_CIRCULAR the same floor/roof-area formulas
  // (a true half-circle footprint isn't actually modeled anywhere yet, so
  // this view doesn't invent one either — both render as a full drum).
  _addCylinder(diameter, height) {
    const r = (diameter || 5) / 2;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, height, 32), this.wallMaterial);
    mesh.position.set(0, height / 2, 0);
    this.wallGroup.add(mesh);
  }

  // A hemispherical cap sitting on top of the cylinder body — engine.js
  // gives DOME the same floor/volume as a plain cylinder of the same
  // height, only the roof *surface area* differs (2*pi*r^2, i.e. a
  // hemisphere) — this visual matches that: straight walls up to `height`,
  // domed only above it, not a full igloo-style hemisphere from the ground.
  _addDomeCap(diameter, height) {
    const r = (diameter || 5) / 2;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), this.wallMaterial);
    cap.position.set(0, height, 0);
    this.wallGroup.add(cap);
  }

  // Extrudes the actual L-tromino footprint engine.js computes (wing A's
  // full-width front strip + wing B's partial-width back strip on the left)
  // up to `height` — replacing the bounding-box approximation used for
  // every other shape. wB is clamped to lengthA, mirroring validator.js's
  // "Wing B's width must be ≤ Wing A's length" rule.
  _addLShapeExtrusion(lengthA, widthA, lengthB, widthB, height) {
    const lA = lengthA || 4, wA = widthA || 4, lB = lengthB || 3;
    const wB = Math.min(widthB || 3, lA);
    const overallW = wA + lB;
    // World-space (X, Z) outline, front = -Z (matching every other shape's
    // door/window convention): front-left -> front-right -> wing A's back-
    // right -> step in to wing B -> wing B's back-left -> back to front-left.
    const outline = [
      [-lA / 2, -overallW / 2], [lA / 2, -overallW / 2], [lA / 2, -overallW / 2 + wA],
      [-lA / 2 + wB, -overallW / 2 + wA], [-lA / 2 + wB, overallW / 2], [-lA / 2, overallW / 2]
    ];
    // ExtrudeGeometry extrudes a Shape (in its own local X/Y plane) along
    // +Z by `depth`; rotateX(-90deg) then remaps that to world (X, height,
    // Z) as (x, z, -y) — so shape.y must be -worldZ for the final mesh to
    // land at the world Z coordinates above.
    const shape = new THREE.Shape();
    shape.moveTo(outline[0][0], -outline[0][1]);
    for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], -outline[i][1]);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    this.wallGroup.add(new THREE.Mesh(geometry, this.wallMaterial));
  }

  // ---- internals: openings -------------------------------------------------

  // Places a plane of size (w,h) at height y on a rectangular wall, at
  // position `along` measured from the centre of whichever wall `face`
  // maps to (FRONT/BACK run along X — span = width; LEFT/RIGHT run along Z
  // — span = length, with the plane rotated 90 deg about Y so it faces
  // outward along +/-X instead of the default +/-Z). Offsets a hair proud
  // of the wall surface to avoid z-fighting.
  _placeOnFaceBox(material, w, h, y, face, along, width, length) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    if (face === "BACK") {
      mesh.position.set(along, y, length / 2 + 0.02);
    } else if (face === "LEFT") {
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(-width / 2 - 0.02, y, along);
    } else if (face === "RIGHT") {
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(width / 2 + 0.02, y, along);
    } else { // FRONT
      mesh.position.set(along, y, -length / 2 - 0.02);
    }
    this.openingsGroup.add(mesh);
  }

  // Same idea, but "along" is an arc-length offset (metres) converted to an
  // angle (angle = along / r) and wrapped around the cylinder at that face's
  // angle (FRONT=0, RIGHT=90, BACK=180, LEFT=270 — matching ui-1.js's
  // edgeOf()), with the plane rotated tangent to the curve at that point.
  _placeOnFaceRound(material, w, h, y, face, along, r) {
    const faceAngleRad = THREE.MathUtils.degToRad(FACE_ANGLE_DEG[face] ?? 0);
    const theta = faceAngleRad + along / r;
    const rOut = r + 0.02;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.rotation.y = theta;
    mesh.position.set(rOut * Math.sin(theta), y, -rOut * Math.cos(theta));
    this.openingsGroup.add(mesh);
  }

  // Maps FRONT/BACK/LEFT/RIGHT onto the L-tromino's actual edges: FRONT is
  // wing A's full-width front edge; BACK is wing B's (narrower) back edge;
  // LEFT is the one continuous full-depth wall both wings share; RIGHT is
  // wing A's edge only, since wing B doesn't reach that far right. The two
  // inner "step" edges of the L aren't reachable from any of the four
  // labels — a deliberate simplification, matching how engine.js already
  // treats the whole L-shaped wall as a single undifferentiated face.
  _placeOnFaceLShape(material, w, h, y, face, along, lengthA, widthA, lengthB, widthB) {
    const lA = lengthA || 4, wA = widthA || 4, lB = lengthB || 3;
    const wB = Math.min(widthB || 3, lA);
    const overallW = wA + lB;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    if (face === "BACK") {
      mesh.position.set(-lA / 2 + wB / 2 + along, y, overallW / 2 + 0.02);
    } else if (face === "LEFT") {
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(-lA / 2 - 0.02, y, along);
    } else if (face === "RIGHT") {
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(lA / 2 + 0.02, y, -overallW / 2 + wA / 2 + along);
    } else { // FRONT
      mesh.position.set(along, y, -overallW / 2 - 0.02);
    }
    this.openingsGroup.add(mesh);
  }

  // Doors and windows each use the same FRONT/BACK/LEFT/RIGHT face as the
  // rest of the app (the Shelter Designer's "Door face"/"Window face"
  // controls and the 2D preview). When they land on the same wall, they
  // share one evenly-spaced slot layout (doors first, then windows) so they
  // can't overlap; otherwise each is spaced independently along its own
  // wall. The span/placement functions swap per shape so the same slot
  // math works whether "along" a wall means a straight line, an arc, or an
  // L-tromino edge.
  _rebuildOpenings(shape, width, length, height, diameter, lengthA, widthA, lengthB, widthB, doorCount, windowCount, doorFace, windowFace) {
    while (this.openingsGroup.children.length) {
      const child = this.openingsGroup.children.pop();
      child.geometry.dispose();
    }

    let spanOf, place;
    if (shape === "CIRCULAR" || shape === "DOME" || shape === "SEMI_CIRCULAR") {
      const r = (diameter || 5) / 2;
      spanOf = () => r * THREE.MathUtils.degToRad(ROUND_ARC_DEG);
      place = (material, w, h, y, face, along) => this._placeOnFaceRound(material, w, h, y, face, along, r);
    } else if (shape === "L_SHAPE") {
      const wA = widthA || 4, lB = lengthB || 3, lA = lengthA || 4;
      const wB = Math.min(widthB || 3, lA);
      const spans = { FRONT: lA, BACK: wB, LEFT: wA + lB, RIGHT: wA };
      spanOf = (face) => spans[face] ?? lA;
      place = (material, w, h, y, face, along) => this._placeOnFaceLShape(material, w, h, y, face, along, lengthA, widthA, lengthB, widthB);
    } else {
      spanOf = (face) => (face === "LEFT" || face === "RIGHT") ? length : width;
      place = (material, w, h, y, face, along) => this._placeOnFaceBox(material, w, h, y, face, along, width, length);
    }

    const doorH = Math.min(DOOR_SIZE.h, height * 0.85), doorY = doorH / 2;
    const winH = Math.min(WINDOW_SIZE.h, height * 0.35), winY = height * 0.55;

    if (doorCount > 0 && windowCount > 0 && doorFace === windowFace) {
      const span = spanOf(doorFace);
      const total = doorCount + windowCount;
      const slotW = span / (total + 1);
      const doorW = Math.min(DOOR_SIZE.w, slotW * 0.7);
      const winW = Math.min(WINDOW_SIZE.w, slotW * 0.7);
      let slot = 1;
      for (let i = 0; i < doorCount; i++, slot++) {
        place(this.doorMaterial, doorW, doorH, doorY, doorFace, -span / 2 + slotW * slot);
      }
      for (let i = 0; i < windowCount; i++, slot++) {
        place(this.windowMaterial, winW, winH, winY, windowFace, -span / 2 + slotW * slot);
      }
      return;
    }

    if (doorCount > 0) {
      const span = spanOf(doorFace);
      const slotW = span / (doorCount + 1);
      const doorW = Math.min(DOOR_SIZE.w, slotW * 0.7);
      for (let i = 1; i <= doorCount; i++) {
        place(this.doorMaterial, doorW, doorH, doorY, doorFace, -span / 2 + slotW * i);
      }
    }

    if (windowCount > 0) {
      const span = spanOf(windowFace);
      const slotW = span / (windowCount + 1);
      const winW = Math.min(WINDOW_SIZE.w, slotW * 0.7);
      for (let i = 1; i <= windowCount; i++) {
        place(this.windowMaterial, winW, winH, winY, windowFace, -span / 2 + slotW * i);
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
