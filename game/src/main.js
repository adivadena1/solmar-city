// Solmar — the entry point. It builds the renderer and every system, runs
// the frame loop, and owns the things that belong to no single system: the
// third-person camera, getting in and out of cars, combat input, crime and
// its consequences (busted, wasted), and the start/pause flow. The game is
// an open world: on foot and by car, traffic, police, missions, a HUD with
// a minimap, synthesized sound and a save.

import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Vehicles } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { loadSave, writeSave } from './save.js';
import { stageShot } from './shots.js';
import { START_MONEY, PLAYER } from './config.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const world = new World(scene);
const player = new Player(scene, world);
const vehicles = new Vehicles(scene, world);
const traffic = new Traffic(scene, world, vehicles);
const audio = new AudioSys();
const input = new Input(canvas);
const hud = new HUD();
const saveData = loadSave();

const game = {
  scene, world, player, vehicles, traffic, hud, audio, input,
  mode: 'menu',
  money: saveData ? saveData.money : START_MONEY,
  prompt: '',
  autopilot: null,
  shotCamera: null,
  saveData,
  addMoney(n) { this.money += n; },
  saveProgress() {
    writeSave({
      money: this.money,
      missionsDone: this.missions.done,
      spawn: { x: this.player.pos.x, z: this.player.pos.z },
    });
  },
};
const police = new Police(scene, world, vehicles, traffic, audio, () => bustPlayer());
game.police = police;
const missions = new Missions(game);
game.missions = missions;

// Parked cars to steal, and the player's start position.
vehicles.spawnParkedCars(10);
if (saveData && saveData.spawn) {
  player.reset(saveData.spawn.x, saveData.spawn.z);
} else {
  player.reset(0, 10);
}

// --- Camera ----------------------------------------------------------------
let camOrbit = Math.PI;
let camPitch = 0.34;
let camDistance = 8;
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const tmpV = new THREE.Vector3();

function updateCamera(dt) {
  const { dx, dy } = input.consumeMouse();
  if (game.mode === 'playing') {
    camOrbit -= dx * 0.0032;
    camPitch = Math.max(0.06, Math.min(1.05, camPitch + dy * 0.0032));
  }
  const target = player.inCar ? player.inCar.pos : player.pos;
  const wantDist = player.inCar ? 12 : 7.5;
  camDistance += (wantDist - camDistance) * Math.min(1, dt * 4);
  camTarget.set(target.x, target.y + (player.inCar ? 2.2 : 1.8), target.z);
  const hDist = camDistance * Math.cos(camPitch);
  const vDist = camDistance * Math.sin(camPitch);
  camPos.set(
    camTarget.x + Math.sin(camOrbit) * hDist,
    camTarget.y + vDist,
    camTarget.z + Math.cos(camOrbit) * hDist,
  );
  // Never let the camera sink under the street.
  camPos.y = Math.max(camPos.y, 1.2);
  camera.position.lerp(camPos, 1 - Math.exp(-dt * 10));
  camera.lookAt(camTarget);
}

/** The heading the camera looks along, on the ground plane. */
function cameraYaw() {
  return camOrbit + Math.PI;
}

// --- Crime, busts, and going down -------------------------------------------
let crimeCooldown = 0;

function commitCrime(stars, reason) {
  if (crimeCooldown > 0) return;
  crimeCooldown = 2;
  police.addStars(stars, reason);
}

function bustPlayer() {
  if (game.mode !== 'playing') return;
  const loss = Math.min(game.money, 150);
  game.money -= loss;
  audio.busted();
  police.clear();
  game.mode = 'busted';
  input.unlockPointer();
  hud.showEndCard('busted', loss, () => respawnAt(world.landmarks.policeStation));
  game.saveProgress();
}

function wastePlayer() {
  if (game.mode !== 'playing') return;
  const loss = Math.min(game.money, 100);
  game.money -= loss;
  audio.busted();
  police.clear();
  game.mode = 'wasted';
  input.unlockPointer();
  hud.showEndCard('wasted', loss, () => respawnAt(world.landmarks.hospital));
  game.saveProgress();
}

function respawnAt(spot) {
  if (player.inCar) {
    player.inCar.driver = null;
    player.inCar = null;
  }
  player.reset(spot.x, spot.z);
  player.group.visible = true;
  hud.hideEndCard();
  game.mode = 'playing';
  input.lockPointer();
  game.saveProgress();
}

// --- Getting in and out of cars ----------------------------------------------
let eCooldown = 0;

function tryToggleCar() {
  if (eCooldown > 0) return;
  eCooldown = 0.4;
  if (player.inCar) {
    // Get out beside the car.
    const car = player.inCar;
    car.driver = null;
    player.inCar = null;
    player.pos.set(car.pos.x + Math.cos(car.heading) * 2.6, 0, car.pos.z - Math.sin(car.heading) * 2.6);
    player.group.visible = true;
    player.heading = car.heading;
    return;
  }
  const car = vehicles.nearestCar(player.pos.x, player.pos.z, 3.4);
  if (!car) return;
  if (car.kind === 'police') {
    game.prompt = 'That car belongs to the police.';
    return;
  }
  if ((car.kind === 'parked' || car.kind === 'traffic') && !car.stolen) {
    car.stolen = true;
    commitCrime(1, 'stole a car');
    hud.showMessage('CAR STOLEN — the law is watching');
  }
  car.kind = 'player';
  car.driver = player;
  player.inCar = car;
  player.group.visible = false;
  player.pos.copy(car.pos);
  player.heading = car.heading;
  missions.onEnterCar();
  audio.init();
}

// --- Combat -------------------------------------------------------------------
const shotTracer = (() => {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
  line.frustumCulled = false;
  scene.add(line);
  return line;
})();
let tracerTimer = 0;

function fireShot() {
  if (!player.shoot()) return;
  audio.shot();
  const dir = tmpV.set(Math.sin(cameraYaw()), 0, Math.cos(cameraYaw()));
  const origin = player.pos;
  const end = new THREE.Vector3(origin.x + dir.x * 60, 1.4, origin.z + dir.z * 60);
  // Find the nearest thing in the cone: a guard, a pedestrian, a police car.
  let bestD = 60;
  let bestKind = null;
  let bestObj = null;
  for (const g of missions.guards) {
    if (g.down > 0) continue;
    const d = hitDistance(origin, dir, g.pos, 1.2);
    if (d !== null && d < bestD) { bestD = d; bestKind = 'guard'; bestObj = g; }
  }
  for (const ped of traffic.peds) {
    if (ped.down > 0) continue;
    const d = hitDistance(origin, dir, ped.pos, 1.0);
    if (d !== null && d < bestD) { bestD = d; bestKind = 'ped'; bestObj = ped; }
  }
  for (const car of police.cars) {
    const d = hitDistance(origin, dir, car.pos, 2.2);
    if (d !== null && d < bestD) { bestD = d; bestKind = 'police'; bestObj = car; }
  }
  end.set(origin.x + dir.x * bestD, 1.4, origin.z + dir.z * bestD);
  const pos = shotTracer.geometry.attributes.position;
  pos.setXYZ(0, origin.x, 1.4, origin.z);
  pos.setXYZ(1, end.x, end.y, end.z);
  pos.needsUpdate = true;
  shotTracer.material.opacity = 0.9;
  tracerTimer = 0.09;
  if (bestKind === 'guard') {
    missions.combatHit(origin, dir.x, dir.z, bestD + 0.5, 34);
  } else if (bestKind === 'ped') {
    traffic.knockDown(bestObj, origin.x, origin.z);
    commitCrime(1, 'shot a pedestrian');
  } else if (bestKind === 'police') {
    commitCrime(1, 'shot at the police');
  }
  if (bestKind) traffic.scare(origin.x, origin.z, 25);
}

/** Distance along `dir` to a circle at `p`, or null when the ray misses. */
function hitDistance(origin, dir, p, radius) {
  const dx = p.x - origin.x;
  const dz = p.z - origin.z;
  const along = dx * dir.x + dz * dir.z;
  if (along < 0) return null;
  const perp2 = dx * dx + dz * dz - along * along;
  if (perp2 > radius * radius) return null;
  return along;
}

function punch() {
  if (!player.punch()) return;
  audio.punch();
  player.forward(tmpV);
  const origin = player.pos;
  // Guards first (mission 4), then pedestrians in front of the fist.
  const guardHits = missions.combatHit(origin, tmpV.x, tmpV.z, 2.6, 25);
  if (guardHits === 0) {
    for (const ped of traffic.peds) {
      if (ped.down > 0) continue;
      const dx = ped.pos.x - origin.x;
      const dz = ped.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.6) continue;
      const dot = (dx * tmpV.x + dz * tmpV.z) / (d || 1);
      if (dot < 0.3) continue;
      traffic.knockDown(ped, origin.x, origin.z);
      commitCrime(1, 'attacked a pedestrian');
      traffic.scare(origin.x, origin.z, 20);
      break;
    }
  }
}

// --- The frame ----------------------------------------------------------------
let last = performance.now();
let saveTimer = 0;
let hurtCooldown = 0;
let prevE = false;
let prevQ = false;
let prevM = false;
let prevP = false;

function stepGame(dt) {
  if (crimeCooldown > 0) crimeCooldown -= dt;
  if (eCooldown > 0) eCooldown -= dt;
  if (hurtCooldown > 0) hurtCooldown -= dt;
  if (tracerTimer > 0) {
    tracerTimer -= dt;
    if (tracerTimer <= 0) shotTracer.material.opacity = 0;
  }
  const eDown = input.down('KeyE');
  if (eDown && !prevE) tryToggleCar();
  prevE = eDown;
  const qDown = input.down('KeyQ');
  if (qDown && !prevQ) {
    player.armed = !player.armed;
    hud.showMessage(player.armed ? 'PISTOL OUT — left click to shoot' : 'PISTOL AWAY');
  }
  prevQ = qDown;
  const mDown = input.down('KeyM');
  if (mDown && !prevM) audio.setMuted(!audio.muted);
  prevM = mDown;
  const pDown = input.down('KeyP');
  if (pDown && !prevP) pauseGame();
  prevP = pDown;

  // Movement: on foot, or behind the wheel.
  if (player.inCar) {
    const car = player.inCar;
    input.consumeClick();
    let throttle = 0;
    let steer = 0;
    let brake = 0;
    if (game.autopilot) {
      throttle = game.autopilot.throttle;
      steer = game.autopilot.steer;
    } else {
      if (input.down('KeyW') || input.down('ArrowUp')) throttle = 1;
      if (input.down('KeyS') || input.down('ArrowDown')) throttle = -1;
      if (input.down('KeyA') || input.down('ArrowLeft')) steer = 1;
      if (input.down('KeyD') || input.down('ArrowRight')) steer = -1;
      if (input.down('Space')) brake = 1;
    }
    const hit = vehicles.drive(car, dt, throttle, steer, brake);
    if (hit) audio.crash();
    player.pos.copy(car.pos);
    player.heading = car.heading;
    audio.engine(Math.abs(car.speed) / 34, true);
    // Running over a pedestrian is a crime, once per pedestrian.
    for (const ped of traffic.peds) {
      if (ped.down > 0) continue;
      const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
      if (d < 2.4 && Math.abs(car.speed) > 6) {
        traffic.knockDown(ped, car.pos.x, car.pos.z);
        commitCrime(1, 'ran over a pedestrian');
        traffic.scare(car.pos.x, car.pos.z, 25);
        audio.crash();
      }
    }
    game.prompt = 'E — get out of the car';
  } else {
    player.updateOnFoot(dt, input, cameraYaw());
    audio.engine(0, false);
    const near = vehicles.nearestCar(player.pos.x, player.pos.z, 3.4, ['parked', 'traffic']);
    game.prompt = near
      ? (near.kind === 'parked' ? 'E — steal this car' : 'E — take this car')
      : '';
    // Left click: punch, or shoot when armed.
    if (input.consumeClick()) {
      input.lockPointer();
      audio.init();
      if (player.armed) fireShot();
      else punch();
    }
    if (input.down('KeyF')) punch();
    // Traffic can run the player down.
    for (const car of traffic.cars) {
      const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
      if (d < 2.4 && Math.abs(car.speed) > 5 && hurtCooldown <= 0) {
        hurtCooldown = 1;
        if (player.hurt(12)) wastePlayer();
        audio.crash();
        traffic.scare(player.pos.x, player.pos.z, 15);
      }
    }
  }
  // Health comes back slowly when the player is out of trouble.
  if (player.health < PLAYER.health && police.stars === 0) {
    player.heal(2 * dt);
  }
  if (player.health <= 0 && game.mode === 'playing') wastePlayer();

  world.update(dt);
  traffic.update(dt, player, player.inCar);
  police.update(dt, player, player.inCar);
  missions.update(dt);
  audio.music(dt);
  hud.update(game, dt);
  saveTimer += dt;
  if (saveTimer > 12) {
    saveTimer = 0;
    game.saveProgress();
  }
}

function pauseGame() {
  if (game.mode !== 'playing') return;
  game.mode = 'paused';
  input.unlockPointer();
  audio.engine(0, false);
  game.saveProgress();
  hud.showPause(
    () => {
      hud.hidePause();
      game.mode = 'playing';
      input.lockPointer();
    },
    () => {
      hud.hidePause();
      player.reset(0, 10);
      police.clear();
      game.mode = 'playing';
      input.lockPointer();
    },
    () => {
      hud.hidePause();
      game.mode = 'menu';
      hud.showMenu(loadSave(), startPlaying, startPlaying);
    },
  );
}

function startPlaying(useSave) {
  audio.init();
  if (useSave && saveData) {
    game.money = saveData.money;
    if (saveData.spawn) player.reset(saveData.spawn.x, saveData.spawn.z);
  } else if (!useSave) {
    game.money = START_MONEY;
    missions.done = [];
    missions.nextIndex = 0;
    player.reset(0, 10);
  }
  hud.hideMenu();
  game.mode = 'playing';
  input.lockPointer();
  hud.showMessage('SOLMAR — welcome to the city');
  hud.showSubtitle('DANA: Rook. You are in Solmar now. Go to the gold marker.', 4);
  game.saveProgress();
}

// --- Boot ----------------------------------------------------------------------
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const hudEl = document.getElementById('hud');

if (shotName) {
  stageShot(shotName, game);
  if (shotName === 'city') {
    hudEl.style.display = 'none';
    hud.showMenu(saveData, startPlaying, startPlaying);
  } else {
    hudEl.style.display = 'block';
  }
} else {
  hudEl.style.display = 'none';
  hud.showMenu(saveData, startPlaying, startPlaying);
}

// A handle for play-testing and screenshots: the whole game state, read-only
// from the console. Harmless in play; the game never reads it back.
window.__solmar = game;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.mode === 'playing') {
    stepGame(dt);
    updateCamera(dt);
  } else if (game.mode === 'menu') {
    // The city lives behind the start screen: a slow orbit over downtown,
    // or the staged cinematic view when a screenshot asked for it.
    if (game.shotCamera) {
      camera.position.set(game.shotCamera.pos[0], game.shotCamera.pos[1], game.shotCamera.pos[2]);
      camera.lookAt(game.shotCamera.look[0], game.shotCamera.look[1], game.shotCamera.look[2]);
    } else {
      const t = now * 0.00004;
      camOrbit = t * Math.PI * 2;
      camera.position.set(Math.sin(camOrbit) * 190, 95, Math.cos(camOrbit) * 190 + 40);
      camera.lookAt(0, 10, -20);
    }
    world.update(dt);
    traffic.update(dt, player, null);
  } else if (game.mode === 'paused' || game.mode === 'busted' || game.mode === 'wasted') {
    updateCamera(dt);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
