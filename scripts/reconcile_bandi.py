import hashlib
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DATA = ROOT / "data"
CATALOG = PUBLIC / "radar_bandi_auto.json"
STATE = DATA / "radar_bandi_state.json"
ITALY_TZ = ZoneInfo("Europe/Rome")

# Campi che descrivono davvero il contenuto del bando. I metadati tecnici
# (hash/versione/timestamp) non entrano nell'impronta e quindi non generano
# falsi cambiamenti a ogni esecuzione.
CONTENT_FIELDS = [
    "title",
    "source",
    "deadline",
    "fund",
    "maxGrant",
    "aid",
    "tags",
    "eligibility",
    "keywords",
    "sectors",
    "beneficiaries",
    "activities",
    "purposes",
    "territories",
    "legalForms",
    "hardRequirements",
    "hardKeyword",
    "sourceUrl",
    "sourceStatus",
    "discoveryText",
]


def now_iso():
    return datetime.now(ITALY_TZ).isoformat(timespec="seconds")


def load_json(path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def normalized_url(value):
    return str(value or "").strip().rstrip("/")


def record_key(record):
    url = normalized_url(record.get("sourceUrl"))
    if url:
        return "url:" + url
    return "id:" + str(record.get("id") or "").strip()


def content_snapshot(record):
    return {field: record.get(field) for field in CONTENT_FIELDS if field in record}


def content_hash(snapshot):
    raw = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def changed_fields(old_snapshot, new_snapshot):
    keys = set(old_snapshot or {}) | set(new_snapshot or {})
    return sorted(k for k in keys if (old_snapshot or {}).get(k) != (new_snapshot or {}).get(k))


def successful_sources(catalog):
    return {
        str(item.get("source") or "")
        for item in catalog.get("sourceStats", [])
        if item.get("ok") is True
    }


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    catalog = load_json(CATALOG, {})
    bandi = catalog.get("bandi", []) if isinstance(catalog.get("bandi", []), list) else []
    previous = load_json(STATE, {"schemaVersion": 1, "records": {}})
    old_records = previous.get("records", {}) if isinstance(previous.get("records", {}), dict) else {}
    records = dict(old_records)
    stamp = now_iso()

    new_count = 0
    modified_count = 0
    unchanged_count = 0
    reappeared_count = 0
    missing_count = 0
    current_keys = set()

    enriched = []
    for bando in bandi:
        key = record_key(bando)
        if not key or key in {"id:", "url:"}:
            continue
        current_keys.add(key)
        snapshot = content_snapshot(bando)
        fingerprint = content_hash(snapshot)
        old = old_records.get(key)

        if not old:
            state_rec = {
                "id": bando.get("id"),
                "source": bando.get("source"),
                "sourceUrl": bando.get("sourceUrl"),
                "contentHash": fingerprint,
                "version": 1,
                "firstSeenAt": stamp,
                "lastChangedAt": stamp,
                "present": True,
                "missingSince": None,
                "lastChangeFields": list(snapshot.keys()),
                "needsAnalysis": True,
                "snapshot": snapshot,
            }
            new_count += 1
        else:
            was_missing = old.get("present") is False
            if fingerprint != old.get("contentHash"):
                fields = changed_fields(old.get("snapshot", {}), snapshot)
                state_rec = {
                    **old,
                    "id": bando.get("id"),
                    "source": bando.get("source"),
                    "sourceUrl": bando.get("sourceUrl"),
                    "contentHash": fingerprint,
                    "version": int(old.get("version") or 1) + 1,
                    "lastChangedAt": stamp,
                    "present": True,
                    "missingSince": None,
                    "lastChangeFields": fields,
                    "needsAnalysis": True,
                    "snapshot": snapshot,
                }
                modified_count += 1
            else:
                state_rec = {
                    **old,
                    "id": bando.get("id"),
                    "source": bando.get("source"),
                    "sourceUrl": bando.get("sourceUrl"),
                    "present": True,
                    "missingSince": None,
                }
                unchanged_count += 1
                if was_missing:
                    state_rec["reappearedAt"] = stamp
                    reappeared_count += 1

        records[key] = state_rec
        enriched_record = dict(bando)
        enriched_record["tracking"] = {
            "contentHash": state_rec["contentHash"],
            "version": state_rec["version"],
            "firstSeenAt": state_rec["firstSeenAt"],
            "lastChangedAt": state_rec["lastChangedAt"],
            "needsAnalysis": bool(state_rec.get("needsAnalysis")),
        }
        enriched.append(enriched_record)

    # Se una fonte è andata in errore non consideriamo i suoi bandi "spariti":
    # evitiamo falsi negativi causati da timeout o indisponibilità temporanee.
    ok_sources = successful_sources(catalog)
    for key, old in list(old_records.items()):
        if key in current_keys or old.get("present") is False:
            continue
        source = str(old.get("source") or "")
        if source and source not in ok_sources:
            continue
        records[key] = {**old, "present": False, "missingSince": stamp}
        missing_count += 1

    meaningful_change = any([new_count, modified_count, reappeared_count, missing_count])
    previous_catalog_updated = previous.get("catalogUpdatedAt")
    catalog_updated = stamp if meaningful_change or not previous_catalog_updated else previous_catalog_updated

    catalog["schemaVersion"] = max(int(catalog.get("schemaVersion") or 0), 7)
    catalog["updatedAt"] = datetime.fromisoformat(catalog_updated).strftime("%d/%m/%Y %H:%M")
    catalog["incremental"] = True
    catalog["trackingSummary"] = {
        "new": new_count,
        "modified": modified_count,
        "unchanged": unchanged_count,
        "reappeared": reappeared_count,
        "missing": missing_count,
    }
    catalog["bandi"] = enriched

    state = {
        "schemaVersion": 1,
        "catalogUpdatedAt": catalog_updated,
        "regionsEnabled": catalog.get("regionsEnabled", []),
        "records": records,
    }

    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        "BANDOVERA reconcile: "
        f"nuovi={new_count}, modificati={modified_count}, invariati={unchanged_count}, "
        f"riapparsi={reappeared_count}, mancanti={missing_count}, "
        f"da_analizzare={sum(1 for r in records.values() if r.get('present') and r.get('needsAnalysis'))}"
    )


if __name__ == "__main__":
    main()
