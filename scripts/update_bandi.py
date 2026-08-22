import json
import re
import hashlib
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OUT = PUBLIC / "radar_bandi_auto.json"

SOURCES = [
    {
        "name": "Regione Lombardia",
        "url": "https://www.bandi.regione.lombardia.it/servizi/servizio/catalogo/target/ENTI_E_OPERATORI",
        "kind": "regione",
    },
    {
        "name": "Fondazione Cariplo",
        "url": "https://www.fondazionecariplo.it/contributi/bandi/",
        "kind": "cariplo",
    },
]

HEADERS = {
    "User-Agent": "BANDOVERA/1.0 (+monitoraggio bandi pubblici; contatto amministratore sito)"
}


def clean(s):
    return re.sub(r"\s+", " ", (s or "")).strip()


def slug_id(prefix, url, title):
    digest = hashlib.sha1((url + "|" + title).encode("utf-8")).hexdigest()[:12].upper()
    return f"{prefix}-{digest}"


def parse_date(text):
    if not text:
        return None
    m = re.search(r"(?:chiude il|scadenza(?:\s+il)?|entro il)\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})", text, re.I)
    if not m:
        return None
    d, mo, y = map(int, m.groups())
    try:
        return datetime(y, mo, d).strftime("%Y-%m-%d")
    except ValueError:
        return None


def nearby_text(a):
    node = a
    for _ in range(5):
        if not node:
            break
        txt = clean(node.get_text(" ", strip=True))
        if len(txt) >= 80:
            return txt
        node = node.parent
    return clean(a.get_text(" ", strip=True))


def region_items(html, base):
    soup = BeautifulSoup(html, "html.parser")
    out = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        if "/servizi/servizio/" not in href or "/dettaglio/" not in href:
            continue
        url = urljoin(base, href)
        block = nearby_text(a)
        title = clean(a.get_text(" ", strip=True))
        if len(title) < 8 or title.lower() in {"scopri di più", "fai domanda", "dettaglio"}:
            # Try to recover a useful title from headings in the surrounding card.
            parent = a
            for _ in range(5):
                parent = parent.parent if parent else None
                if not parent:
                    break
                h = parent.find(["h2", "h3", "h4", "strong"])
                if h and len(clean(h.get_text(" ", strip=True))) >= 8:
                    title = clean(h.get_text(" ", strip=True))
                    break
        if len(title) < 8:
            continue
        code_match = re.search(r"\b(RL[A-Z0-9]{6,})\b", block)
        code = code_match.group(1) if code_match else slug_id("RL-AUTO", url, title)
        if code in seen:
            continue
        seen.add(code)
        out.append(make_record(code, title, "Regione Lombardia", url, block, "lombardia"))
    return out


def cariplo_items(html, base):
    soup = BeautifulSoup(html, "html.parser")
    out = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        if "/bando/" not in href:
            continue
        url = urljoin(base, href)
        title = clean(a.get_text(" ", strip=True))
        block = nearby_text(a)
        if len(title) < 8 or title.lower() in {"scopri di più", "leggi", "vai al bando"}:
            parent = a
            for _ in range(5):
                parent = parent.parent if parent else None
                if not parent:
                    break
                h = parent.find(["h2", "h3", "h4", "strong"])
                if h and len(clean(h.get_text(" ", strip=True))) >= 8:
                    title = clean(h.get_text(" ", strip=True))
                    break
        if len(title) < 8:
            continue
        # The Cariplo listing contains active and archived items; only retain cards marked active.
        if "attivo" not in block.lower() and "attiva" not in block.lower():
            continue
        rec_id = slug_id("FC-AUTO", url, title)
        if rec_id in seen:
            continue
        seen.add(rec_id)
        out.append(make_record(rec_id, title, "Fondazione Cariplo", url, block, "lombardia"))
    return out


def make_record(rec_id, title, source, url, text, territory):
    desc = clean(text)[:700]
    words = [w.lower() for w in re.findall(r"[A-Za-zÀ-ÿ]{4,}", f"{title} {desc}")]
    stop = {"della","delle","degli","dello","dalla","dalle","sono","come","anche","alla","alle","nella","nelle","per","con","bando","scopri","più","fai","domanda","aperto","attivo"}
    keywords = []
    for w in words:
        if w not in stop and w not in keywords:
            keywords.append(w)
        if len(keywords) >= 18:
            break
    return {
        "id": rec_id,
        "title": title,
        "source": source,
        "deadline": parse_date(text),
        "fund": 0,
        "maxGrant": 0,
        "aid": "Dettagli economici da verificare nella fonte ufficiale",
        "tags": ["Automatico", source],
        "eligibility": ["Requisiti da verificare nella fonte ufficiale"],
        "keywords": keywords,
        "sectors": keywords[:8],
        "beneficiaries": [],
        "activities": [],
        "purposes": [],
        "territories": [territory],
        "legalForms": ["ets", "odv", "aps", "associazione", "fondazione", "ente non profit"],
        "hardRequirements": [],
        "hardKeyword": None,
        "sourceUrl": url,
        "autoDiscovered": True,
        "discoveryText": desc,
    }


def existing_urls_and_ids():
    ids, urls = set(), set()
    for name in ["radar_bandi_catalogo.json", "radar_bandi_catalogo_extra.json"]:
        p = PUBLIC / name
        if not p.exists():
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        for b in data.get("bandi", []):
            if b.get("id"):
                ids.add(b["id"])
            if b.get("sourceUrl"):
                urls.add(b["sourceUrl"].rstrip("/"))
    return ids, urls


def main():
    found = []
    errors = []
    for src in SOURCES:
        try:
            r = requests.get(src["url"], headers=HEADERS, timeout=30)
            r.raise_for_status()
            if src["kind"] == "regione":
                found.extend(region_items(r.text, src["url"]))
            else:
                found.extend(cariplo_items(r.text, src["url"]))
        except Exception as e:
            errors.append(f"{src['name']}: {e}")

    ids, urls = existing_urls_and_ids()
    dedup = {}
    for b in found:
        if b["id"] in ids or b["sourceUrl"].rstrip("/") in urls:
            continue
        dedup[b["sourceUrl"].rstrip("/")] = b

    payload = {
        "updatedAt": datetime.now().astimezone().strftime("%d/%m/%Y %H:%M"),
        "schemaVersion": 3,
        "automatic": True,
        "sourcesChecked": [s["name"] for s in SOURCES],
        "errors": errors,
        "bandi": sorted(dedup.values(), key=lambda x: (x.get("deadline") or "9999-12-31", x["title"])),
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"BANDOVERA: {len(payload['bandi'])} bandi automatici, {len(errors)} errori fonte")


if __name__ == "__main__":
    main()
