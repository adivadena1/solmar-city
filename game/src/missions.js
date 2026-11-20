// Solmar — the story and its four missions. Rook, a driver new to Solmar,
// takes jobs from Dana, a fixer with a phone full of trouble, and ends up
// crossing Kessler, who owns the marina. Each mission is steps with a
// target on the map; a beacon pillar marks it, the HUD names it, and Dana
// talks the player through it in subtitles.

import * as THREE from 'three';
import { makePlayerMesh } from './player.js';

const MISSION_DEFS = [
  {
    id: 'fresh-wheels',
    title: 'Fresh Wheels',
    reward: 150,
    intro: [
      'DANA: Rook. You are in Solmar now, and in Solmar nobody walks.',
      'DANA: Borrow a car. Any car. Bring it to my garage on the north side.',
    ],
    start: { x: 0, z: 24 },
    steps: [
      { type: 'stealCar', text: 'Steal a car — walk up to one and press E' },
      { type: 'goto', text: 'Drive the car to the Garage', target: 'garage', radius: 9 },
    ],
    outro: 'DANA: Not bad. The car is ugly, but it runs. I have real work for you.',
  },
  {
    id: 'the-package',
    title: 'The Package',
    reward: 300,
    intro: [
      'DANA: A friend at the Docks has a package. Pick it up, take it to Cafe Solmar.',
      'DANA: Quietly. The cops got a tip, so do not make a scene.',
    ],
    start: { x: 144, z: 124 },
    steps: [
      { type: 'goto', text: 'Meet the contact at the Docks', target: 'docks', radius: 8 },
      { type: 'goto', text: 'Deliver the package to Cafe Solmar', target: 'cafe', radius: 8, wantedOnStart: 1 },
    ],
    outro: 'DANA: Delivered clean. The cafe crowd never even looked up.',
  },
  {
    id: 'smoke-on-the-water',
    title: 'Smoke on the Water',
    reward: 500,
    intro: [
      'DANA: Kessler\'s boats need a part from the Marina. He pays well and asks nothing.',
      'DANA: The police are already watching the Marina. Take the part, lose them, then come home.',
    ],
    start: { x: 108, z: 210 },
    steps: [
      { type: 'goto', text: 'Pick up the boat part at the Marina', target: 'marina', radius: 8, wantedOnStart: 2 },
      { type: 'loseHeat', text: 'Lose the cops — stay clean until the stars are gone' },
      { type: 'goto', text: 'Bring the part to the Hideout', target: 'hideout', radius: 9 },
    ],
    outro: 'DANA: Kessler is pleased. Pleased men pay. Unhappy men send boats.',
  },
  {
    id: 'the-marina-job',
    title: 'The Marina Job',
    reward: 1000,
    intro: [
      'DANA: Kessler shorted us on the last job. We take it back — from his bank.',
      'DANA: Two guards at the door. Handle them, grab the cash, and run. The whole city will be looking.',
    ],
    start: { x: 0, z: -124 },
    steps: [
      { type: 'goto', text: 'Get to the Bank', target: 'bank', radius: 9 },
      { type: 'defeat', text: 'Deal with the two guards', count: 2 },
      { type: 'goto', text: 'Grab the cash inside the Bank', target: 'bank', radius: 6 },
      { type: 'goto', text: 'Escape to the Hideout', target: 'hideout', radius: 9, wantedOnStart: 3 },
    ],
    outro: 'DANA: That is the whole city, paid back in one night. Solmar is yours now, Rook.',
  },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.world = game.world;
    this.defs = MISSION_DEFS;
    this.done = game.saveData ? [...game.saveData.missionsDone] : [];
    this.nextIndex = this._firstUndoneIndex();
    this.active = null;
    this.guards = [];
    this._subtitleQueue = [];
    this._subtitleTimer = 0;
    // The beacon: a pillar of light and a floating marker over the target.
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true), beaconMat);
    this.beacon.position.y = 30;
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xffd76a });
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), markerMat);
    this.marker.visible = false;
    this.scene.add(this.marker);
    this._ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    this._ring.rotation.x = -Math.PI / 2;
    this._ring.position.y = 0.15;
    this._ring.visible = false;
    this.scene.add(this._ring);
    this._bob = 0;
  }

  _firstUndoneIndex() {
    for (let i = 0; i < this.defs.length; i += 1) {
      if (!this.done.includes(this.defs[i].id)) return i;
    }
    return this.defs.length;
  }

  get nextDef() {
    return this.nextIndex < this.defs.length ? this.defs[this.nextIndex] : null;
  }

  get allDone() {
    return this.nextIndex >= this.defs.length;
  }

  /** Where the beacon points right now: the active step, or the next start. */
  currentTarget() {
    if (this.active) {
      const step = this.active.def.steps[this.active.step];
      if (step.type === 'goto') return this.world.landmarks[step.target];
      if (step.type === 'defeat') return this.world.landmarks.bank;
      return null;
    }
    const def = this.nextDef;
    return def ? def.start : null;
  }

  currentObjective() {
    if (this.active) {
      const step = this.active.def.steps[this.active.step];
      return `${this.active.def.title} — ${step.text}`;
    }
    const def = this.nextDef;
    if (def) return `Next job: ${def.title} — go to the marker to start`;
    return 'All jobs done — Solmar is yours. Free roam!';
  }

  /** Talk through `lines` one at a time as subtitles. */
  say(lines) {
    for (const line of lines) this._subtitleQueue.push(line);
  }

  _spawnGuards() {
    this._clearGuards();
    for (let i = 0; i < 2; i += 1) {
      const group = makePlayerMesh();
      group.children[0].material = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.85 });
      group.children[4].material = group.children[0].material;
      group.children[5].material = group.children[0].material;
      const x = -6 + i * 12;
      const z = -132;
      group.position.set(x, 0, z);
      this.scene.add(group);
      this.guards.push({ group, pos: group.position, heading: 0, health: 60, attackCooldown: 0, down: 0 });
    }
  }

  _clearGuards() {
    for (const g of this.guards) this.scene.remove(g.group);
    this.guards = [];
  }

  startMission(def) {
    this.active = { def, step: 0 };
    this.say(def.intro);
    this.game.hud.showMessage(`JOB STARTED — ${def.title}`);
    this._applyStepStart();
  }

  _applyStepStart() {
    if (!this.active) return;
    const step = this.active.def.steps[this.active.step];
    if (step.wantedOnStart) this.game.police.addStars(step.wantedOnStart, 'mission');
    if (step.type === 'defeat') this._spawnGuards();
  }

  _advanceStep() {
    this.active.step += 1;
    if (this.active.step >= this.active.def.steps.length) {
      this._completeMission();
    } else {
      this._applyStepStart();
    }
  }

  _completeMission() {
    const def = this.active.def;
    this.done.push(def.id);
    this.game.addMoney(def.reward);
    this.game.audio.missionDone();
    this.game.hud.showMessage(`JOB DONE — ${def.title}  +$${def.reward}`);
    this.say([def.outro]);
    this._clearGuards();
    this.active = null;
    this.nextIndex = this._firstUndoneIndex();
    this.game.saveProgress();
    if (this.allDone) {
      this.game.hud.showMessage('STORY COMPLETE — Solmar is yours, Rook!');
      this.say(['DANA: That is every job. The city knows your name now.']);
    }
  }

  /** Called when the player enters a car (mission 1 step 1 watches this). */
  onEnterCar() {
    if (this.active && this.active.def.steps[this.active.step].type === 'stealCar') {
      this._advanceStep();
    }
  }

  /** Called when the player punches or shoots; returns guards hit. */
  combatHit(origin, dirX, dirZ, range, damage) {
    let hits = 0;
    for (const g of this.guards) {
      if (g.down > 0) continue;
      const dx = g.pos.x - origin.x;
      const dz = g.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const dot = (dx * dirX + dz * dirZ) / (d || 1);
      if (dot < 0.4 && d > 1.2) continue;
      g.health -= damage;
      g.pos.x += dirX * 0.8;
      g.pos.z += dirZ * 0.8;
      hits += 1;
      if (g.health <= 0) {
        g.down = 999;
        g.group.rotation.x = -Math.PI / 2;
        g.group.position.y = 0.4;
      }
    }
    if (this.active && this.active.def.steps[this.active.step].type === 'defeat') {
      const down = this.guards.filter((g) => g.down > 0).length;
      if (down >= this.active.def.steps[this.active.step].count) this._advanceStep();
    }
    return hits;
  }

  update(dt) {
    // Subtitles, one line at a time.
    if (this._subtitleTimer > 0) {
      this._subtitleTimer -= dt;
    } else if (this._subtitleQueue.length > 0) {
      const line = this._subtitleQueue.shift();
      this.game.hud.showSubtitle(line, 3.5);
      this._subtitleTimer = 3.5;
    }
    // Beacon over the current target.
    const target = this.currentTarget();
    this._bob += dt;
    if (target) {
      this.beacon.visible = true;
      this.marker.visible = true;
      this._ring.visible = true;
      this.beacon.position.set(target.x, 30, target.z);
      this.marker.position.set(target.x, 8 + Math.sin(this._bob * 2.4) * 0.8, target.z);
      this.marker.rotation.y += dt * 1.5;
      this._ring.position.set(target.x, 0.15, target.z);
    } else {
      this.beacon.visible = false;
      this.marker.visible = false;
      this._ring.visible = false;
    }
    // Start the next mission by walking or driving into its start marker.
    if (!this.active && this.nextDef) {
      const s = this.nextDef.start;
      const d = Math.hypot(this.game.player.pos.x - s.x, this.game.player.pos.z - s.z);
      if (d < 6) this.startMission(this.nextDef);
    }
    // Active mission steps.
    if (this.active) {
      const step = this.active.def.steps[this.active.step];
      const p = this.game.player;
      if (step.type === 'goto') {
        const t = this.world.landmarks[step.target];
        const d = Math.hypot(p.pos.x - t.x, p.pos.z - t.z);
        if (d < (step.radius || 8)) this._advanceStep();
      } else if (step.type === 'loseHeat') {
        if (this.game.police.stars === 0) this._advanceStep();
      }
    }
    // Guards chase and punch the player.
    for (const g of this.guards) {
      if (g.down > 0) continue;
      const p = this.game.player;
      const dx = p.pos.x - g.pos.x;
      const dz = p.pos.z - g.pos.z;
      const d = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      g.heading = wantHeading;
      g.group.rotation.y = wantHeading;
      if (d > 1.6) {
        g.pos.x += Math.sin(wantHeading) * 4.2 * dt;
        g.pos.z += Math.cos(wantHeading) * 4.2 * dt;
        this.world.resolveCircle(g.pos, 0.5);
      } else if (g.attackCooldown <= 0) {
        g.attackCooldown = 1.1;
        if (p.hurt(10)) {
          // The main loop handles the wasted screen.
        }
        this.game.audio.punch();
      }
      if (g.attackCooldown > 0) g.attackCooldown -= dt;
    }
  }
}
