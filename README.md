# solmar-city

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/adivadena1/solmar-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/adivadena1/solmar-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar** is an open-world crime game that runs offline in a desktop browser
from its own static files. You are Rook, a driver new to a sun-soaked coastal
city, taking jobs from Dana, a fixer with a phone full of trouble — and ending
up across Kessler, who owns the marina.

## What is in the game

- **A city to explore on foot and by car** — a seeded grid city with a beach,
  an ocean, a pier, a marina, and named landmarks (Garage, Bank, Hideout,
  Hospital, Police Station, Cafe Solmar, Docks).
- **Cars to steal and drive** — walk up to any parked or traffic car, press E,
  and it is yours. Arcade driving: accelerate, brake, reverse, and steer.
- **Traffic and pedestrians** — cars loop the road grid and brake for each
  other; pedestrians stroll the sidewalks and run from danger.
- **A wanted level and police** — steal a car, run someone over, or shoot,
  and the stars rise. Police cars chase and ram; get held too long and you
  are busted, lose money, and wake up at the station.
- **Four story missions** — Fresh Wheels, The Package, Smoke on the Water,
  and The Marina Job, with objectives, a beacon marker, dialogue, and
  rewards. Finish them all and the city is yours.
- **Combat** — punch up close, or draw a pistol (Q) and shoot.
- **A HUD with a minimap** — cash, health, wanted stars, speed, the current
  objective, and a live top-down map with the player, traffic, police, and
  the mission marker.
- **A start screen and a save** — progress (cash and finished jobs) saves to
  the browser automatically.
- **Synthesized sound** — engine hum, sirens, gunshots, and a quiet pad loop,
  all made with WebAudio. No audio files. M mutes.

## Controls

| Key | Action |
|---|---|
| WASD | Walk / drive |
| Mouse | Look around (click to lock the pointer) |
| E | Enter, steal, or exit a car |
| Space | Brake (in a car) |
| Shift | Sprint |
| Q | Draw / holster the pistol |
| Click | Punch / shoot |
| F | Punch |
| P | Pause |
| M | Mute sound |

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no network. `game/index.html` opens in desktop Chrome and
plays from its own files; three.js is vendored as a minified build under
`game/vendor/`.

## Files

- `main.ts` — the entry program: copies `game/` and `screenshots/` to the
  output and writes `dossier.json` with the kit's library.
- `game/index.html` — the page: canvas, HUD, menus, and the import map.
- `game/src/main.js` — bootstrap, frame loop, camera, cars, combat, busts.
- `game/src/world.js` — the city: roads, buildings, beach, ocean, landmarks.
- `game/src/player.js` — the walker on foot: movement, punch, pistol.
- `game/src/vehicles.js` — car models and arcade driving physics.
- `game/src/traffic.js` — traffic cars and pedestrians.
- `game/src/police.js` — the wanted level and police pursuit.
- `game/src/missions.js` — the story and its four missions.
- `game/src/hud.js` — the HUD, the minimap, and the menus.
- `game/src/audio.js` — synthesized sound with WebAudio.
- `game/src/input.js` — keyboard and mouse.
- `game/src/save.js` — progress in localStorage.
- `game/src/shots.js` — the staged scenes behind `?shot=...`.
- `game/src/config.js`, `game/src/rng.js` — shared constants, seeded random.
- `game/vendor/three.module.min.js` — three.js r160, vendored.
- `screenshots/` — four real renders of the game.

## Screenshots

The four screenshots are real renders of the game, staged with `?shot=`
query parameters that set up a real driving, chase, mission, and start-screen
scene and let it run: `1-cover.png` (driving through the city),
`2-chase.png` (three-star police chase), `3-mission.png` (a mission in
progress), `4-city.png` (the start screen over the city).

## An original game

Every name, character, place, story beat, and piece of art and sound in
Solmar is invented for this entry. Nothing comes from Rockstar Games or any
other commercial game.

---

Entered on [make.fun](https://make.fun/?ref=3txr3dna&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards
