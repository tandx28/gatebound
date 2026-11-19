# Contributing

Thanks for wanting to help. The game is small enough to read in an afternoon.

## Reporting a bug

Open an issue with:

- what you did, what you expected, and what happened;
- your browser and operating system;
- if the game showed "SOMETHING WENT WRONG": open the browser console
  (F12) and copy the red error, or run
  `localStorage.getItem("gatebound.error")` there and paste the result.

An exported save (System tab, Export) helps a lot with bugs that depend on
progress.

## Suggesting something

Ideas are welcome as issues. The game has a few fixed rules, so read these
first:

- **Original world only.** No names, characters, monsters or story from other
  games, books or shows, even "the same as" something.
- **Hard but fair.** Three hits kill a fresh hunter, and every attack is warned
  of on the floor before it lands.
- **Desktop, keyboard and mouse.** Touch controls, multiplayer and accounts are
  out of scope for now.

## Changing the code

```bash
npm install
npm run dev          # the game on http://localhost:5173
npm test             # every unit test
npm run typecheck
npm run balance      # the bot plays every rank; read the table
```

Before a pull request:

1. `npm run typecheck` and `npm test` pass.
2. New behaviour in `src/game` has a test.
3. If you changed combat or level numbers, run `npm run balance` and say in the
   pull request how the table moved.
4. You played the change in the browser and the console is clean.

[CLAUDE.md](CLAUDE.md) is the full guide to how the code is laid out and the
rules it keeps (the simulation never touches the screen, no `Math.random` in
game code, every save must keep loading, and so on). It is written for AI
coding assistants but reads fine for people.

By contributing you agree that your work is released under the MIT licence.
