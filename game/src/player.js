// Solmar — the player on foot. A low-poly walker (every part a box or a
// cylinder, in Rook's teal jacket) who walks, sprints, punches and shoots,
// camera-relative, and hands the car over to the vehicle system when the
// player gets in. The camera itself lives in main.js; this module owns the
// body, the feet and the fists.

import * as THREE from 'three';
import { PLAYER } from './config.js';

export function makePlayerMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8a077, roughness: 0.8 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2a7a7a, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), jacket);
  torso.position.y = 1.15;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.82;
  group.add(head);
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), hair);
  hairTop.position.y = 2.06;
  group.add(hairTop);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.75, 0.32), pants);
  legL.position.set(-0.19, 0.38, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.75, 0.32), pants);
  legR.position.set(0.19, 0.38, 0);
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.26), jacket);
  armL.position.set(-0.48, 1.18, 0);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.26), jacket);
  armR.position.set(0.48, 1.18, 0);
  group.add(armR);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);
  group.userData = { legL, legR, armL, armR, torso };
  return group;
}

export class Player {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = makePlayerMesh();
    this.group.position.set(0, 0, 10);
    this.scene.add(this.group);
    this.pos = this.group.position;
    this.heading = 0;
    this.speed = 0;
    this.inCar = null;
    this.health = PLAYER.health;
    this.armed = false;
    this.shootCooldown = 0;
    this.punchCooldown = 0;
    this.punchAnim = 0;
    this.walkPhase = 0;
    this.hurtFlash = 0;
  }

  reset(x, z) {
    this.pos.set(x, 0, z);
    this.heading = 0;
    this.speed = 0;
    this.inCar = null;
    this.health = PLAYER.health;
    this.group.visible = true;
  }

  /** Damage the player; returns true when it drops them. */
  hurt(amount) {
    this.health = Math.max(0, this.health - amount);
    this.hurtFlash = 1;
    return this.health <= 0;
  }

  heal(amount) {
    this.health = Math.min(PLAYER.health, this.health + amount);
  }

  /**
   * On-foot movement, camera-relative: W forward, S back, A/D strafe,
   * Shift sprint. `camYaw` is the camera's heading. Returns the distance
   * moved this step, for the walk cycle.
   */
  updateOnFoot(dt, input, camYaw) {
    let fx = 0;
    let fz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) fz += 1;
    if (input.down('KeyS') || input.down('ArrowDown')) fz -= 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) fx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) fx += 1;
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const moving = fx !== 0 || fz !== 0;
    const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    if (moving) {
      const len = Math.hypot(fx, fz);
      fx /= len;
      fz /= len;
      // Camera-relative: forward is where the camera looks, right is the
      // forward vector crossed with up: (-cos, sin) in (x, z).
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      const mx = fz * sin - fx * cos;
      const mz = fz * cos + fx * sin;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      this.heading = Math.atan2(mx, mz);
      this.speed = speed;
      this.walkPhase += dt * speed * 1.6;
    } else {
      this.speed = 0;
    }
    this.world.resolveCircle(this.pos, PLAYER.radius);
    this.group.rotation.y = this.heading;
    // Walk cycle: legs and arms swing opposite.
    const swing = moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    const u = this.group.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8;
    u.armR.rotation.x = swing * 0.8;
    // Punch animation: the right arm snaps forward.
    if (this.punchAnim > 0) {
      this.punchAnim -= dt;
      u.armR.rotation.x = -1.6 * Math.max(0, this.punchAnim / 0.22);
    }
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.punchCooldown > 0) this.punchCooldown -= dt;
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
    return moving ? speed * dt : 0;
  }

  punch() {
    if (this.punchCooldown > 0) return false;
    this.punchCooldown = 0.45;
    this.punchAnim = 0.22;
    return true;
  }

  canShoot() {
    return this.armed && this.shootCooldown <= 0;
  }

  shoot() {
    if (!this.canShoot()) return false;
    this.shootCooldown = PLAYER.shootCooldown;
    return true;
  }

  /** Where the player's eyes are, for the camera to follow. */
  eyePosition(out) {
    out.set(this.pos.x, this.pos.y + 1.7, this.pos.z);
    return out;
  }

  /** The forward direction the player faces, on the ground plane. */
  forward(out) {
    out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    return out;
  }
}
