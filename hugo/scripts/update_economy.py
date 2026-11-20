"""Offline treasury. Default audit is read-only; --apply requires an explicit accounting instant.
A human reviewer is the trust boundary; this tool does not authenticate Instagram or accept browser writes.
"""

import argparse, datetime as dt, hashlib, json, os, re, sys, tempfile
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
RES = {"likes": "food", "comments": "currency", "shares": "gold"}
IS = ZoneInfo("Asia/Kolkata")
ZERO = "0" * 64


def check(ok, reason):
    if not ok:
        raise ValueError(reason)


def enc(o):
    return (
        json.dumps(o, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n"
    ).encode()


def digest(o):
    return hashlib.sha256(enc(o)).hexdigest()


def read(p):
    return json.loads(p.read_bytes())


def instant(v):
    d = dt.datetime.fromisoformat(v.replace("Z", "+00:00"))
    check(d.tzinfo and d.utcoffset() is not None, "timestamp needs an explicit offset")
    return d.astimezone(dt.timezone.utc)


def iso(d):
    return (
        d.astimezone(dt.timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def day(s):
    return dt.date.fromisoformat(s)


def integer(v):
    return type(v) is int and 0 <= v <= 10**15


def safeid(v):
    return isinstance(v, str) and bool(re.fullmatch(r"[\w.:/@-]{1,180}", v))


def balances():
    return dict.fromkeys(RES.values(), 0)


def validate_cfg(c):
    check(
        c["schema"] == 1
        and c["zone"] == "Asia/Kolkata"
        and set(c["rates"]) == set(RES),
        "unsupported policy",
    )
    day(c["startsOn"])
    check(
        all(
            integer(x) and x > 0
            for x in [
                *c["rates"].values(),
                c["goldExchange"],
                *c["costs"].values(),
                *c["minHomes"].values(),
            ]
        )
        and integer(c["foodPerHouse"]),
        "invalid costs or rates",
    )
    check(
        len(set(c["campaignReels"])) == len(c["campaignReels"])
        and all(safeid(x) for x in c["campaignReels"]),
        "invalid campaign list",
    )


def validate_rows(roster):
    spans = {}
    for r in roster:
        u = r["user"]
        start = day(r["from"])
        end = day(r["until"]) if r.get("until") else dt.date.max
        check(
            safeid(u)
            and type(r["district"]) is int
            and 1 <= r["district"] <= 61
            and start < end,
            "invalid occupancy",
        )
        check(
            all(end <= a or start >= b for a, b in spans.get(u, [])),
            "overlapping occupancy",
        )
        spans.setdefault(u, []).append((start, end))


def occupied(rows, d):
    return sorted(
        (r["user"], r["district"])
        for r in rows
        if day(r["from"]) <= d and (not r.get("until") or d < day(r["until"]))
    )


def snap(s, c):
    check(
        all(
            k in s
            for k in [
                "reel",
                "reportedAt",
                "source",
                "status",
                "metrics",
                "reviewer",
                "evidence",
            ]
        ),
        "incomplete snapshot",
    )
    check(s["reel"] in c["campaignReels"], "not a designated reel")
    check(
        s["status"] in ["verified", "pending"]
        and s["source"] in ["official-export", "manual-review"]
        and safeid(s["reviewer"])
        and safeid(s["evidence"]),
        "missing verification provenance",
    )
    instant(s["reportedAt"])
    m = s["metrics"]
    check(
        isinstance(m, dict)
        and set(m) == set(RES)
        and all(v is None or integer(v) for v in m.values()),
        "invalid cumulative metrics",
    )
    return (s["reel"], iso(instant(s["reportedAt"])))


def replay(entries):
    b = balances()
    ids = set()
    prev = ZERO
    for t in entries:
        check(
            isinstance(t, dict)
            and t["previous"] == prev
            and digest({k: v for k, v in t.items() if k != "hash"}) == t["hash"],
            "broken ledger chain",
        )
        check(
            t["id"] not in ids
            and t["resource"] in b
            and type(t["amount"]) is int
            and bool(t["source"])
            and bool(t["reason"]),
            "invalid or repeated transaction",
        )
        instant(t["at"])
        ids.add(t["id"])
        b[t["resource"]] += t["amount"]
        check(
            b[t["resource"]] >= 0 and b[t["resource"]] == t["balance"],
            "invalid running balance",
        )
        prev = t["hash"]
    return b


def condition(c, food, need):
    if not need:
        return None, "no-houses"
    days = food / need
    q = c["thresholds"]
    return round(days, 4), (
        "crisis"
        if not food
        else "shortage"
        if days < q["lowFrom"]
        else "low"
        if days < q["stableFrom"]
        else "stable"
        if days <= q["healthyAbove"]
        else "healthy"
    )


def fold(c, log, roster, asday):
    b = replay(log)
    real = occupied(roster, asday)
    last = next((t["day"] for t in reversed(log) if t["reason"] == "daily-food"), None)
    vs = [t for t in log if t["reason"] == "snapshot"]
    latest = max(vs, key=lambda t: t["reportedAt"], default=None)
    need = len(real) * c["foodPerHouse"]
    days, status = condition(c, b["food"], need)
    return {
        "schema": 1,
        "balances": b,
        "lastProcessedDay": last,
        "asOfRealDate": asday.isoformat(),
        "lastVerified": latest["reportedAt"] if latest else None,
        "sharesVerified": bool(latest and latest["sharesAvailable"]),
        "occupiedHomes": len(real),
        "dailyFoodNeed": need,
        "foodDays": days,
        "condition": status,
        "transactions": len(log),
        "head": log[-1]["hash"] if log else ZERO,
        "projects": [
            {
                "id": t["order"],
                "type": t["project"],
                "district": t["district"],
                "site": t["site"],
                "at": t["at"],
                "cost": -t["amount"],
                "xy": t["xy"],
                **({"banks": t["banks"]} if "banks" in t else {}),
            }
            for t in log
            if t["reason"] == "project"
        ],
        "lastAccountedAt": log[-1]["at"] if log else None,
    }


def plan(c, eng, ledger, roster, asat, imports=(), orders=(), sites=None):
    validate_cfg(c)
    validate_rows(roster)
    b = replay(ledger)
    now = instant(asat)
    D = now.astimezone(IS).date()
    check(D >= day(c["startsOn"]), "before economy epoch")
    check(
        not ledger or now >= instant(ledger[-1]["at"]),
        "accounting timestamp moved backwards",
    )
    log = list(ledger)
    known = {t["id"]: t for t in log}
    ee = {}
    stored = {}
    sites = sites or {}
    for s in [*eng, *imports]:
        key = snap(s, c)
        check(instant(s["reportedAt"]) <= now, "future snapshot")
        prior = ee.get(key)
        check(
            prior is None
            or prior == s
            or prior["status"] == "pending"
            and s["status"] == "verified"
            and prior["metrics"] == s["metrics"],
            "conflicting snapshot at same instant",
        )
        ee[key] = s
    for s in eng:
        stored[snap(s, c)] = s

    def add(id, res, n, reason, source, **fields):
        check(
            id not in known and type(n) is int and b[res] + n >= 0,
            "duplicate or unaffordable",
        )
        b[res] += n
        t = dict(
            id=id,
            at=iso(now),
            resource=res,
            amount=n,
            reason=reason,
            source=source,
            balance=b[res],
            previous=log[-1]["hash"] if log else ZERO,
            **fields,
        )
        t["hash"] = digest(t)
        known[id] = t
        log.append(t)

    # Closed-day rosters are immutable. Corrections need an explicit audited migration, not a rebuild.
    for t in ledger:
        if t["reason"] == "daily-food":
            check(
                t["rosterHash"] == digest(occupied(roster, day(t["day"]))),
                "closed day occupancy changed",
            )
    cur = day(
        next(
            (t["day"] for t in reversed(log) if t["reason"] == "daily-food"),
            (day(c["startsOn"]) - dt.timedelta(days=1)).isoformat(),
        )
    ) + dt.timedelta(days=1)
    while cur < D:
        cohort = occupied(roster, cur)
        need = len(cohort) * c["foodPerHouse"]
        amount = min(need, b["food"])
        ds = cur.isoformat()
        add(
            "day:" + ds,
            "food",
            -amount,
            "daily-food",
            "civil-day:" + c["zone"],
            day=ds,
            homes=len(cohort),
            need=need,
            unmet=need - amount,
            rosterHash=digest(cohort),
        )
        cur += dt.timedelta(days=1)
    highs = {}
    last = {}
    for t in log:
        if t["reason"] in ("new-engagement", "downward-observation"):
            highs[t["reel"], t["metric"]] = max(
                highs.get((t["reel"], t["metric"]), 0), t["observed"]
            )
        if t["reason"] == "snapshot":
            last[t["reel"]] = t["reportedAt"]
    for (reel, when), s in sorted(
        ee.items(), key=lambda pair: (pair[0][1], pair[0][0])
    ):
        if s["status"] != "verified":
            continue
        ref = "snap:" + reel + ":" + when
        if ref in known:
            check(known[ref]["snapshotHash"] == digest(s), "verified history edited")
            continue
        check(when > last.get(reel, ""), "out-of-order observation requires review")
        m = s["metrics"]
        add(
            ref,
            "food",
            0,
            "snapshot",
            s["source"],
            reel=reel,
            reportedAt=when,
            snapshotHash=digest(s),
            reviewer=s["reviewer"],
            evidence=s["evidence"],
            sharesAvailable=m["shares"] is not None,
        )
        last[reel] = when
        for k, res in RES.items():
            if m[k] is None:
                continue
            high = highs.get((reel, k), 0)
            delta = max(0, m[k] - high)
            add(
                ref + ":" + k,
                res,
                delta * c["rates"][k],
                "downward-observation" if m[k] < high else "new-engagement",
                s["source"],
                reel=reel,
                reportedAt=when,
                metric=k,
                observed=m[k],
                priorHigh=high,
                rate=c["rates"][k],
            )
            highs[reel, k] = max(high, m[k])
    check(
        all(
            (t["reel"], t["reportedAt"]) in ee
            and digest(ee[t["reel"], t["reportedAt"]]) == t["snapshotHash"]
            for t in log
            if t["reason"] == "snapshot"
        ),
        "verified snapshot removed or changed",
    )
    for o in orders:
        check(
            safeid(o["id"])
            and safeid(o.get("approvedBy"))
            and safeid(o.get("evidence"))
            and o.get("approved") is True,
            "explicit human approval and reference required",
        )
        oid = "order:" + o["id"]
        old = known.get(oid)
        if old:
            check(old["orderHash"] == digest(o), "conflicting order id")
            continue
        fields = dict(
            order=o["id"],
            orderHash=digest(o),
            approvedBy=o["approvedBy"],
            evidence=o["evidence"],
        )
        kind = o["kind"]
        if kind == "exchange":
            n = o["gold"]
            check(
                integer(n) and n > 0 and n <= b["gold"],
                "insufficient gold or invalid amount",
            )
            add(oid, "gold", -n, "gold-conversion", "approved-order", **fields)
            add(
                oid + ":credit",
                "currency",
                n * c["goldExchange"],
                "gold-conversion",
                "approved-order",
                rate=c["goldExchange"],
                **fields,
            )
        else:
            p = o["project"]
            did = o["district"]
            site = sites.get(o["site"])
            check(
                kind == "project"
                and p in c["costs"]
                and type(did) is int
                and site
                and site["district"] == did
                and p in site["suitable"],
                "unsupported or unsuitable project site",
            )
            cohort = occupied(roster, D)
            n = sum(d == did for u, d in cohort)
            check(n >= c["minHomes"][p] and n > 0, "no local need")
            check(
                not any(
                    t.get("site") == o["site"] and t.get("project") == p for t in log
                ),
                "already developed",
            )
            cost = c["costs"][p]
            check(cost <= b["currency"], "insufficient currency")
            add(
                oid,
                "currency",
                -cost,
                "project",
                "approved-order",
                district=did,
                project=p,
                site=o["site"],
                xy=site["xy"],
                **({"banks": site["banks"]} if "banks" in site else {}),
                **fields,
            )
    state = fold(c, log, roster, D)
    return [ee[k] for k in sorted(ee)], log, state


# POSIX build machine. flock releases automatically on termination; an interrupted multi-file commit is replayed from its journal.
def replace(p, b):
    fd, name = tempfile.mkstemp(dir=p.parent, prefix=".pending-")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(b)
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, p)
    finally:
        Path(name).unlink(missing_ok=True)


def recover(folder):
    j = folder / ".transaction.json"
    if j.exists():
        tx = read(j)
        check(
            set(tx) == {"engagement.json", "ledger.json", "state.json"}, "bad journal"
        )
        for k, v in tx.items():
            check(
                digest(read(folder / k)) in [v["old"], digest(v["next"])],
                "concurrent state change; do not overwrite",
            )
        for k, v in tx.items():
            replace(folder / k, enc(v["next"]))
        j.unlink()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true")
    p.add_argument("--at")
    p.add_argument("--import-file", type=Path)
    p.add_argument("--orders", type=Path)
    p.add_argument("--check", action="store_true")
    a = p.parse_args()
    f = ROOT / "data/economy"
    import fcntl

    with (f / ".lock").open("a") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        recover(f)
        c = read(f / "config.json")
        r = read(f / "occupancy.json")
        e = read(f / "engagement.json")
        l = read(f / "ledger.json")
        state = read(f / "state.json")
        asday = day(state["asOfRealDate"])
        validate_cfg(c)
        validate_rows(r)
        check(fold(c, l, r, asday) == state, "state does not replay")
        cat = read(ROOT / "config/record-cohorts.json")
        check(
            set(cat["community"])
            == {
                u
                for u, d in occupied(
                    r, instant(a.at).astimezone(IS).date() if a.at else asday
                )
            },
            "current public cohort and dated residential occupancy differ",
        )
        if not a.apply:
            check(not (a.import_file or a.orders), "use --apply with explicit --at")
            stamp = state["lastAccountedAt"] or iso(
                dt.datetime.combine(asday, dt.time(12), IS)
            )
            seen, reb, st = plan(c, e, l, r, stamp)
            check(reb == l and st == state, "missing or unreconciled entries")
            print(
                "Reconciled",
                len(l),
                "entries:",
                state["balances"],
                "last verified:",
                state["lastVerified"],
            )
            return
        check(a.at is not None, "explicit accounting time required")
        check(
            instant(a.at) <= dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=2),
            "future accounting time",
        )
        sitespath = ROOT / "site/static/living/public/sites.json"
        sites = read(sitespath) if sitespath.exists() else {}
        e2, l2, s2 = plan(
            c,
            e,
            l,
            r,
            a.at,
            read(a.import_file) if a.import_file else [],
            read(a.orders) if a.orders else [],
            sites,
        )
        nxt = {"engagement.json": e2, "ledger.json": l2, "state.json": s2}
        tx = {k: {"old": digest(read(f / k)), "next": v} for k, v in nxt.items()}
        if any(read(f / k) != v for k, v in nxt.items()):
            replace(f / ".transaction.json", enc(tx))
            recover(f)
        print(
            json.dumps(
                {
                    "newTransactions": len(l2) - len(l),
                    "balances": s2["balances"],
                    "lastVerified": s2["lastVerified"],
                    "head": s2["head"],
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    try:
        main()
    except (ValueError, TypeError, KeyError, OSError) as e:
        raise SystemExit(str(e))
