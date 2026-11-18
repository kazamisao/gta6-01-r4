// hud.js — everything painted over the world: health and cash, the wanted
// stars, the objective banner, the minimap, floating cash popups, the busted
// meter, damage vignette, and the title / pause / busted / wasted overlays.

import { WORLD, PALETTE } from './config.js';
import { districtAt } from './city.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function panel(ctx, x, y, w, h, alpha = 0.55) {
  ctx.fillStyle = `rgba(16,20,26,${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
}

export function drawHUD(ctx, view) {
  const { w, h, state } = view;
  const s = state;
  ctx.save();
  ctx.font = `600 15px ${FONT}`;
  ctx.textBaseline = 'top';

  // Health and cash, top-left.
  panel(ctx, 16, 16, 232, 64);
  ctx.fillStyle = '#f5f0e6';
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText(`$${s.cash.toLocaleString('en-US')}`, 30, 24);
  ctx.fillStyle = s.health > 30 ? '#7ed492' : PALETTE.danger;
  ctx.fillRect(30, 54, 190 * Math.max(0, s.health) / 100, 9);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(30, 54, 190, 9);
  ctx.font = `600 10.5px ${FONT}`;
  ctx.fillStyle = 'rgba(245,240,230,0.75)';
  ctx.fillText(s.inCar ? 'DRIVING — click/F shoot · E to get out' : 'ON FOOT — E to take a car · Shift to sprint', 30, 66);

  // Wanted stars, top-right.
  if (s.stars > 0) {
    ctx.font = `26px ${FONT}`;
    ctx.textAlign = 'right';
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < s.stars ? '#ffd34d' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', w - 26 - (4 - i) * 30, 14);
    }
    ctx.textAlign = 'left';
  }

  drawMinimap(ctx, view);

  // Objective banner, top-centre.
  if (s.objective) {
    const title = s.missionTitle || 'VERANO BAY';
    ctx.font = `700 12px ${FONT}`;
    const titleW = ctx.measureText(title).width;
    ctx.font = `600 15px ${FONT}`;
    const textW = ctx.measureText(s.objective).width;
    const bw = Math.max(titleW, textW) + 44;
    const bx = (w - bw) / 2;
    panel(ctx, bx, 16, bw, 52, 0.62);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.objective;
    ctx.font = `700 12px ${FONT}`;
    ctx.fillText(title, w / 2, 23);
    ctx.fillStyle = '#f5f0e6';
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText(s.objective, w / 2, 41);
    ctx.textAlign = 'left';
    if (s.timeLeft !== null && s.timeLeft !== undefined) {
      const frac = Math.max(0, s.timeLeft / s.timeTotal);
      ctx.fillStyle = frac > 0.3 ? PALETTE.objective : PALETTE.danger;
      ctx.fillRect(bx + 10, 61, (bw - 20) * frac, 4);
    }
  }

  // District name, bottom-left.
  ctx.font = `700 15px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 5;
  ctx.fillText(districtAt(s.playerX, s.playerY).toUpperCase(), 20, h - 32);
  ctx.shadowBlur = 0;

  // Context hint, bottom-centre.
  if (s.hint) {
    ctx.font = `600 14px ${FONT}`;
    const hw = ctx.measureText(s.hint).width + 30;
    panel(ctx, (w - hw) / 2, h - 46, hw, 30, 0.6);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5f0e6';
    ctx.fillText(s.hint, w / 2, h - 38);
    ctx.textAlign = 'left';
  }

  // Busted meter.
  if (s.bustedMeter > 0.02) {
    const bw = 260;
    panel(ctx, (w - bw) / 2, h * 0.62, bw, 40, 0.65);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.danger;
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText('BUSTED', w / 2, h * 0.62 + 5);
    ctx.fillRect((w - bw) / 2 + 12, h * 0.62 + 24, (bw - 24) * Math.min(1, s.bustedMeter), 7);
    ctx.textAlign = 'left';
  }

  // Floating popups (+$200, CHECKPOINT, and friends).
  ctx.textAlign = 'center';
  for (const pop of s.popups) {
    const a = Math.min(1, pop.life / 0.5, (pop.maxLife - pop.life) / 0.4 + 0.2);
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.font = `800 ${pop.big ? 30 : 19}px ${FONT}`;
    ctx.fillStyle = pop.color;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6;
    ctx.fillText(pop.text, w / 2, pop.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  // Damage vignette.
  if (s.hurtFlash > 0) {
    const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.36, w / 2, h / 2, h * 0.75);
    grad.addColorStop(0, 'rgba(180,20,20,0)');
    grad.addColorStop(1, `rgba(180,20,20,${0.4 * s.hurtFlash})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

function drawMinimap(ctx, view) {
  const { w, state } = view;
  const mw = 196;
  const mh = 148;
  const mx = w - mw - 16;
  const my = 52;
  const sx = mw / WORLD.width;
  const sy = mh / WORLD.height;
  ctx.save();
  panel(ctx, mx - 5, my - 5, mw + 10, mh + 10, 0.6);
  ctx.fillStyle = '#177e9c';
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = '#d9cda7';
  ctx.fillRect(mx, my, mw, WORLD.sandY * sy);
  ctx.fillStyle = '#eed9a4';
  ctx.fillRect(mx, my + WORLD.sandY * sy, mw, (WORLD.waterY - WORLD.sandY) * sy);
  ctx.strokeStyle = 'rgba(61,65,72,0.8)';
  ctx.lineWidth = 2;
  for (const ax of [300, 750, 1200, 1650, 2100, 2550, 3000]) {
    ctx.beginPath(); ctx.moveTo(mx + ax * sx, my); ctx.lineTo(mx + ax * sx, my + WORLD.waterY * sy); ctx.stroke();
  }
  for (const syLine of [300, 690, 1080, 1470, 1860, 2250]) {
    ctx.beginPath(); ctx.moveTo(mx, my + syLine * sy); ctx.lineTo(mx + mw, my + syLine * sy); ctx.stroke();
  }
  const dot = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(mx + x * sx, my + y * sy, r, 0, Math.PI * 2); ctx.fill();
  };
  for (const car of state.mapCars) {
    if (car.kind === 'police') dot(car.x, car.y, '#ff5040', 2.6);
    else if (car.kind === 'mission') dot(car.x, car.y, PALETTE.objective, 3);
  }
  for (const g of state.mapGuards) if (g.alive) dot(g.x, g.y, '#ff5040', 2.4);
  if (state.target) {
    const blink = Math.floor(performance.now() / 400) % 2 === 0;
    if (blink) dot(state.target.x, state.target.y, PALETTE.objective, 4);
  }
  // The player: a white arrow.
  const px = mx + state.playerX * sx;
  const py = my + state.playerY * sy;
  ctx.translate(px, py);
  ctx.rotate(state.playerAngle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-4.4, -4); ctx.lineTo(-4.4, 4);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

export function drawOverlay(ctx, view) {
  const { w, h, kind, state } = view;
  ctx.save();
  ctx.fillStyle = kind === 'title' ? 'rgba(10,16,24,0.55)' : 'rgba(10,14,20,0.62)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  if (kind === 'title') {
    ctx.fillStyle = '#ffd34d';
    ctx.font = `800 74px ${FONT}`;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 14;
    ctx.fillText('VERANO BAY', w / 2, h * 0.24);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f5f0e6';
    ctx.font = `600 19px ${FONT}`;
    ctx.fillText('An open-world crime story in a sun-soaked coastal city', w / 2, h * 0.24 + 66);
    ctx.font = `500 16px ${FONT}`;
    ctx.fillStyle = 'rgba(245,240,230,0.88)';
    const lines = [
      'Nico Vale owes the wrong people money. Fixer Carmen Ruiz has seven jobs that fix that.',
      '',
      'WASD / arrows — walk and drive      Shift — sprint      E — steal or leave a car',
      'Mouse — aim      Click or F — shoot      Space — handbrake      P — pause      M — mute',
      '',
      'Follow the amber marker. Do the jobs. Mind the stars.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.42 + i * 26));
    ctx.fillStyle = '#ffd34d';
    ctx.font = `700 21px ${FONT}`;
    const blink = Math.floor(performance.now() / 550) % 2 === 0;
    if (blink) ctx.fillText(state.hasSave ? 'Press ENTER to continue — or N for a new game' : 'Press ENTER to start', w / 2, h * 0.78);
  } else if (kind === 'pause') {
    ctx.fillStyle = '#f5f0e6';
    ctx.font = `800 44px ${FONT}`;
    ctx.fillText('PAUSED', w / 2, h * 0.4);
    ctx.font = `600 17px ${FONT}`;
    ctx.fillText('P or Esc to keep playing · M to mute · progress saves itself', w / 2, h * 0.4 + 52);
  } else if (kind === 'busted') {
    ctx.fillStyle = '#ff6b5e';
    ctx.font = `800 58px ${FONT}`;
    ctx.fillText('BUSTED', w / 2, h * 0.38);
    ctx.fillStyle = '#f5f0e6';
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText(`The patrol kept the $${state.fine}. You walk out of Marina Azul with your story intact.`, w / 2, h * 0.38 + 58);
    ctx.fillText('Press ENTER to go on', w / 2, h * 0.38 + 92);
  } else if (kind === 'wasted') {
    ctx.fillStyle = '#ff6b5e';
    ctx.font = `800 58px ${FONT}`;
    ctx.fillText('WASTED', w / 2, h * 0.38);
    ctx.fillStyle = '#f5f0e6';
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText(`The marina clinic patched you up for $${state.fine}. The city is still out there.`, w / 2, h * 0.38 + 58);
    ctx.fillText('Press ENTER to go on', w / 2, h * 0.38 + 92);
  } else if (kind === 'story') {
    ctx.fillStyle = '#ffd34d';
    ctx.font = `800 46px ${FONT}`;
    ctx.fillText('DEBT PAID', w / 2, h * 0.36);
    ctx.fillStyle = '#f5f0e6';
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText('Seven jobs done. Verano Bay is yours now — the city stays open.', w / 2, h * 0.36 + 56);
    ctx.fillText('Press ENTER to keep driving', w / 2, h * 0.36 + 90);
  }
  ctx.restore();
}
