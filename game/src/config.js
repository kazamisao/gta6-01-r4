// config.js — the tuning table for Verano Bay. One place for the numbers the
// logic core, the drivers and the renderer all share, so the game can be
// balanced without hunting through systems.

export const WORLD = {
  width: 3600,
  height: 2700,
  seed: 20261118,
  sandY: 2300, // beach starts here
  waterY: 2430, // sea starts here; nothing drives or walks past the waterline
  pierX: 1800, // the El Faro pier strip reaches a little further south
  pierHalfWidth: 70,
};

export const ROADS = {
  avenues: [300, 750, 1200, 1650, 2100, 2550, 3000], // vertical road centre lines (x)
  streets: [300, 690, 1080, 1470, 1860, 2250], // horizontal road centre lines (y)
  halfWidth: 46, // asphalt half width
  sidewalk: 15, // pavement beyond the asphalt
  laneOffset: 17, // right-hand traffic offset from the centre line
};

export const CAR_CLASSES = {
  coupe: { label: 'Coupe', topSpeed: 335, reverseSpeed: 90, accel: 300, brake: 520, grip: 3.4, length: 46, width: 24, health: 100 },
  sedan: { label: 'Sedan', topSpeed: 285, reverseSpeed: 80, accel: 250, brake: 480, grip: 3.1, length: 48, width: 25, health: 110 },
  sport: { label: 'Sport', topSpeed: 395, reverseSpeed: 95, accel: 380, brake: 560, grip: 3.8, length: 45, width: 24, health: 90 },
  van: { label: 'Van', topSpeed: 235, reverseSpeed: 70, accel: 200, brake: 430, grip: 2.6, length: 56, width: 27, health: 150 },
  police: { label: 'Patrol', topSpeed: 360, reverseSpeed: 90, accel: 330, brake: 540, grip: 3.5, length: 48, width: 25, health: 130 },
};

export const PLAYER = {
  walkSpeed: 128,
  sprintSpeed: 205,
  radius: 11,
  health: 100,
  enterRange: 44, // how close to a car door E works from
};

export const WANTED = {
  heatPerStar: 26, // heat points per star
  maxStars: 5,
  decayPerSecond: 3.2, // heat drain while no officer sees the player
  seenRange: 430, // an officer inside this range with line of sight keeps heat up
  policeByStar: [0, 2, 3, 4, 5, 6], // patrol cars wanted on the street per star count
  bustedFillSeconds: 2.4, // pinned next to police this long ends the chase badly
  bustedRange: 64,
  maxFine: 140,
  wastedFee: 90,
  heat: {
    stealCar: 9,
    hitCar: 5,
    hitPedestrian: 16,
    shotFired: 4,
    wreckCar: 12,
    guardDown: 10,
    missionCrime: 14,
  },
};

export const COMBAT = {
  playerDamage: 34, // per player hit on a guard or a car panel
  guardDamage: 7, // per guard hit on the player
  guardRange: 330,
  guardFireSeconds: 0.9,
  playerFireSeconds: 0.16,
  bulletRange: 460,
  guardHealth: 68,
};

export const PALETTE = {
  sea: '#177e9c',
  seaDeep: '#0f6a8a',
  sand: '#eed9a4',
  sandWet: '#e3c88f',
  grass: '#79b657',
  sidewalk: '#e8dcc3',
  asphalt: '#3d4148',
  asphaltEdge: '#2f333a',
  laneMark: '#f5eeda',
  buildingShadow: 'rgba(59, 42, 26, 0.28)',
  palmTrunk: '#8a6642',
  palmLeaf: '#2e7d4f',
  objective: '#ffb300',
  danger: '#e5484d',
  player: '#ff7847',
};

export const BUILDING_COLORS = [
  '#e07856', '#d9a441', '#e5c07b', '#c96f4a', '#7fc4b5',
  '#e8e3d5', '#d98e6a', '#a8c686', '#e0b184', '#8fb8d8',
];
