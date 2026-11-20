"""Classify only locally published plot records. No network lookups or social account metrics.

The demo catalog is a historical roster. A removed record has no public count even if its
reservation is retained. No new name becomes a reviewed community record by default.
"""

KINDS = ("demo", "community", "unreviewed")


def record_stats(catalog, public_districts, district_ids, valid_name):
    if (
        not isinstance(catalog, dict)
        or set(catalog) != {"schema", "demo", "community"}
        or type(catalog["schema"]) is not int
        or catalog["schema"] != 1
    ):
        raise ValueError(
            "record-cohorts.json: expected schema 1 and demo/community rosters"
        )
    names = {}
    for kind in ("demo", "community"):
        group = catalog[kind]
        if (
            not isinstance(group, list)
            or any(not valid_name(u) for u in group)
            or len(group) != len(set(group))
        ):
            raise ValueError(
                f"record-cohorts.json: {kind} must contain unique valid public usernames"
            )
        names[kind] = set(group)
    if names["demo"] & names["community"]:
        raise ValueError(
            "record-cohorts.json: a demo cannot also be a reviewed community record"
        )
    if names["community"].difference(public_districts):
        raise ValueError(
            "record-cohorts.json: remove retired names from the published community roster"
        )
    labels, totals = {}, dict.fromkeys(KINDS, 0)
    districts = {str(d): dict.fromkeys(KINDS, 0) for d in district_ids}
    for u, d in sorted(public_districts.items()):
        k = (
            "demo"
            if u in names["demo"]
            else "community"
            if u in names["community"]
            else "unreviewed"
        )
        if str(d) not in districts:
            raise ValueError(f"Unexpected published district {d}")
        labels[u] = k
        totals[k] += 1
        districts[str(d)][k] += 1
    return {"schema": 1, "totals": totals, "byDistrict": districts, "byHandle": labels}
