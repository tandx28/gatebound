"""Cut the KayKit character files down to what the game uses.

Each source .glb carries every animation in its pack (76 to 95 clips, about
3 MB). The game needs about twenty, and since every character in a pack shares
one skeleton, only one file per pack has to carry them.

Usage: python3 tools/trim_models.py <folder of source .glb files> public/models

Sources (CC0, Kay Lousberg):
  github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
  github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0
"""
import json
import struct
import sys
from pathlib import Path

# Clips the game plays, plus a few held back for the story scenes.
KEEP = {
    "Idle", "Idle_Combat", "Unarmed_Idle", "2H_Melee_Idle", "Running_A", "Walking_A",
    "1H_Melee_Attack_Chop", "1H_Melee_Attack_Slice_Horizontal", "1H_Melee_Attack_Stab",
    "2H_Melee_Attack_Slice", "2H_Melee_Attack_Stab", "Dualwield_Melee_Attack_Slice",
    "Unarmed_Melee_Attack_Punch_A", "2H_Ranged_Shoot", "Spellcast_Shoot", "Spellcast_Raise",
    "Blocking", "Hit_A", "Jump_Idle", "Dodge_Forward", "Death_A", "Death_A_Pose",
    "Cheer", "Sit_Floor_Idle", "Lie_Idle",
}
# The one file in each pack that carries the clips for the rest.
CARRIERS = {"Rogue_Hooded.glb", "Skeleton_Minion.glb"}


def trim(src: Path, dst: Path) -> None:
    raw = src.read_bytes()
    assert raw[:4] == b"glTF"
    jlen = struct.unpack("<I", raw[12:16])[0]
    doc = json.loads(raw[20 : 20 + jlen])
    blob = raw[20 + jlen + 8 :]

    anims = doc.get("animations", [])
    doc["animations"] = [a for a in anims if a["name"] in KEEP] if src.name in CARRIERS else []
    if not doc["animations"]:
        del doc["animations"]

    # Which accessors are still referenced.
    used: list[int] = []

    def use(i: int) -> int:
        if i not in used:
            used.append(i)
        return used.index(i)

    for mesh in doc["meshes"]:
        for prim in mesh["primitives"]:
            prim["attributes"] = {k: use(v) for k, v in prim["attributes"].items()}
            if "indices" in prim:
                prim["indices"] = use(prim["indices"])
            for target in prim.get("targets", []):
                for k in target:
                    target[k] = use(target[k])
    for skin in doc.get("skins", []):
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = use(skin["inverseBindMatrices"])
    for anim in doc.get("animations", []):
        for s in anim["samplers"]:
            s["input"] = use(s["input"])
            s["output"] = use(s["output"])
    accessors = [doc["accessors"][i] for i in used]

    # Which buffer views those accessors and the images need, repacked end to end.
    views: list[int] = []
    out = bytearray()
    new_views = []

    def view(i: int) -> int:
        if i in views:
            return views.index(i)
        views.append(i)
        v = dict(doc["bufferViews"][i])
        start = v.get("byteOffset", 0)
        while len(out) % 4:
            out.append(0)
        v["byteOffset"] = len(out)
        v["buffer"] = 0
        out.extend(blob[start : start + v["byteLength"]])
        new_views.append(v)
        return len(new_views) - 1

    for a in accessors:
        assert "sparse" not in a
        a["bufferView"] = view(a["bufferView"])
    for img in doc.get("images", []):
        img["bufferView"] = view(img["bufferView"])
    while len(out) % 4:
        out.append(0)

    doc["accessors"] = accessors
    doc["bufferViews"] = new_views
    doc["buffers"] = [{"byteLength": len(out)}]

    text = json.dumps(doc, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(out)
    dst.write_bytes(
        b"glTF" + struct.pack("<II", 2, total) + struct.pack("<I", len(text)) + b"JSON" + text + struct.pack("<I", len(out)) + b"BIN\0" + bytes(out)
    )
    print(f"{src.name}: {len(raw) // 1024} KB -> {total // 1024} KB, {len(doc.get('animations', []))} clips")


if __name__ == "__main__":
    source, target = Path(sys.argv[1]), Path(sys.argv[2])
    target.mkdir(parents=True, exist_ok=True)
    for f in sorted(source.glob("*.glb")):
        trim(f, target / f.name.lower())
