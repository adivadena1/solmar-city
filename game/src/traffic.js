// Solmar — the city's other inhabitants. Traffic cars loop the road grid on
// rectangular routes, braking for the car ahead; pedestrians stroll the
// sidewalks and run away from danger. Both are simple and cheap: a dozen
// cars and two dozen walkers, each a few boxes, and the city feels alive.

import * as THREE from 'three';
import { CITY } from './config.js';
import { mulberry32, pick, range } from './rng.js';
import { makePlayerMesh } from './player.js';

const PED_COLORS = [0xd83a3a, 0x3a6ad8, 0xe8c93a, 0x3a8a4a, 0xe8e8e8, 0x7a4a9a, 0xd87a3a, 0x4a9a8a];

function makePedMesh(color) {
  const group = makePlayerMesh();
  // Recolour the jacket: the torso and arms are children 0, 4 and 5.
  group.children[0].material = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  group.children[4].material = group.children[0].material;
  group.children[5].material = group.children[0].material;
  group.scale.setScalar(0.95);
  return group;
}

/** A rectangular loop around one city block, on the roads. */
function makeLoop(rand) {
  const a = pick(rand, CITY.roads);
  const b = pick(rand, CITY.roads);
  const c = pick(rand, CITY.roads);
  const d = pick(rand, CITY.roads);
  const x0 = Math.min(a, b);
  const x1 = Math.max(a, b);
  const z0 = Math.min(c, d);
  const z1 = Math.max(c, d);
  if (x1 - x0 < 24 || z1 - z0 < 24) return makeLoop(rand);
  return [
    { x: x0, z: z0 }, { x: x1, z: z0 },
    { x: x1, z: z1 }, { x: x0, z: z1 },
  ];
}

export class Traffic {
  constructor(scene, world, vehicles) {
    this.scene = scene;
    this.world = world;
    this.vehicles = vehicles;
    this.rand = mulberry32(4242);
    this.cars = [];
    this.peds = [];
    this._spawnCars(12);
    this._spawnPeds(22);
  }

  _spawnCars(count) {
    for (let i = 0; i < count; i += 1) {
      const loop = makeLoop(this.rand);
      const start = loop[Math.floor(this.rand() * loop.length)];
      const car = this.vehicles.spawnCar(start.x, start.z, 0, 'traffic');
      car.waypoints = loop;
      car.waypointIndex = Math.floor(this.rand() * loop.length);
      car.speed = car.cruiseSpeed;
      this.cars.push(car);
    }
  }

  _spawnPeds(count) {
    for (let i = 0; i < count; i += 1) {
      const group = makePedMesh(pick(this.rand, PED_COLORS));
      const p = this.world.randomRoadPoint(this.rand);
      const onVertical = this.rand() < 0.5;
      const x = onVertical ? p.x + (this.rand() < 0.5 ? -8 : 8) : p.x;
      const z = onVertical ? p.z : p.z + (this.rand() < 0.5 ? -8 : 8);
      group.position.set(x, 0, z);
      this.scene.add(group);
      this.peds.push({
        group,
        pos: group.position,
        heading: this.rand() * Math.PI * 2,
        speed: range(this.rand, 1.2, 2.2),
        walkPhase: this.rand() * 6,
        // Fleeing: 0 calm, >0 seconds of running from a scare.
        flee: 0,
        fleeX: 0,
        fleeZ: 0,
        down: 0,
        targetX: x,
        targetZ: z,
      });
    }
  }

  /** A pedestrian is knocked down: they lie flat, then get up and run. */
  knockDown(ped, fromX, fromZ) {
    if (ped.down > 0) return;
    ped.down = 2.5;
    ped.group.rotation.x = -Math.PI / 2;
    ped.group.position.y = 0.4;
    ped.flee = 6;
    ped.fleeX = fromX;
    ped.fleeZ = fromZ;
  }

  /** Scare every pedestrian within `radius` of (x, z): they run from it. */
  scare(x, z, radius) {
    for (const ped of this.peds) {
      const d = Math.hypot(ped.pos.x - x, ped.pos.z - z);
      if (d < radius && ped.down <= 0) {
        ped.flee = 4;
        ped.fleeX = x;
        ped.fleeZ = z;
      }
    }
  }

  update(dt, player, playerCar) {
    // Traffic cars: steer toward the next waypoint, brake for the car ahead.
    for (const car of this.cars) {
      if (car.stopped) continue;
      const wp = car.waypoints[car.waypointIndex];
      const dx = wp.x - car.pos.x;
      const dz = wp.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4) {
        car.waypointIndex = (car.waypointIndex + 1) % car.waypoints.length;
        continue;
      }
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 1.8));
      // Brake when another car is close ahead.
      let blocked = false;
      for (const other of this.vehicles.cars) {
        if (other === car) continue;
        const ox = other.pos.x - car.pos.x;
        const oz = other.pos.z - car.pos.z;
        const od = Math.hypot(ox, oz);
        if (od < 8) {
          const ahead = ox * Math.sin(car.heading) + oz * Math.cos(car.heading);
          if (ahead > 0) {
            blocked = true;
            break;
          }
        }
      }
      const throttle = blocked ? 0 : 1;
      const target = blocked ? 0 : car.cruiseSpeed;
      if (car.speed < target) car.speed = Math.min(target, car.speed + 8 * dt);
      else if (car.speed > target) car.speed = Math.max(target, car.speed - 14 * dt);
      this.vehicles.drive(car, dt, throttle, steer, blocked ? 1 : 0);
    }
    // Pedestrians: stroll the sidewalks; flee when scared, lie when down.
    const px = player.pos.x;
    const pz = player.pos.z;
    const playerSpeed = playerCar ? Math.abs(playerCar.speed) : player.speed;
    for (const ped of this.peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        if (ped.down <= 0) {
          ped.group.rotation.x = 0;
          ped.group.position.y = 0;
        }
        continue;
      }
      // A fast car nearby is a scare, on its own.
      const dPlayer = Math.hypot(ped.pos.x - px, ped.pos.z - pz);
      if (dPlayer < 6 && playerSpeed > 8 && ped.flee <= 0) {
        ped.flee = 3;
        ped.fleeX = px;
        ped.fleeZ = pz;
      }
      let tx = ped.targetX;
      let tz = ped.targetZ;
      let speed = ped.speed;
      if (ped.flee > 0) {
        ped.flee -= dt;
        const dx = ped.pos.x - ped.fleeX;
        const dz = ped.pos.z - ped.fleeZ;
        const d = Math.hypot(dx, dz) || 1;
        tx = ped.pos.x + (dx / d) * 20;
        tz = ped.pos.z + (dz / d) * 20;
        speed = 5.5;
      }
      const dx = tx - ped.pos.x;
      const dz = tz - ped.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2) {
        // Pick a new stroll target: a sidewalk point nearby.
        const p = this.world.randomRoadPoint(this.rand);
        const onVertical = this.rand() < 0.5;
        ped.targetX = onVertical ? p.x + (this.rand() < 0.5 ? -8 : 8) : p.x;
        ped.targetZ = onVertical ? p.z : p.z + (this.rand() < 0.5 ? -8 : 8);
        continue;
      }
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - ped.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ped.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
      ped.pos.x += Math.sin(ped.heading) * speed * dt;
      ped.pos.z += Math.cos(ped.heading) * speed * dt;
      this.world.resolveCircle(ped.pos, 0.5);
      ped.group.rotation.y = ped.heading;
      ped.walkPhase += dt * speed * 1.8;
      const swing = Math.sin(ped.walkPhase) * 0.5;
      const u = ped.group.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.8;
      u.armR.rotation.x = swing * 0.8;
    }
  }
}
