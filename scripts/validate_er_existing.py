import json
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
AUTO = PUBLIC / "radar_bandi_auto.json"
STATIC = PUBLIC / "radar_bandi_catalogo_extra.json"
HEADERS = {"User-Agent": "BANDOVERA/1.4 (+validazione bandi pubblici)"}

SOURCE_BY_HOST = {
    "sociale.regione.emilia-romagna.it": "Regione Emilia-Romagna · Sociale",
    "partecipazione.regione.emilia-romagna.it": "Regione Emilia-Romagna · Partecipazione",
    "parita.regione.emilia-romagna.it": "Regione Emilia-Romagna · Pari opportunità",
}


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def source_name(url):
    p = urlparse(url)
    if p.hostname in SOURCE_BY_HOST:
        return SOURCE_BY_HOST[p.hostname]
    if p.hostname == "www.regione.emilia-romagna.it" and "/sport/" in p.path:
        return "Regione Emilia-Romagna · Sport"
    return None


def deadline_date(value):
    try:
        return date.fromisoformat(str(value or ""))
    except Exception:
        return None


def page_state(text, deadline):
    low = text.lower()
    if "bando programmato" in low:
        return "programmato"
    if "bando aperto" in low:
        return "aperto"
    if "bando chiuso" in low or "bando scaduto" in low:
        return "chiuso"
    if deadline:
        return "aperto" if deadline >= date.today() else "chiuso"
    if "bando in corso" in low:
        return "in-corso"
    return "da-verificare"


def main():
    auto = load(AUTO)
    static = load(STATIC)
    stats = auto.get("sourceStats", []) if isinstance(auto.get("sourceStats", []), list) else []
    summary = {}
    items = []

    for b in static.get("bandi", []):
        territories = [str(x).lower() for x in b.get("territories", [])]
        if "emilia-romagna" not in territories:
            continue
        url = str(b.get("sourceUrl") or "")
        src = source_name(url)
        if not src:
            continue
        info = summary.setdefault(src, {"checked": 0, "active": 0, "closed": 0, "failed": 0, "uncertain": 0})
        info["checked"] += 1
        deadline = deadline_date(b.get("deadline"))
        try:
            r = requests.get(url, headers=HEADERS, timeout=25)
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "html.parser")
            text = " ".join(soup.stripped_strings)
            state = page_state(text, deadline)
        except Exception as exc:
            info["failed"] += 1
            items.append({"id": b.get("id"), "source": src, "url": url, "state": "fetch-failed", "error": str(exc)[:250]})
            continue

        if state in {"aperto", "programmato", "in-corso"}:
            info["active"] += 1
        elif state == "chiuso":
            info["closed"] += 1
        else:
            info["uncertain"] += 1
        items.append({"id": b.get("id"), "source": src, "url": url, "deadline": b.get("deadline"), "state": state})

    for stat in stats:
        info = summary.get(stat.get("source"))
        if not info:
            continue
        stat["existingChecked"] = info["checked"]
        stat["existingActive"] = info["active"]
        stat["existingClosed"] = info["closed"]
        stat["existingFailed"] = info["failed"]
        stat["existingUncertain"] = info["uncertain"]
        stat["found"] = max(int(stat.get("found") or 0), info["active"])

    auto["sourceStats"] = stats
    auto["erExistingValidation"] = {
        "checkedAt": datetime.now().isoformat(timespec="seconds"),
        "sources": summary,
        "items": items,
    }
    AUTO.write_text(json.dumps(auto, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total = sum(x["checked"] for x in summary.values())
    active = sum(x["active"] for x in summary.values())
    print(f"BANDOVERA ER esistenti: controllati={total}, attivi_o_programmati={active}")


if __name__ == "__main__":
    main()
