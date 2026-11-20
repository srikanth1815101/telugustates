"""Generate the local, read-only living-world publication. Never edits resident records or economic history."""

import argparse, json, sys
from pathlib import Path
from settlement_paths import compile_paths

ROOT = Path(__file__).resolve().parents[1]


def read(p):
    return json.loads(p.read_text())


def blob(o):
    return (
        json.dumps(o, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"
    ).encode()


def outputs(root=ROOT):
    web = root / "site/static"
    data = web / "data"
    atlas = read(data / "atlas.json")
    groups = atlas["recordStats"]["byHandle"]
    out = {"world.json": read(root / "config/world.json")}
    homes = {d["id"]: {} for d in atlas["districts"]}
    for k in atlas["plots"]:
        for x, y, u, style, d, h in read(data / "plots" / (k + ".json")):
            homes[d][u] = h
    from collections import Counter
    import copy

    clean = copy.deepcopy(atlas)
    allowed = {u for u, c in groups.items() if c == "community"}
    counts = Counter()
    shards = {}
    keys = []
    directory = []
    for k in atlas["plots"]:
        rows = [r for r in read(data / "plots" / (k + ".json")) if r[2] in allowed]
        if rows:
            out["public/plots/" + k + ".json"] = rows
            keys.append(k)
        for x, y, u, style, d, h in rows:
            counts[d] += 1
            directory.append([u, d])
    for k in atlas["shards"]:
        rows = {
            u: r
            for u, r in read(data / "search" / (k + ".json")).items()
            if u in allowed
        }
        if rows:
            out["public/search/" + k + ".json"] = rows
            shards[k] = True
    selected = {"demo_user1", "demo_user195", "demo_user209"}
    out["examples.json"] = {
        u: r
        for k in atlas["shards"]
        for u, r in read(data / "search" / (k + ".json")).items()
        if u in selected and groups[u] == "demo"
    }
    assert set(out["examples.json"]) == selected and not (selected & allowed)
    for d in clean["districts"]:
        d["count"] = counts[d["id"]]
    clean.update(
        plots=keys,
        shards=sorted(shards),
        total=len(directory),
        recordStats={
            "byHandle": {u: "community" for u, d in directory},
            "totals": {"community": len(directory), "demo": 0, "unreviewed": 0},
            "byDistrict": {
                str(d["id"]): {"community": d["count"], "demo": 0, "unreviewed": 0}
                for d in clean["districts"]
            },
        },
    )
    out["public/atlas.json"] = clean
    out["public/directory.json"] = sorted(directory)
    for d, rows in homes.items():
        road = read(data / "roads" / f"{d}.json")
        out[f"dev/villages/{d}.json"] = compile_paths(road, rows)
        out[f"public/villages/{d}.json"] = compile_paths(
            road, {u: h for u, h in rows.items() if groups[u] == "community"}
        )
    from update_economy import fold, day, occupied

    econ = root / "data/economy"
    cfg = read(econ / "config.json")
    ledger = read(econ / "ledger.json")
    state = read(econ / "state.json")
    roster = read(econ / "occupancy.json")
    assert fold(cfg, ledger, roster, day(state["asOfRealDate"])) == state, (
        "Treasury replay failed"
    )
    out["public/treasury.json"] = {
        **state,
        "history": [
            {k: t[k] for k in ["id", "at", "resource", "amount", "reason", "balance"]}
            for t in ledger
            if t["amount"]
        ],
    }
    assert sorted((u, d) for u, d in directory) == occupied(
        roster, day(state["asOfRealDate"])
    ), "Reviewed homes do not match dated treasury occupancy"
    # Deliberate QA-only local before/after. No order or balance in the published ledger.
    home = homes[32].get("demo_user1")
    out["dev/corridor-review.json"] = compile_paths(
        read(data / "roads/32.json"), homes[32], [home["entry"]] if home else False
    )
    from natural_trails import trails

    scenic = read(web / "ecology/stops.json")
    safe = copy.deepcopy(scenic)
    for stop in safe:
        stop["observations"].pop("user", None)
        if stop["id"] == "village":
            stop["observations"]["selection"] = (
                "Deccan settlement candidate; no public resident is implied."
            )
    out["public/places.json"] = safe
    out["trails.json"] = trails(root)
    from atlas import Atlas
    from community_places import stage, site_register

    at = Atlas(root)
    locks = read(root / "data/residents.lock.json")["houses"]
    locked = {tuple(r["cell"]) for r in locks.values()}
    pv = {d: out[f"public/villages/{d}.json"] for d in homes}
    sites = site_register(at, read(econ / "sites-reviewed.json"), pv, locked)
    out["public/sites.json"] = sites
    records = []
    selected = {"demo_user1", "demo_user195", "demo_user209"}
    out["examples.json"] = {
        u: r
        for k in atlas["shards"]
        for u, r in read(data / "search" / (k + ".json")).items()
        if u in selected and groups[u] == "demo"
    }
    assert set(out["examples.json"]) == selected and not (selected & allowed)
    for d in clean["districts"]:
        id = d["id"]
        events = [p for p in state["projects"] if p["district"] == id]
        n = counts[id]
        rec = {
            "id": "village-" + str(id),
            "district": id,
            "name": d["name"],
            "state": d["state"],
            "homes": n,
            "occupiedAcres": n,
            "stage": stage(n, events),
            "connectedBranches": sum(t["type"] == "village" for t in pv[id]["paths"]),
            "infrastructure": [p["type"] for p in events],
        }
        records.append(rec)
        if n and events:
            v = compile_paths(
                read(data / "roads" / f"{id}.json"),
                {u: h for u, h in homes[id].items() if u in allowed},
                [p["xy"] for p in events if p["type"] == "lights"],
            )
            v["projects"] = events
            out[f"public/villages/{id}.json"] = v
    terrain = read(at.f / "stats.json")
    capacity = sum(d["capacity"] for d in clean["districts"])
    assert len(locked) == len(locks) and len(locked) <= capacity
    out["public/geography.json"] = {
        "schema": 1,
        "areaKm2": round(sum(d["area_m2"] for d in clean["districts"]) / 1e6, 2),
        "generatedCells": terrain["inside"],
        "terrainEligible": sum(terrain["buildable"].values()),
        "claimableCapacity": capacity,
        "allocatedCommunity": len(directory),
        "allLockedReservations": len(locked),
        "remainingEligible": capacity - len(locked),
        "villages": sum(r["homes"] > 0 for r in records),
        "districtCandidates": records,
    }
    # sequence is actual review/publication date, not lexical username order
    enrolled = {r["user"]: r["from"] for r in roster if not r.get("until")}
    out["public/recent.json"] = sorted(
        directory, key=lambda row: (enrolled.get(row[0], ""), row[0]), reverse=True
    )[:6]

    return {web / "living" / k: blob(v) for k, v in out.items()}


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--check", action="store_true")
    args = p.parse_args()
    out = outputs()
    diff = [f for f, b in out.items() if not f.exists() or f.read_bytes() != b]
    public = ROOT / "site/static/living/public"
    stale = [
        f
        for sub in ["plots", "search"]
        for f in (public / sub).glob("*.json")
        if f not in out
    ]
    if args.check and stale:
        raise SystemExit("Retired public index shard remains: " + str(stale[:2]))
    for f in stale:
        assert f.is_file() and not f.is_symlink() and f.resolve().is_relative_to(public)
        f.unlink()
    if args.check and diff:
        raise SystemExit("Run scripts/prepare_living.py: " + str(diff[:4]))
    for f in diff:
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(out[f])
    print(len(out), "derived files;", len(diff), "changed")
