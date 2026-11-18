// wanted.js — heat, stars and the busted meter, as a pure state machine.
// Crimes add heat; heat reads as one to five stars; stars decide how many
// patrol cars the city sends. Heat only drains while no officer can see the
// player, and standing pinned next to a patrol car fills the busted meter.

import { WANTED } from './config.js';

export function createWanted() {
  return { heat: 0, stars: 0, bustedMeter: 0, seenNow: false };
}

export function starsForHeat(heat) {
  if (heat <= 0) return 0;
  return Math.min(WANTED.maxStars, Math.ceil(heat / WANTED.heatPerStar));
}

// kind is a key of WANTED.heat, or a raw number of heat points.
export function addHeat(wanted, kind) {
  const points = typeof kind === 'number' ? kind : WANTED.heat[kind] || 0;
  wanted.heat += points;
  wanted.stars = starsForHeat(wanted.heat);
  return wanted.stars;
}

export function clearHeat(wanted) {
  wanted.heat = 0;
  wanted.stars = 0;
  wanted.bustedMeter = 0;
}

// How many patrol cars the city wants on the street for this wanted state.
export function policeWanted(wanted) {
  return WANTED.policeByStar[wanted.stars] || 0;
}

// Advance the wanted state. ctx: {seen, pinned} — seen: some officer has
// line of sight within range; pinned: a patrol car is close while the player
// is slow or on foot. Returns 'busted' on the step the meter fills, else null.
export function updateWanted(wanted, dt, ctx) {
  wanted.seenNow = !!ctx.seen;
  if (!ctx.seen) {
    wanted.heat = Math.max(0, wanted.heat - WANTED.decayPerSecond * dt);
    wanted.stars = starsForHeat(wanted.heat);
  }
  if (ctx.pinned && wanted.stars > 0) {
    wanted.bustedMeter += dt / WANTED.bustedFillSeconds;
    if (wanted.bustedMeter >= 1) {
      wanted.bustedMeter = 0;
      return 'busted';
    }
  } else {
    wanted.bustedMeter = Math.max(0, wanted.bustedMeter - dt * 1.6);
  }
  return null;
}

// The fine for being busted grows with the stars you were carrying.
export function bustedFine(stars) {
  return Math.round(WANTED.maxFine * (stars / WANTED.maxStars));
}
