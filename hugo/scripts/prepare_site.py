#!/usr/bin/env python3
"""Validate everything before writing anything. This command never contacts the network."""

import sys, re, json, hashlib, datetime, argparse
from pathlib import Path
from collections import defaultdict, Counter
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent / "vendor"))
import yaml
from atlas import Atlas, ROOT, jsonbytes, read
from village import Network, network_index
from house_design import design
from record_cohorts import record_stats

HANDLE = re.compile(r"^[a-z0-9_](?:[a-z0-9._]{0,28}[a-z0-9_])?$")
FM = re.compile(r"\A---\n(.*?)\n---(?:\n|\Z)(.*)\Z", re.S)


class Unique(yaml.SafeLoader):
    pass


def mapping(loader, node):
    keys = [loader.construct_object(k) for k, v in node.value]
    if len(set(keys)) != len(keys):
        raise ValueError("duplicate front matter key")
    return loader.construct_mapping(node)


Unique.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping)


def today():
    return datetime.datetime.now(ZoneInfo("Asia/Kolkata")).date()


def valid_name(s):
    return isinstance(s, str) and bool(HANDLE.fullmatch(s)) and ".." not in s


def parse(path):
    if path.is_symlink() or path.stat().st_size > 100000:
        raise ValueError("expected a regular Markdown file under 100 KB")
    m = FM.match(path.read_text(encoding="utf-8"))
    if not m:
        raise ValueError("start and end the YAML header with --- on its own line")
    meta = yaml.load(m[1], Loader=Unique)
    if not isinstance(meta, dict):
        raise ValueError("expected username and district in the header")
    return meta, m[2]


def render(m, body):
    return (
        "---\n"
        + yaml.safe_dump(
            m, sort_keys=False, allow_unicode=True, default_flow_style=False
        )
        + "---\n"
        + body
    ).encode()


def write_if(p, b):
    if p.is_file() and p.read_bytes() == b:
        return False
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".tmp")
    tmp.write_bytes(b)
    tmp.replace(p)
    return True


def getdistrict(at, name, state=None):
    if not isinstance(name, str):
        raise ValueError("district must be a name from config/districts.json")

    def norm(n):
        return re.sub(r"[^a-z0-9]", "", n.casefold().removesuffix(" district").strip())

    ds = [
        d
        for d in at.ds
        if norm(name) in (norm(d["name"]), norm(d.get("osm_name") or ""))
        and (state is None or state == d["state"])
    ]
    if len(ds) != 1:
        raise ValueError(
            f"unknown or ambiguous district {name!r} (state {state!r}); use config/districts.json"
        )
    return ds[0]


def prepare(root=ROOT, write=True):
    root = Path(root)
    at = Atlas(root)
    folder = root / "content/houses"
    lp = root / "data/residents.lock.json"
    index = network_index(at)
    lock = (
        read(lp) if lp.exists() else {"version": 2, "grid": at.identity, "houses": {}}
    )
    if lock.get("version") != 2:
        raise ValueError(
            "Legacy reservations require the single guarded village migration; ordinary preparation never moves plots"
        )
    locked = lock["houses"]
    if lock["grid"] != at.identity:
        raise ValueError(
            "residents.lock.json: frozen terrain/grid identity changed; cannot move existing plots"
        )
    taken = {tuple(v["cell"]): u for u, v in locked.items()}
    if len(taken) != len(locked):
        raise ValueError("residents.lock.json: duplicate reserved cell")
    records = {}
    counts = Counter(p.stem.casefold() for p in folder.glob("*.md"))
    for p in sorted(folder.glob("*.md")):
        try:
            m, note = parse(p)
            u = m.get("username")
            if (
                counts[p.stem.casefold()] > 1
                or isinstance(u, str)
                and u.casefold() in records
            ):
                raise ValueError("duplicate username (case-insensitive)")
            if not valid_name(u) or u != p.stem:
                raise ValueError(
                    "username must match the lowercase filename (1–30 Instagram letters, digits, dots or underscores)"
                )
            d = getdistrict(at, m.get("district"), m.get("state"))
            prior = locked.get(u)
            cell = m.get("cell")
            if m.get("type", "house") != "house":
                raise ValueError("type must be house")
            if prior and (cell != prior["cell"] or d["id"] != prior["district_id"]):
                raise ValueError(
                    "cell/district differs from residents.lock.json; existing houses cannot move"
                )
            added = m.get("added", today())
            added = datetime.date.fromisoformat(str(added))
            if "house_style" in m:
                raise ValueError("house_style is retired; use archetype instead")
            if cell is not None:
                if not lp.exists():
                    raise ValueError(
                        "residents.lock.json is missing; restore the lock before accepting preassigned cells"
                    )
                if (
                    not isinstance(cell, list)
                    or len(cell) != 2
                    or any(type(z) != int for z in cell)
                ):
                    raise ValueError("cell must be [integer x, integer y]")
                xy = tuple(cell)
                did, ok, _ = at.info(*xy)
                if did != d["id"] or not ok:
                    raise ValueError(
                        "cell is outside this district or is not buildable"
                    )
                if taken.get(xy, u) != u:
                    raise ValueError(f"duplicate cell {cell}; reserved by {taken[xy]}")
                if not prior:
                    raise ValueError(
                        "new plots are assigned by the village allocator; omit cell"
                    )
                taken[xy] = u
            records[u] = dict(p=p, d=d, note=note, cell=cell, added=added, m=m)
        except Exception as exc:
            raise ValueError(f"{p.name}: {exc}") from exc
    pending = defaultdict(list)
    for u, r in records.items():
        if r["cell"] is None:
            pending[r["d"]["id"]].append(u)
    networks = {}
    for d in at.ds:
        did = d["id"]
        existing = sorted(
            ((h["seq"], u, h) for u, h in locked.items() if h["district_id"] == did)
        )
        us = sorted(pending[did], key=lambda u: (records[u]["added"], u))
        net = networks[did] = Network(at, d, index)
        for _, u, prior in existing:
            slot = net.next_slot(u)
            if slot != prior:
                raise ValueError(
                    f"{u}: immutable reservation differs from the frozen frontage-first order"
                )
        for u in us:
            locked[u] = slot = net.next_slot(u)
            records[u]["cell"] = slot["cell"]
    # Derived metadata only: never edit a house source or reservation merely to label a demo.
    groups = record_stats(
        read(root / "config/record-cohorts.json"),
        {u: r["d"]["id"] for u, r in records.items()},
        (d["id"] for d in at.ds),
        valid_name,
    )
    outputs = {}
    road_ends = defaultdict(dict)
    web = root / "site/static/data"
    generated = root / "site/content/houses"
    shards = defaultdict(dict)
    plots = defaultdict(list)
    tot = Counter()
    listings = []
    for u, r in sorted(records.items()):
        x, y = r["cell"]
        d = r["d"]
        _, _, elev = at.info(x, y)

        def ll(a, b):
            lon, lat = at.coords(a, b)
            return [round(lat, 7), round(lon, 7)]

        lat, lon = ll(x + 0.5, y + 0.5)
        corners = [ll(x, y), ll(x + 1, y), ll(x + 1, y + 1), ll(x, y + 1)]
        try:
            fields, model = design(r["m"], u, d, at, locked[u], networks[d["id"]])
        except (ValueError, TypeError, KeyError) as e:
            raise ValueError(f"{u}.md: {e}") from e
        road_ends[d["id"]][u] = model
        m = dict(
            title=u,
            username=u,
            type="house",
            instagram=f"https://www.instagram.com/{u}/",
            state=d["state"],
            district=d["name"],
            added=r["added"],
            cell=[x, y],
            lat=lat,
            lon=lon,
            elevation_m=elev,
            corners=corners,
            area_acres=1,
            **fields,
        )
        for field in (
            "title",
            "instagram",
            "area_acres",
            "lat",
            "lon",
            "elevation_m",
            "corners",
        ):
            if field in r["m"] and r["m"][field] != m[field]:
                raise ValueError(
                    f"{r['p'].name}: {field} does not match the assigned plot; omit derived fields on new records"
                )
        outputs[r["p"]] = render(m, r["note"])
        outputs[generated / ("resident-" + u + ".md")] = render(
            {
                **m,
                "record_kind": groups["byHandle"][u],
                "slug": u,
                "url": f"/houses/{u}/",
            },
            r["note"],
        )
        row = dict(
            u=u,
            c=[x, y],
            d=d["id"],
            z=elev,
            lat=lat,
            lon=lon,
            s=model["style"],
            house=model,
            corners=corners,
        )
        shards[u[:2].encode().hex()][u] = row
        plots[f"{x // 256}_{y // 256}"].append(
            [x, y, u, model["style"], d["id"], model]
        )
        tot[d["id"]] += 1
        listings.append([u, d["id"]])
    for k, sh in shards.items():
        outputs[web / "search" / (k + ".json")] = jsonbytes(sh)
    for k, li in plots.items():
        outputs[web / "plots" / (k + ".json")] = jsonbytes(li)
    for d in at.ds:
        did = d["id"]
        road = networks[did].roads_file(road_ends[did])
        if len(road["cells"]) > len(road_ends[did]):
            raise ValueError(
                f"{d['name']}: {len(road['cells'])} drawn road cells / {len(road_ends[did])} houses, exceeds 1.0: {', '.join(road_ends[did])}"
            )
        outputs[web / "roads" / f"{did}.json"] = jsonbytes(road)
    # Cache only trusted freeze-dependent district teleports; these never change with residents.
    anchors = (
        read(at.f / "anchors.json")
        if (at.f / "anchors.json").is_file()
        else {str(d["id"]): at.nearest(d, 1, {})[0] for d in at.ds}
    )
    outputs[web / "atlas.json"] = jsonbytes(
        dict(
            project=at.cfg,
            districts=[
                {
                    **d,
                    "count": tot[d["id"]],
                    "anchor": anchors[str(d["id"])],
                    "village_root": index[str(d["id"])]["road_root"],
                    "capacity": index[str(d["id"])]["capacity"],
                }
                for d in at.ds
            ],
            recordStats=groups,
            total=len(records),
            shards=sorted(shards),
            plots=sorted(plots),
            tiles=sorted(at.ts),
            edition="2026-11-17",
        )
    )
    outputs[web / "counts.json"] = jsonbytes({d["name"]: tot[d["id"]] for d in at.ds})
    outputs[web / "directory.json"] = jsonbytes(listings)
    outputs[lp] = (json.dumps(lock, sort_keys=True, indent=2) + "\n").encode()
    changed = 0
    for p, b in outputs.items():
        if write:
            changed += write_if(p, b)
        else:
            changed += not p.is_file() or p.read_bytes() != b
    for p in [
        *generated.glob("resident-*.md"),
        *(web / "search").glob("*.json"),
        *(web / "plots").glob("*.json"),
        *(web / "roads").glob("*.json"),
    ]:
        if p not in outputs:
            if write:
                p.unlink()
            changed += 1
    return len(records), changed


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    g = parser.add_mutually_exclusive_group()
    g.add_argument(
        "--check",
        action="store_true",
        help="validate and simulate new assignments, no writes",
    )
    g.add_argument("--write-back", action="store_true")
    args = parser.parse_args()
    try:
        n, k = prepare(write=not args.check)
        print(
            f"{n} valid houses; {k} files "
            + ("would change (read-only check)." if args.check else "changed.")
        )
    except (ValueError, OSError, KeyError) as exc:
        sys.exit(f"House preparation failed: {exc}")
