// main.js — Verano Bay's game shell: owns the state, runs the loop, wires
// the pure systems together (city, physics, wanted, missions, saves), drives
// combat and the police response, works the camera, and stages the
// deterministic ?scene= set-ups the screenshots are taken from.

import { generateCity, LOCATIONS } from './city.js';
import { Rng } from './rng.js';
import { WORLD, ROADS, CAR_CLASSES, PLAYER, COMBAT } from './config.js';
import { MissionRunner } from './missions.js';
import { createWanted, addHeat, updateWanted, policeWanted, bustedFine, clearHeat } from './wanted.js';
import { createSave } from './save.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  makeCar, spawnParkedCars, spawnTraffic, updateTrafficCar, updatePoliceCar,
  makePedestrian, updatePedestrian, makeGuard, updateGuard, driveCar,
} from './entities.js';
import { moveCircle, lineOfSight, distance, angleTo, clamp } from './physics.js';
import { drawScene } from './render.js';
import { drawHUD, drawOverlay } from './hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

const input = createInput(canvas);
const audio = createAudio();
const save = createSave(window.localStorage);
const city = generateCity();
const rng = new Rng(WORLD.seed ^ 0x5eed);

const game = {
  mode: 'title',
  time: 0,
  city,
  player: { x: LOCATIONS.respawn.x, y: LOCATIONS.respawn.y - 60, angle: -Math.PI / 2, aim: 0, health: PLAYER.health, carId: 0 },
  cars: [],
  peds: [],
  guards: [],
  wanted: createWanted(),
  runner: new MissionRunner(),
  cash: 50,
  skids: [],
  particles: [],
  tracers: [],
  popups: [],
  camera: { x: LOCATIONS.respawn.x, y: LOCATIONS.respawn.y, shake: 0 },
  markedCars: new Set(),
  fireCooldown: 0,
  hurtFlash: 0,
  fine: 0,
  toast: '',
  toastUntil: 0,
  nextJobTimer: 0,
  objectiveOverride: null,
  crimePos: null,
  crimeUntil: 0,
  hasSave: false,
  saveTimer: 0,
  started: false,
};

game.cars.push(...spawnParkedCars(city, rng));
game.cars.push(...spawnTraffic(city, rng, 26));
for (let i = 0; i < 46; i++) {
  const vertical = rng.chance(0.5);
  const line = vertical ? rng.pick(ROADS.avenues) : rng.pick(ROADS.streets);
  const side = rng.pick([-1, 1]);
  const along = rng.range(80, 2100);
  const x = vertical ? line + side * (ROADS.halfWidth + 8) : along;
  const y = vertical ? along : line + side * (ROADS.halfWidth + 8);
  game.peds.push(makePedestrian(x, Math.min(y, WORLD.sandY - 30), rng));
}

const savedGame = save.read();
game.hasSave = !!savedGame;

function playerCar() {
  return game.cars.find(c => c.id === game.player.carId) || null;
}

function playerPos() {
  const car = playerCar();
  return car ? { x: car.x, y: car.y } : { x: game.player.x, y: game.player.y };
}

function addPopup(text, color = '#ffd34d', big = false) {
  game.popups.push({ text, color, big, y: canvas.height * 0.3, life: 0, maxLife: big ? 2.6 : 1.8 });
  if (game.popups.length > 4) game.popups.shift();
}

function addParticles(type, x, y, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (0.3 + Math.random() * 0.7) * speed;
    game.particles.push({
      type, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: type === 'smoke' ? 1.4 : 0.5, maxLife: type === 'smoke' ? 1.4 : 0.5,
      size: type === 'smoke' ? 9 + Math.random() * 8 : 3 + Math.random() * 3,
    });
  }
  if (game.particles.length > 420) game.particles.splice(0, game.particles.length - 420);
}

const crashFx = {
  crash(car, hard) {
    addParticles('spark', car.x, car.y, hard ? 10 : 5, 130);
    game.camera.shake = Math.min(14, game.camera.shake + (hard ? 8 : 3));
    audio.crash(hard);
    game.crimePos = { x: car.x, y: car.y };
    game.crimeUntil = game.time + 1.4;
    if (car === playerCar() || car.kind === 'police') {
      // Police and the player always notice a crash.
    }
  },
};

function witnessesNear(x, y, range) {
  for (const car of game.cars) if (car.kind === 'police' && distance(x, y, car.x, car.y) < range) return true;
  for (const ped of game.peds) if (distance(x, y, ped.x, ped.y) < range * 0.6) return true;
  return false;
}

// --- story wiring ----------------------------------------------------------

function startNextJob() {
  const mission = game.runner.startNext();
  if (!mission) return;
  addPopup(mission.title.toUpperCase(), '#ffd34d', true);
  game.toast = mission.intro;
  game.toastUntil = game.time + 8;
}

function handleMissionEvents(events) {
  for (const ev of events) {
    if (ev.type === 'spawnCar') {
      const car = makeCar(ev.spawn.x, ev.spawn.y, ev.spawn.angle, ev.spawn.carClass, ev.spawn.color, 'mission');
      car.health = 100000; // the job's car is the MacGuffin: it cannot be wrecked
      game.cars.push(car);
      game.runner.setTargetCar(car.id);
      game.markedCars.add(car.id);
    } else if (ev.type === 'spawnGuards') {
      game.guards = [];
      for (let i = 0; i < ev.count; i++) {
        const a = (i / ev.count) * Math.PI * 2 + 0.6;
        game.guards.push(makeGuard(ev.at.x + Math.cos(a) * 58, ev.at.y + Math.sin(a) * 58));
      }
      game.runner.setGuardsSpawned();
    } else if (ev.type === 'spawnWreckTargets') {
      const spots = [
        { x: ev.at.x - 45, y: ev.at.y - 40, angle: 0.25 },
        { x: ev.at.x + 55, y: ev.at.y + 45, angle: -0.3 },
      ];
      for (let i = 0; i < ev.count; i++) {
        const car = makeCar(spots[i].x, spots[i].y, spots[i].angle, 'sedan', '#4a4e55', 'wreck');
        game.cars.push(car);
        game.markedCars.add(car.id);
      }
    } else if (ev.type === 'crime') {
      addHeat(game.wanted, ev.heat);
    } else if (ev.type === 'stepComplete') {
      audio.pickup();
    } else if (ev.type === 'checkpoint') {
      addPopup(`CHECKPOINT ${ev.index}/${ev.total}`, '#7ed492');
      audio.checkpoint();
    } else if (ev.type === 'stepFailed') {
      addPopup('OUT OF TIME — GO AGAIN', '#ff6b5e');
      audio.alarm();
    } else if (ev.type === 'missionComplete') {
      game.cash += ev.reward;
      addPopup(`+$${ev.reward} — ${ev.mission.title.toUpperCase()} COMPLETE`, '#7ed492', true);
      audio.jingle();
      audio.cash();
      persist();
      if (game.runner.storyDone) {
        game.mode = 'story';
      } else {
        game.nextJobTimer = 2.2;
      }
    }
  }
}

function missionContext() {
  const pos = playerPos();
  const targetCar = game.cars.find(c => c.id === game.runner.targetCarId);
  return {
    x: pos.x, y: pos.y,
    inCarId: game.player.carId,
    stars: game.wanted.stars,
    guardsAlive: game.guards.filter(g => g.alive).length,
    wreckedMarked: game.cars.filter(c => c.kind === 'wreck' && c.wrecked).length,
    targetCarPos: targetCar ? { x: targetCar.x, y: targetCar.y } : null,
  };
}

function persist() {
  const pos = playerPos();
  save.write({ cash: game.cash, missionIndex: game.runner.completedCount(), x: pos.x, y: pos.y });
}

// --- player actions --------------------------------------------------------

function tryEnterExitCar() {
  const p = game.player;
  if (p.carId) {
    const car = playerCar();
    p.carId = 0;
    if (car) {
      car.driverIn = false;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
      moveCircle(city, p, PLAYER.radius, 0, 0);
    }
    audio.door();
    return;
  }
  let best = null;
  let bestDist = PLAYER.enterRange;
  for (const car of game.cars) {
    if (car.wrecked || car.kind === 'police') continue;
    const d = distance(p.x, p.y, car.x, car.y);
    if (d < bestDist) { best = car; bestDist = d; }
  }
  if (best) {
    p.carId = best.id;
    best.driverIn = true;
    audio.door();
    if (!best.stolen) {
      best.stolen = true;
      if (best.kind !== 'traffic' || witnessesNear(best.x, best.y, 320)) addHeat(game.wanted, 'stealCar');
      game.crimePos = { x: best.x, y: best.y };
      game.crimeUntil = game.time + 1.2;
    }
  }
}

function playerShoot(dt) {
  game.fireCooldown -= dt;
  const p = game.player;
  const firing = (input.mouseDown || input.down('KeyF')) && game.mode === 'play';
  if (!firing || game.fireCooldown > 0) return;
  game.fireCooldown = COMBAT.playerFireSeconds;
  const origin = playerPos();
  const fromX = p.carId ? origin.x : p.x;
  const fromY = p.carId ? origin.y : p.y;
  const aim = p.aim;
  let hitX = fromX + Math.cos(aim) * COMBAT.bulletRange;
  let hitY = fromY + Math.sin(aim) * COMBAT.bulletRange;
  let bestT = Infinity;
  let hitGuard = null;
  let hitCar = null;
  for (const guard of game.guards) {
    if (!guard.alive) continue;
    const dx = guard.x - fromX;
    const dy = guard.y - fromY;
    const t = dx * Math.cos(aim) + dy * Math.sin(aim);
    if (t < 0 || t > COMBAT.bulletRange) continue;
    const perp = Math.abs(-dx * Math.sin(aim) + dy * Math.cos(aim));
    if (perp < 15 && t < bestT && lineOfSight(city, fromX, fromY, guard.x, guard.y)) {
      bestT = t; hitGuard = guard; hitCar = null;
      hitX = guard.x; hitY = guard.y;
    }
  }
  for (const car of game.cars) {
    if (car.wrecked || car.id === p.carId) continue;
    const dx = car.x - fromX;
    const dy = car.y - fromY;
    const t = dx * Math.cos(aim) + dy * Math.sin(aim);
    if (t < 0 || t > COMBAT.bulletRange) continue;
    const perp = Math.abs(-dx * Math.sin(aim) + dy * Math.cos(aim));
    if (perp < 26 && t < bestT) {
      bestT = t; hitCar = car; hitGuard = null;
      hitX = car.x; hitY = car.y;
    }
  }
  game.tracers.push({ x0: fromX, y0: fromY, x1: hitX, y1: hitY, life: 0.09, maxLife: 0.09 });
  addParticles('flash', fromX + Math.cos(aim) * 22, fromY + Math.sin(aim) * 22, 1, 10);
  audio.shot();
  game.crimePos = { x: fromX, y: fromY };
  game.crimeUntil = game.time + 1.2;
  if (witnessesNear(fromX, fromY, 300)) addHeat(game.wanted, 'shotFired');
  if (hitGuard) {
    hitGuard.health -= COMBAT.playerDamage;
    addParticles('spark', hitGuard.x, hitGuard.y, 4, 90);
    if (hitGuard.health <= 0 && hitGuard.alive) {
      hitGuard.alive = false;
      addHeat(game.wanted, 'guardDown');
    }
  } else if (hitCar) {
    hitCar.health -= COMBAT.playerDamage;
    addParticles('spark', hitCar.x, hitCar.y, 5, 110);
    if (hitCar.health <= 0 && !hitCar.wrecked) {
      hitCar.wrecked = true;
      addParticles('smoke', hitCar.x, hitCar.y, 8, 40);
      if (witnessesNear(hitCar.x, hitCar.y, 340)) addHeat(game.wanted, 'wreckCar');
    }
  }
}

// --- the update --------------------------------------------------------------

function update(dt) {
  game.time += dt;
  const p = game.player;
  const car = playerCar();
  const pos = playerPos();

  // Aim from the mouse.
  const worldMouseX = game.camera.x + (input.mouseX - canvas.width / 2);
  const worldMouseY = game.camera.y + (input.mouseY - canvas.height / 2);
  p.aim = angleTo(pos.x, pos.y, worldMouseX, worldMouseY);

  if (car) {
    const driveInput = input.driving();
    car.braking = driveInput.down && car.speed > 12;
    driveCar(city, car, driveInput, dt, crashFx);
    if (car.wrecked) {
      p.carId = 0;
      car.driverIn = false;
      p.x = car.x + 34;
      p.y = car.y;
      addPopup('YOUR RIDE IS WRECKED', '#ff6b5e');
    }
    if (car.sliding && Math.abs(car.speed) > 90) laySkid(car);
    if (groundIsSand(car.x, car.y) && Math.abs(car.speed) > 120 && Math.random() < 0.4) {
      addParticles('dust', car.x, car.y, 1, 30);
    }
  } else {
    const v = input.walkVector();
    const speed = input.sprint() ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    if (v.x !== 0 || v.y !== 0) {
      p.angle = Math.atan2(v.y, v.x);
      moveCircle(city, p, PLAYER.radius, v.x * speed * dt, v.y * speed * dt);
    }
  }

  if (input.tap('KeyE')) tryEnterExitCar();
  playerShoot(dt);

  // Ambient traffic and pedestrians.
  for (const c of game.cars) {
    if (c.kind === 'traffic' && c.id !== game.player.carId) updateTrafficCar(city, c, game.cars, dt, crashFx);
  }
  const danger = game.time < game.crimeUntil && game.crimePos
    ? { x: game.crimePos.x, y: game.crimePos.y, dist: 0 }
    : null;
  for (const ped of game.peds) {
    if (ped.state === 'down' || ped.state === 'dead') continue;
    const d = danger ? { ...danger, dist: distance(ped.x, ped.y, danger.x, danger.y) } : null;
    updatePedestrian(city, ped, d, dt);
  }

  updatePolice(dt);
  updateGuards(dt);
  collideCars(dt);
  collidePeds();

  // Wanted bookkeeping.
  const police = game.cars.filter(c => c.kind === 'police');
  const seen = police.some(c => distance(c.x, c.y, pos.x, pos.y) < 430 && lineOfSight(city, c.x, c.y, pos.x, pos.y));
  const mySpeed = car ? Math.abs(car.speed) : 0;
  const pinned = police.some(c => distance(c.x, c.y, pos.x, pos.y) < 64) && (!car || mySpeed < 26);
  const verdict = updateWanted(game.wanted, dt, { seen, pinned });
  if (verdict === 'busted') return doBusted();

  // Story.
  const events = game.runner.update(dt, missionContext());
  handleMissionEvents(events);
  if (game.nextJobTimer > 0) {
    game.nextJobTimer -= dt;
    if (game.nextJobTimer <= 0) startNextJob();
  }

  // Smoke from hurt cars, fading effects.
  for (const c of game.cars) {
    const spec = CAR_CLASSES[c.carClass];
    if (!c.wrecked && c.health < spec.health * 0.35) {
      c.smokeTimer -= dt;
      if (c.smokeTimer <= 0) { c.smokeTimer = 0.14; addParticles('smoke', c.x, c.y, 1, 16); }
    }
    if (c.wrecked && Math.random() < 0.05) addParticles('smoke', c.x, c.y, 1, 14);
  }
  updateFx(dt);

  // Camera: velocity lookahead in a car, a gentle lead on foot, plus shake.
  const lead = car ? clamp(Math.abs(car.speed) * 0.42, 0, 190) : 26;
  const leadX = car ? Math.cos(car.angle) * lead * Math.sign(car.speed || 1) : Math.cos(p.aim) * lead;
  const leadY = car ? Math.sin(car.angle) * lead * Math.sign(car.speed || 1) : Math.sin(p.aim) * lead;
  const tx = clamp(pos.x + leadX, canvas.width / 2 - 60, WORLD.width - canvas.width / 2 + 60);
  const ty = clamp(pos.y + leadY, canvas.height / 2 - 60, WORLD.height - canvas.height / 2 + 60);
  const k = 1 - Math.exp(-dt * 3.6);
  game.camera.x += (tx - game.camera.x) * k;
  game.camera.y += (ty - game.camera.y) * k;
  game.camera.shake = Math.max(0, game.camera.shake - dt * 26);

  // Audio beds.
  audio.engine(!!car, car ? Math.abs(car.speed) / CAR_CLASSES[car.carClass].topSpeed : 0, !!(car && input.driving().up));
  const nearestPolice = police.length ? Math.min(...police.map(c => distance(c.x, c.y, pos.x, pos.y))) : 9999;
  audio.siren(game.wanted.stars > 0 && nearestPolice < 700, clamp(nearestPolice / 700, 0, 1));

  game.hurtFlash = Math.max(0, game.hurtFlash - dt * 2.2);
  game.saveTimer -= dt;
  if (game.saveTimer <= 0) { game.saveTimer = 20; persist(); }

  if (p.health <= 0) doWasted();
}

function groundIsSand(x, y) {
  return y >= WORLD.sandY && y < WORLD.waterY;
}

function laySkid(car) {
  const backX = car.x - Math.cos(car.angle) * 16;
  const backY = car.y - Math.sin(car.angle) * 16;
  const sideX = Math.cos(car.angle + Math.PI / 2) * 9;
  const sideY = Math.sin(car.angle + Math.PI / 2) * 9;
  for (const s of [-1, 1]) {
    game.skids.push({ x: backX + sideX * s, y: backY + sideY * s, angle: car.angle, len: Math.abs(car.speed) * 0.033 + 6, alpha: 0.75 });
  }
  if (game.skids.length > 500) game.skids.splice(0, game.skids.length - 500);
}

function updateFx(dt) {
  for (const s of game.skids) s.alpha -= dt * 0.02;
  game.skids = game.skids.filter(s => s.alpha > 0.05);
  for (const pt of game.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    if (pt.type === 'smoke') pt.y -= 14 * dt;
  }
  game.particles = game.particles.filter(pt => pt.life > 0);
  for (const t of game.tracers) t.life -= dt;
  game.tracers = game.tracers.filter(t => t.life > 0);
  for (const pop of game.popups) {
    pop.life += dt;
    pop.y -= dt * 26;
  }
  game.popups = game.popups.filter(pop => pop.life < pop.maxLife);
}

function updatePolice(dt) {
  const want = policeWanted(game.wanted);
  const police = game.cars.filter(c => c.kind === 'police');
  const pos = playerPos();
  if (police.length < want) {
    // New patrols join from a road a few blocks away.
    const a = Math.random() * Math.PI * 2;
    const sx = clamp(pos.x + Math.cos(a) * 560, 80, WORLD.width - 80);
    const sy = clamp(pos.y + Math.sin(a) * 560, 80, WORLD.sandY - 60);
    const snapped = snapToRoad(sx, sy);
    const car = makeCar(snapped.x, snapped.y, angleTo(snapped.x, snapped.y, pos.x, pos.y), 'police', '#f5f5f5', 'police');
    game.cars.push(car);
  } else if (police.length > want) {
    const far = police.find(c => distance(c.x, c.y, pos.x, pos.y) > 500);
    if (far) game.cars.splice(game.cars.indexOf(far), 1);
  }
  for (const c of game.cars) {
    if (c.kind !== 'police') continue;
    const target = { x: pos.x, y: pos.y, onFoot: !game.player.carId };
    updatePoliceCar(city, c, target, dt, crashFx);
    c.braking = Math.abs(c.speed) < 4;
  }
}

function snapToRoad(x, y) {
  let bestX = x;
  let bestD = Infinity;
  for (const ax of ROADS.avenues) { const d = Math.abs(ax - x); if (d < bestD) { bestD = d; bestX = ax; } }
  let bestY = y;
  bestD = Infinity;
  for (const sy of ROADS.streets) { const d = Math.abs(sy - y); if (d < bestD) { bestD = d; bestY = sy; } }
  return Math.abs(bestX - x) < Math.abs(bestY - y) ? { x: bestX, y } : { x, y: bestY };
}

function updateGuards(dt) {
  const pos = playerPos();
  for (const guard of game.guards) {
    if (!guard.alive) continue;
    const sight = lineOfSight(city, guard.x, guard.y, pos.x, pos.y);
    const fired = updateGuard(city, guard, pos, sight, dt);
    if (fired) {
      audio.guardShot();
      const d = distance(guard.x, guard.y, pos.x, pos.y);
      const hitChance = clamp(0.66 - d / 850, 0.16, 0.62);
      const hit = Math.random() < hitChance;
      const endX = hit ? pos.x : pos.x + (Math.random() - 0.5) * 90;
      const endY = hit ? pos.y : pos.y + (Math.random() - 0.5) * 90;
      game.tracers.push({ x0: guard.x, y0: guard.y, x1: endX, y1: endY, life: 0.09, maxLife: 0.09 });
      if (hit) {
        const car = playerCar();
        if (car) {
          car.health -= COMBAT.guardDamage * 1.4;
          game.player.health -= COMBAT.guardDamage * 0.35;
          if (car.health <= 0 && !car.wrecked) car.wrecked = true;
        } else {
          game.player.health -= COMBAT.guardDamage;
        }
        game.hurtFlash = 1;
        addParticles('spark', pos.x, pos.y, 3, 80);
      }
    }
  }
}

function collideCars(dt) {
  const pos = playerPos();
  const near = game.cars.filter(c => !c.wrecked && distance(c.x, c.y, pos.x, pos.y) < 150);
  for (let i = 0; i < near.length; i++) {
    for (let j = i + 1; j < near.length; j++) {
      const a = near[i];
      const b = near[j];
      const d = distance(a.x, a.y, b.x, b.y);
      const min = 40;
      if (d <= 0.01 || d >= min) continue;
      const relSpeed = Math.abs(a.speed) + Math.abs(b.speed);
      const nx = (b.x - a.x) / d;
      const ny = (b.y - a.y) / d;
      const push = (min - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      if (relSpeed > 90) {
        const hard = relSpeed > 210;
        a.health -= hard ? 13 : 5;
        b.health -= hard ? 13 : 5;
        if (a.health <= 0) a.wrecked = true;
        if (b.health <= 0) b.wrecked = true;
        crashFx.crash(relSpeed > 0 && Math.abs(a.speed) > Math.abs(b.speed) ? a : b, hard);
        if ((a === playerCar() || b === playerCar()) && witnessesNear(pos.x, pos.y, 380)) {
          addHeat(game.wanted, 'hitCar');
        }
        a.speed *= 0.45;
        b.speed *= 0.45;
      } else {
        a.speed *= 0.8;
        b.speed *= 0.8;
      }
      void dt;
    }
  }
}

function collidePeds() {
  for (const car of game.cars) {
    if (car.wrecked || Math.abs(car.speed) < 55) continue;
    for (const ped of game.peds) {
      if (ped.state === 'down' || ped.state === 'dead') continue;
      if (distance(car.x, car.y, ped.x, ped.y) < 24) {
        const fatal = Math.abs(car.speed) > 175;
        ped.state = fatal ? 'dead' : 'down';
        ped.downTime = fatal ? 9999 : 3;
        addParticles('dust', ped.x, ped.y, 6, 60);
        if (car === playerCar() && witnessesNear(ped.x, ped.y, 380)) addHeat(game.wanted, 'hitPedestrian');
        game.crimePos = { x: ped.x, y: ped.y };
        game.crimeUntil = game.time + 1.4;
      }
    }
  }
  for (const ped of game.peds) {
    if (ped.state === 'down') {
      ped.downTime -= 1 / 60;
      if (ped.downTime <= 0) ped.state = 'stroll';
    }
  }
}

function doBusted() {
  const fine = Math.min(game.cash, bustedFine(game.wanted.stars));
  game.fine = fine;
  game.cash -= fine;
  clearHeat(game.wanted);
  game.cars = game.cars.filter(c => c.kind !== 'police');
  exitToStreet();
  game.mode = 'busted';
  persist();
}

function doWasted() {
  const fee = Math.min(game.cash, 90);
  game.fine = fee;
  game.cash -= fee;
  game.player.health = PLAYER.health;
  clearHeat(game.wanted);
  game.cars = game.cars.filter(c => c.kind !== 'police');
  game.guards = [];
  exitToStreet();
  game.mode = 'wasted';
  persist();
}

function exitToStreet() {
  const p = game.player;
  if (p.carId) {
    const car = playerCar();
    if (car) car.driverIn = false;
    p.carId = 0;
  }
  p.x = LOCATIONS.respawn.x;
  p.y = LOCATIONS.respawn.y - 60;
  p.health = PLAYER.health;
  game.camera.x = p.x;
  game.camera.y = p.y;
}

// --- rendering ---------------------------------------------------------------

function currentTarget() {
  if (game.objectiveOverride) return null;
  const step = game.runner.step;
  if (!step) return null;
  return game.runner.targetPoint(missionContext());
}

function render() {
  const pos = playerPos();
  const shakeX = game.camera.shake ? (Math.random() - 0.5) * game.camera.shake : 0;
  const shakeY = game.camera.shake ? (Math.random() - 0.5) * game.camera.shake : 0;
  const step = game.runner.step;
  const target = currentTarget();
  const checkpoint = step && step.type === 'checkpoints' ? step.points[game.runner.checkpointIndex] : null;
  const pickup = step && step.type === 'pickup' ? target : (game.stagedPickup || null);
  drawScene(ctx, {
    city,
    camX: game.camera.x + shakeX,
    camY: game.camera.y + shakeY,
    w: canvas.width,
    h: canvas.height,
    time: game.time,
    cars: game.cars,
    peds: game.peds.filter(ped => ped.state !== 'dead'),
    guards: game.guards,
    player: game.player.carId ? null : { x: game.player.x, y: game.player.y, aim: game.player.aim },
    skids: game.skids,
    particles: game.particles,
    tracers: game.tracers,
    target: checkpoint ? null : target,
    checkpoint,
    pickup,
    markedCarIds: game.markedCars,
  });

  const inCar = !!game.player.carId;
  const objective = game.objectiveOverride || (step ? game.runner.objectiveText() : (game.runner.storyDone ? 'Free roam — the bay is yours' : ''));
  drawHUD(ctx, {
    w: canvas.width,
    h: canvas.height,
    state: {
      cash: game.cash,
      health: game.player.health,
      inCar,
      stars: game.wanted.stars,
      objective,
      missionTitle: game.runner.mission ? `${game.runner.mission.title}` : null,
      timeLeft: step && step.time ? game.runner.timeLeft : null,
      timeTotal: step && step.time ? step.time : null,
      playerX: pos.x,
      playerY: pos.y,
      playerAngle: game.player.carId ? (playerCar()?.angle ?? 0) : game.player.angle,
      mapCars: game.cars,
      mapGuards: game.guards,
      target,
      bustedMeter: game.wanted.bustedMeter,
      popups: game.popups,
      hurtFlash: game.hurtFlash,
      hint: hintText(),
    },
  });

  if (game.toast && game.time < game.toastUntil && game.mode === 'play') drawToast();
  drawEdgeArrow(target);

  if (game.mode !== 'play') {
    drawOverlay(ctx, {
      w: canvas.width, h: canvas.height,
      kind: game.mode,
      state: { hasSave: game.hasSave, fine: game.fine },
    });
  }
  status.textContent = objective || 'Verano Bay';
}

function hintText() {
  if (game.mode !== 'play') return '';
  const p = game.player;
  if (p.carId) return '';
  for (const car of game.cars) {
    if (!car.wrecked && car.kind !== 'police' && distance(p.x, p.y, car.x, car.y) < PLAYER.enterRange) {
      return `E — take the ${CAR_CLASSES[car.carClass].label.toLowerCase()}`;
    }
  }
  return '';
}

function drawToast() {
  const text = game.toast;
  ctx.save();
  ctx.font = '600 14px system-ui, sans-serif';
  const maxW = Math.min(620, canvas.width - 80);
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxW && line) { lines.push(line); line = word; }
    else line = trial;
  }
  if (line) lines.push(line);
  const boxH = lines.length * 20 + 18;
  const boxY = 108;
  ctx.fillStyle = 'rgba(16,20,26,0.66)';
  ctx.beginPath();
  ctx.roundRect((canvas.width - maxW - 36) / 2, boxY, maxW + 36, boxH, 10);
  ctx.fill();
  ctx.fillStyle = '#f5f0e6';
  ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, boxY + 12 + i * 20));
  ctx.restore();
}

function drawEdgeArrow(target) {
  if (!target || game.mode !== 'play') return;
  const pos = playerPos();
  const dx = target.x - game.camera.x;
  const dy = target.y - game.camera.y;
  if (Math.abs(dx) < canvas.width / 2 - 40 && Math.abs(dy) < canvas.height / 2 - 40) return;
  const a = Math.atan2(dy, dx);
  const ex = canvas.width / 2 + Math.cos(a) * (canvas.width / 2 - 44);
  const ey = canvas.height / 2 + Math.sin(a) * (canvas.height / 2 - 44);
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(a);
  ctx.fillStyle = '#ffb300';
  ctx.beginPath();
  ctx.moveTo(16, 0); ctx.lineTo(-10, -10); ctx.lineTo(-10, 10);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  void pos;
}

// --- scene staging for screenshots -------------------------------------------

function stageScene(name) {
  const p = game.player;
  if (name === 'cover') {
    const car = makeCar(1150, 2250, 0, 'coupe', '#2fb3a6', 'traffic');
    car.speed = 185;
    car.driverIn = true;
    car.stolen = true;
    game.cars.push(car);
    p.carId = car.id;
    game.camera.x = car.x + 60;
    game.camera.y = car.y;
    startNextJob();
  } else if (name === 'chase') {
    const car = makeCar(1560, 1080, 0, 'sport', '#e5484d', 'traffic');
    car.speed = 250;
    car.driverIn = true;
    car.stolen = true;
    game.cars.push(car);
    p.carId = car.id;
    addHeat(game.wanted, 60);
    const spots = [[1352, 1058, 0.15], [1300, 1112, -0.1], [1212, 986, 1.45]];
    for (const [sx, sy, sa] of spots) {
      const cop = makeCar(sx, sy, sa, 'police', '#f5f5f5', 'police');
      cop.speed = 190;
      game.cars.push(cop);
    }
    for (let i = 0; i < 7; i++) {
      game.skids.push({ x: 1560 - i * 26, y: 1080 + Math.sin(i * 0.7) * 7, angle: 0.1, len: 24, alpha: 0.8 });
    }
    game.objectiveOverride = 'Lose the police';
    game.camera.x = car.x + 40;
    game.camera.y = car.y;
  } else if (name === 'fight') {
    p.x = 1425;
    p.y = 1310;
    p.health = 72;
    p.aim = -0.5;
    game.guards = [makeGuard(1505, 1245), makeGuard(1350, 1215)];
    game.guards[0].angle = Math.atan2(p.y - 1245, p.x - 1505);
    game.guards[1].angle = Math.atan2(p.y - 1215, p.x - 1350);
    game.stagedPickup = { x: 1560, y: 1395 };
    game.objectiveOverride = 'Drop the Syndicate guards — 2 left';
    game.camera.x = p.x;
    game.camera.y = p.y;
  } else if (name === 'race') {
    game.runner.restore(6);
    startNextJob();
    game.runner.checkpointIndex = 2;
    const car = makeCar(1480, 2250, 0, 'coupe', '#d9a441', 'traffic');
    car.speed = 230;
    car.driverIn = true;
    car.stolen = true;
    game.cars.push(car);
    p.carId = car.id;
    game.camera.x = car.x + 70;
    game.camera.y = car.y;
  }
  // Settle the staged world for a moment so the traffic breathes, then
  // freeze the composition: the renderer keeps animating water, sirens and
  // markers from game.time while the actors hold their poses.
  for (let i = 0; i < 24; i++) stepWorld(1 / 30, true);
  game.popups.length = 0; // the stills carry the banner and toast, not the title splash
  game.mode = 'play';
  game.started = true;
  game.frozen = true;
}

function stepWorld(dt, staging = false) {
  if (game.mode === 'play') update(dt);
  else if (staging) {
    game.time += dt;
    for (const c of game.cars) if (c.kind === 'traffic' && !c.driverIn) updateTrafficCar(city, c, game.cars, dt, crashFx);
    updateFx(dt);
  }
}

// --- boot and loop -------------------------------------------------------------

const params = new URLSearchParams(window.location.search);
const scene = params.get('scene');
if (scene) stageScene(scene);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.frozen) {
    // Screenshot staging: hold the composition, keep the light alive.
    game.time += dt;
    updateFx(dt);
    render();
    input.endFrame();
    requestAnimationFrame(frame);
    return;
  }
  if (game.mode === 'play') {
    update(dt);
  } else {
    game.time += dt;
    updateFx(dt);
    if (input.tap('Enter') || input.tap('NumpadEnter')) {
      audio.unlock();
      if (game.mode === 'title') {
        if (savedGame && !params.get('scene')) {
          game.cash = savedGame.cash;
          game.runner.restore(savedGame.missionIndex);
          game.player.x = savedGame.x;
          game.player.y = savedGame.y;
          game.camera.x = savedGame.x;
          game.camera.y = savedGame.y;
        }
        game.mode = 'play';
        game.started = true;
        if (!game.runner.mission && !game.runner.storyDone) startNextJob();
      } else if (game.mode === 'busted' || game.mode === 'wasted' || game.mode === 'story') {
        game.mode = 'play';
      }
    }
    if (game.mode === 'title' && input.tap('KeyN')) {
      save.clear();
      game.hasSave = false;
      game.cash = 50;
      game.runner.restore(0);
      game.mode = 'play';
      game.started = true;
      startNextJob();
    }
  }
  if (game.mode === 'play' && (input.tap('KeyP') || input.tap('Escape'))) game.mode = 'pause';
  else if (game.mode === 'pause' && (input.tap('KeyP') || input.tap('Escape'))) game.mode = 'play';
  if (input.tap('KeyM')) audio.toggleMute();
  render();
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
