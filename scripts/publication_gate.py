"""Gate prudenziale per il catalogo automatico BANDOVERA.

I record non sufficientemente documentati rimangono nella coda di revisione
(data/radar_bandi_ai_queue.json) e nello storico, ma non nel catalogo
automatico esposto ai clienti. Non modifica i cataloghi manuali.
"""
import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import urldefrag

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "public" / "radar_bandi_auto.json"
REPORT = ROOT / "data" / "radar_bandi_publication_gate.json"
BAD_TITLES = {"bandi | regione siciliana", "amministrazione trasparente", "attività istituzionale", "canale bandi e avvisi"}
BAD_TERMS = ("procedura per l'affidamento", "procedura per l’affidamento", "cig ", "appalto", "gara d'appalto", "gara d’appalto", "fornitura di servizi")
ETS_TERMS = ("terzo settore", "organizzazioni di volontariato", "associazioni di promozione sociale", "odv", "aps", "ets", "non profit", "nonprofit", "senza scopo di lucro")
DATE_RE = re.compile(r"^\\d{4}-\\d{2}-\\d{2}$")


def assess(b):
    title = str(b.get("title") or "").strip()
    url = str(b.get("sourceUrl") or "").strip()
    status = str(b.get("sourceStatus") or "").strip().lower()
    deadline = str(b.get("deadline") or "").strip()
    tracking = b.get("tracking") or {}
    evidence = " ".join([
        title, str(b.get("discoveryText") or ""),
        " ".join(map(str, b.get("eligibility") or [])),
    ]).lower()
    if not title or title.lower() in BAD_TITLES or len(title) < 12:
        return "titolo generico"
    if not url.startswith("https://"):
        return "fonte HTTPS assente"
    if any(t in title.lower() for t in BAD_TERMS):
        return "gara/appalto non pertinente"
    if status in ("chiuso", "scaduto", "closed", "expired", "programmato", "da-verificare"):
        return "stato non aperto verificato"
    if not DATE_RE.fullmatch(deadline):
        return "scadenza non verificata"
    try:
        if date.fromisoformat(deadline) < date.today():
            return "scaduto"
    except ValueError:
        return "scadenza non valida"
    if tracking.get("excludedForEts") is True or tracking.get("etsRelevant") is False:
        return "destinatari incompatibili"
    if tracking.get("triageStatus") != "rules-resolved" or tracking.get("etsRelevant") is not True:
        return "requisiti ETS non accertati"
    if not any(re.search(r"(?<!\\w)" + re.escape(t) + r"(?!\\w)", evidence) for t in ETS_TERMS):
        return "pertinenza ETS non documentata"
    if b.get("detailFetchOk") is not True:
        return "pagina ufficiale non riletta"
    return None


def main():
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    original = data.get("bandi") or []
    kept, withheld, seen = [], [], set()
    for b in original:
        reason = assess(b)
        canonical, _ = urldefrag(str(b.get("sourceUrl") or "").rstrip("/"))
        if not reason and canonical in seen:
            reason = "duplicato"
        if reason:
            withheld.append({"id": b.get("id"), "title": b.get("title"), "reason": reason, "sourceUrl": b.get("sourceUrl")})
        else:
            kept.append(b)
            seen.add(canonical)
    data["bandi"] = kept
    data["publicationGate"] = {"enabled": True, "reviewRequired": len(withheld), "published": len(kept), "policy": "strict-ets-v1"}
    CATALOG.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT.write_text(json.dumps({"total": len(original), "published": len(kept), "withheld": withheld}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"BANDOVERA publication gate: {len(kept)} published; {len(withheld)} held for review")


if __name__ == "__main__":
    main()
