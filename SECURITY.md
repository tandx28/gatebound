# Security

The game is a static page with no server, no accounts and no network calls of
its own: everything it stores is in your own browser's local storage.

The places that take outside input are the save import (System tab) and the
save already in local storage. Both go through `parseSave` in
`src/game/save.ts`, which rebuilds the save field by field, keeps only known
values, and bounds every number. The published page also carries a strict
Content-Security-Policy (scripts only from the site itself).

If you find a way to make the game run code, break someone else's game through
a shared save file, or anything similar, please do not post the details in a public
issue. Use "Report a vulnerability" on the repository's Security tab, or, if
that button is not there, open an issue that says only that you have a
security report, and the owner will give you a private way to send it.
