// Solmar — the screenshot scenes behind ?shot=cover|chase|mission|city.
// Each one stages the real game (a real car, real traffic, real police,
// a real mission) and lets it run for a few seconds, so the frame is what
// a short session really looks like. Nothing here is faked for the camera.

export function stageShot(name, game) {
  const { player, vehicles, police, missions, world } = game;
  if (name === 'city') {
    // Start screen over a cinematic view of the skyline and the beach.
    game.mode = 'menu';
    game.shotCamera = { pos: [170, 60, 270], look: [0, 12, -20] };
    return { screen: 'menu' };
  }
  game.mode = 'playing';
  game.shotCamera = null;
  if (name === 'cover') {
    const car = vehicles.spawnCar(36, -80, 0, 'parked', 0xd83a3a);
    enterCarForShot(game, car, 16);
    // Traffic ahead and behind on the same road, pedestrians on the kerb.
    const t1 = vehicles.spawnCar(36, -30, 0, 'traffic', 0x3a6ad8);
    t1.waypoints = [{ x: 36, z: -180 }, { x: 36, z: 180 }];
    t1.waypointIndex = 1;
    const t2 = vehicles.spawnCar(-36, -50, Math.PI, 'traffic', 0xe8c93a);
    t2.waypoints = [{ x: -36, z: 180 }, { x: -36, z: -180 }];
    t2.waypointIndex = 1;
    game.traffic.cars.push(t1, t2);
    game.autopilot = { throttle: 0.6, steer: 0 };
    return { screen: 'playing' };
  }
  if (name === 'chase') {
    // A fast chase down a long straight: the player's car ahead, two police
    // cars closing in behind, the road and the city ahead of them.
    const car = vehicles.spawnCar(36, -100, 0, 'parked', 0x2a2a2e);
    enterCarForShot(game, car, 24);
    police.stars = 3;
    police._syncCars();
    const p1 = police.cars[0];
    if (p1) {
      p1.pos.set(36, -140);
      p1.heading = 0;
      p1.speed = 22;
    }
    const p2 = police.cars[1];
    if (p2) {
      // A second unit pulling alongside on the right, in frame, closing in.
      p2.pos.set(46, -72);
      p2.heading = 0;
      p2.speed = 20;
    }
    game.autopilot = { throttle: 0.85, steer: 0 };
    return { screen: 'playing' };
  }
  if (name === 'mission') {
    // Mission 2, on the way to the Docks, with the beacon in view.
    const def = missions.defs[1];
    missions.nextIndex = 1;
    missions.active = { def, step: 0 };
    missions.say(def.intro);
    const car = vehicles.spawnCar(96, 96, Math.PI / 4, 'parked', 0x3a8a4a);
    enterCarForShot(game, car, 14);
    const t1 = vehicles.spawnCar(108, 60, Math.PI, 'traffic', 0xe8e8e8);
    t1.waypoints = [{ x: 108, z: 180 }, { x: 108, z: -180 }];
    t1.waypointIndex = 0;
    game.traffic.cars.push(t1);
    game.autopilot = { throttle: 0.6, steer: 0.12 };
    return { screen: 'playing' };
  }
  return { screen: 'playing' };
}

function enterCarForShot(game, car, speed) {
  const { player } = game;
  player.inCar = car;
  player.group.visible = false;
  car.speed = speed;
  car.driver = player;
  player.pos.copy(car.pos);
  player.heading = car.heading;
}
