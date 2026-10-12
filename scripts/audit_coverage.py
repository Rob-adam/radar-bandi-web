"""Diagnostica copertura geografica BANDOVERA; non certifica l'ammissibilità dei bandi."""
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OUTPUT = PUBLIC / "radar_bandi_coverage.json"
FILES = ("radar_bandi_catalogo.json", "radar_bandi_catalogo_extra.json", "radar_bandi_auto.json")
REGIONS = (
    "abruzzo", "basilicata", "calabria", "campania", "emilia-romagna",
    "friuli-venezia-giulia", "lazio", "liguria", "lombardia", "marche",
    "molise", "piemonte", "puglia", "sardegna", "sicilia", "toscana",
    "trentino-alto-adige", "umbria", "valle-d-aosta", "veneto",
)
NATIONAL = {"italia", "nazionale", "tutta italia", "tutto il territorio nazionale"}
INTERNATIONAL = {"internazionale", "europa", "ue", "unione europea"}
def main():
    counts = {region: {"manual": 0, "automatic": 0} for region in REGIONS}
    national = {"manual": 0, "automatic": 0}
    international = {"manual": 0, "automatic": 0}
    sources = {}
    for filename in FILES:
        path = PUBLIC / filename
        data = json.loads(path.read_text(encoding="utf-8"))
        automatic = filename == "radar_bandi_auto.json"
        group = "automatic" if automatic else "manual"
        bandi = data.get("bandi", [])
        sources[filename] = len(bandi)
        for item in bandi:
            territories = {str(t).lower().strip() for t in item.get("territories", []) if t}
            for region in REGIONS:
                if region in territories:
                    counts[region][group] += 1
            if territories & NATIONAL:
                national[group] += 1
            if territories & INTERNATIONAL:
                international[group] += 1
    payload = {
        "generatedAt": datetime.now(ZoneInfo("Europe/Rome")).isoformat(timespec="seconds"),
        "meaning": "Conteggio record per territorio dichiarato, NON bandi aperti o ammissibili",
        "sources": sources,
        "regions": counts,
        "national": national,
        "international": international,
        "regionsWithoutRecords": [r for r, c in counts.items() if not sum(c.values())],
        "warning": "Una regione senza record non significa che non esistano bandi. Verificare acquisizione, fonti, filtri e requisiti.",
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("BANDOVERA copertura: " + str(len(payload["regionsWithoutRecords"])) + " regioni senza record; " + ", ".join(payload["regionsWithoutRecords"]))
if __name__ == "__main__":
    main()
