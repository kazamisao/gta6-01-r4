// entities.js — the living traffic of Verano Bay: lane-following traffic
// cars, kerbside parked cars, pursuit-driving police, strolling pedestrians
// and mission guards. Each driver computes pedal and steering inputs and
// lets physics.js move the body, so behaviour stays testable and shared.

import { Rng } from './rng.js';
import { ROADS, CAR_CLASSES, COMBAT } from './config.js';
import { stepCar, moveCircle, angleDelta, angleTo, distance, clamp } from './physics.js';

let nextCarId = 1;

export function makeCar(x, y, angle, carClass, color, kind) {
  const spec = CAR_CLASSES[carClass];
  return {
    id: nextCarId++, x, y, angle, speed: 0,
    carClass, color, kind, // 'traffic' | 'parked' | 'police' | 'mission' | 'wreck'
    health: spec.health, wrecked: false, driverIn: false,
    cruise: 0, ai: null, smokeTimer: 0,
  };
}

const TRAFFIC_COLORS = ['#c94f38', '#e8e3d5', '#8fb8d8', '#d9a441', '#7fc4b5', '#5b6ee1', '#e0b184', '#9aa3ad'];
const TRAFFIC_CLASSES = ['sedan', 'sedan', 'coupe', 'coupe', 'van', 'sport'];

export function spawnParkedCars(city, rng) {
  const cars = [];
  for (const spot of city.parkedSpots) {
    const carClass = rng.pick(TRAFFIC_CLASSES);
    cars.push(makeCar(spot.x, spot.y, spot.angle, carClass, rng.pick(TRAFFIC_COLORS), 'parked'));
  }
  return cars;
}

// Traffic starts spread over the whole grid so the city is alive everywhere,
// then streams around the player as the world updates.
export function spawnTraffic(city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const vertical = rng.chance(0.5);
    const lineIdx = vertical ? rng.int(0, ROADS.avenues.length - 1) : rng.int(0, ROADS.streets.length - 1);
    const dir = rng.pick([-1, 1]);
    const along = vertical ? rng.range(120, 2150) : rng.range(120, 3400);
    const off = laneOffset(vertical, dir);
    const x = vertical ? ROADS.avenues[lineIdx] + off : along;
    const y = vertical ? along : ROADS.streets[lineIdx] + off;
    const carClass = rng.pick(TRAFFIC_CLASSES);
    const car = makeCar(x, y, headingFor(vertical, dir), carClass, rng.pick(TRAFFIC_COLORS), 'traffic');
    car.cruise = rng.range(105, 165);
    car.ai = { vertical, lineIdx, dir, junction: nextJunction(vertical, lineIdx, along, dir), turn: null };
    cars.push(car);
  }
  return cars;
}

function laneOffset(vertical, dir) {
  // Right-hand traffic: heading south keeps west, north keeps east,
  // east keeps south, west keeps north.
  if (vertical) return dir > 0 ? -ROADS.laneOffset : ROADS.laneOffset;
  return dir > 0 ? ROADS.laneOffset : -ROADS.laneOffset;
}

function headingFor(vertical, dir) {
  if (vertical) return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

function nextJunction(vertical, lineIdx, along, dir) {
  const lines = vertical ? ROADS.streets : ROADS.avenues;
  let best = null;
  for (const line of lines) {
    const d = (line - along) * dir;
    if (d > 30 && (best === null || d < best.d)) best = { line, d };
  }
  return best ? best.line : along + dir * 400;
}

function steerInput(car, targetX, targetY, throttle) {
  const want = angleTo(car.x, car.y, targetX, targetY);
  const delta = angleDelta(car.angle, want);
  return {
    up: throttle && Math.abs(delta) < 1.15,
    down: Math.abs(delta) >= 1.15 && car.speed > 40,
    left: delta < -0.06,
    right: delta > 0.06,
    handbrake: false,
  };
}

function carAhead(car, cars, gap) {
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  for (const other of cars) {
    if (other === car || other.wrecked) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * hx + dy * hy;
    if (ahead > 6 && ahead < gap && Math.abs(dx * -hy + dy * hx) < 21) return other;
  }
  return null;
}

// Drive one traffic car along its lane. fx.crash(car, hard) reports impacts.
export function updateTrafficCar(city, car, cars, dt, fx) {
  const ai = car.ai;
  const along = ai.vertical ? car.y : car.x;
  const junctionDist = (ai.junction - along) * ai.dir;

  if (!ai.turn && junctionDist < 110) {
    const r = Math.random();
    if (r < 0.34) {
      const turnDir = Math.random() < 0.5 ? 1 : -1;
      ai.turn = { vertical: !ai.vertical, dir: turnDir, line: ai.junction };
    }
  }

  let targetX;
  let targetY;
  if (ai.turn) {
    const off = laneOffset(ai.turn.vertical, ai.turn.dir);
    if (ai.turn.vertical) { targetX = ai.turn.line + off; targetY = car.y + ai.turn.dir * 200; }
    else { targetX = car.x + ai.turn.dir * 200; targetY = ai.turn.line + off; }
    if (junctionDist < 14) {
      // The turn is made: the junction line becomes the new road.
      const newAlong = ai.turn.vertical ? car.y : car.x;
      ai.lineIdx = ai.turn.vertical ? ROADS.avenues.indexOf(ai.junction) : ROADS.streets.indexOf(ai.junction);
      if (ai.lineIdx < 0) ai.lineIdx = 0;
      ai.vertical = ai.turn.vertical;
      ai.dir = ai.turn.dir;
      ai.junction = nextJunction(ai.vertical, ai.lineIdx, newAlong, ai.dir);
      ai.turn = null;
    }
  } else {
    const off = laneOffset(ai.vertical, ai.dir);
    if (ai.vertical) { targetX = ROADS.avenues[ai.lineIdx] + off; targetY = ai.junction + ai.dir * 220; }
    else { targetX = ai.junction + ai.dir * 220; targetY = ROADS.streets[ai.lineIdx] + off; }
    if (junctionDist < 20) ai.junction = nextJunction(ai.vertical, ai.lineIdx, along + ai.dir * 40, ai.dir);
  }

  const blocked = carAhead(car, cars, 62);
  const input = steerInput(car, targetX, targetY, !blocked && car.speed < car.cruise);
  if (blocked && car.speed > 6) input.down = true;
  driveCar(city, car, input, dt, fx);
}

// Pursuit: steer at the target, ram when close, back out when wedged.
export function updatePoliceCar(city, car, target, dt, fx) {
  if (!car.ai) car.ai = { stuck: 0, reverse: 0 };
  const ai = car.ai;
  const dist = distance(car.x, car.y, target.x, target.y);
  if (ai.reverse > 0) {
    ai.reverse -= dt;
    driveCar(city, car, { down: true, left: false, right: false }, dt, fx);
    return;
  }
  if (Math.abs(car.speed) < 9 && dist > 60) {
    ai.stuck += dt;
    if (ai.stuck > 1.1) { ai.reverse = 0.65; ai.stuck = 0; }
  } else {
    ai.stuck = 0;
  }
  const input = steerInput(car, target.x, target.y, true);
  if (dist < 46 && target.onFoot) { input.up = false; input.down = car.speed > 8; }
  driveCar(city, car, input, dt, fx);
}

// Shared driving: physics step, city collision, damage and crash reporting.
export function driveCar(city, car, input, dt, fx) {
  if (car.wrecked) return;
  const spec = CAR_CLASSES[car.carClass];
  const move = stepCar(car, input, spec, dt);
  const speedBefore = Math.abs(car.speed);
  const hit = moveCircle(city, car, 20, move.dx, move.dy);
  if (hit > 0.25 && speedBefore > 55) {
    const hard = speedBefore > 150;
    car.health -= hard ? 16 : 6;
    car.speed *= -0.22;
    if (fx && fx.crash) fx.crash(car, hard);
    if (car.health <= 0) car.wrecked = true;
  }
  car.sliding = move.sliding;
}

export function makePedestrian(x, y, rng) {
  return {
    x, y, angle: rng.range(0, Math.PI * 2), speed: 0,
    color: rng.pick(['#e07856', '#7fc4b5', '#d9a441', '#e8e3d5', '#8fb8d8', '#c94f38', '#a8c686']),
    state: 'stroll', targetX: x, targetY: y, wait: rng.range(0, 3),
    fleeX: 0, fleeY: 0, fleeTime: 0, phase: rng.range(0, 6),
  };
}

export function updatePedestrian(city, ped, danger, dt) {
  if (danger && danger.dist < 150) {
    ped.state = 'flee';
    ped.fleeX = ped.x - danger.x;
    ped.fleeY = ped.y - danger.y;
    ped.fleeTime = 1.6;
  }
  let tx = 0;
  let ty = 0;
  let speed = 0;
  if (ped.state === 'flee') {
    ped.fleeTime -= dt;
    const len = Math.hypot(ped.fleeX, ped.fleeY) || 1;
    tx = ped.fleeX / len;
    ty = ped.fleeY / len;
    speed = 168;
    if (ped.fleeTime <= 0) ped.state = 'stroll';
  } else if (ped.wait > 0) {
    ped.wait -= dt;
  } else {
    const dx = ped.targetX - ped.x;
    const dy = ped.targetY - ped.y;
    const d = Math.hypot(dx, dy);
    if (d < 14) {
      // Pick a new stroll target along a nearby pavement.
      const vertical = Math.random() < 0.5;
      const line = vertical ? ROADS.avenues[Math.floor(Math.random() * ROADS.avenues.length)] : ROADS.streets[Math.floor(Math.random() * ROADS.streets.length)];
      const side = Math.random() < 0.5 ? -1 : 1;
      const along = Math.random() * 2000 + 100;
      ped.targetX = vertical ? line + side * (ROADS.halfWidth + 8) : along;
      ped.targetY = vertical ? along : line + side * (ROADS.halfWidth + 8);
      ped.wait = Math.random() * 2.5;
    } else {
      tx = dx / d;
      ty = dy / d;
      speed = 62;
    }
  }
  if (speed > 0) {
    ped.angle = Math.atan2(ty, tx);
    moveCircle(city, ped, 9, tx * speed * dt, ty * speed * dt);
    ped.phase += dt * (speed > 100 ? 11 : 7);
  }
  ped.speed = speed;
}

export function makeGuard(x, y) {
  return {
    x, y, angle: 0, health: COMBAT.guardHealth, alive: true,
    fireTimer: Math.random() * 0.8 + 0.3, strafeDir: 1, strafeTimer: 2,
  };
}

// Guards close to mid-range, strafe, and fire on a timer when they can see
// the player. Returns true on the steps where the guard shoots.
export function updateGuard(city, guard, player, hasSight, dt) {
  if (!guard.alive) return false;
  const d = distance(guard.x, guard.y, player.x, player.y);
  guard.angle = angleTo(guard.x, guard.y, player.x, player.y);
  guard.strafeTimer -= dt;
  if (guard.strafeTimer <= 0) { guard.strafeDir *= -1; guard.strafeTimer = 1.4 + Math.random() * 1.6; }
  let mx = 0;
  let my = 0;
  const px = Math.cos(guard.angle);
  const py = Math.sin(guard.angle);
  if (d > 215) { mx = px; my = py; }
  else if (d < 105) { mx = -px; my = -py; }
  mx += -py * guard.strafeDir * 0.55;
  my += px * guard.strafeDir * 0.55;
  const len = Math.hypot(mx, my) || 1;
  moveCircle(city, guard, 10, (mx / len) * 56 * dt, (my / len) * 56 * dt);
  guard.fireTimer -= dt;
  if (guard.fireTimer <= 0 && d < COMBAT.guardRange && hasSight) {
    guard.fireTimer = COMBAT.guardFireSeconds * (0.8 + Math.random() * 0.5);
    return true;
  }
  if (guard.fireTimer <= 0) guard.fireTimer = 0.3;
  return false;
}
