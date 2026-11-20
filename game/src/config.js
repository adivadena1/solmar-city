// Solmar — shared constants: the city's layout, the palette, and the tuning
// numbers every system agrees on. Nothing here imports three.js, so the HUD
// and the save code can read the same numbers the 3D world uses.

export const CITY = {
  // Roads run on a grid: one road line per entry, in both axes.
  roads: [-180, -108, -36, 36, 108, 180],
  roadWidth: 12,
  blockSize: 60,
  // The built city runs from -half to +half; south of it is the beach.
  half: 216,
  beachStart: 216,
  sandEnd: 262,
  oceanEnd: 460,
  // Seeded layout: the same city every run, for every player.
  seed: 7,
};

export const PALETTE = {
  sky: 0x87bfe8,
  fog: 0xa8c8e0,
  sun: 0xfff2d0,
  ground: 0x9aa0a3,
  sidewalk: 0xb9b3a4,
  road: 0x3a3f45,
  roadLine: 0xd8d2c0,
  sand: 0xe8d29a,
  ocean: 0x2e7fa8,
  // Warm sun-soaked building colours, one per building.
  buildings: [0xf2ead8, 0xe8c9a0, 0xd98a6a, 0x7fb8a8, 0xf0f0e8, 0xc9a86a, 0x8fb8d8, 0xe8b8a0],
  palmTrunk: 0x8a6a42,
  palmLeaf: 0x3f9a4a,
};

export const PLAYER = {
  walkSpeed: 6,
  sprintSpeed: 10,
  radius: 0.55,
  health: 100,
  punchRange: 2.4,
  punchDamage: 25,
  shootRange: 60,
  shootDamage: 34,
  shootCooldown: 0.35,
};

export const CAR = {
  accel: 16,
  brake: 30,
  reverseAccel: 10,
  maxSpeed: 34,
  maxReverse: 10,
  steerSpeed: 2.1,
  grip: 6,
  radius: 1.9,
};

export const WANTED = {
  maxStars: 5,
  // Seconds of no crime before the heat starts to fall, then one star per gap.
  decayDelay: 18,
  decayGap: 12,
  // Police cars on the road per wanted level.
  policePerStar: [0, 1, 2, 3, 3, 4],
  bustHoldSeconds: 2.5,
  bustMoneyLoss: 150,
};

export const SAVE_KEY = 'solmar-save-v1';

export const START_MONEY = 50;
