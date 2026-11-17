# Gatebound

A browser action game. You are the lowest-ranked hunter in the city of Veyra.
A gate goes wrong, you should have died, and you wake with your name entered
in the Ledger: a system only you can see, which rewards progress and punishes
failure.

Play it: https://tandx28.github.io/gatebound/

## What is in it

- Real-time combat in 3D: four weapon types, two weapon slots, a dash with
  invulnerability, twelve skills in a four-slot loadout. Heavy blows stagger.
- Gates of rank E to S, each a generated set of rooms ending in a boss with
  phases. Rooms have pillars to fight around and traps in the floor that
  hurt whoever stands on them. Hard from the first room: three hits kill a
  fresh hunter. A new game's first gate explains itself, one tip a room.
- Sealed gates, lit red: no way out, a boss already awake with guards, and a
  prize. One stands on the board each day, and one gate in six is sealed.
- Five stats, levels to 60, equipment in six rarities with random perks,
  eight mythics earned only by deeds, titles, potions and a flask.
- A daily quest, and a penalty zone if you miss it.
- Emergency quests, a hidden trial, key dungeons, gate breaks.
- The Rite of Echoes: after it, the enemies you kill, bosses included, can
  be bound to fight beside you, ordered to hunt, guard or hold, sent away
  and called back.
- Four classes, chosen on the Hunter tab once the rite is done, each with its
  own power on H: Echo Caller (the army), Vanguard (Bulwark), Ranger (Arrow
  Storm) and Arcanist (Overflow, from New Game+ 1).
- Twenty skills on four pages of the Skills tab: blade, guard, arcane, echo,
  each with its own effect (a falling star, rock spikes, chain lightning...).
- Five weapon types: dagger, sword, spear, bow (hold to draw; a full draw
  looses a piercing charged shot) and staff (bolts that burst, shaped by the
  staff's element: fireball, ice shard, lightning, plain light).
- Every mythic has an ultimate on Y that recharges over 90 s, faster with kills.
  Legendary and mythic gear wears an aura by its perks.
- A Bestiary tab: kills per enemy kind, lore at 10 kills, and +10/20/30%
  damage against that kind at 50, 150 and 500 (bosses need a tenth).
- Special gates (sealed, gate break, emergency, hidden door, the trials) open
  with a short scene the first time, then a title card.
- A secret, for those who finish the story: five struck lines, a riddle, and
  something waiting in the margin.
- A story in six chapters with in-engine cutscenes and two endings. Hold Esc
  for two seconds to skip a scene; replay any of them from the Story tab.
- Bosses pass through stages as they weaken, gaining new attacks: quakes,
  rings of bolts, crossing lines of blasts, falling fire, called guards.
- After the story: New Game+ (three cycles, everything kept, stronger
  gates, one more skill slot and a title each cycle), then Nightmare. The
  Trials tab holds the Tower (an endless climb), the Time Trial (the tower
  against a clock) and the Boss Rush (every master at Rank S, timed).
- Every key can be moved (System, or the pause menu: Controls).
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
| 1 2 3 | Extra skill slots, opened by New Game+ 1, 2 and 3 |
| F | Potion |
| V B Z | Mana draught, belt item, next belt item |
| X | Swap weapon |
| T | Return Stone: leave the gate |
| G | Bind a remnant (after the rite) |
| H | Class power: send echoes away or call them back (Echo Caller), Bulwark, Arrow Storm, Overflow |
| Y | Mythic ultimate |
| J | Army orders: hunt, guard, hold |
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
