# Untitled Levelling Game

Instructions for any model working in this repository. Read all of it before
changing anything.

The game was called Gatebound until 2026-11-19; the repository, the site's
address, the package name and the save keys (`gatebound.save`,
`gatebound.settings`) keep that name so every existing save still loads.
Only what the player sees says "Untitled Levelling Game".

## What this is

Untitled Levelling Game is a single-player browser action game: a top-down 3D dungeon
crawler with levelling, loot, a bound army of "echoes", and a story told on a
gate board and in short cutscenes. It is inspired by the *genre* of
"weakest hunter levels up alone" stories, but everything in it is original:
the city of Veyra, the Ledger, Mara Quill, Dov, the Hollow Monarch.

- Live: https://tandx28.github.io/gatebound/ (GitHub Pages, public repository
  `tandx28/gatebound`). Every push to `main` runs the tests and deploys.
- The owner plays each change and reports back in plain language. They are not
  reading the code, so what you tell them must be true and checkable in play.

## How it is built

TypeScript, Vite, Three.js 0.187, Vitest. No framework, no backend.

Three layers, with a strict one-way dependency:

1. **Simulation** (`src/game`, `src/engine`). Pure TypeScript on a flat 2D
   plane. One `World` object holds all state; `step(world, controls, dt)`
   advances it by a fixed `STEP = 1/120` s. It never touches the DOM, WebGL,
   audio, storage, the clock or `Math.random` directly (it uses `world.rng`
   and `world.today`). It is what the tests and the balance bot run.
2. **Presentation** (`src/render`, `src/audio`). Reads the world and draws or
   plays it. Never changes game state. `scene3d.ts` is the WebGL view,
   `hud.ts` is a 2D canvas laid over it, `rigs.ts` builds jointed figures
   from boxes, `models.ts` loads the skinned KayKit models that replace them
   for human and undead kinds.
3. **Shell** (`src/main.ts`). The frame loop, input wiring, `localStorage`,
   audio unlock, WebGL context-loss recovery, error reporting.

Conventions that everything relies on:

- Simulation point `(x, y)` is Three.js `(x, 0, y)`. A facing angle `a` is
  `rotation.y = -a`. Figures face +X and stand on y = 0.
- The room is `ROOM.w × ROOM.h` (1400 × 900). The HUD is drawn in a fixed
  1280 × 720 space (`VIEW_W`, `VIEW_H`) and scaled by CSS.
- Input reaches the simulation only through the `Controls` interface
  (`src/engine/input.ts`). One-shot presses are queued and taken with
  `consume(code)`; tests use a `FakeControls`.
- Sound: the simulation calls `sfx(w, id)`, which pushes an id onto
  `w.sounds`; the shell plays and clears them. Ids are the keys of `RECIPES`
  in `src/audio/sfx.ts`. All sound and music is synthesised; there are no
  audio files.
- Buttons: `src/game/ui.ts` returns rectangles with string ids such as
  `buy:3` or `echo:toggle:2`. `hud.ts` draws them; `hubAction` in
  `profile.ts` acts on the id. Layout lives in `ui.ts` so tests can check it.
- An owned item is a string: base id plus perks, e.g. `iron_fang+poison`.
  Use `baseOf`, `perksOf`, `itemDef`, `makeItem` from `items.ts`.
- Rendering is interpolated: every moving thing carries `px, py` (where it
  was one step ago) and the view draws between the two with `alpha`.
- Classes: `profile.classUnlocked` means the rite is done; `profile.cls` is
  the class in use. Anything about echoes (binding, remnants, the army, the
  Echoes tab) checks `isCaller(profile)`, not `classUnlocked`. H runs
  `classPower` in `world.ts`; `armyCd` is the cooldown for every class.
  Skill slots 5 to 7 open with New Game+ cycles: check `slotOpen`.
- Effects: the simulation pushes `w.fx` entries (kinds in `FxShow`) and
  `w.blasts` with a `show`; `src/render/effects.ts` draws them from pooled
  meshes and its own motes. Visual-only randomness (sparks, ash, auras) lives
  there and uses `Math.random`, never `w.rng`: drawing must not change the
  game's dice, or the balance bot's results shift.
- A new weapon item needs a `FORMS` entry in `src/render/weapons.ts` of its
  own type (a test checks every weapon has one). Glow strength follows rarity:
  gems and runes only below rare, the edge from rare, the pattern animates from
  legendary, moving parts only on mythics.
- Anything drawn only for play (auras, rings, aim line, footprints, marks)
  is hidden while `w.cutscene` runs.
- `GateKind` "practice" (`enterPractice`, `w.practice`) is the ultimate
  showcase: a scene in which the hunter uses the ultimate on its own (input
  is replaced by `SHOWCASE_HANDS`), on inert targets, untouchable, never
  settled, never saved as a resumable gate. `profile.ultPick` is which worn
  mythic's ultimate Y uses (`ultimateOf`).
- Pillars carry a `style` (view only, 0 to 3 per theme, or `WALL_STYLE`);
  `pillarFor` in decor.ts builds each shape. Ultimate names and text live in
  `ULTIMATES` (items.ts).
- `parseSave` also catches up rewards a save earned before they existed
  (New Game+ titles, ending titles, Nightmare); add to it when a new reward
  hangs off progress the player may already have.
- The attack button is latched (`w.attackLatched`) when play resumes with it
  held, so a click on the board or a menu never swings.
- Special-gate scenes play in full only when `w.specialScenes` is on (the
  shell sets it); tests and the bot see the title card (`w.sting`).
- The secret: five struck lines (`earnLine`, `STRUCK_LINES` in profile.ts),
  glyph stones on tower floor 13 (`GLYPH_ORDER`), the margin gate and the
  Redactor (`redactor.ts`). Do not print the answer in the README.
- Look up tables keyed by outside strings (saves, ids) with `has()` from
  items.ts, never `key in table` or a bare `table[key]`: those also find
  `constructor`, `toString` and `__proto__`.
- The published page carries a CSP (vite.config.ts): no inline scripts, no
  eval, nothing from other sites. Anything new that loads a resource must fit it.
- Saves: `localStorage["gatebound.save"]`, versioned (`SAVE_VERSION` in
  `save.ts`). `parseSave` rebuilds a profile field by field from untrusted
  input and is the only way a save gets in. Device settings live separately
  in `gatebound.settings`.

## Map

```
index.html              two stacked canvases: #view (WebGL) and #hud (2D)
src/main.ts             shell: loop, storage, audio unlock, context loss
src/engine/             input.ts (Controls), rng.ts (seeded), vec.ts
src/game/
  config.ts             every tuning number: player, skills, enemy kinds, ranks
  state.ts              World, Profile, Player, Enemy, Ally… and small helpers
  world.ts              createWorld, entering gates and rooms, step()
  enemies.ts            every enemy kind's behaviour and damageEnemy
  allies.ts             echoes on the field
  combat.ts, perks.ts   geometry of hits; weapon perk effects
  stats.ts              levels, stat points, derived values (LEVEL_CAP 60)
  items.ts              weapons, armour, rarities, perks, mythics, titles
  profile.ts            everything between gates: shop, quests, loot, hubAction
  quests.ts, story.ts   main and side quests, chapters, dialogue text
  cutscenes.ts          cutscene scripts and their stepping (pure data + state)
  rooms.ts              pillars and floor traps: worked out from the room, never saved
  dungeon.ts            room-graph generator
  save.ts               save format, validation, migration
  ui.ts                 button rectangles for the board (eleven tabs, skill pages,
                        Hunter and Trials tabs), pause and status menus
  classes.test.ts       classes, extra skill slots, new skills, time trial, boss rush,
                        and a check that every tab's buttons fit at 1280 × 720
  bestiary.ts           kills per kind, lore, damage bonus tiers
  redactor.ts           the hidden boss: its moves and its hazards on the floor
  secret.test.ts        staff, charged bow, ultimates, bestiary, multi-boss floors,
                        the struck lines, the margin and the Redactor
  balance/              bot.ts (scripted player), balance.test.ts (locked
                        difficulty targets), report.test.ts, stuck.test.ts
  *.test.ts             unit tests beside the code they cover
src/render/
  scene3d.ts            the 3D view; reads World, owns all GPU objects
  hud.ts                the 2D overlay: bars, board, menus, captions
  effects.ts            3D skill and ultimate effects, auras, ash, dust, hazards
  rigs.ts               built figures and poses for every kind
  models.ts             KayKit model specs, loading, animation
  weapons.ts            one built form per named weapon (FORMS), glow patterns,
                        animateWeapon for glow and mythic moving parts
  preview.ts            the turning weapon on the shop/gear tabs: own small scene,
                        drawn by the main renderer into PREVIEW_VIEW (ui.ts)
src/audio/              sfx.ts (effects), compose.ts + director.ts + music.ts
public/models/          trimmed .glb files (CC0) and their LICENSE.txt
public/                 favicon.svg, icon-512.png, og.jpg (social card), manifest,
                        robots.txt, sitemap.xml: absolute URLs point at the live site
vite.config.ts          relative base, three.js in its own chunk, and the
                        Content-Security-Policy meta tag (build only)
docs/                   screenshot.jpg for the README, LAUNCH.md (post drafts)
LICENSE, CONTRIBUTING.md, SECURITY.md, .github/ISSUE_TEMPLATE/
tools/trim_models.py    cuts source .glb files down to the clips in use
.github/workflows/      deploy.yml: npm ci, npm test, npm run build, Pages
```

## Commands

```bash
npm install          # once
npm run dev          # dev server on :5173
npm test             # all unit tests (vitest run)
npm run typecheck    # tsc --noEmit (strict, no unused locals or parameters)
npm run build        # typecheck, then static build into dist/
npm run balance      # bot-played difficulty report (slow; read the table)
```

- One test file: `npx vitest run src/game/world.test.ts`.
- Stuck-bot hunt: `STUCK=1 npx vitest run src/game/balance/stuck.test.ts`.
- Deploy: push to `main`; watch with `gh run watch <id> --exit-status`. If no
  run starts, `gh workflow run deploy.yml --ref main`.

In a dev build the page exposes hooks for checking by hand or from a browser
tool: `window.__world`, `__advance(seconds)` (runs the simulation and
redraws; use it because background tabs throttle frames), `__input`,
`__scene`, `__audio`, `__music`. Modules can be imported in the console:
`await import('/src/game/world.ts')` returns the live instances.

## Coding rules

- Game rules go in `src/game` and get a test. If a behaviour cannot be tested
  without a browser, it is in the wrong layer.
- `src/game` must not import from `src/render`, `src/audio` or `main.ts`.
- Numbers that tune the game live in `config.ts` (or `items.ts` for gear),
  named and commented, never inline in behaviour code.
- No `Math.random`, `Date`, `performance`, `window` or `document` in
  `src/game`. Use `w.rng()`; the shell supplies the day as `w.today`.
- Strict TypeScript. No `any`, no `@ts-ignore`; a single `@ts-expect-error`
  with a reason is acceptable where typings genuinely do not exist.
- Add a field to `World`, `Profile`, `Player`, `Enemy` or `Ally`? Give it a
  doc comment, initialise it in the constructor function (`createWorld`,
  `newProfile`, `makeEnemy`, `makeAlly`), reset it wherever its siblings are
  reset (`beginGate`, `toSelect`, `clearField`, `resetPlayer`), and if it is
  on `Profile`, read it in `parseSave` with a bounded default.
- Changing the meaning of saved data (reordering quests, renaming ids)
  needs a `SAVE_VERSION` bump and a migration in `parseSave`, with a test
  that loads an old-shaped save.
- Everything the GPU holds is freed when its owner goes: use `disposeTree`.
  Model geometry is shared between copies and marked `userData.shared`.
- Comments say why, in plain English, and are kept true. Do not delete or
  reword comments you were not asked to change.
- Match the surrounding style: small functions, early returns, data tables
  over branching, no new dependencies without asking.
- Commit messages: imperative summary line, a short body saying what the
  player will notice. Work on a branch or worktree; fast-forward `main`.

## Design rules

- **Original world only.** Never add names, characters, monsters, art,
  music or story beats from Solo Leveling or any other existing work, even
  if asked for "the same as". Offer an original equivalent instead.
- **Hard but fair.** Three hits kill a fresh hunter. Every damaging attack
  is telegraphed on the ground before it lands (`RING_WARNING`, wind-ups);
  nothing may hit the instant it appears. A boss changing phase pushes the
  player away harmlessly before its new attacks begin.
- **Difficulty is measured, not guessed.** `balance.test.ts` pins how the bot
  fares at each rank: a wall at the entry level, routine by the end of the
  rank. If you change combat numbers, run `npm run balance`, read the table,
  and move the pinned targets only on purpose.
- **Death costs** gold and experience and the run's loot; it never deletes
  gear or progress.
- **The save carries over.** Every release must load every earlier save.
- **Assets:** code-generated first. Outside assets must be CC0 (or the
  owner's own), credited in `public/models/LICENSE.txt` and the README, and
  the whole download stays under 30 MB. Ask the owner, with file names,
  source and size, before downloading anything.
- **Lighting is restrained:** tone-mapped, little bloom; glow is reserved
  for things the player must notice (telegraphs, eyes, the Ledger's blue).
- **HUD:** monospace, the blue/cyan/gold palette in `hud.ts`. Text must fit
  its box at 1280 × 720; long item names and nine tabs are the usual
  offenders.
- **Cutscenes** are in-engine, under 40 seconds each, skippable by holding
  Esc for 2 seconds, and replayable from the Story tab.
- **Build first, test once.** When several features are agreed, write them
  all (typecheck as you go), then do one pass of tests, balance, browser
  check and publish. The owner's usage is limited and testing is the cost.
- **Out of scope** unless the owner asks: touch controls, multiplayer,
  voice acting, accounts, servers.

## Mistakes to avoid

| Mistake | Why it bites | Do this instead |
| --- | --- | --- |
| Putting a rule in `scene3d.ts` or `hud.ts` | Untestable; the bot never sees it | Put it in `src/game`, expose state, draw from state |
| Reading the mouse or keys directly in game code | Breaks tests and the bot | Use `Controls`; add to the interface if something is missing |
| `Math.random()` in the simulation | Tests and the balance report stop being repeatable | `w.rng()` |
| Adding a `Profile` field and forgetting `parseSave` | The field silently resets on every load | Parse it, bound it, test the round trip |
| Inserting a quest mid-chain without migration | Old saves point at the wrong quest | Bump `SAVE_VERSION`, map old index to new by id |
| Declaring a visual change done from tests alone | Tests cannot see a figure sunk in the floor, text off its panel, or a white screen | Open the page, drive it with `__advance`, look at a screenshot, read the console |
| Judging motion from one screenshot of a background tab | Frames are throttled; you see a stale frame | Call `__advance(t)` then capture; capture twice if unsure |
| Fixing a failing test by loosening it | Hides the defect the test was written for | Find which object fails (print it), fix the cause; change a test only when the *intent* changed, and say so |
| Calling the dungeon generator in a test with a constant `rng` | It loops for ever looking for a free cell | Give it `seeded(n)` |
| Tuning damage or health by feel | One rank becomes a wall or a walkover | Change `config.ts`, run `npm run balance`, compare with the pinned targets |
| An attack that damages on its first frame | Unavoidable hits; the owner has already complained about this once | Warn first: `Shockwave.wait`, zone timers, wind-up states |
| Clearing the field without thinking what must survive | Boss remnants and held gates vanish | Check `clearField` callers; preserve what the player is meant to act on |
| Disposing a shared model's geometry | Every other copy re-uploads or breaks | Honour `userData.shared`; clone materials per figure, not geometry |
| Adding, removing or hiding a light during play (including hiding a group that holds one) | The GPU rebuilds every lit surface's shader: a 1-2 s freeze | Keep the light count fixed; set `intensity = 0` instead, borrow from the torch pool in `scene3d.ts` |
| Forgetting WebGL context loss | "The screen went white" mid-fight | Keep all GPU state inside `Scene3D` so `main.ts` can rebuild it |
| Writing node names with dots when looking up bones | three.js strips dots on load (`handslot.r` → `handslotr`) | Use the `bone()` helper in `models.ts` |
| Referring to an animation clip that was trimmed away | Figure freezes in a T-pose | Add the clip to `KEEP` in `tools/trim_models.py`, re-run it, and keep `models.test.ts` passing |
| Letting the tab bar or a row overflow | Buttons overlap or leave the screen | Compute widths from the count; check at 1280 × 720 |
| Queueing two sounds or notices per frame for one event | Noise; notices back up | One `sfx` and one notice per event |
| Long `sleep` loops while waiting for CI | Wasted time, blocked shells | `gh run watch <id> --exit-status` |
| Pushing straight after tests pass locally | The live site is what the owner plays | After the deploy succeeds, fetch the live page and confirm the new bundle and assets are served |
| Reporting "done" with untested parts unmentioned | The owner finds out in play | Say exactly what was checked and what was not |
| Copying a named character or monster because the owner asked | The game is public | Decline that part, build an original with the same role |
| Downloading or installing without asking | Not yours to decide | Ask with file name, source, size and licence |

## Before you say a task is done

1. `npm run typecheck` is clean.
2. `npm test` passes, and new behaviour has a test that fails without it.
3. If combat, enemy or level numbers changed: `npm run balance` was run and
   the pinned targets in `balance.test.ts` still hold or were moved on
   purpose.
4. `npm run build` succeeds.
5. You opened the game in a browser and exercised the change itself: saw it
   on screen, read the console (no errors), checked the HUD still fits.
6. An existing save still loads: either a migration test, or you loaded one.
7. Nothing leaks: enemies, echoes and rooms that go away are disposed.
8. The README and this file still describe the game (controls, features,
   map of files).
9. If the owner asked for it to be published: committed, fast-forwarded to
   `main`, pushed, the deploy run succeeded, and the live site serves the new
   build.
10. Your report says, in plain words: what changed for the player, what you
    verified and how, what you did not verify, and anything you chose on
    the owner's behalf.
