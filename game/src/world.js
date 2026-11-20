// Solmar — the city itself. A seeded grid city on a sun-soaked coast: roads,
// sidewalks, instanced buildings with windowed facades, palms, streetlights,
// a beach, an ocean and a pier, and the named landmarks the missions point
// at (garage, bank, hideout, hospital, police station, cafe, docks, marina).
// Every building also registers an AABB collider the cars and the player
// bounce off, and the module exposes the spawn points the other systems use.

import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { mulberry32, pick, range } from './rng.js';

function makeFacadeTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 256);
  // Window grid: lit and dark panes, denser near the top.
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const lit = Math.random() < 0.35;
      g.fillStyle = lit ? '#ffe9a8' : '#3a4a5a';
      g.fillRect(10 + col * 30, 12 + row * 24, 18, 14);
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 0, 128, 10);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3f45';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#d8d2c0';
  g.fillRect(30, 4, 4, 24);
  g.fillRect(30, 36, 4, 24);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(6, 6, 500, 116);
  g.fillStyle = fg;
  g.font = 'bold 64px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.landmarks = {};
    this._clouds = [];
    this._waves = [];
    this._lights = [];
    this._lightTimer = 0;
    this.rand = mulberry32(CITY.seed);
    this._buildSky();
    this._buildGround();
    this._buildRoads();
    this._buildBuildings();
    this._buildLandmarks();
    this._buildPalms();
    this._buildStreetlights();
    this._buildTrafficLights();
    this._buildBeach();
  }

  _buildSky() {
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 260, 700);
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.95);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(PALETTE.sun, 2.2);
    sun.position.set(140, 220, 90);
    this.scene.add(sun);
    // A visible sun disc and drifting clouds, for the sun-soaked look.
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(22, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }),
    );
    sunDisc.position.set(260, 240, -320);
    sunDisc.lookAt(0, 0, 0);
    this.scene.add(sunDisc);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
    for (let i = 0; i < 10; i += 1) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 3; j += 1) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(range(this.rand, 8, 16), 8, 6), cloudMat);
        puff.position.set(j * 12 - 12, range(this.rand, -2, 2), range(this.rand, -4, 4));
        puff.scale.y = 0.45;
        cloud.add(puff);
      }
      cloud.position.set(range(this.rand, -320, 320), range(this.rand, 120, 190), range(this.rand, -320, 320));
      this.scene.add(cloud);
      this._clouds.push(cloud);
    }
  }

  _buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.half * 2 + 40, CITY.half * 2 + 40),
      new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    ground.receiveShadow = false;
    this.scene.add(ground);
    // Sand south of the city, then the ocean.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.half * 2 + 40, CITY.sandEnd - CITY.beachStart),
      new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.05, (CITY.beachStart + CITY.sandEnd) / 2);
    this.scene.add(sand);
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.half * 2 + 200, CITY.oceanEnd - CITY.sandEnd),
      new THREE.MeshStandardMaterial({ color: PALETTE.ocean, roughness: 0.25, metalness: 0.1 }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, 0.02, (CITY.sandEnd + CITY.oceanEnd) / 2);
    this.scene.add(ocean);
    // Slow white wave strips rolling onto the sand.
    const waveMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
    for (let i = 0; i < 4; i += 1) {
      const wave = new THREE.Mesh(new THREE.PlaneGeometry(300, 2.5), waveMat);
      wave.rotation.x = -Math.PI / 2;
      wave.position.set(0, 0.1, CITY.sandEnd + i * 14);
      this.scene.add(wave);
      this._waves.push(wave);
    }
  }

  _buildRoads() {
    const roadTex = makeRoadTexture();
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
    const walkMat = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 1 });
    const span = CITY.half * 2;
    for (const c of CITY.roads) {
      for (const tex of [roadTex]) tex.repeat.set(1, span / 12);
      const v = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, span), roadMat.clone());
      v.material.map = roadTex.clone();
      v.material.map.repeat.set(1, span / 12);
      v.material.map.needsUpdate = true;
      v.rotation.x = -Math.PI / 2;
      v.position.set(c, 0.06, 0);
      this.scene.add(v);
      const h = new THREE.Mesh(new THREE.PlaneGeometry(span, CITY.roadWidth), roadMat.clone());
      h.material.map = roadTex.clone();
      h.material.map.repeat.set(span / 12, 1);
      h.material.map.needsUpdate = true;
      h.rotation.x = -Math.PI / 2;
      h.position.set(0, 0.06, c);
      this.scene.add(h);
      // Sidewalks flanking each road.
      for (const off of [-CITY.roadWidth / 2 - 2, CITY.roadWidth / 2 + 2]) {
        const sv = new THREE.Mesh(new THREE.PlaneGeometry(4, span), walkMat);
        sv.rotation.x = -Math.PI / 2;
        sv.position.set(c + off, 0.08, 0);
        this.scene.add(sv);
        const sh = new THREE.Mesh(new THREE.PlaneGeometry(span, 4), walkMat);
        sh.rotation.x = -Math.PI / 2;
        sh.position.set(0, 0.08, c + off);
        this.scene.add(sh);
      }
    }
  }

  _addCollider(x, z, w, d) {
    this.colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
  }

  _buildBuildings() {
    const rand = this.rand;
    const facadeTex = makeFacadeTexture();
    const facadeMat = new THREE.MeshStandardMaterial({ map: facadeTex, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x6a6a62, roughness: 1 });
    const specs = [];
    // Landmark blocks get their own buildings; the rest get 1-4 per block.
    const special = new Set(['-144,-144', '0,-144', '144,-144', '-144,0', '-144,144', '0,144', '144,144', '0,0']);
    const centers = [-144, -72, 0, 72, 144];
    for (const bx of centers) {
      for (const bz of centers) {
        if (special.has(`${bx},${bz}`)) continue;
        const count = 1 + Math.floor(rand() * 3);
        for (let i = 0; i < count; i += 1) {
          const w = range(rand, 14, 26);
          const d = range(rand, 14, 26);
          const x = bx + range(rand, -14, 14);
          const z = bz + range(rand, -14, 14);
          const h = range(rand, 8, 30);
          specs.push({ x, z, w, d, h, color: pick(rand, PALETTE.buildings) });
          this._addCollider(x, z, w + 1, d + 1);
        }
      }
    }
    // Downtown towers around the centre plaza.
    for (let i = 0; i < 4; i += 1) {
      const x = [-24, 24, -24, 24][i];
      const z = [-24, -24, 24, 24][i];
      specs.push({ x, z, w: 22, d: 22, h: range(rand, 44, 62), color: pick(rand, PALETTE.buildings) });
      this._addCollider(x, z, 23, 23);
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, [facadeMat, facadeMat, roofMat, roofMat, facadeMat, facadeMat], specs.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    specs.forEach((b, i) => {
      p.set(b.x, 0, b.z);
      s.set(b.w, b.h, b.d);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.setHex(b.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
    // Rooftop boxes so the skyline is not flat.
    const roofSpecs = specs.filter(() => rand() < 0.4);
    const roofMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x8a8a80, roughness: 1 }),
      Math.max(1, roofSpecs.length),
    );
    roofSpecs.forEach((b, i) => {
      p.set(b.x + range(rand, -4, 4), b.h, b.z + range(rand, -4, 4));
      s.set(4, 2, 4);
      m.compose(p, q, s);
      roofMesh.setMatrixAt(i, m);
    });
    roofMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(roofMesh);
  }

  _sign(text, bg, fg, w, x, y, z, ry = 0) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w / 4),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(text, bg, fg) }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    this.scene.add(mesh);
    return mesh;
  }

  _landmarkBuilding(x, z, w, d, h, color, signText, signBg, signFg) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
    );
    mesh.position.set(x, h / 2, z);
    this.scene.add(mesh);
    this._addCollider(x, z, w + 1, d + 1);
    if (signText) this._sign(signText, signBg, signFg, Math.min(w * 0.9, 26), x, h + 3, z - d / 2 - 0.6, Math.PI);
    return mesh;
  }

  _buildLandmarks() {
    // Garage (mission 1 target), bank (mission 4), hideout, hospital,
    // police station, cafe, docks office, marina office.
    this._landmarkBuilding(-144, -144, 30, 20, 9, 0xc9a86a, 'GARAGE', '#3a3f45', '#ffd76a');
    this.landmarks.garage = { x: -144, z: -124 };
    this._landmarkBuilding(0, -144, 26, 22, 16, 0xe8e0c8, 'BANK', '#2a4a6a', '#ffffff');
    this.landmarks.bank = { x: 0, z: -124 };
    // Bank columns.
    for (const dx of [-8, 0, 8]) {
      const colMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.2, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.8 }),
      );
      colMesh.position.set(dx, 7, -131);
      this.scene.add(colMesh);
    }
    this._landmarkBuilding(144, -144, 24, 18, 8, 0x7fb8a8, 'HIDEOUT', '#223322', '#b8ffd8');
    this.landmarks.hideout = { x: 144, z: -124 };
    this._landmarkBuilding(-144, 0, 28, 20, 12, 0xf0f0e8, 'HOSPITAL', '#ffffff', '#d83a3a');
    this.landmarks.hospital = { x: -144, z: 20 };
    this._landmarkBuilding(0, 144, 26, 20, 12, 0x5a7aa8, 'POLICE', '#1a2a4a', '#ffffff');
    this.landmarks.policeStation = { x: 0, z: 124 };
    this._landmarkBuilding(-144, 144, 24, 16, 8, 0xe8b8a0, 'CAFE SOLMAR', '#7a3a2a', '#ffe8d8');
    this.landmarks.cafe = { x: -144, z: 124 };
    this._landmarkBuilding(144, 144, 26, 18, 9, 0x8fb8d8, 'DOCKS', '#1a3a4a', '#c8ecff');
    this.landmarks.docks = { x: 144, z: 124 };
    this._landmarkBuilding(108, 196, 22, 14, 8, 0xd98a6a, 'MARINA', '#4a2a1a', '#ffd8b8');
    this.landmarks.marina = { x: 108, z: 210 };
    // Boats in the marina water.
    for (let i = 0; i < 3; i += 1) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(4, 1.6, 10),
        new THREE.MeshStandardMaterial({ color: pick(this.rand, [0xffffff, 0xd8e8f0, 0xf0d8a8]), roughness: 0.5 }),
      );
      hull.position.y = 0.8;
      boat.add(hull);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(3, 1.6, 4),
        new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.4 }),
      );
      cabin.position.set(0, 2.2, -1);
      boat.add(cabin);
      boat.position.set(86 + i * 22, 0.1, 232 + (i % 2) * 10);
      boat.rotation.y = range(this.rand, -0.2, 0.2);
      this.scene.add(boat);
    }
    // Wooden docks reaching into the water.
    const dockMat = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 1 });
    for (const dx of [86, 108, 130]) {
      const dock = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 34), dockMat);
      dock.position.set(dx, 0.4, 240);
      this.scene.add(dock);
    }
    // The pier at the beach centre, with lamp posts.
    const pier = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 60), dockMat);
    pier.position.set(0, 0.5, 262 + 28);
    this.scene.add(pier);
  }

  _buildPalms() {
    const rand = this.rand;
    const spots = [];
    for (let x = -200; x <= 200; x += 14) spots.push([x + range(rand, -3, 3), 226 + range(rand, -4, 6)]);
    for (let i = 0; i < 26; i += 1) {
      spots.push([range(rand, -200, 200), range(rand, -200, 200)]);
    }
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
    trunkGeo.translate(0, 3.5, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: PALETTE.palmTrunk, roughness: 1 }), spots.length);
    const leafGeo = new THREE.IcosahedronGeometry(2.6, 0);
    leafGeo.scale(1, 0.45, 1);
    leafGeo.translate(0, 7.4, 0);
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: PALETTE.palmLeaf, roughness: 1 }), spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    spots.forEach(([x, z], i) => {
      e.set(0, rand() * Math.PI * 2, range(rand, -0.08, 0.08));
      q.setFromEuler(e);
      p.set(x, 0, z);
      m.compose(p, q, s);
      trunks.setMatrixAt(i, m);
      leaves.setMatrixAt(i, m);
    });
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    this.scene.add(trunks);
    this.scene.add(leaves);
  }

  _buildStreetlights() {
    const positions = [];
    for (const c of CITY.roads) {
      for (let t = -180; t <= 180; t += 36) {
        positions.push([c + 8, t]);
        positions.push([t, c + 8]);
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 6, 6);
    poleGeo.translate(0, 3, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x2a2f35, roughness: 0.8 }), positions.length);
    const lampGeo = new THREE.SphereGeometry(0.45, 8, 6);
    lampGeo.translate(0, 6.1, 0);
    const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshStandardMaterial({ color: 0xfff2b8, emissive: 0xffdf80, emissiveIntensity: 0.7 }), positions.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    positions.forEach(([x, z], i) => {
      p.set(x, 0, z);
      m.compose(p, q, s);
      poles.setMatrixAt(i, m);
      lamps.setMatrixAt(i, m);
    });
    poles.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    this.scene.add(poles);
    this.scene.add(lamps);
  }

  _buildTrafficLights() {
    const spots = [[-36, -36], [36, 36], [-108, 108], [108, -108]];
    for (const [x, z] of spots) {
      const group = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 5, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a2f35 }),
      );
      pole.position.y = 2.5;
      group.add(pole);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 1.8, 0.7),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a }),
      );
      box.position.y = 5.4;
      group.add(box);
      const lamps = [];
      for (let i = 0; i < 3; i += 1) {
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0x000000, emissiveIntensity: 1 }),
        );
        lamp.position.set(0, 5.95 - i * 0.55, 0.4);
        group.add(lamp);
        lamps.push(lamp);
      }
      group.position.set(x + 7, 0, z + 7);
      this.scene.add(group);
      this._lights.push({ lamps, phase: Math.random() * 6 });
    }
  }

  _buildBeach() {
    // A few beach umbrellas and deck chairs, for the postcard look.
    const rand = this.rand;
    const umbMat = new THREE.MeshStandardMaterial({ color: 0xff6a5a, roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 8; i += 1) {
      const x = range(rand, -180, 180);
      const z = range(rand, 226, 252);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
      pole.position.set(x, 1.5, z);
      this.scene.add(pole);
      const top = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.1, 8), umbMat);
      top.position.set(x, 3.4, z);
      this.scene.add(top);
    }
  }

  /** Push a circle (x, z, radius) out of every building AABB it overlaps. */
  resolveCircle(pos, radius) {
    for (const b of this.colliders) {
      const nx = Math.max(b.x0, Math.min(pos.x, b.x1));
      const nz = Math.max(b.z0, Math.min(pos.z, b.z1));
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          pos.x = nx + (dx / d) * radius;
          pos.z = nz + (dz / d) * radius;
        } else {
          // Centre inside the box: push out along the smallest exit.
          const exits = [
            [pos.x - (b.x0 - radius), -1, 0],
            [(b.x1 + radius) - pos.x, 1, 0],
            [pos.z - (b.z0 - radius), 0, -1],
            [(b.z1 + radius) - pos.z, 0, 1],
          ];
          exits.sort((a, b2) => a[0] - b2[0]);
          pos.x += exits[0][1] * (exits[0][0] + 0.01);
          pos.z += exits[0][2] * (exits[0][0] + 0.01);
        }
      }
    }
    // Keep everyone inside the playable area (city + beach, not the ocean).
    pos.x = Math.max(-CITY.half, Math.min(CITY.half, pos.x));
    pos.z = Math.max(-CITY.half, Math.min(CITY.sandEnd + 2, pos.z));
  }

  /** True when (x, z) is on a road (within the asphalt). */
  isRoad(x, z) {
    for (const c of CITY.roads) {
      if (Math.abs(x - c) < CITY.roadWidth / 2 || Math.abs(z - c) < CITY.roadWidth / 2) return true;
    }
    return false;
  }

  /** A random point on a road, for spawning cars. */
  randomRoadPoint(rand) {
    const c = pick(rand, CITY.roads);
    const t = range(rand, -CITY.half + 10, CITY.half - 10);
    return rand() < 0.5 ? { x: c, z: t } : { x: t, z: c };
  }

  update(dt) {
    for (const cloud of this._clouds) {
      cloud.position.x += dt * 1.5;
      if (cloud.position.x > 360) cloud.position.x = -360;
    }
    for (let i = 0; i < this._waves.length; i += 1) {
      const w = this._waves[i];
      w.position.z = CITY.sandEnd + ((i * 14 + performance.now() * 0.004) % 56);
      w.material.opacity = 0.35;
    }
    this._lightTimer += dt;
    const phase = Math.floor(this._lightTimer / 3) % 2;
    for (const light of this._lights) {
      const on = (Math.floor(this._lightTimer / 3) + Math.floor(light.phase)) % 2 === 0;
      light.lamps[0].material.emissive.setHex(on ? 0xff2222 : 0x000000);
      light.lamps[2].material.emissive.setHex(on ? 0x000000 : 0x22ff44);
    }
    void phase;
  }
}
