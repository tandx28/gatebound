# Gatebound

A browser action game. You are the lowest-ranked hunter in the city of Veyra.
A gate goes wrong, you should have died, and you wake with your name entered
in the Ledger: a system only you can see, which rewards progress and punishes
failure.

Play it: https://tandx28.github.io/gatebound/

## What is in it

- Real-time combat in 3D: four weapon types, two weapon slots, a dash with
  invulnerability, six skills in a four-slot loadout.
- Gates of rank E to S, each a generated set of rooms ending in a boss with
  phases. Hard from the first room: three hits kill a fresh hunter.
- Five stats, levels to 60, equipment in six rarities with random perks,
  eight mythics earned only by deeds, titles, potions and a flask.
- A daily quest, and a penalty zone if you miss it.
- Sealed gates, emergency quests, a hidden trial, key dungeons, gate breaks.
- The Rite of Echoes: after it, the enemies you kill, bosses included, can
  be bound to fight beside you, sent away and called back.
- A story in six chapters with in-engine cutscenes and two endings. Hold Esc
  for two seconds to skip a scene; replay any of them from the Story tab.
  The game carries on after the ending.
- Generated music with its own song per gate, and synthesised sound effects.
- Progress saves in the browser. Saving inside a gate resumes at the room.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Aim |
| Click | Attack |
| Space | Dash |
| Q E R, right click | Skills |
| F | Potion |
| V B Z | Mana draught, belt item, next belt item |
| X | Swap weapon |
| T | Return Stone: leave the gate |
| G | Bind a remnant (after the rite) |
| H | Send your echoes away, or call them back |
| C | Status and stat points |
| Esc | Pause, save, settings |

## Run it locally

Needs Node 20 or later.

```bash
npm install
npm run dev
```

Other commands:

```bash
npm test          # unit tests
npm run build     # static build in dist/
npm run balance   # bot-played difficulty report
```

## How it is built

TypeScript, Vite and Three.js. The game itself is a pure simulation on a flat
plane (`src/game`), stepped at a fixed 120 Hz and covered by unit tests; it
knows nothing about rendering or audio. The 3D view (`src/render/scene3d.ts`),
the 2D overlay (`src/render/hud.ts`) and the audio (`src/audio`) only read its
state. Difficulty is tuned against a scripted player (`src/game/balance`).

## Credits

Character models: KayKit Character Packs (Adventurers, Skeletons) by Kay Lousberg, CC0. See `public/models/LICENSE.txt`.
