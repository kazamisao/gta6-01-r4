// city.js — Verano Bay itself, generated from one seed by pure logic: the
// boulevard grid, six-plus named districts, every building with its collision
// box, palms, market stalls, parking spots and the named locations the story
// visits. No DOM, no canvas: the renderer draws what this module decides and
// the tests can rebuild the city headlessly.

import { Rng } from './rng.js';
import { WORLD, ROADS, BUILDING_COLORS } from './config.js';

export const DISTRICTS = [
  { name: 'El Faro', x: 975, y: 2055, w: 1275, h: 645 },
  { name: 'Marina Azul', x: 2250, y: 2055, w: 1350, h: 645 },
  { name: 'Playa Alta', x: 0, y: 885, w: 975, h: 1815 },
  { name: 'Puerto Viejo', x: 0, y: 0, w: 975, h: 885 },
  { name: 'Centro Alto', x: 975, y: 0, w: 1275, h: 885 },
  { name: 'Las Colinas', x: 2250, y: 0, w: 1350, h: 885 },
  { name: 'Mercado Nuevo', x: 975, y: 885, w: 1275, h: 1170 },
  { name: 'Barrio Puerto', x: 2250, y: 885, w: 1350, h: 1170 },
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d.name;
  }
  return 'Verano Bay';
}

// The named places the missions and the HUD talk about. Coordinates sit on
// pavements or open ground beside the roads they belong to.
export const LOCATIONS = {
  marinaOffice: { x: 3210, y: 2175, label: "Carmen's office" },
  garage: { x: 445, y: 445, label: 'Puerto Viejo garage' },
  safehouse: { x: 3170, y: 445, label: 'Las Colinas safehouse' },
  marketAlley: { x: 1425, y: 1130, label: 'Mercado alley' },
  plaza: { x: 1425, y: 1280, label: 'Mercado plaza' },
  playaLot: { x: 520, y: 1660, label: 'Playa Alta lot' },
  pier: { x: 1800, y: 2405, label: 'El Faro pier' },
  hotel: { x: 2920, y: 1990, label: 'Marina Azul hotel' },
  bank: { x: 2040, y: 775, label: 'Banco del Sol' },
  boat: { x: 3260, y: 2370, label: 'the waiting boat' },
  respawn: { x: 3120, y: 2250, label: 'Marina Azul' },
};

const ROAD_MARGIN = ROADS.halfWidth + ROADS.sidewalk + 4;

function blockRects() {
  const xs = [0, ...ROADS.avenues, WORLD.width];
  const ys = [0, ...ROADS.streets, WORLD.sandY];
  const rects = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const x0 = xs[i] === 0 ? 6 : xs[i] + ROAD_MARGIN;
      const x1 = xs[i + 1] === WORLD.width ? WORLD.width - 6 : xs[i + 1] - ROAD_MARGIN;
      const y0 = ys[j] === 0 ? 6 : ys[j] + ROAD_MARGIN;
      const y1 = ys[j + 1] === WORLD.sandY ? WORLD.sandY - 8 : ys[j + 1] - ROAD_MARGIN;
      if (x1 - x0 > 110 && y1 - y0 > 110) rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  return rects;
}

function isPlazaBlock(b) {
  return b.x >= 1200 && b.x < 1650 && b.y >= 1080 && b.y < 1470;
}

function isLotBlock(b) {
  return b.x >= 300 && b.x < 750 && b.y >= 1470 && b.y < 1860;
}

export function generateCity(seed = WORLD.seed) {
  const rng = new Rng(seed);
  const buildings = [];
  const stalls = [];
  const lots = [];

  for (const block of blockRects()) {
    if (isPlazaBlock(block)) {
      // Mercado plaza: open ground ringed with market stalls.
      const cols = 5;
      for (let i = 0; i < cols; i++) {
        const sx = block.x + 18 + i * ((block.w - 60) / (cols - 1));
        stalls.push({ x: sx, y: block.y + 14, w: 34, h: 20, color: rng.pick(['#c94f38', '#2fb3a6', '#d9a441']) });
        stalls.push({ x: sx, y: block.y + block.h - 34, w: 34, h: 20, color: rng.pick(['#2fb3a6', '#d9a441', '#c94f38']) });
      }
      continue;
    }
    if (isLotBlock(block)) {
      lots.push({ x: block.x, y: block.y, w: block.w, h: block.h });
      continue;
    }
    // Split the block into plots and raise a building on most of them.
    const cols = rng.int(2, 3);
    const rows = rng.int(2, 3);
    const gap = 16;
    const pw = (block.w - gap * (cols + 1)) / cols;
    const ph = (block.h - gap * (rows + 1)) / rows;
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        if (rng.chance(0.16)) continue; // a courtyard or car park gap
        const inset = rng.range(2, 9);
        buildings.push({
          x: block.x + gap + cx * (pw + gap) + inset,
          y: block.y + gap + cy * (ph + gap) + inset,
          w: pw - inset * 2,
          h: ph - inset * 2,
          color: rng.pick(BUILDING_COLORS),
          floors: rng.int(2, 9),
        });
      }
    }
  }

  // Palms: a fringe along the beach and a scatter on the pavements.
  const palms = [];
  for (let x = 60; x < WORLD.width - 40; x += rng.range(70, 130)) {
    if (Math.abs(x - WORLD.pierX) < 110) continue;
    palms.push({ x, y: rng.range(WORLD.sandY + 26, WORLD.waterY - 42), s: rng.range(0.8, 1.3) });
  }
  for (let i = 0; i < 130; i++) {
    const onAvenue = rng.chance(0.5);
    const px = onAvenue ? rng.pick(ROADS.avenues) + rng.pick([-1, 1]) * (ROADS.halfWidth + 10) : rng.range(40, WORLD.width - 40);
    const py = onAvenue ? rng.range(60, WORLD.sandY - 60) : rng.pick(ROADS.streets) + rng.pick([-1, 1]) * (ROADS.halfWidth + 10);
    palms.push({ x: px, y: py, s: rng.range(0.7, 1.15) });
  }

  // Street lamps at intersection corners.
  const lamps = [];
  for (const ax of ROADS.avenues) {
    for (const sy of ROADS.streets) {
      lamps.push({ x: ax - ROADS.halfWidth - 8, y: sy - ROADS.halfWidth - 8 });
      lamps.push({ x: ax + ROADS.halfWidth + 8, y: sy + ROADS.halfWidth + 8 });
    }
  }

  // Kerbside parking spots along every road run between intersections.
  const parkedSpots = [];
  const runs = [];
  for (const ax of ROADS.avenues) {
    const stops = [60, ...ROADS.streets, WORLD.sandY - 40];
    for (let j = 0; j < stops.length - 1; j++) runs.push({ vertical: true, fixed: ax, from: stops[j] + 70, to: stops[j + 1] - 70 });
  }
  for (const sy of ROADS.streets) {
    const stops = [40, ...ROADS.avenues, WORLD.width - 40];
    for (let j = 0; j < stops.length - 1; j++) runs.push({ vertical: false, fixed: sy, from: stops[j] + 70, to: stops[j + 1] - 70 });
  }
  for (const run of runs) {
    for (let t = run.from + rng.range(0, 50); t < run.to - 40; t += rng.range(95, 150)) {
      if (!rng.chance(0.42)) continue;
      const side = rng.pick([-1, 1]);
      const off = side * (ROADS.halfWidth - 13);
      parkedSpots.push(run.vertical
        ? { x: run.fixed + off, y: t, angle: side > 0 ? Math.PI / 2 : -Math.PI / 2 }
        : { x: t, y: run.fixed + off, angle: side > 0 ? Math.PI : 0 });
    }
  }

  const city = {
    buildings, stalls, lots, palms, lamps, parkedSpots,
    locations: LOCATIONS,
    districtAt,
  };
  city.colliders = [...buildings, ...stalls];
  return city;
}

export function isPier(x, y) {
  return Math.abs(x - WORLD.pierX) <= WORLD.pierHalfWidth && y >= ROADS.streets[ROADS.streets.length - 1] && y <= WORLD.waterY + 110;
}

export function isWater(x, y) {
  return y >= WORLD.waterY && !isPier(x, y);
}

export function isRoad(x, y) {
  if (isPier(x, y)) return true;
  if (y >= WORLD.waterY) return false;
  for (const ax of ROADS.avenues) if (Math.abs(x - ax) <= ROADS.halfWidth) return true;
  for (const sy of ROADS.streets) if (Math.abs(y - sy) <= ROADS.halfWidth) return true;
  return false;
}

export function groundAt(city, x, y) {
  if (isWater(x, y)) return 'water';
  if (y >= WORLD.sandY) return isPier(x, y) ? 'pier' : 'sand';
  if (isRoad(x, y)) return 'road';
  for (const ax of ROADS.avenues) if (Math.abs(x - ax) <= ROADS.halfWidth + ROADS.sidewalk) return 'sidewalk';
  for (const sy of ROADS.streets) if (Math.abs(y - sy) <= ROADS.halfWidth + ROADS.sidewalk) return 'sidewalk';
  return 'block';
}

// Buildings and stalls whose box comes within r of a point — the only
// colliders movement ever has to test.
export function collidersNear(city, x, y, r) {
  const out = [];
  for (const c of city.colliders) {
    if (x + r < c.x - 4 || x - r > c.x + c.w + 4 || y + r < c.y - 4 || y - r > c.y + c.h + 4) continue;
    out.push(c);
  }
  return out;
}
