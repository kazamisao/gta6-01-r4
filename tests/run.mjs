// tests/run.mjs — headless tests over Verano Bay's pure logic modules.
// Run with: node tests/run.mjs   (no browser, no DOM, no network)

import { Rng, mulberry32 } from '../game/src/rng.js';
import { generateCity, districtAt, isRoad, isWater, groundAt, collidersNear } from '../game/src/city.js';
import { stepCar, moveCircle, lineOfSight, angleDelta } from '../game/src/physics.js';
import { CAR_CLASSES, WORLD } from '../game/src/config.js';

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.log('FAIL:', name); }
}
function eq(name, a, b) { check(`${name} (got ${a}, want ${b})`, a === b); }

// --- rng -----------------------------------------------------------------
{
  const a = mulberry32(42);
  const b = mulberry32(42);
  let same = true;
  for (let i = 0; i < 50; i++) if (a() !== b()) same = false;
  check('mulberry32 is deterministic', same);
  const r = new Rng(7);
  let inRange = true;
  for (let i = 0; i < 500; i++) { const v = r.range(3, 9); if (v < 3 || v >= 9) inRange = false; }
  check('Rng.range stays in bounds', inRange);
  const ints = new Set();
  const r2 = new Rng(11);
  for (let i = 0; i < 200; i++) ints.add(r2.int(1, 3));
  check('Rng.int covers its range', ints.has(1) && ints.has(2) && ints.has(3));
}

// --- city ----------------------------------------------------------------
const city = generateCity();
{
  const again = generateCity();
  eq('city generation is deterministic (buildings)', again.buildings.length, city.buildings.length);
  eq('first building matches across runs', again.buildings[0].x, city.buildings[0].x);
  check('city has a real building stock', city.buildings.length > 120);
  check('city has palms', city.palms.length > 100);
  check('city has parking spots', city.parkedSpots.length > 60);
  eq('district of the marina', districtAt(3200, 2200), 'Marina Azul');
  eq('district of the plaza', districtAt(1425, 1280), 'Mercado Nuevo');
  eq('district of the north west', districtAt(200, 200), 'Puerto Viejo');
  check('avenue centre is road', isRoad(750, 900));
  check('street centre is road', isRoad(900, 690));
  check('open sea is water', isWater(900, 2600));
  check('pier is not water', !isWater(1800, 2480));
  eq('ground on the beach', groundAt(city, 900, 2360), 'sand');
  eq('ground on an avenue', groundAt(city, 750, 900), 'road');
  check('buildings collide near themselves', collidersNear(city, city.buildings[0].x + 5, city.buildings[0].y + 5, 4).length > 0);
  check('the sea has no colliders', collidersNear(city, 900, 2600, 10).length === 0);
  // No building may sit on a road or in the sea.
  let clean = true;
  for (const b of city.buildings) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    if (isRoad(cx, cy) || cy >= WORLD.sandY) clean = false;
  }
  check('no building on a road or the beach', clean);
}

// --- physics ---------------------------------------------------------------
{
  const spec = CAR_CLASSES.sedan;
  const car = { x: 750, y: 900, angle: 0, speed: 0 };
  for (let i = 0; i < 60; i++) stepCar(car, { up: true }, spec, 1 / 30);
  check('car accelerates from rest', car.speed > 150);
  const fast = car.speed;
  for (let i = 0; i < 90; i++) stepCar(car, { down: true }, spec, 1 / 30);
  check('brake pedal slows before it reverses', car.speed < fast - 100);
  for (let i = 0; i < 120; i++) stepCar(car, { down: true }, spec, 1 / 30);
  check('holding the pedal ends in reverse', car.speed < 0 && car.speed >= -spec.reverseSpeed - 0.01);

  const turner = { x: 0, y: 0, angle: 0, speed: 0 };
  stepCar(turner, { left: true }, spec, 1 / 30);
  eq('a parked car does not steer', turner.angle, 0);
  turner.speed = 200;
  const before = turner.angle;
  stepCar(turner, { left: true }, spec, 1 / 30);
  check('steering bites at speed', turner.angle < before);

  const pos = { x: city.buildings[0].x - 30, y: city.buildings[0].y + city.buildings[0].h / 2 };
  const hit = moveCircle(city, pos, 11, 60, 0);
  check('a walker is stopped by a building', hit > 0 && pos.x <= city.buildings[0].x - 10);

  const swimmer = { x: 900, y: 2400 };
  moveCircle(city, swimmer, 11, 0, 200);
  check('nobody walks into the sea', swimmer.y <= WORLD.waterY);

  check('angleDelta wraps', Math.abs(angleDelta(3.0, -3.0) - 0.2832) < 0.01);
  const open = { x: 750, y: 900 };
  check('line of sight along a road', lineOfSight(city, open.x, open.y, 750, 1300));
}

import { createWanted, addHeat, updateWanted, policeWanted, starsForHeat, bustedFine } from '../game/src/wanted.js';
import { MissionRunner, MISSIONS } from '../game/src/missions.js';
import { LOCATIONS } from '../game/src/city.js';
import { createSave } from '../game/src/save.js';

// --- wanted ----------------------------------------------------------------
{
  const w = createWanted();
  eq('no heat, no stars', w.stars, 0);
  addHeat(w, 'stealCar');
  eq('stealing a car earns a star', w.stars, 1);
  addHeat(w, 200);
  eq('a crime spree caps at five stars', w.stars, 5);
  eq('five stars send six patrol cars', policeWanted(w), 6);
  eq('two stars send three patrol cars', policeWanted({ stars: 2 }), 3);
  const heatBefore = w.heat;
  updateWanted(w, 1, { seen: true, pinned: false });
  eq('heat holds while an officer watches', w.heat, heatBefore);
  updateWanted(w, 2, { seen: false, pinned: false });
  check('heat drains out of sight', w.heat < heatBefore);
  eq('stars follow heat down', w.stars, starsForHeat(w.heat));
  const w2 = createWanted();
  addHeat(w2, 60);
  let busted = null;
  for (let i = 0; i < 40 && !busted; i++) busted = updateWanted(w2, 0.25, { seen: true, pinned: true });
  eq('standing pinned next to police ends in busted', busted, 'busted');
  check('the fine scales with stars', bustedFine(5) > bustedFine(1));
}

// --- missions ---------------------------------------------------------------
{
  const r = new MissionRunner();
  const at = (p, extra = {}) => ({ x: p.x, y: p.y, inCarId: 0, stars: 0, guardsAlive: 0, wreckedMarked: 0, ...extra });
  const m1 = r.startNext();
  eq('first job is First Shift', m1.id, 'first-shift');
  let ev = r.update(0.1, at(LOCATIONS.marinaOffice));
  check('arriving completes the meet step', ev.some(e => e.type === 'stepComplete'));
  ev = r.update(0.1, at(LOCATIONS.marinaOffice));
  check('the steal step asks the shell to spawn its car', ev.some(e => e.type === 'spawnCar'));
  r.setTargetCar(42);
  ev = r.update(0.1, at(LOCATIONS.marinaOffice, { inCarId: 42 }));
  check('entering the marked car completes the steal', ev.some(e => e.type === 'stepComplete'));
  ev = r.update(0.1, at(LOCATIONS.garage, { inCarId: 7 }));
  check('the wrong car does not deliver', !ev.some(e => e.type === 'stepComplete'));
  ev = r.update(0.1, at(LOCATIONS.garage, { inCarId: 42 }));
  check('delivering the marked car pays out', ev.some(e => e.type === 'missionComplete' && e.reward === 200));
  eq('one job done', r.completedCount(), 1);

  const m2 = r.startNext();
  eq('second job is Cold Ledger', m2.id, 'cold-ledger');
  r.update(0.1, at(LOCATIONS.marketAlley));
  r.update(0.1, at({ x: 1560, y: 1395 }));
  ev = r.update(0.1, at(LOCATIONS.plaza));
  check('the ambush asks for guards', ev.some(e => e.type === 'spawnGuards' && e.count === 2));
  ev = r.update(0.1, at(LOCATIONS.plaza, { guardsAlive: 2 }));
  check('the fight waits for the guards to fall', !ev.some(e => e.type === 'stepComplete'));
  r.setGuardsSpawned();
  ev = r.update(0.1, at(LOCATIONS.plaza, { guardsAlive: 0 }));
  check('clearing the guards completes the fight', ev.some(e => e.type === 'stepComplete'));
  ev = r.update(0.1, at(LOCATIONS.safehouse));
  check('the ledger delivery ends job two', ev.some(e => e.type === 'missionComplete'));

  const m3 = r.startNext();
  r.update(0.1, at(LOCATIONS.playaLot));
  ev = r.update(0.1, at(LOCATIONS.playaLot));
  check('the wreck step asks for target cars', ev.some(e => e.type === 'spawnWreckTargets' && e.count === 2));
  ev = r.update(0.1, at(LOCATIONS.playaLot, { wreckedMarked: 1 }));
  check('one wreck is not enough', !ev.some(e => e.type === 'stepComplete'));
  r.update(0.1, at(LOCATIONS.playaLot, { wreckedMarked: 2 }));
  ev = r.update(0.1, at(LOCATIONS.playaLot, { stars: 0 }));
  check('escape needs heat first', !ev.some(e => e.type === 'stepComplete'));
  r.update(0.1, at(LOCATIONS.playaLot, { stars: 3 }));
  ev = r.update(0.1, at(LOCATIONS.playaLot, { stars: 0 }));
  check('losing the police completes the escape', ev.some(e => e.type === 'stepComplete'));
  check('job three pays out', ev.some(e => e.type === 'missionComplete'));

  const r2 = new MissionRunner();
  r2.restore(3);
  const m4 = r2.startNext();
  eq('a restored game resumes at job four', m4.id, 'night-ferry');
  r2.update(0.1, at(LOCATIONS.pier));
  let failed = null;
  for (let i = 0; i < 12 && !failed; i++) {
    const evs = r2.update(10, at(LOCATIONS.pier, { inCarId: 5 }));
    failed = evs.find(e => e.type === 'stepFailed') || null;
  }
  check('a timed delivery can run out of road', !!failed);
  const ev2 = r2.update(0.1, at(LOCATIONS.hotel, { inCarId: 5 }));
  check('after a failed timer the delivery still counts', ev2.some(e => e.type === 'missionComplete'));

  const r3 = new MissionRunner();
  r3.restore(6);
  const m7 = r3.startNext();
  eq('the finale is Last Light', m7.id, 'last-light');
  const gates = m7.steps[0].points;
  let gateEvents = 0;
  for (const g of gates) {
    const evs = r3.update(0.1, at(g, { inCarId: 3 }));
    gateEvents += evs.filter(e => e.type === 'checkpoint').length;
  }
  eq('every checkpoint reports in', gateEvents, gates.length);
  eq('the story has seven jobs', MISSIONS.length, 7);
  const total = MISSIONS.reduce((s, m) => s + m.reward, 0);
  eq('the story pays $4,700 in all', total, 4700);
}

// --- save --------------------------------------------------------------------
{
  const store = new Map();
  const storage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: k => store.delete(k),
  };
  const save = createSave(storage);
  eq('an empty slot reads as no save', save.read(), null);
  save.write({ cash: 640, missionIndex: 3, x: 123.6, y: 876.2 });
  const back = save.read();
  check('a save round-trips', back.cash === 640 && back.missionIndex === 3 && back.x === 124 && back.y === 876);
  store.set('verano-bay-save-v1', '{not json');
  eq('a corrupt save reads as no save', save.read(), null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
