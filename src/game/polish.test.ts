import { describe, expect, it } from "vitest";
import type { Controls } from "../engine/input";
import { seeded } from "../engine/rng";
import { PLAYER, ROOM, STEP, VIEW_W } from "./config";
import { ITEMS, makeItem } from "./items";
import { refreshDerived, settleClear } from "./profile";
import { addCrit, CRIT_CAP, CRIT_OVERFLOW, derive } from "./stats";
import type { World } from "./state";
import { bagView, hoveredItem, hubButtons, PREVIEW, PREVIEW_VIEW, previewWeapon } from "./ui";
import { hubAction } from "./profile";
import { createWorld, enterGate, enterKeyGate, step } from "./world";

class FakeControls implements Controls {
  mouseX = 0;
  mouseY = 0;
  aimX = ROOM.w / 2 + 300;
  aimY = ROOM.h / 2;
  attackHeld = false;
  move = { x: 0, y: 0 };
  private presses = new Set<string>();
  axis() {
    return this.move;
  }
  press(code: string) {
    this.presses.add(code);
  }
  consume(...codes: string[]) {
    let hit = false;
    for (const c of codes) if (this.presses.delete(c)) hit = true;
    return hit;
  }
}

function run(w: World, c: Controls, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) step(w, c, STEP);
}

describe("the struck line for a gate cleared without a basic attack", () => {
  it("a button still held from the board swings nothing until it is let go", () => {
    const w = createWorld(seeded(4));
    w.mode = "select";
    const c = new FakeControls();
    // The click that chose the gate, still held as the gate opens.
    c.attackHeld = true;
    step(w, c, STEP);
    enterGate(w, "E");
    w.enemies = [];
    run(w, c, 1);
    expect(w.run.swings).toBe(0);
    // Let go, then press: that is a real swing.
    c.attackHeld = false;
    run(w, c, 0.1);
    c.attackHeld = true;
    run(w, c, 0.1);
    expect(w.run.swings).toBeGreaterThan(0);
  });

  it("is earned on any cleared gate kind, not only the plain ones", () => {
    const w = createWorld(seeded(4));
    w.profile.keys = 1;
    enterKeyGate(w);
    expect(w.gateKind).toBe("key");
    settleClear(w);
    expect(w.profile.lines).toContain(0);
  });

  it("is not earned once a basic attack was used", () => {
    const w = createWorld(seeded(4));
    enterGate(w, "E");
    w.run.swings = 1;
    settleClear(w);
    expect(w.profile.lines).not.toContain(0);
  });
});

describe("crit past the cap", () => {
  it("chance stops at the cap and the rest becomes crit damage", () => {
    const d = derive({ str: 5, agi: 5, vit: 5, sen: 5, int: 5 });
    expect(d.critMult).toBe(PLAYER.critMult);
    addCrit(d, 1);
    expect(d.critChance).toBe(CRIT_CAP);
    expect(d.critMult).toBeCloseTo(PLAYER.critMult + (d.critRaw - CRIT_CAP) * CRIT_OVERFLOW);
    expect(d.critMult).toBeGreaterThan(PLAYER.critMult);
  });

  it("a high-Sense hunter with a crit dagger hits harder on a crit than one at the cap", () => {
    const w = createWorld(seeded(4));
    w.player.prog.stats.sen = 80;
    w.profile.equipped.weapon = makeItem("nightglass", []);
    refreshDerived(w);
    expect(w.player.d.critChance).toBe(CRIT_CAP);
    expect(w.player.d.critMult).toBeGreaterThan(PLAYER.critMult);
  });
});

describe("the weapon preview", () => {
  it("shows the hovered weapon row, else the weapon in hand, and never armour", () => {
    const w = createWorld(seeded(4));
    w.mode = "select";
    w.tab = "gear";
    w.profile.equipped.weapon = makeItem("militia_sword", []);
    w.profile.inventory = [makeItem("kingfisher", []), makeItem("padded_coat", [])];
    expect(previewWeapon(w)).toBe(w.profile.equipped.weapon);
    const rows = hubButtons(w).filter((b) => b.item);
    const bow = rows.find((b) => b.item === w.profile.inventory[0])!;
    // Anywhere along the row counts, not only its button.
    w.hoverItem = hoveredItem(w, (bow.textX ?? 0) + 20, bow.rect.y + 10);
    expect(previewWeapon(w)).toBe(w.profile.inventory[0]);
    const coat = rows.find((b) => b.item === w.profile.inventory[1])!;
    w.hoverItem = hoveredItem(w, (coat.textX ?? 0) + 20, coat.rect.y + 10);
    expect(w.hoverItem).toBe(w.profile.inventory[1]);
    expect(previewWeapon(w)).toBe(w.profile.equipped.weapon);
    w.tab = "skills";
    expect(previewWeapon(w)).toBeNull();
  });

  it("its box sits clear of every button on the shop and gear tabs, inside the view", () => {
    const w = createWorld(seeded(4));
    w.mode = "select";
    w.profile.inventory = Object.keys(ITEMS).slice(0, 20).map((id) => makeItem(id, []));
    for (const tab of ["shop", "gear"] as const) {
      w.tab = tab;
      for (const b of hubButtons(w)) {
        if (b.kind === "tab") continue;
        const r = b.rect;
        const apart = r.x + r.w <= PREVIEW.x || r.x >= PREVIEW.x + PREVIEW.w || r.y + r.h <= PREVIEW.y || r.y >= PREVIEW.y + PREVIEW.h;
        expect(apart, `${tab} ${b.id}`).toBe(true);
      }
    }
    expect(PREVIEW.x + PREVIEW.w).toBeLessThanOrEqual(VIEW_W);
    expect(PREVIEW.y + PREVIEW.h).toBeLessThanOrEqual(700);
    expect(PREVIEW_VIEW.x).toBeGreaterThanOrEqual(PREVIEW.x);
    expect(PREVIEW_VIEW.x + PREVIEW_VIEW.w).toBeLessThanOrEqual(PREVIEW.x + PREVIEW.w);
    expect(PREVIEW_VIEW.y + PREVIEW_VIEW.h).toBeLessThanOrEqual(PREVIEW.y + PREVIEW.h);
  });
});

describe("filtering and sorting the bag", () => {
  function bagged(): World {
    const w = createWorld(seeded(4));
    w.mode = "select";
    w.tab = "gear";
    w.profile.inventory = [makeItem("iron_fang", []), makeItem("padded_coat", []), makeItem("oathkeeper", []), makeItem("focus_ring", []), makeItem("gatecleaver", []), makeItem("aegis_of_veyra", [])];
    return w;
  }
  const ids = (w: World) => bagView(w).map((v) => v.owned.split("+")[0]);

  it("shows the newest first by default, and every action still points at the right item", () => {
    const w = bagged();
    expect(ids(w)[0]).toBe("aegis_of_veyra");
    const equip = hubButtons(w).find((b) => b.item === w.profile.inventory[2])!;
    expect(equip.id).toBe("equip:2");
  });

  it("filters by kind and by rarity, and the switches step round", () => {
    const w = bagged();
    hubAction(w, "bag:kind");
    expect(w.bagKind).toBe("weapon");
    expect(ids(w).sort()).toEqual(["gatecleaver", "iron_fang", "oathkeeper"]);
    hubAction(w, "bag:rarity");
    hubAction(w, "bag:rarity");
    hubAction(w, "bag:rarity");
    expect(ids(w)).toEqual(["oathkeeper"]);
    hubAction(w, "bag:kind");
    expect(ids(w)).toEqual(["aegis_of_veyra"]);
    hubAction(w, "bag:kind");
    hubAction(w, "bag:kind");
    hubAction(w, "bag:rarity");
    expect(w.bagKind).toBe("all");
    expect(w.bagRarity).toBe(0);
    expect(ids(w)).toHaveLength(6);
  });

  it("sorts by rarity, name and kind without changing the bag itself", () => {
    const w = bagged();
    const before = [...w.profile.inventory];
    hubAction(w, "bag:sort");
    expect(ids(w).slice(0, 2).sort()).toEqual(["aegis_of_veyra", "oathkeeper"]);
    hubAction(w, "bag:sort");
    expect(ids(w)[0]).toBe("aegis_of_veyra");
    hubAction(w, "bag:sort");
    expect(ids(w).slice(0, 3)).toEqual(["iron_fang", "oathkeeper", "gatecleaver"]);
    expect(ids(w).slice(3, 5).sort()).toEqual(["aegis_of_veyra", "padded_coat"]);
    expect(w.profile.inventory).toEqual(before);
  });

  it("a filter goes back to the first page", () => {
    const w = bagged();
    w.profile.inventory = Array.from({ length: 20 }, () => makeItem("iron_fang", []));
    w.invPage = 2;
    hubAction(w, "bag:sort");
    expect(w.invPage).toBe(0);
  });
});
