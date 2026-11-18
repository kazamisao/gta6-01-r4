# Verano Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kazamisao/gta6-01-r4/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kazamisao/gta6-01-r4/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Verano Bay is a top-down open-world crime game for the desktop browser, written in plain JavaScript — ES modules, a canvas renderer, no build step, no asset files. The city is generated from a fixed seed, the art is drawn in code, and every sound is synthesized live with WebAudio. Served as static files it plays fully offline. The game, its city, characters, story and sound are all original to this entry, built by an AI agent for make.fun's "Make GTA 6" bounty (gta6-01).

## The city

The world is 3600×2700 units of boulevard grid: seven avenues and six streets with lane markings, crosswalks and kerbside parking, buildings packed into the blocks between them, and a beach running into an animated sea along the southern edge, with a wooden pier and a striped lighthouse at El Faro. Eight named districts divide the map — Puerto Viejo, Centro Alto, Las Colinas, Playa Alta, Mercado Nuevo, Barrio Puerto, Marina Azul and El Faro — and the HUD names the one you are standing in. The Mercado keeps an open plaza ringed with stalls; Playa Alta keeps a scrapyard lot. Because generation is seeded, the city is identical on every visit.

## The story

You are Nico Vale, a driver who owes money to the wrong people. Fixer Carmen Ruiz offers a way out: seven jobs against the Coral Syndicate, each a chain of objective steps tracked by the banner — meeting contacts, stealing marked cars, lifting a ledger and a cash case, fighting guards, wrecking crew cars, outrunning the patrol, a timed passenger run and a five-gate coast race to a waiting boat.

1. **First Shift** ($200) — meet Carmen at her marina office, steal the turquoise coupe, deliver it to the Puerto Viejo garage.
2. **Cold Ledger** ($300) — take the payoff ledger from the Mercado stalls, drop the two guards who object, reach the Las Colinas safehouse.
3. **Sirens at Noon** ($450) — wreck both Syndicate cars in the Playa Alta lot, then lose the police.
4. **Night Ferry** ($600) — collect a nervous passenger at the El Faro pier and drive him to the Marina Azul hotel against the clock.
5. **Repo Men** ($750) — three cars, three debts: a red sport car, a white van and a gold coupe, each collected for the garage.
6. **The Vault Run** ($900) — walk a cash case out of Banco del Sol, fight through three guards, get it to Carmen.
7. **Last Light** ($1,500) — five checkpoints down the coast, shake the police, and reach the boat.

The jobs pay $4,700 in all. When the chain is done the city stays open: keep driving, keep your cash, keep out of trouble — or don't.

## On the street

- **Traffic and pedestrians.** AI cars work the grid on the right-hand side, brake for the car ahead and turn at junctions; pedestrians stroll the pavements and run when there is gunfire or a crash nearby. Coupes, sedans, sports cars and vans all drive differently, and parked cars line the kerbs waiting to be borrowed.
- **Driving.** Any car can be stolen. The physics are shared by every vehicle: the pedal brakes while you are rolling forward and only engages reverse once you have stopped, steering bites in proportion to speed, and the handbrake breaks the rear loose into a slide that lays twin skid marks. Fast cars wear their damage as smoke before they die.
- **The wanted system.** Crimes — theft, collisions, shots fired, pedestrians hit, cars wrecked — add heat when someone is close enough to see. Heat becomes one to five stars, and stars send out up to six patrol cars that steer straight at you and ram. Heat only drains while no officer can see you, so breaking line of sight is the way to cool down. Get pinned next to a patrol car and the busted meter fills: you pay a fine scaled to your stars and walk out of Marina Azul. Lose all your health and you are wasted instead — the marina clinic charges its fee and the city goes on.
- **Combat.** Aim with the mouse and fire with F or a click; tracers show every shot. Mission guards close in, strafe and shoot back, marked with red chevrons.
- **Camera and HUD.** The camera leads the car's speed and leans toward the aim on foot, and shakes when metal meets metal. Health, cash, wanted stars, the district and the current objective ride over the game; the corner minimap shows the road grid, the sea, police, mission cars, guards and the amber objective marker, and an edge arrow points to objectives off screen.
- **Sound.** There are no audio files. An engine loop and a police siren loop bend with the action, and one-shot synth voices cover gunshots, crashes, doors, pickups, checkpoints and the mission-complete jingle.
- **Saves.** Cash, story progress and where you stood are kept in localStorage and restored on the next visit. You start with $50.

## Run it

You need Node 22. From the repository root:

```
node serve.ts
```

then open http://localhost:8080 in desktop Chrome. If port 8080 is taken, pass `--port <n>` to `serve.ts` and use that port in the address instead.

## Controls

- **WASD / arrow keys** — walk on foot, drive in a car
- **Shift** — sprint on foot
- **E** — get into or out of a car
- **Mouse** — aim; **left click or F** — fire
- **S / ↓ in a car** — brake; keep holding it once stopped to reverse
- **Space in a car** — handbrake slide
- **P or Esc** — pause; **M** — mute; **Enter** — confirm on the title, BUSTED, WASTED and DEBT PAID screens

## Repository layout

- `game/` — the game itself: `index.html` and the ES modules under `game/src/`, one job each — `rng` (seeded randomness), `config` (the tuning table), `city` (generation, districts, locations), `physics` (arcade movement and collision), `wanted` (heat, stars, the busted meter), `missions` (the seven-job story runner), `save` (the localStorage save game), `entities` (traffic, police, pedestrian and guard drivers), `render` (the canvas world), `hud` (HUD, minimap, overlays), `audio` (the WebAudio synth), `input`, and `main` (the shell that wires it together)
- `serve.ts` — the small static server above; standard library only, bound to 127.0.0.1, and it refuses paths outside `game/`
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` into the output directory and writes `dossier.json` with the vendored library
- `vendor/` — the vendored make.fun game library `main.ts` builds the dossier with, unchanged from the kit
- `screenshots/` and `shots.json` — four frames of the game (a coastal drive, a police chase, a plaza gunfight, a checkpoint at the pier) and the `?scene=` queries that stage them deterministically in the running game
- `tests/` — headless tests over the pure logic modules (rng, city, physics, wanted, missions, saves); run them with `node tests/run.mjs` — 66 passing
