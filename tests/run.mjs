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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
