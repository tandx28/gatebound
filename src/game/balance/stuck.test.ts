import { describe, it } from "vitest";
import { seeded } from "../../engine/rng";
import { STEP } from "../config";
import { createWorld, enterGate, step } from "../world";
import { applyLoadout, Bot, spendPoints, squadFor } from "./bot";

const env: Record<string, string | undefined> = (globalThis as { process?: { env: Record<string, string> } }).process?.env ?? {};

/** Diagnostic: where does the bot stop making progress? Run with STUCK=1. */
describe.skipIf(!env.STUCK)("stuck runs", () => {
  it("prints the state of runs that time out", () => {
    const build = { str: 0.45, vit: 0.35, agi: 0.2 };
    for (let seed = 1; seed <= 12; seed++) {
      const w = createWorld(seeded(seed * 13));
      w.hiddenChance = 0;
      applyLoadout(w, { level: 42, build, gear: ["nightglass", "bastion_plate"], potions: 3, echoes: squadFor("S", 42) });
      enterGate(w, "S", { sealed: false });
      const bot = new Bot(0.2);
      let t = 0;
      while (w.mode === "gate" && t < 500) {
        bot.update(w, STEP);
        step(w, bot, STEP);
        spendPoints(w, build);
        t += STEP;
        w.sounds.length = 0;
        w.notices.length = 0;
      }
      if (w.mode === "gate") {
        const room = w.dungeon!.rooms[w.roomId];
        console.log(
          `seed ${seed}: stuck in ${room.kind} room, hp ${w.player.hp}, pos ${Math.round(w.player.x)},${Math.round(w.player.y)}, open ${w.doorsOpen}, hold ${w.remnantHold}, bossDead ${w.bossDead}, clearT ${w.clearT}`,
          w.enemies.map((e) => `${e.kind}:${e.state}:${Math.round(e.hp)}/${e.maxHp}:g${Math.round(e.guard)}@${Math.round(e.x)},${Math.round(e.y)}`).join(" | "),
          `remnants ${w.remnants.length} patches ${w.patches.length} allies ${w.allies.length}`,
        );
      }
    }
  }, 900000);
});
