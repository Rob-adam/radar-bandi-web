import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DATA = ROOT / "data"
CATALOG = PUBLIC / "radar_bandi_auto.json"
AI_QUEUE = DATA / "radar_bandi_ai_queue.json"
REPORT = DATA / "radar_bandi_enrichment.json"
ITALY_TZ = ZoneInfo("Europe/Rome")
HEADERS = {
    "User-Agent": "BANDOVERA/1.4 (+approfondimento fonti ufficiali; monitoraggio bandi pubblici)"
}

GENERIC_TITLES = {
    "bando", "bandi", "avviso", "avvisi", "dettaglio", "scopri di più",
    "scopri di piu", "approfondisci", "vai al bando", "home",
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


def title_usable(value):
    t = clean(value).lower().strip(" .:-–—")
    if len(t) < 10 or t in GENERIC_TITLES:
        return False
    if re.fullmatch(r"\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}", t):
        return False
    return True


def extract_title(soup):
    candidates = []
    for tag in soup.find_all("h1", limit=3):
        candidates.append(clean(tag.get_text(" ", strip=True)))
    og = soup.find("meta", attrs={"property": "og:title"})
    if og:
        candidates.append(clean(og.get("content")))
    tw = soup.find("meta", attrs={"name": "twitter:title"})
    if tw:
        candidates.append(clean(tw.get("content")))
    if soup.title:
        candidates.append(clean(soup.title.get_text(" ", strip=True)))

    for title in candidates:
        title = re.sub(r"\s*[|–—-]\s*(Regione Lombardia|Regione Piemonte|Regione Emilia-Romagna|Fondazione Cariplo).*$", "", title, flags=re.I)
        if title_usable(title):
            return title
    return None


def parse_date(text):
    if not text:
        return None
    month_names = {
        "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4,
        "maggio": 5, "giugno": 6, "luglio": 7, "agosto": 8,
        "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12,
    }
    patterns = [
        r"(?:scadenza(?:\s+il)?|chiude(?:\s+il)?|entro(?:\s+il)?|fino(?:\s+al)?|termine(?:\s+il)?)\s*[:\-]?\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})",
        r"(?:scadenza(?:\s+il)?|chiude(?:\s+il)?|entro(?:\s+il)?|fino(?:\s+al)?|termine(?:\s+il)?)\s*[:\-]?\s*(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})",
    ]
    for i, pattern in enumerate(patterns):
        m = re.search(pattern, text, re.I)
        if not m:
            continue
        try:
            if i == 0:
                d, mo, y = map(int, m.groups())
            else:
                d = int(m.group(1))
                mo = month_names[m.group(2).lower()]
                y = int(m.group(3))
            return datetime(y, mo, d).strftime("%Y-%m-%d")
        except (ValueError, KeyError):
            continue
    return None


def detect_status(text):
    n = clean(text).lower()
    if any(x in n for x in ["bando chiuso", "avviso chiuso", "domande chiuse", "termini scaduti", "stato scaduto", "stato chiuso"]):
        return "chiuso"
    if any(x in n for x in ["pre-informazione", "pre informazione", "bando programmato", "apertura futura"]):
        return "programmato"
    if any(x in n for x in ["bando aperto", "avviso aperto", "stato aperto", "aperte le domande", "attivo"]):
        return "aperto"
    return None


def page_text(soup):
    for node in soup(["script", "style", "noscript", "svg"]):
        node.decompose()
    main = soup.find("main") or soup.find("article") or soup.body or soup
    return clean(main.get_text(" ", strip=True))[:12000]


def record_key(bando):
    url = clean(bando.get("sourceUrl")).rstrip("/")
    return "url:" + url if url else "id:" + clean(bando.get("id"))


def main():
    catalog = load_json(CATALOG, {})
    queue = load_json(AI_QUEUE, {"items": []})
    queued = {clean(x.get("key")): x for x in queue.get("items", []) if clean(x.get("key"))}
    stamp = now_iso()

    attempted = 0
    enriched = 0
    failed = 0
    unchanged = 0
    report_items = []

    for bando in catalog.get("bandi", []):
        key = record_key(bando)
        if key not in queued:
            continue
        url = clean(bando.get("sourceUrl"))
        if not url.startswith(("http://", "https://")):
            continue

        attempted += 1
        changed = []
        try:
            r = requests.get(url, headers=HEADERS, timeout=25)
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "html.parser")
            text = page_text(soup)
            if len(text) < 80:
                raise ValueError("testo pagina insufficiente")

            title = extract_title(soup)
            if title and title_usable(title) and title != clean(bando.get("title")):
                bando["title"] = title
                changed.append("title")

            old_text = clean(bando.get("discoveryText"))
            if len(text) > len(old_text) and text != old_text:
                bando["discoveryText"] = text
                changed.append("discoveryText")

            deadline = parse_date(text)
            if deadline and deadline != bando.get("deadline"):
                bando["deadline"] = deadline
                changed.append("deadline")

            status = detect_status(text)
            if status and status != bando.get("sourceStatus"):
                bando["sourceStatus"] = status
                changed.append("sourceStatus")

            bando["detailFetchedAt"] = stamp
            bando["detailFetchOk"] = True
            if changed:
                enriched += 1
            else:
                unchanged += 1
            report_items.append({"key": key, "ok": True, "changed": changed, "url": url})
        except Exception as e:
            failed += 1
            bando["detailFetchedAt"] = stamp
            bando["detailFetchOk"] = False
            report_items.append({"key": key, "ok": False, "error": clean(e), "url": url})

    catalog["detailEnrichment"] = {
        "enabled": True,
        "updatedAt": stamp,
        "attempted": attempted,
        "enriched": enriched,
        "unchanged": unchanged,
        "failed": failed,
    }

    report = {
        "schemaVersion": 1,
        "generatedAt": stamp,
        "attempted": attempted,
        "enriched": enriched,
        "unchanged": unchanged,
        "failed": failed,
        "items": report_items,
    }

    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"BANDOVERA enrich: tentati={attempted}, arricchiti={enriched}, invariati={unchanged}, errori={failed}")


if __name__ == "__main__":
    main()
