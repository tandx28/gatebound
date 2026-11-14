// @ts-expect-error The project has no Node typings; the test runner provides the module.
import * as fs from "node:fs";
import { describe, expect, it } from "vitest";
import { KINDS } from "../game/config";
import { CARRIER, HUNTER_MODEL, MODEL_FILES, MODELS, NPC_MODELS, type ModelSpec } from "./models";

const DIR = new URL("../../public/models/", import.meta.url);
const files: string[] = fs.readdirSync(DIR);

/** The JSON part of a .glb file. */
function read(file: string): { nodes: { name: string }[]; animations?: { name: string }[] } {
  const raw = fs.readFileSync(new URL(`${file}.glb`, DIR));
  expect(raw.toString("latin1", 0, 4)).toBe("glTF");
  return JSON.parse(raw.toString("utf8", 20, 20 + raw.readUInt32LE(12)));
}

const specs: [string, ModelSpec][] = [["player", HUNTER_MODEL], ...(Object.entries(MODELS) as [string, ModelSpec][]), ...Object.entries(NPC_MODELS)];

describe("models", () => {
  it("every model the game asks for is shipped, and nothing else", () => {
    const shipped = files.filter((f) => f.endsWith(".glb")).map((f) => f.replace(".glb", "")).sort();
    expect(shipped).toEqual([...MODEL_FILES].sort());
  });

  it("the models stay well inside the download budget", () => {
    const bytes = files.reduce((sum, f) => sum + fs.statSync(new URL(f, DIR)).size, 0);
    expect(bytes).toBeLessThan(8 * 1024 * 1024);
  });

  it("every clip a figure plays exists in its pack", () => {
    const always = ["Idle", "Running_A", "2H_Ranged_Shoot", "Spellcast_Shoot", "Blocking", "Hit_A", "Jump_Idle", "Lie_Idle"];
    const hunter = ["1H_Melee_Attack_Slice_Horizontal", "1H_Melee_Attack_Chop", "2H_Melee_Attack_Stab", "Unarmed_Melee_Attack_Punch_A"];
    for (const [name, spec] of specs) {
      const clips = new Set((read(CARRIER[spec.pack]).animations ?? []).map((a) => a.name));
      const wanted = [...always, spec.strike, spec.thrust, spec.cast, spec.idle, ...(name === "player" ? hunter : [])];
      for (const clip of wanted) if (clip) expect(clips.has(clip), `${name}: ${clip}`).toBe(true);
    }
  });

  it("every part a figure shows, and both hands, exist in its model", () => {
    for (const [name, spec] of specs) {
      const nodes = new Set(read(spec.file).nodes.map((n) => n.name));
      for (const part of ["handslot.r", "handslot.l", ...(spec.show ?? [])]) expect(nodes.has(part), `${name}: ${part}`).toBe(true);
    }
    expect(read(HUNTER_MODEL.file).nodes.some((n) => n.name === "Knife")).toBe(true);
  });

  it("only real enemy kinds have models, and the odd-shaped ones keep their built figures", () => {
    for (const kind of Object.keys(MODELS)) expect(kind in KINDS).toBe(true);
    for (const kind of ["charger", "leaper", "queen", "commander", "warden", "colossus", "exploder", "egg", "totem"]) expect(kind in MODELS).toBe(false);
  });
});
