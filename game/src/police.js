// Solmar — the wanted system and the Solmar police. Crimes add stars; the
// heat fades when the player stays clean. Police cars spawn on the roads
// away from the player, chase, and ram; on foot they close in to bust the
// player, and a bust costs money and drops the player at the police station.

import { WANTED } from './config.js';

export class Police {
  constructor(scene, world, vehicles, traffic, audio, onBusted) {
    this.scene = scene;
    this.world = world;
    this.vehicles = vehicles;
    this.traffic = traffic;
    this.audio = audio;
    this.onBusted = onBusted;
    this.stars = 0;
    this._sinceCrime = 0;
    this._decayTimer = 0;
    this._bustHold = 0;
    this._spawnTimer = 0;
    this.cars = [];
  }

  addStars(n, reason) {
    if (this.stars >= WANTED.maxStars) return;
    this.stars = Math.min(WANTED.maxStars, this.stars + n);
    this._sinceCrime = 0;
    this._decayTimer = 0;
    this._syncCars();
    void reason;
  }

  clear() {
    this.stars = 0;
    this._sinceCrime = 0;
    this._decayTimer = 0;
    this._bustHold = 0;
    this._despawnAll();
  }

  _wantedCount() {
    return WANTED.policePerStar[Math.min(this.stars, WANTED.maxStars)];
  }

  _syncCars() {
    const want = this._wantedCount();
    while (this.cars.length < want) {
      const car = this._spawnPoliceCar();
      if (!car) break;
      this.cars.push(car);
    }
    while (this.cars.length > want) {
      const car = this.cars.pop();
      this.vehicles.removeCar(car);
    }
  }

  _despawnAll() {
    for (const car of this.cars) this.vehicles.removeCar(car);
    this.cars = [];
  }

  _spawnPoliceCar(player) {
    // Spawn on a road 50-70 units from the player, off-screen if possible.
    const px = player ? player.pos.x : 0;
    const pz = player ? player.pos.z : 0;
    for (let tries = 0; tries < 12; tries += 1) {
      const p = this.world.randomRoadPoint(this.vehicles.rand);
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d > 45 && d < 90) {
        const car = this.vehicles.spawnCar(p.x, p.z, 0, 'police', 0x1a1a1e);
        car.cruiseSpeed = 16 + this.stars * 2;
        return car;
      }
    }
    const p = this.world.randomRoadPoint(this.vehicles.rand);
    const car = this.vehicles.spawnCar(p.x, p.z, 0, 'police', 0x1a1a1e);
    car.cruiseSpeed = 16 + this.stars * 2;
    return car;
  }

  /** The nearest police car to the player, or null. */
  nearestPolice(player) {
    let best = null;
    let bestD = Infinity;
    for (const car of this.cars) {
      const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best ? { car: best, dist: bestD } : null;
  }

  update(dt, player, playerCar) {
    if (this.stars > 0) {
      this._sinceCrime += dt;
      if (this._sinceCrime > WANTED.decayDelay) {
        this._decayTimer += dt;
        if (this._decayTimer >= WANTED.decayGap) {
          this._decayTimer = 0;
          this.stars -= 1;
          this._syncCars();
        }
      }
    }
    this._syncCars();
    // Siren when a police car is within earshot.
    const near = this.nearestPolice(player);
    this.audio.siren(dt, !!near && near.dist < 70);
    // Chase: steer at the player, ram on contact; stuck cars reverse out.
    let closest = Infinity;
    for (const car of this.cars) {
      if (car.ramCooldown > 0) car.ramCooldown -= dt;
      const dx = player.pos.x - car.pos.x;
      const dz = player.pos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      closest = Math.min(closest, dist);
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.2));
      const target = Math.min(car.cruiseSpeed, 8 + dist * 0.35);
      if (car.speed < target) car.speed = Math.min(target, car.speed + 12 * dt);
      const before = { x: car.pos.x, z: car.pos.z };
      this.vehicles.drive(car, dt, 1, steer, 0);
      const moved = Math.hypot(car.pos.x - before.x, car.pos.z - before.z);
      if (Math.abs(car.speed) > 3 && moved < 0.05) {
        car.stuckTimer += dt;
      } else {
        car.stuckTimer = 0;
      }
      if (car.stuckTimer > 1.5) {
        // Reverse out of the jam, then try again.
        car.speed = -6;
        car.stuckTimer = -1.5;
        this.vehicles.drive(car, dt, -1, -steer, 0);
      }
      // Ramming the player's car shoves it forward and nudges its heading;
      // it never pins the player in place, so a chase stays a chase.
      if (playerCar) {
        const dCar = Math.hypot(car.pos.x - playerCar.pos.x, car.pos.z - playerCar.pos.z);
        if (dCar < 4.2 && car.ramCooldown <= 0 && car.speed > Math.abs(playerCar.speed) + 2) {
          car.ramCooldown = 0.6;
          playerCar.speed = Math.min(30, playerCar.speed + 3);
          playerCar.heading += (car.heading - playerCar.heading) * 0.08;
          this.audio.crash();
        }
      } else if (dist < 2.2) {
        if (player.hurt(14 * dt)) {
          // Beaten down: the bust below handles the arrest.
        }
      }
    }
    // Bust: a police car holds the player (in a slow car, or on foot) close.
    if (this.stars > 0 && near) {
      const playerSlow = playerCar ? Math.abs(playerCar.speed) < 1.5 : true;
      if (near.dist < 5 && playerSlow) {
        this._bustHold += dt;
        if (this._bustHold >= WANTED.bustHoldSeconds) {
          this._bustHold = 0;
          this.onBusted();
        }
      } else {
        this._bustHold = Math.max(0, this._bustHold - dt * 2);
      }
    } else {
      this._bustHold = 0;
    }
  }
}
