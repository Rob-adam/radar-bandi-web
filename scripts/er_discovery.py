import json
import re
import hashlib
from datetime import datetime, date
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
CATALOG = PUBLIC / "radar_bandi_auto.json"
STATIC_FILES = [PUBLIC / "radar_bandi_catalogo.json", PUBLIC / "radar_bandi_catalogo_extra.json"]

HEADERS = {"User-Agent": "BANDOVERA/1.4 (+monitoraggio bandi pubblici)"}

SOURCES = [
    {
        "name": "Regione Emilia-Romagna · Sociale",
        "sitemaps": ["https://sociale.regione.emilia-romagna.it/sitemap"],
        "host": "sociale.regione.emilia-romagna.it",
        "path_signals": ["/leggi-atti-bandi/bandi/2026/", "/infanzia-adolescenza/"],
    },
    {
        "name": "Regione Emilia-Romagna · Partecipazione",
        "sitemaps": ["https://partecipazione.regione.emilia-romagna.it/sitemap"],
        "host": "partecipazione.regione.emilia-romagna.it",
        "path_signals": ["/leggi-atti-bandi/bandi/"],
    },
    {
        "name": "Regione Emilia-Romagna · Pari opportunità",
        "sitemaps": ["https://parita.regione.emilia-romagna.it/sitemap"],
        "host": "parita.regione.emilia-romagna.it",
        "path_signals": ["/leggi-atti-bandi/", "/bandi/"],
    },
    {
        "name": "Regione Emilia-Romagna · Sport",
        "sitemaps": [
            "https://www.regione.emilia-romagna.it/sport/sitemap",
            "https://www.regione.emilia-romagna.it/sitemap",
        ],
        "host": "www.regione.emilia-romagna.it",
        "path_signals": ["/sport/bandi/2026/"],
    },
]

RELEVANCE = (
    "terzo settore", "enti del terzo settore", "organizzazioni di volontariato",
    "organizzazione di volontariato", "associazioni di promozione sociale",
    "associazione di promozione sociale", " odv ", " aps ", "non profit",
    "senza scopo di lucro", "associazioni", "fondazioni del terzo settore",
)

CLOSED = (
    "bando chiuso", "bando scaduto", "procedimento concluso", "termini scaduti",
    "domande chiuse", "graduatoria approvata", "esiti del bando",
)

MONTHS = {
    "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6,
    "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12,
}


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def slug_id(url, title):
    digest = hashlib.sha1((url + "|" + title).encode("utf-8")).hexdigest()[:12].upper()
    return f"ER-AUTO-{digest}"


def load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default
    except Exception:
        return default


def parse_deadline(text):
    text = clean(text)
    numeric = [
        r"(?:scade il|scadenza(?:\s+il)?|entro il|fino al)\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})",
        r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\s*(?:[-–]\s*)?(?:scadenza|chiusura)",
    ]
    for pattern in numeric:
        m = re.search(pattern, text, re.I)
        if m:
            try:
                return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
            except ValueError:
                pass

    month_names = "|".join(MONTHS)
    patterns = [
        rf"(?:scade il|scadenza(?: dei termini)?(?: per partecipare)?|fino al|entro il)\s*(\d{{1,2}})\s+({month_names})\s+(\d{{4}})",
        rf"(\d{{1,2}})\s+({month_names})\s+(\d{{4}})\s*(?:[-–]\s*)?(?:scadenza|chiusura)",
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.I)
        if m:
            try:
                return date(int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1)))
            except ValueError:
                pass
    return None


def status_from_text(text, deadline):
    n = f" {clean(text).lower()} "
    if any(marker in n for marker in CLOSED):
        # Una pagina può contenere parole sugli esiti pur avendo una nuova fase futura:
        # una scadenza futura prevale sui marcatori generici di archivio/esito.
        if not deadline or deadline < date.today():
            return "chiuso"
    if "bando programmato" in n or " programmato " in n:
        return "programmato"
    if "bando aperto" in n:
        return "aperto"
    if "bando in corso" in n:
        return "aperto" if (not deadline or deadline >= date.today()) else "chiuso"
    if deadline and deadline >= date.today():
        return "aperto"
    return "da-verificare"


def static_urls():
    urls = set()
    for path in STATIC_FILES:
        data = load_json(path, {})
        for item in data.get("bandi", []):
            if item.get("sourceUrl"):
                urls.add(str(item["sourceUrl"]).rstrip("/"))
    return urls


def source_urls_from_sitemap(src):
    urls = set()
    last_error = None
    for sitemap in src["sitemaps"]:
        try:
            r = requests.get(sitemap, headers=HEADERS, timeout=35)
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "html.parser")
            for a in soup.find_all("a", href=True):
                url = urljoin(sitemap, a.get("href", ""))
                p = urlparse(url)
                if p.hostname != src["host"]:
                    continue
                path = p.path.lower()
                if not any(signal in path for signal in src["path_signals"]):
                    continue
                if re.search(r"\.(pdf|doc|docx|xls|xlsx|zip)(?:$|\?)", path):
                    continue
                # Concentrati sull'annualità corrente: evita di aprire interi archivi storici.
                anchor = clean(a.get_text(" ", strip=True)).lower()
                if "2026" not in path and "2026" not in anchor and src["name"].endswith("Partecipazione") is False:
                    continue
                urls.add(url.rstrip("/"))
            if urls:
                return sorted(urls), None
        except Exception as exc:
            last_error = str(exc)
    return sorted(urls), last_error


def detail_record(url, source_name):
    try:
        r = requests.get(url, headers=HEADERS, timeout=25)
        r.raise_for_status()
    except Exception:
        return None
    soup = BeautifulSoup(r.text, "html.parser")
    text = clean(soup.get_text(" ", strip=True))
    low = f" {text.lower()} "
    if "2026" not in low:
        return None
    if not any(signal in low for signal in RELEVANCE):
        return None
    deadline = parse_deadline(text)
    status = status_from_text(text, deadline)
    if status not in {"aperto", "programmato"}:
        return None
    h1 = soup.find("h1")
    title = clean(h1.get_text(" ", strip=True)) if h1 else ""
    if len(title) < 10:
        title = clean((soup.title.get_text(" ", strip=True) if soup.title else ""))
    if len(title) < 10:
        return None
    desc = text[:6000]
    words = [w.lower() for w in re.findall(r"[A-Za-zÀ-ÿ]{4,}", f"{title} {desc}")]
    stop = {"della", "delle", "degli", "dello", "dalla", "sono", "come", "anche", "alla", "alle", "nella", "nelle", "per", "con", "bando", "regione", "regionale"}
    keywords = []
    for w in words:
        if w not in stop and w not in keywords:
            keywords.append(w)
        if len(keywords) >= 20:
            break
    rec = {
        "id": slug_id(url, title),
        "title": title,
        "source": source_name,
        "deadline": deadline.isoformat() if deadline else None,
        "fund": 0,
        "maxGrant": 0,
        "aid": "Dettagli economici da verificare nella fonte ufficiale",
        "tags": ["Automatico", source_name, "emilia-romagna"],
        "eligibility": ["Requisiti estratti dalla fonte ufficiale e da verificare nel dettaglio"],
        "keywords": keywords,
        "sectors": keywords[:8],
        "beneficiaries": [],
        "activities": [],
        "purposes": [],
        "territories": ["emilia-romagna"],
        "legalForms": ["ets", "odv", "aps", "associazione", "fondazione", "ente non profit"],
        "hardRequirements": [{"label": "Territorio: emilia-romagna", "anyOf": ["emilia-romagna"]}],
        "hardKeyword": None,
        "sourceUrl": url,
        "sourceStatus": status,
        "autoDiscovered": True,
        "discoveryText": desc,
        "discoveryMethod": "official-sitemap-fallback",
    }
    if status == "programmato":
        rec["tags"].insert(0, "PROGRAMMATO · APERTURA FUTURA")
    return rec


def main():
    catalog = load_json(CATALOG, {})
    bandi = catalog.get("bandi", []) if isinstance(catalog.get("bandi", []), list) else []
    known_static = static_urls()
    known_auto = {str(b.get("sourceUrl") or "").rstrip("/") for b in bandi}
    errors = list(catalog.get("errors", []))
    stats = catalog.get("sourceStats", []) if isinstance(catalog.get("sourceStats", []), list) else []

    discovered_total = 0
    added_total = 0
    per_source = {}

    for src in SOURCES:
        candidates, sitemap_error = source_urls_from_sitemap(src)
        discovered = []
        # Limite di sicurezza: le mappe possono contenere anni di contenuti.
        for url in candidates[:80]:
            rec = detail_record(url, src["name"])
            if rec:
                discovered.append(rec)
        discovered_total += len(discovered)
        added = 0
        for rec in discovered:
            key = rec["sourceUrl"].rstrip("/")
            if key in known_static or key in known_auto:
                continue
            bandi.append(rec)
            known_auto.add(key)
            added += 1
        added_total += added
        per_source[src["name"]] = {"discovered": len(discovered), "added": added, "fallbackOk": sitemap_error is None or bool(candidates)}
        if sitemap_error and not candidates:
            errors.append(f"{src['name']} fallback: {sitemap_error}")

    for stat in stats:
        info = per_source.get(stat.get("source"))
        if not info:
            continue
        stat["fallbackDiscovered"] = info["discovered"]
        stat["fallbackAdded"] = info["added"]
        stat["fallbackOk"] = info["fallbackOk"]
        # found rappresenta ora ciò che la sorgente ufficiale ha davvero individuato,
        # anche se il record era già presente nel catalogo statico e quindi non duplicato.
        stat["found"] = max(int(stat.get("found") or 0), info["discovered"])

    by_region = {}
    for b in bandi:
        for territory in b.get("territories", []):
            by_region[territory] = by_region.get(territory, 0) + 1

    catalog["bandi"] = sorted(bandi, key=lambda x: (x.get("deadline") or "9999-12-31", x.get("title") or ""))
    catalog["sourceStats"] = stats
    catalog["bandiByRegion"] = by_region
    catalog["errors"] = errors
    catalog["erFallback"] = {
        "enabled": True,
        "discovered": discovered_total,
        "added": added_total,
        "checkedAt": datetime.now().isoformat(timespec="seconds"),
    }
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"BANDOVERA ER fallback: individuati={discovered_total}, nuovi={added_total}")


if __name__ == "__main__":
    main()
