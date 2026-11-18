// missions.js — Verano Bay's story: seven jobs for fixer Carmen Ruiz, told as
// chains of objective steps. The runner is pure logic: the game shell feeds
// it the player's position, car, wanted stars and body counts, and it answers
// with events (spawn this car, send in these guards, pay this reward). Step
// types: goto, pickup, steal, deliverCar, fight, wreck, escape, checkpoints,
// and deliverCar with a time limit.

import { LOCATIONS } from './city.js';

export const MISSIONS = [
  {
    id: 'first-shift',
    title: 'First Shift',
    reward: 200,
    intro: 'Carmen: "Simple work, Nico. A coupe by the marina needs a new home — the garage in Puerto Viejo."',
    steps: [
      { type: 'goto', at: 'marinaOffice', radius: 60, text: 'Meet Carmen at her marina office' },
      { type: 'steal', spawn: { x: 3050, y: 2250, angle: 0, carClass: 'coupe', color: '#2fb3a6' }, text: 'Steal the turquoise coupe by the marina' },
      { type: 'deliverCar', at: 'garage', radius: 85, text: 'Deliver the coupe to the Puerto Viejo garage' },
    ],
  },
  {
    id: 'cold-ledger',
    title: 'Cold Ledger',
    reward: 300,
    intro: 'Carmen: "A payoff ledger is sitting under the Mercado stalls. The Coral Syndicate would rather it stayed there."',
    steps: [
      { type: 'goto', at: 'marketAlley', radius: 55, text: 'Slip into the Mercado alley' },
      { type: 'pickup', at: { x: 1560, y: 1395 }, radius: 34, item: 'the payoff ledger', text: 'Take the payoff ledger from the south stalls' },
      { type: 'fight', at: 'plaza', guards: 2, text: 'Drop the Syndicate guards' },
      { type: 'goto', at: 'safehouse', radius: 60, text: 'Bring the ledger to the Las Colinas safehouse' },
    ],
  },
  {
    id: 'sirens-at-noon',
    title: 'Sirens at Noon',
    reward: 450,
    intro: 'Carmen: "Two Syndicate cars are parked up in Playa Alta. Make them scrap, then make yourself scarce."',
    steps: [
      { type: 'goto', at: 'playaLot', radius: 80, text: 'Head to the Playa Alta lot' },
      { type: 'wreck', at: 'playaLot', cars: 2, text: 'Wreck the Syndicate cars' },
      { type: 'escape', text: 'Lose the police' },
    ],
  },
  {
    id: 'night-ferry',
    title: 'Night Ferry',
    reward: 600,
    intro: 'Carmen: "A nervous man at the pier needs to be across town before his nerve goes entirely. Drive him."',
    steps: [
      { type: 'goto', at: 'pier', radius: 55, text: 'Meet your passenger at the El Faro pier' },
      { type: 'deliverCar', at: 'hotel', radius: 80, anyCar: true, time: 95, text: 'Drive your passenger to the Marina Azul hotel' },
    ],
  },
  {
    id: 'repo-men',
    title: 'Repo Men',
    reward: 750,
    intro: 'Carmen: "Three cars, three debts. Collect them all for the garage. Try not to collect the police too."',
    steps: [
      { type: 'steal', spawn: { x: 1900, y: 690, angle: 0, carClass: 'sport', color: '#e5484d' }, text: 'Steal the red sport car in Centro Alto' },
      { type: 'deliverCar', at: 'garage', radius: 85, text: 'Deliver it to the Puerto Viejo garage' },
      { type: 'steal', spawn: { x: 2620, y: 1470, angle: Math.PI, carClass: 'van', color: '#e8e3d5' }, text: 'Steal the white van in Barrio Puerto' },
      { type: 'deliverCar', at: 'garage', radius: 85, text: 'Deliver the van to the garage' },
      { type: 'steal', spawn: { x: 520, y: 1860, angle: 0, carClass: 'coupe', color: '#d9a441' }, text: 'Steal the gold coupe in Playa Alta' },
      { type: 'deliverCar', at: 'garage', radius: 85, text: 'Deliver the coupe to the garage' },
    ],
  },
  {
    id: 'vault-run',
    title: 'The Vault Run',
    reward: 900,
    intro: 'Carmen: "Banco del Sol, midday, a cash case that walks out the front door. This one will be loud."',
    steps: [
      { type: 'goto', at: 'bank', radius: 60, text: 'Go to Banco del Sol' },
      { type: 'pickup', at: 'bank', radius: 36, item: 'the cash case', text: 'Take the cash case', crime: 'missionCrime' },
      { type: 'fight', at: 'bank', guards: 3, text: 'Fight through the bank guards' },
      { type: 'goto', at: 'marinaOffice', radius: 70, text: 'Get the case to Carmen at the marina' },
    ],
  },
  {
    id: 'last-light',
    title: 'Last Light',
    reward: 1500,
    intro: 'Carmen: "One last run, Nico. Hit every checkpoint on the coast, then be on that boat before the light goes."',
    steps: [
      {
        type: 'checkpoints', time: 170,
        points: [
          { x: 750, y: 690 }, { x: 300, y: 1470 }, { x: 1800, y: 2250 },
          { x: 3000, y: 1080 }, { x: 3260, y: 2370 },
        ],
        text: 'Run the coast checkpoints',
      },
      { type: 'escape', text: 'Shake the police before the boat leaves' },
      { type: 'goto', at: 'boat', radius: 60, text: 'Reach the waiting boat' },
    ],
  },
];

function stepPoint(step) {
  if (!step.at) return null;
  if (typeof step.at === 'string') return LOCATIONS[step.at];
  return step.at;
}

export class MissionRunner {
  constructor() {
    this.nextIndex = 0; // missions complete in order: this many are done or next up
    this.missionIndex = -1; // the active job, or -1 between jobs
    this.stepIndex = 0;
    this.primed = false;
    this.targetCarId = 0;
    this.guardsSpawned = false;
    this.checkpointIndex = 0;
    this.timeLeft = 0;
    this.hadStars = false;
  }

  get mission() {
    return this.missionIndex >= 0 && this.missionIndex < MISSIONS.length ? MISSIONS[this.missionIndex] : null;
  }

  get step() {
    const m = this.mission;
    return m ? m.steps[this.stepIndex] || null : null;
  }

  get storyDone() {
    return this.missionIndex === -1 && this.nextIndex >= MISSIONS.length;
  }

  // How many jobs are finished — what the save game stores.
  completedCount() {
    return this.missionIndex >= 0 ? this.missionIndex : this.nextIndex;
  }

  snapshot() {
    return { completed: this.completedCount() };
  }

  // Resume between jobs: the next startNext() offers job number `completed`.
  restore(completed) {
    this.nextIndex = Math.max(0, Math.min(MISSIONS.length, completed | 0));
    this.missionIndex = -1;
    this.stepIndex = 0;
    this.primed = false;
  }

  // Take the next job. Returns the mission, or null when the story is over.
  startNext() {
    if (this.mission) return this.mission;
    if (this.nextIndex >= MISSIONS.length) return null;
    this.missionIndex = this.nextIndex;
    this.stepIndex = 0;
    this.targetCarId = 0;
    this.primeStep();
    return this.mission;
  }

  primeStep() {
    this.primed = false;
    // targetCarId survives primeStep on purpose: a steal step hands its car
    // to the deliverCar step that follows it. startNext clears it instead.
    this.guardsSpawned = false;
    this.checkpointIndex = 0;
    this.hadStars = false;
    const step = this.step;
    this.timeLeft = step && step.time ? step.time : 0;
  }

  setTargetCar(id) { this.targetCarId = id; }
  setGuardsSpawned() { this.guardsSpawned = true; }

  objectiveText() {
    const step = this.step;
    if (!step) return '';
    let text = step.text;
    if (step.type === 'fight' && this.guardsSpawned) text += ` — ${this.lastGuardCount ?? step.guards} left`;
    if (step.type === 'wreck') text += ` — ${this.lastWrecked ?? 0}/${step.cars}`;
    if (step.type === 'checkpoints') text += ` — gate ${Math.min(this.checkpointIndex + 1, step.points.length)}/${step.points.length}`;
    if (step.time) text += ` — ${Math.max(0, Math.ceil(this.timeLeft))}s`;
    return text;
  }

  // The world point the HUD marker should point at for the current step.
  targetPoint(ctx) {
    const step = this.step;
    if (!step) return null;
    if (step.type === 'steal') return ctx.targetCarPos || { x: step.spawn.x, y: step.spawn.y };
    if (step.type === 'deliverCar' && !step.anyCar && ctx.targetCarPos && ctx.inCarId !== this.targetCarId) return ctx.targetCarPos;
    if (step.type === 'checkpoints') return step.points[this.checkpointIndex] || null;
    if (step.type === 'escape') return null;
    return stepPoint(step);
  }

  // Advance the story. ctx: {x, y, inCarId, stars, guardsAlive, wreckedMarked, dt}
  // Returns a list of events for the shell: {type:'spawnCar'|'spawnGuards'|
  // 'spawnWreckTargets'|'crime'|'stepComplete'|'missionComplete'|'stepFailed', ...}
  update(dt, ctx) {
    const events = [];
    const step = this.step;
    if (!step) return events;

    if (!this.primed) {
      this.primed = true;
      if (step.type === 'steal') events.push({ type: 'spawnCar', spawn: step.spawn });
      if (step.type === 'fight') events.push({ type: 'spawnGuards', at: stepPoint(step), count: step.guards });
      if (step.type === 'wreck') events.push({ type: 'spawnWreckTargets', at: stepPoint(step), count: step.cars });
      if (step.crime) events.push({ type: 'crime', heat: step.crime });
    }

    if (ctx.stars > 0) this.hadStars = true;
    if (step.type === 'fight') this.lastGuardCount = ctx.guardsAlive;
    if (step.type === 'wreck') this.lastWrecked = ctx.wreckedMarked;

    let done = false;
    switch (step.type) {
      case 'goto':
      case 'pickup':
        done = within(ctx, stepPoint(step), step.radius);
        break;
      case 'steal':
        done = this.targetCarId !== 0 && ctx.inCarId === this.targetCarId;
        break;
      case 'deliverCar': {
        const inRightCar = step.anyCar ? ctx.inCarId !== 0 : ctx.inCarId === this.targetCarId && this.targetCarId !== 0;
        done = inRightCar && within(ctx, stepPoint(step), step.radius);
        break;
      }
      case 'fight':
        done = this.guardsSpawned && ctx.guardsAlive === 0;
        break;
      case 'wreck':
        done = ctx.wreckedMarked >= step.cars;
        break;
      case 'escape':
        done = this.hadStars && ctx.stars === 0;
        break;
      case 'checkpoints': {
        const point = step.points[this.checkpointIndex];
        if (point && within(ctx, point, 95)) {
          this.checkpointIndex++;
          events.push({ type: 'checkpoint', index: this.checkpointIndex, total: step.points.length });
          if (this.checkpointIndex >= step.points.length) done = true;
        }
        break;
      }
    }

    if (step.time && !done) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = step.time;
        events.push({ type: 'stepFailed', step });
        return events;
      }
    }

    if (done) {
      events.push({ type: 'stepComplete', step });
      this.stepIndex++;
      if (this.stepIndex >= this.mission.steps.length) {
        const finished = this.mission;
        events.push({ type: 'missionComplete', mission: finished, reward: finished.reward });
        this.nextIndex = this.missionIndex + 1;
        this.missionIndex = -1;
        this.stepIndex = 0;
        this.primed = false;
      } else {
        this.primeStep();
      }
    }
    return events;
  }
}

function within(ctx, point, radius) {
  if (!point) return false;
  const dx = ctx.x - point.x;
  const dy = ctx.y - point.y;
  return dx * dx + dy * dy <= radius * radius;
}
