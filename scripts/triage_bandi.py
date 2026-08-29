import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DATA = ROOT / "data"
CATALOG = PUBLIC / "radar_bandi_auto.json"
STATE = DATA / "radar_bandi_state.json"
AI_QUEUE = DATA / "radar_bandi_ai_queue.json"
ITALY_TZ = ZoneInfo("Europe/Rome")
RULE_VERSION = 2

ETS_SIGNALS = (
    "terzo settore", "enti del terzo settore", "ente del terzo settore",
    "organizzazioni di volontariato", "organizzazione di volontariato",
    "associazioni di promozione sociale", "associazione di promozione sociale",
    "odv", "aps", "ets",
)

NONPROFIT_SIGNALS = (
    "enti privati non profit", "ente privato non profit",
    "enti pubblici o privati non profit", "ente pubblico o privato non profit",
    "enti non profit", "ente non profit",
    "organizzazioni non profit", "organizzazione non profit",
    "soggetti non profit", "soggetto non profit",
    "senza scopo di lucro", "non lucrativo", "non lucrative",
)

BANDO_SIGNALS = (
    "bando", "avviso", "contribut", "finanzi", "candidatur", "domand",
    "manifestazione di interesse", "presentazione progetti", "presentazione di progetti",
)

GENERIC_TITLES = {
    "bando", "bandi", "avviso", "avvisi", "approfondisci", "scopri di più",
    "scopri di piu", "vai al bando", "dettaglio", "leggi",
}


def now_iso():
    return datetime.now(ITALY_TZ).isoformat(timespec="seconds")


def load_json(path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalized_text(snapshot):
    parts = [
        snapshot.get("title"), snapshot.get("discoveryText"), snapshot.get("aid"),
        " ".join(snapshot.get("eligibility") or []),
        " ".join(snapshot.get("keywords") or []),
    ]
    return clean(" ".join(str(x or "") for x in parts)).lower()


def title_is_usable(title):
    t = clean(title).lower().strip(" .:-–—")
    if len(t) < 10 or t in GENERIC_TITLES:
        return False
    if re.fullmatch(r"\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}", t):
        return False
    return True


def phrase_hits(text, signals):
    return [
        signal for signal in signals
        if re.search(r"(?<!\w)" + re.escape(signal) + r"(?!\w)", text)
    ]


def audience_classification(text):
    ets_hits = phrase_hits(text, ETS_SIGNALS)
    nonprofit_hits = phrase_hits(text, NONPROFIT_SIGNALS)

    if ets_hits:
        return {
            "known": True,
            "scope": "ets-specific",
            "evidence": ets_hits,
            "specificLegalFormConfirmed": True,
        }
    if nonprofit_hits:
        return {
            "known": True,
            "scope": "nonprofit-broad",
            "evidence": nonprofit_hits,
            "specificLegalFormConfirmed": False,
        }
    return {
        "known": False,
        "scope": "unknown",
        "evidence": [],
        "specificLegalFormConfirmed": False,
    }


def triage(snapshot):
    text = normalized_text(snapshot)
    reasons = []
    evidence = []

    title_ok = title_is_usable(snapshot.get("title"))
    if title_ok:
        evidence.append("titolo_specifico")
    else:
        reasons.append("titolo_ambiguo_o_non_descrittivo")

    source_url = clean(snapshot.get("sourceUrl"))
    if source_url.startswith("http://") or source_url.startswith("https://"):
        evidence.append("fonte_ufficiale_collegata")
    else:
        reasons.append("fonte_non_collegata")

    territory = [clean(x).lower() for x in (snapshot.get("territories") or []) if clean(x)]
    if territory:
        evidence.append("territorio_noto")
    else:
        reasons.append("territorio_non_chiaro")

    bando_known = any(signal in text for signal in BANDO_SIGNALS)
    if bando_known:
        evidence.append("natura_bando_riconoscibile")
    else:
        reasons.append("natura_bando_non_chiara")

    audience = audience_classification(text)
    if audience["scope"] == "ets-specific":
        evidence.append("destinatari_ets_espliciti")
    elif audience["scope"] == "nonprofit-broad":
        evidence.append("destinatari_nonprofit_espliciti")
        evidence.append("forma_giuridica_specifica_non_confermata")
    else:
        reasons.append("destinatari_da_interpretare")

    discovery = clean(snapshot.get("discoveryText"))
    if len(discovery) >= 120:
        evidence.append("testo_sufficiente")
    else:
        reasons.append("testo_troppo_breve")

    status = clean(snapshot.get("sourceStatus")).lower()
    deadline = clean(snapshot.get("deadline"))
    timing_known = status in {"aperto", "programmato"} or bool(deadline)
    if timing_known:
        evidence.append("stato_o_scadenza_noti")
    else:
        reasons.append("stato_e_scadenza_da_verificare")

    # Una categoria ampia e chiaramente dichiarata (es. "enti privati non profit")
    # è sufficiente per evitare una chiamata AI: non occorre interpretarla.
    # NON significa però che ODV/APS/ETS siano automaticamente ammesse. Questa
    # distinzione resta memorizzata in audience.scope e specificLegalFormConfirmed.
    critical = {
        "title": title_ok,
        "source": bool(source_url),
        "territory": bool(territory),
        "bando": bando_known,
        "audience": bool(audience["known"]),
        "text": len(discovery) >= 120,
        "timing": timing_known,
    }
    resolved = all(critical.values())

    return {
        "status": "rules-resolved" if resolved else "ai-required",
        "needsAnalysis": not resolved,
        "reasons": reasons,
        "evidence": evidence,
        "audience": audience,
        "ruleVersion": RULE_VERSION,
    }


def main():
    catalog = load_json(CATALOG, {})
    state = load_json(STATE, {"schemaVersion": 1, "records": {}})
    records = state.get("records", {}) if isinstance(state.get("records", {}), dict) else {}
    stamp = now_iso()

    resolved_count = 0
    ai_count = 0
    skipped_count = 0
    queue = []

    for key, rec in records.items():
        if rec.get("present") is not True:
            skipped_count += 1
            continue

        snapshot = rec.get("snapshot") or {}
        result = triage(snapshot)
        rec["triage"] = {**result, "evaluatedAt": stamp}
        rec["needsAnalysis"] = bool(result["needsAnalysis"])

        if result["needsAnalysis"]:
            ai_count += 1
            queue.append({
                "key": key,
                "id": rec.get("id"),
                "version": rec.get("version"),
                "source": rec.get("source"),
                "sourceUrl": rec.get("sourceUrl"),
                "title": snapshot.get("title"),
                "territories": snapshot.get("territories") or [],
                "deadline": snapshot.get("deadline"),
                "sourceStatus": snapshot.get("sourceStatus"),
                "reasons": result["reasons"],
                "audience": result["audience"],
                "text": clean(snapshot.get("discoveryText"))[:1800],
            })
        else:
            resolved_count += 1

    state["schemaVersion"] = max(int(state.get("schemaVersion") or 1), 2)
    state["triageUpdatedAt"] = stamp
    state["triageSummary"] = {
        "rulesResolved": resolved_count,
        "aiRequired": ai_count,
        "notPresent": skipped_count,
        "ruleVersion": RULE_VERSION,
    }
    state["records"] = records

    record_by_key = records
    for bando in catalog.get("bandi", []):
        url = clean(bando.get("sourceUrl")).rstrip("/")
        key = "url:" + url if url else "id:" + clean(bando.get("id"))
        rec = record_by_key.get(key)
        if not rec:
            continue
        tracking = dict(bando.get("tracking") or {})
        triage_data = rec.get("triage") or {}
        tracking["needsAnalysis"] = bool(rec.get("needsAnalysis"))
        tracking["triageStatus"] = triage_data.get("status")
        tracking["triageRuleVersion"] = RULE_VERSION
        tracking["audienceScope"] = (triage_data.get("audience") or {}).get("scope")
        tracking["specificLegalFormConfirmed"] = bool((triage_data.get("audience") or {}).get("specificLegalFormConfirmed"))
        bando["tracking"] = tracking

    catalog["triage"] = {
        "enabled": True,
        "ruleVersion": RULE_VERSION,
        "rulesResolved": resolved_count,
        "aiRequired": ai_count,
    }

    ai_payload = {
        "schemaVersion": 1,
        "generatedAt": stamp,
        "ruleVersion": RULE_VERSION,
        "count": len(queue),
        "items": sorted(queue, key=lambda x: (str(x.get("source") or ""), str(x.get("title") or ""))),
    }

    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    AI_QUEUE.write_text(json.dumps(ai_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        "BANDOVERA triage: "
        f"regole={resolved_count}, ai={ai_count}, non_presenti={skipped_count}, "
        f"coda_ai={len(queue)}, regole_versione={RULE_VERSION}"
    )


if __name__ == "__main__":
    main()
