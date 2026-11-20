// Solmar — vehicles. A low-poly car built from boxes (body, cabin, wheels,
// headlights, tail lights), arcade driving physics (accelerate, brake,
// reverse, steering that bites harder at low speed), and the enter/exit
// handshake with the player. Police cars are cars with a light bar.

import * as THREE from 'three';
import { CAR } from './config.js';
import { mulberry32, pick } from './rng.js';

const CAR_COLORS = [0xd83a3a, 0x3a6ad8, 0xe8c93a, 0x3a8a4a, 0xe8e8e8, 0x2a2a2e, 0xd87a3a, 0x7a4a9a];

export function makeCarMesh(color, kind) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.62;
  group.add(body);
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.2, metalness: 0.6 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), cabinMat);
  cabin.position.set(0, 1.18, -0.25);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, 0.42, z);
    group.add(wheel);
    wheels.push(wheel);
  }
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe9a8, emissiveIntensity: 0.9 });
  for (const x of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMat);
    head.position.set(x, 0.72, 2.22);
    group.add(head);
  }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0x880000, emissiveIntensity: 0.8 });
  for (const x of [-0.65, 0.65]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    tail.position.set(x, 0.72, -2.22);
    group.add(tail);
  }
  if (kind === 'police') {
    const barMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 0.4), barMat);
    bar.position.set(0, 1.52, -0.25);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1 }));
    red.position.set(-0.32, 1.52, -0.25);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42), new THREE.MeshStandardMaterial({ color: 0x2266ff, emissive: 0x2266ff, emissiveIntensity: 1 }));
    blue.position.set(0.32, 1.52, -0.25);
    group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
  }
  // A soft blob shadow under the car: cheap, and it grounds the car.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(2.1, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1, 2.1, 1);
  shadow.position.y = 0.02;
  group.add(shadow);
  group.userData.wheels = wheels;
  return group;
}

export class Vehicles {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.cars = [];
    this.rand = mulberry32(99);
  }

  spawnCar(x, z, heading, kind = 'parked', color = null) {
    const c = color ?? pick(this.rand, CAR_COLORS);
    const group = makeCarMesh(kind === 'police' ? 0x1a1a1e : c, kind);
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    this.scene.add(group);
    const car = {
      group, kind, color: c,
      pos: group.position,
      heading,
      speed: 0,
      steer: 0,
      // Traffic cars follow a waypoint loop; police chase a target.
      waypoints: null,
      waypointIndex: 0,
      cruiseSpeed: 9 + this.rand() * 4,
      driver: null,
      stopped: false,
      stuckTimer: 0,
      ramCooldown: 0,
      lightTimer: 0,
    };
    this.cars.push(car);
    return car;
  }

  removeCar(car) {
    this.scene.remove(car.group);
    const i = this.cars.indexOf(car);
    if (i !== -1) this.cars.splice(i, 1);
  }

  /** The nearest car to (x, z) within `maxDist`, or null. */
  nearestCar(x, z, maxDist, kinds = null) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      if (kinds && !kinds.includes(car.kind)) continue;
      const dx = car.pos.x - x;
      const dz = car.pos.z - z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  /**
   * One step of arcade driving for `car`: throttle -1..1 (reverse to
   * forward), steer -1..1, brake 0..1. Collides with buildings and other
   * cars; returns true when it hit something hard this step.
   */
  drive(car, dt, throttle, steer, brake) {
    const onSand = car.pos.z > 216;
    const maxSpeed = CAR.maxSpeed * (onSand ? 0.55 : 1);
    if (throttle > 0) car.speed += CAR.accel * throttle * dt;
    else if (throttle < 0) car.speed += CAR.reverseAccel * throttle * dt;
    if (brake > 0) {
      const s = Math.sign(car.speed);
      car.speed -= s * CAR.brake * brake * dt;
      if (Math.sign(car.speed) !== s) car.speed = 0;
    }
    // Rolling drag and the speed cap.
    car.speed -= car.speed * 0.35 * dt;
    car.speed = Math.max(-CAR.maxReverse, Math.min(maxSpeed, car.speed));
    const speedFactor = Math.min(1, Math.abs(car.speed) / 8);
    const steerAngle = steer * CAR.steerSpeed * speedFactor * dt * Math.sign(car.speed || 1);
    car.heading += steerAngle;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const prevX = car.pos.x;
    const prevZ = car.pos.z;
    car.pos.x += fx * car.speed * dt;
    car.pos.z += fz * car.speed * dt;
    // Buildings: slide along them, and a hard hit costs speed.
    const before = { x: car.pos.x, z: car.pos.z };
    this.world.resolveCircle(car.pos, CAR.radius);
    const hitBuilding = Math.hypot(car.pos.x - before.x, car.pos.z - before.z) > 0.01;
    if (hitBuilding && Math.abs(car.speed) > 6) {
      car.speed *= 0.45;
      car.pos.x = prevX;
      car.pos.z = prevZ;
      this.world.resolveCircle(car.pos, CAR.radius);
      return true;
    }
    // Other cars: push apart and trade a little speed.
    let hitCar = false;
    for (const other of this.cars) {
      if (other === car) continue;
      const dx = car.pos.x - other.pos.x;
      const dz = car.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      const min = CAR.radius * 2 - 0.4;
      if (d < min && d > 0.001) {
        const push = (min - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        car.pos.x += nx * push;
        car.pos.z += nz * push;
        other.pos.x -= nx * push;
        other.pos.z -= nz * push;
        if (Math.abs(car.speed) > 8) hitCar = true;
        // A bump trades a little speed, but never pins a car in place.
        car.speed *= 0.97;
        other.speed *= 0.97;
      }
    }
    car.group.position.copy(car.pos);
    car.group.rotation.y = car.heading;
    // Spin the wheels with the speed.
    const spin = (car.speed * dt) / 0.42;
    for (const wheel of car.group.userData.wheels) wheel.rotation.x += spin;
    // Police light bar flashes.
    if (car.kind === 'police' && car.group.userData.lightRed) {
      car.lightTimer += dt;
      const on = Math.floor(car.lightTimer * 4) % 2 === 0;
      car.group.userData.lightRed.material.emissiveIntensity = on ? 2.2 : 0.2;
      car.group.userData.lightBlue.material.emissiveIntensity = on ? 0.2 : 2.2;
    }
    return hitCar;
  }

  /** Parked cars along the roads, for the player to steal. */
  spawnParkedCars(count) {
    const rand = this.rand;
    for (let i = 0; i < count; i += 1) {
      const p = this.world.randomRoadPoint(rand);
      const onVertical = Math.abs(p.x - Math.round(p.x)) < 1 && rand() < 0.5;
      const heading = onVertical ? (rand() < 0.5 ? 0 : Math.PI) : (rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      const side = rand() < 0.5 ? -1 : 1;
      const x = onVertical ? p.x + side * 4.4 : p.x;
      const z = onVertical ? p.z : p.z + side * 4.4;
      // Keep parked cars off the landmarks' doorsteps.
      if (Math.abs(x) > 208 || Math.abs(z) > 208) continue;
      this.spawnCar(x, z, heading, 'parked');
    }
  }
}
