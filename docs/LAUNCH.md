# Launch kit

Drafts for telling people about the game. Nothing here has been posted:
copy, edit to your own voice, and post yourself. Each site has its own rules
about self-promotion; read them first (notes under each draft).

- Play: https://tandexun.dev/gatebound/
- Code: https://github.com/tandx28/gatebound
- Social card: `public/og.jpg` (1200 × 630), screenshot: `docs/screenshot.jpg`

## One-liners

- A free, open-source 3D action RPG in your browser: start as the weakest
  hunter, clear gates, level up, and bind the monsters you kill into an army.
- Weakest hunter, deadliest gates, an army of echoes. Free, open source, no
  download.

## Reddit: r/WebGames

Title: **Untitled Levelling Game: a free 3D action RPG in the browser: weakest hunter, deadly gates, an army of the things you kill**

> I've been building a browser action RPG in TypeScript and Three.js. You start
> as the lowest-ranked hunter, clear generated gates from rank E to S, level to
> 60, and after a rite you can bind the enemies you kill (bosses too) to fight
> beside you.
>
> It's meant to be hard but fair: three hits kill a fresh hunter, and every
> attack is warned of on the floor before it lands. There are four classes,
> twenty skills, nine mythics with their own ultimates, New Game+, a tower, a
> boss rush, and a secret boss for people who finish the story.
>
> Desktop, keyboard and mouse. No account, saves in your browser.
> Play: https://tandexun.dev/gatebound/
>
> It's open source (MIT) if you want to look at how it works. Feedback very
> welcome, especially on difficulty.

Notes: r/WebGames wants a direct link to a playable game; post the play
link as the post's URL, put the text in a comment.

## Reddit: r/IndieDev or r/gamedev (Screenshot Saturday / feedback threads)

Title: **I made a 3D action RPG that runs in the browser, and a bot that plays every rank to keep the difficulty honest**

> Most of my tuning problems went away when I wrote a scripted player. The
> game is a pure simulation stepped at 120 Hz with no rendering in it, so a
> bot can play a whole gate in milliseconds. A test suite pins how the bot fares
> at each rank (a wall at the entry level, routine by the end of the rank),
> so if I change a damage number and a rank becomes a walkover, the build
> fails.
>
> Everything else is made in code too: generated rooms, synthesised music and
> sound, weapons built from shapes. The only outside assets are some CC0
> character models.
>
> Play: https://tandexun.dev/gatebound/
> Code (MIT): https://github.com/tandx28/gatebound
>
> Happy to answer questions about the architecture.

Notes: r/gamedev only allows self-promotion in its weekly threads; r/IndieDev
is more relaxed. Lead with something useful to other developers.

## Hacker News: Show HN

Title: **Show HN: A 3D action RPG in the browser, balanced by a bot that plays every rank**

> I built this in TypeScript and Three.js. The game logic is a pure,
> deterministic simulation (seeded randomness, fixed 120 Hz step, no DOM or
> WebGL), which made two things easy: 670-odd unit tests, and a scripted
> player that plays every rank so difficulty targets are checked on every
> push.
>
> Music and sound are synthesised at runtime, rooms are generated, and the
> whole download is about 6 MB. MIT licensed.
>
> Play: https://tandexun.dev/gatebound/
> Code: https://github.com/tandx28/gatebound

Notes: post the play link as the URL. Be around for the first hour or two to
answer comments.

## itch.io page

The repository can build a zip for itch.io (`npm run build`, then zip the
contents of `dist/`; upload as "HTML", tick "This file will be played in the
browser", viewport 1280 × 720, and tick "Fullscreen button").

- Title: Untitled Levelling Game
- Short description: Start as the weakest hunter. Clear gates, level up, bind an army.
- Genre: Action / Role Playing
- Tags: action-rpg, dungeon-crawler, 3d, browser, singleplayer, open-source, roguelite, hack-and-slash
- Pricing: No payments (or "pay what you want" with a 0 minimum)

Description:

> You are the lowest-ranked hunter in the city of Veyra. A gate goes wrong,
> you should have died, and you wake with your name in the Ledger, a system
> only you can see.
>
> - Real-time 3D combat: five weapon types, twenty skills, four classes
> - Generated gates from rank E to S, each ending in a boss with stages
> - Bind the enemies you kill, bosses included, into an army of echoes
> - Nine mythics, each with its own ultimate
> - New Game+, Nightmare, an endless Tower, a Time Trial, a Boss Rush
> - A secret for those who finish the story
>
> Hard but fair: three hits kill a fresh hunter, and every attack is warned of
> before it lands.
>
> Open source (MIT): https://github.com/tandx28/gatebound

## Other places worth a listing

- GitHub: the repository's description and topics are set; pin it on your
  profile.
- Newgrounds and Game Jolt both take HTML5 games.
- Discord servers for Three.js and for web games have showcase channels.
- A short screen recording (20 to 30 seconds of a boss fight) does more on
  social sites than any screenshot.
