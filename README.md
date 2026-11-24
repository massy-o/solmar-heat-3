[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/massy-o/solmar-heat-3/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/massy-o/solmar-heat-3/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# SOLMAR HEAT

An original open-world action game set in **Solmar Bay**, a seeded procedural
sunset city you can explore on foot or behind the wheel. The city is generated
deterministically from a fixed seed, so every visitor gets the same bay: the
towers of **Centro**, the beachfront along Ocean Drive, and the cranes and
warehouses of **Port Solmar**.

## What is in the game

- **Open world, two ways to move** — walk the streets or take a car and drive.
- **Living traffic and pedestrians** — cars follow routes around the grid and
  crowds stroll the pavements and the beach.
- **Wanted system and police** — crimes raise your stars; Solmar Bay PD
  cruisers spawn, chase, and try to bust you. Lose them and the heat fades.
- **Five missions** — a short story chain of jobs across the districts, from
  your first wheels to the final run before sundown.
- **HUD and minimap** — stars, cash, health, speed, the current objective,
  and a live minimap with traffic, police, and the objective marker.
- **WebAudio synth sound** — engine, sirens, impacts, and UI blips are all
  synthesised in code; there are no audio files.
- **Save game** — money and mission progress persist in `localStorage`.

## Zero libraries, fully offline

SOLMAR HEAT runs on a **hand-written minimal WebGL renderer**
(`game/src/minigl.js`, written for this game): a small scene graph, primitive
geometries, canvas textures, lambert shading with hemisphere + directional
light, and linear fog — one shader program, plain WebGL1. There are **zero
external libraries** and no network references of any kind; the game works
completely offline once the static files are served.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrow keys | Walk / drive |
| Shift | Run |
| E | Enter / leave a car |
| Space | Brake / handbrake |
| M | Start the next mission |
| P | Pause |
| Mouse drag | Look around |

## Layout

- `game/index.html` — the page, HUD, and overlays.
- `game/src/main.js` — boot, main loop, camera, staged screenshot scenes
  (`?scene=hero|drive|chase|beach`).
- `game/src/minigl.js` — the hand-written WebGL renderer described above.
- `game/src/city.js` — the procedural city builder (districts, roads, beach, port).
- `game/src/vehicles.js`, `peds.js`, `player.js`, `police.js` — traffic,
  pedestrians, the player, and the police/wanted logic.
- `game/src/missions.js` — the five-mission director and markers.
- `game/src/hud.js`, `audio.js`, `config.js` — HUD/minimap, synth sound, tuning data.
- `screenshots/` — four captures of the staged scenes.
- `vendor/makefun-game.ts` — the make.fun kit's dossier library, copied
  unchanged; used only by `main.ts` to build the entry dossier.
- `main.ts` — the entry builder (see "Verify" below).

## How to play

Serve `game/` with any static file server and open it in a desktop browser,
for example:

```sh
python3 -m http.server 8000 --directory game
# then visit http://127.0.0.1:8000/
```

## How to verify the entry

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

This copies `game/` and `screenshots/` into `out/` and writes
`out/dossier.json` using the kit's `buildDossier`, under the bounty's caps.

## License

MIT — see `LICENSE`.
