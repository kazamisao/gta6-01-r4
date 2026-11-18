// physics.js — movement and collision for Verano Bay, kept pure so the tests
// can drive cars and walkers headlessly. Cars are arcade bodies: a heading, a
// signed speed, pedal logic where the brake pedal only becomes reverse once
// the car has stopped, and steering that bites in proportion to speed.

import { WORLD } from './config.js';
import { collidersNear, isPier } from './city.js';

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function distance(x0, y0, x1, y1) {
  return Math.hypot(x1 - x0, y1 - y0);
}

export function angleTo(x0, y0, x1, y1) {
  return Math.atan2(y1 - y0, x1 - x0);
}

// Shortest signed turn from one heading to another, in [-PI, PI].
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// Push a circle out of a rect; returns the penetration depth it resolved, or
// 0 when the circle was already clear. Mutates pos {x, y}.
export function resolveCircleRect(pos, radius, rect) {
  const nx = clamp(pos.x, rect.x, rect.x + rect.w);
  const ny = clamp(pos.y, rect.y, rect.y + rect.h);
  const dx = pos.x - nx;
  const dy = pos.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 > radius * radius) return 0;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    pos.x = nx + (dx / d) * radius;
    pos.y = ny + (dy / d) * radius;
    return radius - d;
  }
  // Centre inside the rect: leave by the nearest face.
  const left = pos.x - rect.x;
  const right = rect.x + rect.w - pos.x;
  const top = pos.y - rect.y;
  const bottom = rect.y + rect.h - pos.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) pos.x = rect.x - radius;
  else if (m === right) pos.x = rect.x + rect.w + radius;
  else if (m === top) pos.y = rect.y - radius;
  else pos.y = rect.y + rect.h + radius;
  return radius + m;
}

// Move a circle by (dx, dy) through the city: building and stall collision,
// the world edge, and the waterline (the pier deck is walkable). Returns how
// hard the move hit something, 0 for a clean move.
export function moveCircle(city, pos, radius, dx, dy) {
  pos.x += dx;
  pos.y += dy;
  let hit = 0;
  for (const rect of collidersNear(city, pos.x, pos.y, radius + 2)) {
    const depth = resolveCircleRect(pos, radius, rect);
    if (depth > 0) hit = Math.max(hit, Math.min(1, depth / radius));
  }
  if (pos.x < radius) { pos.x = radius; hit = Math.max(hit, 0.5); }
  if (pos.y < radius) { pos.y = radius; hit = Math.max(hit, 0.5); }
  if (pos.x > WORLD.width - radius) { pos.x = WORLD.width - radius; hit = Math.max(hit, 0.5); }
  const southLimit = isPier(pos.x, pos.y) ? WORLD.waterY + 96 : WORLD.waterY - 6;
  if (pos.y > southLimit - radius) { pos.y = southLimit - radius; hit = Math.max(hit, 0.5); }
  if (pos.y > WORLD.height - radius) pos.y = WORLD.height - radius;
  return hit;
}

// One arcade step for a car body {x, y, angle, speed}.
// input: {up, down, left, right, handbrake} booleans; spec from CAR_CLASSES.
// Returns {sliding} so the caller can lay skid marks and smoke.
export function stepCar(car, input, spec, dt) {
  const speedRatio = Math.abs(car.speed) / spec.topSpeed;
  if (input.up) {
    car.speed += spec.accel * dt * (car.speed < 0 ? 2.2 : 1);
  } else if (input.down) {
    if (car.speed > 12) {
      car.speed -= spec.brake * dt; // the pedal is a brake while rolling forward
    } else {
      car.speed -= spec.accel * 0.55 * dt; // and only then a reverse gear
      if (car.speed < -spec.reverseSpeed) car.speed = -spec.reverseSpeed;
    }
  } else {
    // Engine drag and rolling resistance.
    car.speed -= car.speed * 0.55 * dt;
    if (Math.abs(car.speed) < 2) car.speed = 0;
  }
  if (car.speed > spec.topSpeed) car.speed = spec.topSpeed;

  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const bite = clamp(Math.abs(car.speed) / 90, 0, 1);
  const slide = input.handbrake && Math.abs(car.speed) > 120;
  if (steer !== 0 && car.speed !== 0) {
    const dir = car.speed > 0 ? 1 : -1;
    car.angle += steer * spec.grip * bite * dir * dt * (slide ? 1.55 : 1);
  }
  if (input.handbrake) car.speed -= car.speed * 1.15 * dt;

  const dx = Math.cos(car.angle) * car.speed * dt;
  const dy = Math.sin(car.angle) * car.speed * dt;
  return { dx, dy, sliding: slide || (steer !== 0 && speedRatio > 0.72 && bite >= 1) };
}

// Can point B be seen from point A? Buildings block the view; sampled along
// the line, which is plenty for a top-down street grid.
export function lineOfSight(city, x0, y0, x1, y1) {
  const d = distance(x0, y0, x1, y1);
  const steps = Math.max(1, Math.floor(d / 26));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    for (const rect of collidersNear(city, x, y, 2)) {
      if (rect.h > 24 && pointInRect(x, y, rect)) return false; // stalls are low; buildings block
    }
  }
  return true;
}
