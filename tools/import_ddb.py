#!/usr/bin/env python3
"""Generate a character data file from a D&D Beyond export.

    python3 tools/import_ddb.py 169780614
    python3 tools/import_ddb.py path/to/export.json --out characters/foo.js

The character must be set to Public on D&D Beyond, or the endpoint returns 403.

What this CAN derive: identity, base ability scores and their bonuses, feats,
every proficiency, inventory with weights, currency, and all authored prose.

What it CANNOT derive, and leaves marked with TODO:
  - the person/pack split for inventory (DDB reports everything unequipped)
  - condensed `short` wording for the print sheet
  - feature cards and In Play actions, which are authored per character

So an import gets you a mechanically correct sheet with the prose in place,
and you write the feature cards afterwards.
"""

import argparse
import json
import pathlib
import re
import sys
import urllib.request

ENDPOINT = "https://character-service.dndbeyond.com/character/v5/character/{}"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

ABILITY_BY_ID = {1: "str", 2: "dex", 3: "con", 4: "int", 5: "wis", 6: "cha"}

ALIGNMENTS = {
    1: "Lawful Good", 2: "Neutral Good", 3: "Chaotic Good",
    4: "Lawful Neutral", 5: "True Neutral", 6: "Chaotic Neutral",
    7: "Lawful Evil", 8: "Neutral Evil", 9: "Chaotic Evil",
}

# Standard hit dice, used only to decide whether DDB's baseHitPoints matches
# what the engine would derive on its own.
HIT_DICE = {
    "artificer": 8, "barbarian": 12, "bard": 8, "cleric": 8, "druid": 8,
    "fighter": 10, "monk": 8, "paladin": 10, "ranger": 10, "rogue": 8,
    "sorcerer": 6, "warlock": 8, "wizard": 6,
}

# D&D Beyond entity type ids, which cleanly separate the proficiency kinds.
ENTITY_SKILL = 1958004211
ENTITY_TOOL = 2103445194
ENTITY_WEAPON_GROUP = 660121713
ENTITY_WEAPON = 1782728300

SKILL_KEYS = {
    "acrobatics": "acrobatics", "animal-handling": "animalHandling",
    "arcana": "arcana", "athletics": "athletics", "deception": "deception",
    "history": "history", "insight": "insight", "intimidation": "intimidation",
    "investigation": "investigation", "medicine": "medicine", "nature": "nature",
    "perception": "perception", "performance": "performance",
    "persuasion": "persuasion", "religion": "religion",
    "sleight-of-hand": "sleightOfHand", "stealth": "stealth", "survival": "survival",
}

# Tools whose checks use a known ability, so the engine can derive the bonus.
TOOL_ABILITY = {
    "thieves-tools": "dex", "disguise-kit": "cha", "forgery-kit": "dex",
    "herbalism-kit": "int", "navigators-tools": "wis", "poisoners-kit": "dex",
}


def fetch(source):
    """Load the export from a character id or a local JSON path."""
    path = pathlib.Path(source)
    if path.exists():
        return json.loads(path.read_text())
    if not source.isdigit():
        sys.exit(f"error: {source!r} is neither a character id nor a readable file")
    req = urllib.request.Request(ENDPOINT.format(source), headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 403:
            sys.exit(
                f"error: character {source} is not public (403).\n"
                "Set its privacy to Public on D&D Beyond, or pass a saved JSON file."
            )
        raise


def js(value, indent=0):
    """Render a Python value as readable JavaScript source."""
    pad = "  " * indent
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        body = value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ")
        return f"'{re.sub(r'\\s+', ' ', body).strip()}'"
    if isinstance(value, list):
        if not value:
            return "[]"
        items = ",\n".join(f"{pad}  {js(v, indent + 1)}" for v in value)
        return f"[\n{items},\n{pad}]"
    if isinstance(value, dict):
        if not value:
            return "{}"
        items = ",\n".join(
            f"{pad}  {k}: {js(v, indent + 1)}" for k, v in value.items()
        )
        return f"{{\n{items},\n{pad}}}"
    raise TypeError(type(value))


def uninvert(name):
    """DDB names weapons index-style: "Crossbow, Hand" -> "Hand Crossbow".

    Left as-is, the embedded comma corrupts any comma-joined list of
    proficiencies into what reads as two separate entries.
    """
    if name.count(",") == 1:
        head, tail = (part.strip() for part in name.split(","))
        if head and tail:
            return f"{tail} {head}"
    return name


def all_modifiers(c):
    for bucket, items in (c.get("modifiers") or {}).items():
        for it in items or []:
            yield bucket, it


def build(c):
    """Turn a D&D Beyond character object into our data schema."""
    warnings = []

    classes = [
        {
            "name": k["definition"]["name"],
            "level": k["level"],
            "subclass": (k.get("subclassDefinition") or {}).get("name"),
        }
        for k in c.get("classes", [])
    ]
    for k in classes:
        if k["subclass"] is None:
            del k["subclass"]

    identity = {
        "name": c.get("name"),
        "species": (c.get("race") or {}).get("fullName"),
        "background": ((c.get("background") or {}).get("definition") or {}).get("name"),
        "alignment": ALIGNMENTS.get(c.get("alignmentId")),
        "classes": classes,
    }
    physical = {
        "age": c.get("age"), "height": c.get("height"), "weight": c.get("weight"),
        "eyes": c.get("eyes"), "hair": c.get("hair"), "skin": c.get("skin"),
    }
    physical = {k: v for k, v in physical.items() if v}
    if physical:
        if isinstance(physical.get("weight"), int):
            physical["weight"] = f"{physical['weight']} lb"
        identity["physical"] = physical

    # --- ability scores ------------------------------------------------------
    abilities = {}
    for s in c.get("stats", []):
        abilities[ABILITY_BY_ID[s["id"]]] = s["value"]
    overrides = {
        ABILITY_BY_ID[s["id"]]: s["value"]
        for s in c.get("overrideStats", []) if s.get("value")
    }

    bonuses = []
    for bucket, m in all_modifiers(c):
        if m.get("type") != "bonus":
            continue
        sub = m.get("subType") or ""
        if sub.endswith("-score"):
            ability = sub[: -len("-score")][:3]
            bonuses.append({
                "ability": {"str": "str", "dex": "dex", "con": "con",
                            "int": "int", "wis": "wis", "cha": "cha"}[ability],
                "value": m.get("value"),
                "source": bucket,
            })

    # --- proficiencies -------------------------------------------------------
    saves, skills, expertise, tools, weapons, armour, languages = [], [], [], [], [], [], []
    for _bucket, m in all_modifiers(c):
        kind, sub = m.get("type"), m.get("subType") or ""
        friendly = m.get("friendlySubtypeName") or sub
        entity = m.get("entityTypeId")

        if kind == "language":
            languages.append(friendly)
        elif kind == "expertise" and sub in SKILL_KEYS:
            expertise.append(SKILL_KEYS[sub])
        elif kind == "proficiency":
            if sub.endswith("-saving-throws"):
                saves.append(sub[: -len("-saving-throws")][:3])
            elif entity == ENTITY_SKILL and sub in SKILL_KEYS:
                skills.append(SKILL_KEYS[sub])
            elif entity == ENTITY_TOOL:
                tools.append({"name": friendly, "ability": TOOL_ABILITY[sub]}
                             if sub in TOOL_ABILITY else {"name": friendly})
            elif entity in (ENTITY_WEAPON_GROUP, ENTITY_WEAPON):
                weapons.append(uninvert(friendly).replace(" Weapons", ""))
            elif "armor" in sub:
                armour.append(friendly)
            elif sub not in SKILL_KEYS:
                warnings.append(f"unclassified proficiency: {sub} (entityTypeId {entity})")

    # DDB abbreviates saving throws by full ability name; normalise to our keys.
    save_keys = {"str": "str", "dex": "dex", "con": "con",
                 "int": "int", "wis": "wis", "cha": "cha"}
    saves = [save_keys[s] for s in saves if s in save_keys]

    # --- inventory -----------------------------------------------------------
    grouped = {}
    for item in c.get("inventory", []):
        d = item["definition"]
        row = grouped.setdefault(d["name"], {
            "name": d["name"], "qty": 0,
            "weight": d.get("weight") or 0, "carried": "pack",
        })
        row["qty"] += item.get("quantity", 1)
    inventory = list(grouped.values())
    for row in inventory:
        if isinstance(row["weight"], float) and row["weight"].is_integer():
            row["weight"] = int(row["weight"])

    # --- feats ---------------------------------------------------------------
    feats = []
    for f in c.get("feats", []):
        name = f["definition"]["name"]
        if "Ability Score Improvement" in name:
            continue  # an ASI container, already captured as bonuses
        feats.append({"name": name})

    # --- hit points ----------------------------------------------------------
    # Only pin baseHitPoints when it differs from the fixed-average rules,
    # which is what the engine assumes. Rolled HP lands here.
    base_hp = c.get("baseHitPoints")
    derived = 0
    for i, k in enumerate(classes):
        die = HIT_DICE.get(k["name"].lower())
        if not die:
            derived = None
            break
        derived += die if i == 0 else 0
        derived += (k["level"] - (1 if i == 0 else 0)) * (die / 2 + 1)
    hp = {}
    if derived is None or int(derived) != base_hp:
        hp = {"base": base_hp}
        warnings.append(
            f"baseHitPoints {base_hp} differs from average-rules {derived}; pinned hp.base"
        )

    # --- prose ---------------------------------------------------------------
    traits = c.get("traits") or {}
    notes = c.get("notes") or {}

    def paras(text):
        return [p.strip() for p in re.split(r"\n\s*\n|\n", text or "") if p.strip()]

    prose = {
        "ideal": " ".join(paras(traits.get("ideals"))) or None,
        "traits": paras(traits.get("personalityTraits")),
        "bonds": paras(traits.get("bonds")),
        "flaws": paras(traits.get("flaws")),
        "appearance": " ".join(paras(traits.get("appearance"))) or None,
        "backstory": " ".join(paras(notes.get("backstory"))) or None,
        "allies": " ".join(paras(notes.get("allies"))) or None,
        "organizations": " ".join(paras(notes.get("organizations"))) or None,
        "enemies": " ".join(paras(notes.get("enemies"))) or None,
    }
    prose = {k: v for k, v in prose.items() if v}

    currency = {k: v for k, v in (c.get("currencies") or {}).items() if v}

    data = {"identity": identity, "abilities": abilities}
    if overrides:
        data["abilityOverrides"] = overrides
    if bonuses:
        data["abilityBonuses"] = bonuses
    if feats:
        data["feats"] = feats
    data["proficiencies"] = {
        "saves": saves, "skills": skills, "expertise": expertise,
        "armour": armour, "weapons": weapons, "tools": tools,
        "languages": languages,
    }
    if hp:
        data["hp"] = hp
    data["inventory"] = inventory
    if currency:
        data["currency"] = currency
    if prose:
        data["prose"] = prose

    return data, warnings


def emit(data, warnings, source):
    name = data["identity"]["name"]
    header = [
        f"// {name} — imported from D&D Beyond character {source}.",
        "//",
        "// BASE VALUES ONLY. Anything computable is computed in src/character.js.",
        "//",
        "// TODO after import:",
        "//   1. inventory `carried` is 'pack' for everything — split out worn kit",
        "//   2. add `features` cards and `actions`; see characters/raki.js",
        "//   3. add `short` print wording to the features worth printing",
    ]
    if warnings:
        header += ["//", "// Import warnings:"] + [f"//   - {w}" for w in warnings]
    body = js(data, 0)
    return "\n".join(header) + "\n\nexport default " + body + ";\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("source", help="D&D Beyond character id, or a saved JSON file")
    ap.add_argument("--out", help="output path (default: characters/<name>.js)")
    args = ap.parse_args()

    payload = fetch(args.source)
    c = payload.get("data", payload)
    data, warnings = build(c)

    slug = re.sub(r"[^a-z0-9]+", "-", data["identity"]["name"].lower()).strip("-")
    out = pathlib.Path(args.out or f"characters/{slug}.js")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(emit(data, warnings, args.source))

    print(f"wrote {out}")
    print(f"  {data['identity']['name']} — "
          f"{', '.join(f'{k['name']} {k['level']}' for k in data['identity']['classes'])}")
    p = data["proficiencies"]
    print(f"  skills {len(p['skills'])}, tools {len(p['tools'])}, "
          f"weapons {len(p['weapons'])}, languages {len(p['languages'])}")
    print(f"  inventory {len(data['inventory'])} rows, prose {len(data.get('prose', {}))} fields")
    for w in warnings:
        print(f"  warning: {w}")


if __name__ == "__main__":
    main()
