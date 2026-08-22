import json
import re
import hashlib
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OUT = PUBLIC / "radar_bandi_auto.json"
ITALY_TZ = ZoneInfo("Europe/Rome")

SOURCES = [
    {
        "name": "Regione Lombardia",
        "region": "lombardia",
        "url": "https://www.bandi.regione.lombardia.it/servizi/servizio/catalogo/target/ENTI_E_OPERATORI",
        "kind": "lombardia",
    },
    {
        "name": "Regione Emilia-Romagna · Sociale",
        "region": "emilia-romagna",
        "url": "https://sociale.regione.emilia-romagna.it/leggi-atti-bandi/bandi",
        "kind": "emilia-romagna",
    },
    {
        "name": "Regione Emilia-Romagna · Partecipazione",
        "region": "emilia-romagna",
        "url": "https://partecipazione.regione.emilia-romagna.it/leggi-atti-bandi/bandi",
        "kind": "emilia-romagna",
    },
    {
        "name": "Regione Emilia-Romagna · Pari opportunità",
        "region": "emilia-romagna",
        "url": "https://parita.regione.emilia-romagna.it/leggi-atti-bandi",
        "kind": "emilia-romagna",
    },
    {
        "name": "Regione Emilia-Romagna · Sport",
        "region": "emilia-romagna",
        "url": "https://www.regione.emilia-romagna.it/sport/leggi-atti-bandi",
        "kind": "emilia-romagna",
    },
    {
        "name": "Regione Piemonte · Bandi",
        "region": "piemonte",
        "url": "https://bandi.regione.piemonte.it/",
        "kind": "piemonte",
    },
    {
        "name": "Fondazione Cariplo",
        "region": "sovraregionale",
        "url": "https://www.fondazionecariplo.it/contributi/bandi/",
        "kind": "cariplo",
    },
]

HEADERS = {
    "User-Agent": "BANDOVERA/1.3 (+monitoraggio bandi pubblici; contatto amministratore sito)"
}

ER_BAD_TITLES = {
    "conclusi", "concluso", "bandi conclusi", "bandi", "archivio",
    "normativa", "normativa di settore", "vai alla normativa di settore",
    "annualità precedenti", "annualita precedenti", "vedi", "leggi",
    "approfondisci", "scopri di più", "scopri di piu", "vai al bando",
}
ER_BAD_PREFIXES = (
    "scarica ", "download ", "vai ai bandi ", "vai a bandi ",
    "consulta ", "vai alla normativa", "modulistica", "documentazione",
)
ER_BAD_PATH_PARTS = (
    "/conclusi", "/concluso", "/archivio", "/normativa", "/norme",
    "/annualita-precedenti", "/bandi-2025", "/bandi-2024", "/bandi-2023",
    "/documenti", "/modulistica",
)
ER_SIGNALS = (
    "bando", "avviso", "contribut", "finanzi", "manifestazione di interesse",
    "presentazione di progetti", "presentazione progetti", "domande", "candidatur",
    "programmato", "apertura", "scadenza",
)


def clean(s):
    return re.sub(r"\s+", " ", (s or "")).strip()


def slug_id(prefix, url, title):
    digest = hashlib.sha1((url + "|" + title).encode("utf-8")).hexdigest()[:12].upper()
    return f"{prefix}-{digest}"


def parse_date(text):
    if not text:
        return None
    patterns = [
        r"(?:chiude il|scadenza(?:\s+il)?|entro il|fino al)\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})",
        r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\s*(?:[-–]\s*)?(?:scadenza|chiusura)",
        r"scadenza\s*(?:\w+,?\s*)?(\d{1,2})/(\d{1,2})/(\d{4})",
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.I)
        if not m:
            continue
        d, mo, y = map(int, m.groups())
        try:
            return datetime(y, mo, d).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def nearby_text(a):
    node = a
    for _ in range(6):
        if not node:
            break
        txt = clean(node.get_text(" ", strip=True))
        if len(txt) >= 100:
            return txt
        node = node.parent
    return clean(a.get_text(" ", strip=True))


def useful_title(a):
    title = clean(a.get_text(" ", strip=True))
    generic = {"scopri di più", "fai domanda", "dettaglio", "leggi", "vai al bando", "continua", "approfondisci"}
    if len(title) >= 8 and title.lower() not in generic:
        return title
    parent = a
    for _ in range(6):
        parent = parent.parent if parent else None
        if not parent:
            break
        h = parent.find(["h1", "h2", "h3", "h4", "strong"])
        if h:
            candidate = clean(h.get_text(" ", strip=True))
            if len(candidate) >= 8 and candidate.lower() not in generic:
                return candidate
    return ""


def lombardia_items(html, base):
    # NON MODIFICARE: parser Lombardia lasciato identico alla versione stabile.
    soup = BeautifulSoup(html, "html.parser")
    out = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        if "/servizi/servizio/" not in href or "/dettaglio/" not in href:
            continue
        url = urljoin(base, href)
        block = nearby_text(a)
        title = useful_title(a)
        if len(title) < 8:
            continue
        code_match = re.search(r"\b(RL[A-Z0-9]{6,})\b", block)
        code = code_match.group(1) if code_match else slug_id("RL-AUTO", url, title)
        if code in seen:
            continue
        seen.add(code)
        out.append(make_record(code, title, "Regione Lombardia", url, block, "lombardia"))
    return out


def er_candidate_link(url):
    p = urlparse(url)
    if not p.hostname or not p.hostname.endswith("regione.emilia-romagna.it"):
        return False
    path = p.path.lower().rstrip("/")
    if not ("/leggi-atti-bandi/" in path or "/bandi/" in path):
        return False
    if any(x in path for x in ER_BAD_PATH_PARTS):
        return False
    if re.search(r"\.(pdf|doc|docx|xls|xlsx|zip)$", path):
        return False
    exact_lists = {
        "/leggi-atti-bandi/bandi", "/leggi-atti-bandi", "/bandi",
        "/sport/leggi-atti-bandi", "/sport/bandi",
    }
    return path not in exact_lists


def er_title_allowed(title):
    t = clean(title).lower().strip(" .:-–—")
    if len(t) < 10:
        return False
    if t in ER_BAD_TITLES:
        return False
    if any(t.startswith(prefix) for prefix in ER_BAD_PREFIXES):
        return False
    if re.fullmatch(r"bandi?\s+20\d{2}", t):
        return False
    if re.fullmatch(r"(conclusi|aperti|programmati|in corso)", t):
        return False
    return True


def er_status(text):
    n = clean(text).lower()
    if any(x in n for x in ["bando chiuso", "procedimento concluso", "domande chiuse", "termini scaduti"]):
        return "chiuso"
    if "bando in corso" in n:
        return "procedimento-in-corso"
    if "bando programmato" in n or "programmato" in n:
        return "programmato"
    if "bando aperto" in n or ("termini per la presentazione" in n and "aperti" in n):
        return "aperto"
    return "da-verificare"


def emilia_romagna_items(html, base, source_name):
    soup = BeautifulSoup(html, "html.parser")
    out = []
    seen = set()
    for a in soup.find_all("a", href=True):
        url = urljoin(base, a.get("href", ""))
        if not er_candidate_link(url):
            continue
        title = useful_title(a)
        if not er_title_allowed(title):
            continue
        block = nearby_text(a)
        combined = clean(f"{title} {block}").lower()
        status = er_status(combined)
        if status in {"chiuso", "procedimento-in-corso"}:
            continue
        if not any(signal in combined for signal in ER_SIGNALS):
            continue
        if len(clean(block)) < 35:
            continue
        rec_id = slug_id("ER-AUTO", url, title)
        if rec_id in seen:
            continue
        seen.add(rec_id)
        rec = make_record(rec_id, title, source_name, url, block, "emilia-romagna")
        rec["sourceStatus"] = status
        out.append(rec)
    return out


def piemonte_title(a):
    title = clean(a.get_text(" ", strip=True))
    title = re.sub(r"^Per saperne di più su\s*", "", title, flags=re.I)
    return title.strip()


def piemonte_status(text):
    n = clean(text).lower()
    if re.search(r"\bstato\s+aperto\b", n):
        return "aperto"
    if "stato pre-informazione" in n or "pre informazione fondi ue" in n or "pre-informazione" in n:
        return "programmato"
    if any(x in n for x in ["stato scaduto", "stato esito", "stato chiuso"]):
        return "chiuso"
    return "da-verificare"


def piemonte_items(html, base, source_name):
    soup = BeautifulSoup(html, "html.parser")
    out = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        url = urljoin(base, href)
        p = urlparse(url)
        if p.hostname != "bandi.regione.piemonte.it":
            continue
        path = p.path.rstrip("/")
        if not (path.startswith("/contributi-finanziamenti/") or path.startswith("/pre-informazione-fondi-ue/")):
            continue
        if url in seen:
            continue
        seen.add(url)
        title = piemonte_title(a)
        if len(title) < 12:
            continue
        try:
            detail = requests.get(url, headers=HEADERS, timeout=20)
            detail.raise_for_status()
        except Exception:
            continue
        detail_soup = BeautifulSoup(detail.text, "html.parser")
        detail_text = clean(detail_soup.get_text(" ", strip=True))
        status = piemonte_status(detail_text)
        if status not in {"aperto", "programmato"}:
            continue
        if "terzo settore" not in detail_text.lower():
            continue
        h1 = detail_soup.find("h1")
        if h1:
            full_title = clean(h1.get_text(" ", strip=True))
            if len(full_title) >= 12:
                title = full_title
        rec_id = slug_id("PIE-AUTO", url, title)
        rec = make_record(rec_id, title, source_name, url, detail_text, "piemonte")
        rec["sourceStatus"] = status
        if status == "programmato":
            rec["tags"].insert(0, "PROGRAMMATO · APERTURA FUTURA")
        out.append(rec)
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
        title = useful_title(a)
        block = nearby_text(a)
        if len(title) < 8:
            continue
        if "attivo" not in block.lower() and "attiva" not in block.lower():
            continue
        rec_id = slug_id("FC-AUTO", url, title)
        if rec_id in seen:
            continue
        seen.add(rec_id)
        out.append(make_record(rec_id, title, "Fondazione Cariplo", url, block, "lombardia"))
    return out


def make_record(rec_id, title, source, url, text, territory):
    desc = clean(text)[:900]
    words = [w.lower() for w in re.findall(r"[A-Za-zÀ-ÿ]{4,}", f"{title} {desc}")]
    stop = {"della","delle","degli","dello","dalla","dalle","sono","come","anche","alla","alle","nella","nelle","per","con","bando","scopri","più","fai","domanda","aperto","attivo","regione","regionale"}
    keywords = []
    for w in words:
        if w not in stop and w not in keywords:
            keywords.append(w)
        if len(keywords) >= 20:
            break
    return {
        "id": rec_id,
        "title": title,
        "source": source,
        "deadline": parse_date(text),
        "fund": 0,
        "maxGrant": 0,
        "aid": "Dettagli economici da verificare nella fonte ufficiale",
        "tags": ["Automatico", source, territory],
        "eligibility": ["Requisiti da verificare nella fonte ufficiale"],
        "keywords": keywords,
        "sectors": keywords[:8],
        "beneficiaries": [],
        "activities": [],
        "purposes": [],
        "territories": [territory],
        "legalForms": ["ets", "odv", "aps", "associazione", "fondazione", "ente non profit"],
        "hardRequirements": [{"label": f"Territorio: {territory}", "anyOf": [territory]}],
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
    source_stats = []
    for src in SOURCES:
        count_before = len(found)
        try:
            r = requests.get(src["url"], headers=HEADERS, timeout=30)
            r.raise_for_status()
            if src["kind"] == "lombardia":
                found.extend(lombardia_items(r.text, src["url"]))
            elif src["kind"] == "emilia-romagna":
                found.extend(emilia_romagna_items(r.text, src["url"], src["name"]))
            elif src["kind"] == "piemonte":
                found.extend(piemonte_items(r.text, src["url"], src["name"]))
            elif src["kind"] == "cariplo":
                found.extend(cariplo_items(r.text, src["url"]))
            source_stats.append({"source": src["name"], "region": src["region"], "found": len(found) - count_before, "ok": True})
        except Exception as e:
            errors.append(f"{src['name']}: {e}")
            source_stats.append({"source": src["name"], "region": src["region"], "found": 0, "ok": False})

    ids, urls = existing_urls_and_ids()
    dedup = {}
    for b in found:
        if b["id"] in ids or b["sourceUrl"].rstrip("/") in urls:
            continue
        dedup[b["sourceUrl"].rstrip("/")] = b

    by_region = {}
    for b in dedup.values():
        for territory in b.get("territories", []):
            by_region[territory] = by_region.get(territory, 0) + 1

    payload = {
        "updatedAt": datetime.now(ITALY_TZ).strftime("%d/%m/%Y %H:%M"),
        "schemaVersion": 6,
        "automatic": True,
        "regionsEnabled": ["lombardia", "emilia-romagna", "piemonte"],
        "sourcesChecked": [s["name"] for s in SOURCES],
        "sourceStats": source_stats,
        "bandiByRegion": by_region,
        "errors": errors,
        "bandi": sorted(dedup.values(), key=lambda x: (x.get("deadline") or "9999-12-31", x["title"])),
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"BANDOVERA: {len(payload['bandi'])} bandi automatici, Regioni={payload['regionsEnabled']}, {len(errors)} errori fonte")


if __name__ == "__main__":
    main()
