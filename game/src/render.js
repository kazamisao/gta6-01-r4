// render.js — Verano Bay drawn in canvas: sun-bleached ground, the boulevard
// grid with its markings, buildings with one consistent shadow direction,
// palms, the beach and the animated sea, then every car, pedestrian, guard
// and the player, with skid marks, particles and objective markers on top.
// Everything is drawn in code; there are no image assets.

import { WORLD, ROADS, PALETTE } from './config.js';
import { districtAt } from './city.js';

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawScene(ctx, view) {
  const { city, camX, camY, w, h, time } = view;
  const left = camX - w / 2 - 90;
  const right = camX + w / 2 + 90;
  const top = camY - h / 2 - 90;
  const bottom = camY + h / 2 + 90;
  const inView = (x, y, pad = 0) => x > left - pad && x < right + pad && y > top - pad && y < bottom + pad;

  ctx.fillStyle = '#d9cda7';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2 - camX, h / 2 - camY);

  drawGround(ctx, city, left, right, top, bottom, time);
  drawRoads(ctx, left, right, top, bottom);
  drawLotsAndPlaza(ctx, city, inView);
  drawBuildings(ctx, city, inView);
  drawProps(ctx, city, inView, time);
  drawSkids(ctx, view.skids);
  drawMarkers(ctx, view, time);
  for (const ped of view.peds) if (inView(ped.x, ped.y)) drawPedestrian(ctx, ped, false);
  for (const car of view.cars) if (inView(car.x, car.y, 70)) drawCar(ctx, car, time, view.markedCarIds);
  for (const guard of view.guards) if (guard.alive && inView(guard.x, guard.y)) drawPedestrian(ctx, guard, true);
  if (view.player) drawPlayer(ctx, view.player, time);
  drawParticles(ctx, view.particles);
  drawTracers(ctx, view.tracers);

  ctx.restore();
}

function drawGround(ctx, city, left, right, top, bottom, time) {
  // Block ground: sun-bleached earth with a faint per-district warmth.
  ctx.fillStyle = '#d9cda7';
  ctx.fillRect(left, top, right - left, bottom - top);
  // Beach and sea to the south.
  if (bottom > WORLD.sandY) {
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(left, WORLD.sandY, right - left, WORLD.waterY - WORLD.sandY + 40);
    ctx.fillStyle = PALETTE.sandWet;
    ctx.fillRect(left, WORLD.waterY - 14, right - left, 16);
    const sea = ctx.createLinearGradient(0, WORLD.waterY, 0, WORLD.height);
    sea.addColorStop(0, '#35b6c9');
    sea.addColorStop(0.25, PALETTE.sea);
    sea.addColorStop(1, PALETTE.seaDeep);
    ctx.fillStyle = sea;
    ctx.fillRect(left, WORLD.waterY, right - left, WORLD.height - WORLD.waterY);
    // Animated foam along the waterline.
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = Math.max(left, 0); x <= Math.min(right, WORLD.width); x += 26) {
      const y = WORLD.waterY + 4 + Math.sin(time * 1.4 + x * 0.02) * 4;
      if (x === Math.max(left, 0)) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // The El Faro pier: wooden deck reaching into the water.
    ctx.fillStyle = '#9a7350';
    ctx.fillRect(WORLD.pierX - 52, ROADS.streets[ROADS.streets.length - 1], 104, WORLD.waterY + 96 - ROADS.streets[ROADS.streets.length - 1]);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = ROADS.streets[ROADS.streets.length - 1] + 12; y < WORLD.waterY + 90; y += 18) ctx.fillRect(WORLD.pierX - 52, y, 104, 3);
    // The lighthouse on its rock at the east end of the bay.
    ctx.fillStyle = '#5d6d7a';
    ctx.beginPath(); ctx.arc(3380, 2490, 40, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2ede2';
    ctx.beginPath(); ctx.arc(3380, 2490, 21, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PALETTE.danger;
    ctx.fillRect(3359, 2478, 42, 9);
    ctx.fillRect(3359, 2493, 42, 9);
  }
}

function drawRoads(ctx, left, right, top, bottom) {
  const roadTop = Math.max(top, 0);
  const roadBottom = Math.min(bottom, WORLD.waterY + 2);
  ctx.fillStyle = PALETTE.sidewalk;
  for (const ax of ROADS.avenues) {
    if (ax + 70 < left || ax - 70 > right) continue;
    ctx.fillRect(ax - ROADS.halfWidth - ROADS.sidewalk, roadTop, (ROADS.halfWidth + ROADS.sidewalk) * 2, roadBottom - roadTop);
  }
  for (const sy of ROADS.streets) {
    if (sy + 70 < top || sy - 70 > bottom) continue;
    ctx.fillRect(Math.max(left, 0), sy - ROADS.halfWidth - ROADS.sidewalk, Math.min(right, WORLD.width) - Math.max(left, 0), (ROADS.halfWidth + ROADS.sidewalk) * 2);
  }
  ctx.fillStyle = PALETTE.asphalt;
  for (const ax of ROADS.avenues) {
    if (ax + 60 < left || ax - 60 > right) continue;
    ctx.fillRect(ax - ROADS.halfWidth, roadTop, ROADS.halfWidth * 2, roadBottom - roadTop);
  }
  for (const sy of ROADS.streets) {
    if (sy + 60 < top || sy - 60 > bottom) continue;
    ctx.fillRect(Math.max(left, 0), sy - ROADS.halfWidth, Math.min(right, WORLD.width) - Math.max(left, 0), ROADS.halfWidth * 2);
  }
  // Centre dashes.
  ctx.fillStyle = PALETTE.laneMark;
  for (const ax of ROADS.avenues) {
    if (ax + 60 < left || ax - 60 > right) continue;
    for (let y = Math.floor(roadTop / 44) * 44; y < roadBottom; y += 44) {
      if (ROADS.streets.some(sy => Math.abs(y - sy) < 52)) continue;
      ctx.fillRect(ax - 2, y, 4, 24);
    }
  }
  for (const sy of ROADS.streets) {
    if (sy + 60 < top || sy - 60 > bottom) continue;
    for (let x = Math.floor(Math.max(left, 0) / 44) * 44; x < Math.min(right, WORLD.width); x += 44) {
      if (ROADS.avenues.some(ax => Math.abs(x - ax) < 52)) continue;
      ctx.fillRect(x, sy - 2, 24, 4);
    }
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(245,238,218,0.85)';
  for (const ax of ROADS.avenues) {
    for (const sy of ROADS.streets) {
      if (ax < left - 80 || ax > right + 80 || sy < top - 80 || sy > bottom + 80) continue;
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        ctx.fillRect(ax + i * 12 - 4, sy - ROADS.halfWidth - 13, 8, 11);
        ctx.fillRect(ax + i * 12 - 4, sy + ROADS.halfWidth + 2, 8, 11);
        ctx.fillRect(ax - ROADS.halfWidth - 13, sy + i * 12 - 4, 11, 8);
        ctx.fillRect(ax + ROADS.halfWidth + 2, sy + i * 12 - 4, 11, 8);
      }
    }
  }
}

function drawLotsAndPlaza(ctx, city, inView) {
  for (const lot of city.lots) {
    if (!inView(lot.x + lot.w / 2, lot.y + lot.h / 2, 300)) continue;
    ctx.fillStyle = '#4a4e55';
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = 'rgba(245,238,218,0.6)';
    ctx.lineWidth = 2;
    for (let x = lot.x + 26; x < lot.x + lot.w - 10; x += 44) {
      ctx.beginPath(); ctx.moveTo(x, lot.y + 16); ctx.lineTo(x, lot.y + 58); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, lot.y + lot.h - 58); ctx.lineTo(x, lot.y + lot.h - 16); ctx.stroke();
    }
  }
  // Mercado plaza paving.
  ctx.fillStyle = '#e3d3ac';
  ctx.fillRect(1265, 1145, 320, 260);
  ctx.fillStyle = 'rgba(201,79,56,0.16)';
  ctx.fillRect(1265, 1145, 320, 260);
}

function drawBuildings(ctx, city, inView) {
  for (const b of city.buildings) {
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
    ctx.fillStyle = PALETTE.buildingShadow;
    ctx.fillRect(b.x + 13, b.y + 17, b.w, b.h);
    ctx.fillStyle = shade(b.color, 0.72);
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    ctx.fillStyle = shade(b.color, 1.14);
    ctx.fillRect(b.x + 13, b.y + 13, b.w - 26, b.h - 26);
    if (b.floors >= 5) {
      ctx.fillStyle = 'rgba(70,60,50,0.35)';
      ctx.fillRect(b.x + b.w / 2 - 9, b.y + b.h / 2 - 9, 18, 18);
    }
  }
  for (const s of city.stalls) {
    ctx.fillStyle = PALETTE.buildingShadow;
    ctx.fillRect(s.x + 5, s.y + 7, s.w, s.h);
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 3; i++) ctx.fillRect(s.x + 4 + i * 11, s.y + 3, 6, s.h - 6);
  }
}

function drawProps(ctx, city, inView, time) {
  void time;
  for (const lamp of city.lamps) {
    if (!inView(lamp.x, lamp.y)) continue;
    ctx.fillStyle = '#6b7280';
    ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 3.4, 0, Math.PI * 2); ctx.fill();
  }
  for (const palm of city.palms) {
    if (!inView(palm.x, palm.y, 40)) continue;
    ctx.fillStyle = 'rgba(59,42,26,0.22)';
    ctx.beginPath(); ctx.ellipse(palm.x + 10 * palm.s, palm.y + 13 * palm.s, 17 * palm.s, 7 * palm.s, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PALETTE.palmTrunk;
    ctx.lineWidth = 3.4 * palm.s;
    ctx.beginPath(); ctx.moveTo(palm.x, palm.y); ctx.lineTo(palm.x + 3 * palm.s, palm.y - 5 * palm.s); ctx.stroke();
    ctx.strokeStyle = PALETTE.palmLeaf;
    ctx.lineWidth = 3 * palm.s;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + palm.x * 0.01;
      ctx.beginPath();
      ctx.moveTo(palm.x + 3 * palm.s, palm.y - 5 * palm.s);
      ctx.quadraticCurveTo(
        palm.x + 3 * palm.s + Math.cos(a) * 13 * palm.s, palm.y - 5 * palm.s + Math.sin(a) * 10 * palm.s - 4,
        palm.x + 3 * palm.s + Math.cos(a) * 19 * palm.s, palm.y - 5 * palm.s + Math.sin(a) * 15 * palm.s + 3,
      );
      ctx.stroke();
    }
  }
}

function drawSkids(ctx, skids) {
  ctx.fillStyle = 'rgba(24,22,20,0.5)';
  for (const s of skids) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.globalAlpha = s.alpha;
    ctx.fillRect(-s.len / 2, -2.1, s.len, 4.2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawMarkers(ctx, view, time) {
  const pulse = 1 + Math.sin(time * 5) * 0.12;
  if (view.checkpoint) {
    const p = view.checkpoint;
    ctx.strokeStyle = PALETTE.objective;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(p.x, p.y, 52 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,179,0,0.14)';
    ctx.beginPath(); ctx.arc(p.x, p.y, 52 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(p.x - 2, p.y - 74, 4, 74);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#f5f5f5' : '#2b2b2b';
      ctx.fillRect(p.x + 2 + i * 8, p.y - 74 + j * 8, 8, 8);
    }
  }
  if (view.target) {
    const t = view.target;
    ctx.strokeStyle = PALETTE.objective;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(t.x, t.y, 30 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,179,0,0.9)';
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - 58 - Math.sin(time * 5) * 5);
    ctx.lineTo(t.x - 11, t.y - 78 - Math.sin(time * 5) * 5);
    ctx.lineTo(t.x + 11, t.y - 78 - Math.sin(time * 5) * 5);
    ctx.closePath(); ctx.fill();
    const grad = ctx.createLinearGradient(0, t.y - 200, 0, t.y);
    grad.addColorStop(0, 'rgba(255,179,0,0)');
    grad.addColorStop(1, 'rgba(255,179,0,0.30)');
    ctx.fillStyle = grad;
    ctx.fillRect(t.x - 13, t.y - 200, 26, 200);
  }
  if (view.pickup) {
    const p = view.pickup;
    ctx.fillStyle = '#ffd34d';
    ctx.save();
    ctx.translate(p.x, p.y - 6 + Math.sin(time * 3.2) * 3);
    ctx.rotate(time * 1.8);
    ctx.fillRect(-8, -8, 16, 16);
    ctx.fillStyle = '#8a6d1f';
    ctx.fillRect(-8, -2.5, 16, 5);
    ctx.restore();
  }
}

export function drawCar(ctx, car, time, markedCarIds) {
  const spec = { coupe: [46, 24], sedan: [48, 25], sport: [45, 24], van: [56, 27], police: [48, 25] }[car.carClass];
  const [len, wid] = spec;
  ctx.save();
  ctx.translate(car.x, car.y);
  if (markedCarIds && markedCarIds.has(car.id)) {
    ctx.strokeStyle = PALETTE.objective;
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(0, 0, (len / 2 + 13) * (1 + Math.sin(time * 5) * 0.07), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.rotate(car.angle + (car.wrecked ? 0.35 : 0));
  ctx.fillStyle = 'rgba(59,42,26,0.30)';
  roundRect(ctx, -len / 2 + 5, -wid / 2 + 8, len, wid, 7); ctx.fill();
  const body = car.wrecked ? '#3a3a3a' : car.color;
  ctx.fillStyle = body;
  roundRect(ctx, -len / 2, -wid / 2, len, wid, 7); ctx.fill();
  if (car.kind === 'police') {
    ctx.fillStyle = '#f5f5f5';
    roundRect(ctx, -len / 4, -wid / 2, len / 2, wid, 5); ctx.fill();
    ctx.fillStyle = '#22242a';
    roundRect(ctx, -len / 2, -wid / 2, len / 4.4, wid, 6); ctx.fill();
    roundRect(ctx, len / 2 - len / 4.4, -wid / 2, len / 4.4, wid, 6); ctx.fill();
    const flash = Math.floor(time * 2.6) % 2 === 0;
    ctx.fillStyle = flash ? '#ff3b30' : '#3b82f6';
    ctx.fillRect(-9, -wid / 2 + 3, 8, 5);
    ctx.fillStyle = flash ? '#3b82f6' : '#ff3b30';
    ctx.fillRect(1, -wid / 2 + 3, 8, 5);
    ctx.fillStyle = flash ? 'rgba(255,59,48,0.22)' : 'rgba(59,130,246,0.22)';
    ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2); ctx.fill();
  }
  // Cabin and glass.
  ctx.fillStyle = 'rgba(24,32,40,0.88)';
  roundRect(ctx, -len * 0.08, -wid / 2 + 3.4, len * 0.34, wid - 6.8, 4); ctx.fill();
  ctx.fillStyle = 'rgba(140,200,225,0.5)';
  roundRect(ctx, len * 0.16, -wid / 2 + 4.4, len * 0.09, wid - 8.8, 3); ctx.fill();
  // Headlights and brake lights.
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(len / 2 - 3, -wid / 2 + 3, 3, 5);
  ctx.fillRect(len / 2 - 3, wid / 2 - 8, 3, 5);
  ctx.fillStyle = car.braking ? '#ff2d20' : 'rgba(255,45,32,0.45)';
  ctx.fillRect(-len / 2, -wid / 2 + 3, 3, 5);
  ctx.fillRect(-len / 2, wid / 2 - 8, 3, 5);
  if (car.driverIn) {
    ctx.fillStyle = 'rgba(20,20,20,0.85)';
    ctx.beginPath(); ctx.arc(-2, 0, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawPedestrian(ctx, ped, isGuard) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (isGuard) {
    // A red enemy chevron so a guard reads at a glance, even shrunk.
    ctx.fillStyle = PALETTE.danger;
    ctx.beginPath();
    ctx.moveTo(0, -19);
    ctx.lineTo(-6.5, -27);
    ctx.lineTo(6.5, -27);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(59,42,26,0.25)';
  ctx.beginPath(); ctx.ellipse(4, 6, 9, 5, 0.4, 0, Math.PI * 2); ctx.fill();
  const bob = ped.speed > 0 ? Math.sin(ped.phase || 0) * 1.6 : 0;
  ctx.fillStyle = isGuard ? '#7a3030' : ped.color;
  ctx.beginPath(); ctx.arc(0, bob * 0.3, isGuard ? 9 : 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath(); ctx.arc(0, bob * 0.3, 4.6, 0, Math.PI * 2); ctx.fill();
  if (isGuard) {
    ctx.strokeStyle = '#22242a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ped.angle) * 17, Math.sin(ped.angle) * 17);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer(ctx, player, time) {
  void time;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(0, 0, 14.5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(59,42,26,0.28)';
  ctx.beginPath(); ctx.ellipse(4, 6, 10, 5.5, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath(); ctx.arc(0, 0, 8.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath(); ctx.arc(0, 0, 4.8, 0, Math.PI * 2); ctx.fill();
  // The aim line: a short gun toward the mouse heading.
  ctx.strokeStyle = '#22242a';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(Math.cos(player.aim) * 6, Math.sin(player.aim) * 6);
  ctx.lineTo(Math.cos(player.aim) * 19, Math.sin(player.aim) * 19);
  ctx.stroke();
  ctx.restore();
}

function drawParticles(ctx, particles) {
  for (const p of particles) {
    const life01 = p.life / p.maxLife;
    if (p.type === 'smoke') {
      ctx.fillStyle = `rgba(70,70,70,${0.34 * life01})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - life01 * 0.6), 0, Math.PI * 2); ctx.fill();
    } else if (p.type === 'spark') {
      ctx.strokeStyle = `rgba(255,190,60,${life01})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
    } else if (p.type === 'dust') {
      ctx.fillStyle = `rgba(216,190,140,${0.4 * life01})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    } else if (p.type === 'flash') {
      ctx.fillStyle = `rgba(255,220,120,${life01})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * life01, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawTracers(ctx, tracers) {
  for (const t of tracers) {
    ctx.strokeStyle = `rgba(255,214,90,${t.life / t.maxLife})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(t.x0, t.y0); ctx.lineTo(t.x1, t.y1); ctx.stroke();
  }
}

export { districtAt };
