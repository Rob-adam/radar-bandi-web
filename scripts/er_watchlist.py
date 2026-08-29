import json
import re
import hashlib
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
AUTO = PUBLIC / "radar_bandi_auto.json"
STATIC_FILES = [PUBLIC / "radar_bandi_catalogo.json", PUBLIC / "radar_bandi_catalogo_extra.json"]
HEADERS = {"User-Agent": "BANDOVERA/1.4 (+monitoraggio bandi pubblici)"}

WATCH = [
    {
        "source": "Regione Emilia-Romagna · Sociale",
        "url": "https://sociale.regione.emilia-romagna.it/leggi-atti-bandi/bandi/2026/avviso-pubblico-per-lindividuazione-e-il-coinvolgimento-di-enti-del-terzo-settore-disponibili-alla-co-progettazione-nellambito-del-piano-una-giustizia-piu-inclusiva-attuazione-modelli-di-intervento-per-linclusione-attiva-dei-soggetti-in-uscita-ed-es",
    },
    {
        "source": "Regione Emilia-Romagna · Partecipazione",
        "url": "https://partecipazione.regione.emilia-romagna.it/leggi-atti-bandi/bandi/bando-della-partecipazione-2026",
    },
    {
        "source": "Regione Emilia-Romagna · Pari opportunità",
        "url": "https://parita.regione.emilia-romagna.it/leggi-atti-bandi/bandi-regionali-2026/bando-per-la-presentazione-di-progetti-rivolti-alla-promozione-ed-al-conseguimento-delle-pari-opportunita-ed-al-contrasto-delle-discriminazioni-e-della-violenza-di-genere-annualita-2027-2028",
    },
    {
        "source": "Regione Emilia-Romagna · Sport",
        "url": "https://www.regione.emilia-romagna.it/sport/bandi/2026/contributi-per-progetti-sportivi-biennali-2026-2027",
    },
]

MONTHS = {"gennaio":1,"febbraio":2,"marzo":3,"aprile":4,"maggio":5,"giugno":6,"luglio":7,"agosto":8,"settembre":9,"ottobre":10,"novembre":11,"dicembre":12}
RELEVANCE = ("terzo settore","organizzazioni di volontariato","associazioni di promozione sociale"," odv "," aps ","non profit","associazioni")


def clean(v):
    return re.sub(r"\s+", " ", str(v or "")).strip()


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    except Exception:
        return {}


def known_urls():
    urls=set()
    for p in STATIC_FILES:
        for b in load(p).get("bandi",[]):
            if b.get("sourceUrl"):
                urls.add(str(b["sourceUrl"]).rstrip("/"))
    return urls


def parse_deadline(text):
    t=clean(text)
    month_names="|".join(MONTHS)
    patterns=[
        rf"(?:scade il|scadenza(?: dei termini)?(?: per partecipare)?|fino al|entro il)\s*(\d{{1,2}})\s+({month_names})\s+(\d{{4}})",
        rf"(\d{{1,2}})\s+({month_names})\s+(\d{{4}})(?:\s+\d{{1,2}}:\d{{2}})?\s*(?:[-–]\s*)?(?:scadenza|chiusura)",
        r"(?:scade il|scadenza(?:\s+il)?|entro il|fino al)\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})",
    ]
    for i,p in enumerate(patterns):
        m=re.search(p,t,re.I)
        if not m: continue
        try:
            if i<2:
                return date(int(m.group(3)),MONTHS[m.group(2).lower()],int(m.group(1)))
            return date(int(m.group(3)),int(m.group(2)),int(m.group(1)))
        except Exception:
            pass
    return None


def state(text, deadline):
    low=text.lower()
    if "bando programmato" in low: return "programmato"
    if "bando aperto" in low: return "aperto"
    if "bando chiuso" in low or "bando scaduto" in low: return "chiuso"
    if deadline: return "aperto" if deadline>=date.today() else "chiuso"
    if "bando in corso" in low: return "in-corso"
    return "da-verificare"


def slug(url,title):
    return "ER-AUTO-"+hashlib.sha1((url+"|"+title).encode()).hexdigest()[:12].upper()


def record(entry):
    url=entry["url"]
    try:
        r=requests.get(url,headers=HEADERS,timeout=25); r.raise_for_status()
    except Exception as exc:
        return None,"fetch-failed",str(exc)
    soup=BeautifulSoup(r.text,"html.parser")
    text=clean(soup.get_text(" ",strip=True))
    low=f" {text.lower()} "
    deadline=parse_deadline(text)
    st=state(text,deadline)
    if st not in {"aperto","programmato","in-corso"}:
        return None,st,None
    if not any(x in low for x in RELEVANCE):
        return None,"non-ets",None
    h1=soup.find("h1")
    title=clean(h1.get_text(" ",strip=True)) if h1 else clean(soup.title.get_text(" ",strip=True) if soup.title else "")
    if len(title)<10: return None,"bad-title",None
    desc=text[:6000]
    words=[w.lower() for w in re.findall(r"[A-Za-zÀ-ÿ]{4,}",title+" "+desc)]
    keywords=[]
    for w in words:
        if w not in keywords and w not in {"della","delle","degli","dello","sono","come","anche","alla","alle","nella","nelle","bando","regione","regionale"}:
            keywords.append(w)
        if len(keywords)>=20: break
    rec={
        "id":slug(url,title),"title":title,"source":entry["source"],
        "deadline":deadline.isoformat() if deadline else None,"fund":0,"maxGrant":0,
        "aid":"Dettagli economici da verificare nella fonte ufficiale",
        "tags":["Automatico",entry["source"],"emilia-romagna"],
        "eligibility":["Requisiti estratti dalla fonte ufficiale e da verificare nel dettaglio"],
        "keywords":keywords,"sectors":keywords[:8],"beneficiaries":[],"activities":[],"purposes":[],
        "territories":["emilia-romagna"],
        "legalForms":["ets","odv","aps","associazione","fondazione","ente non profit"],
        "hardRequirements":[{"label":"Territorio: emilia-romagna","anyOf":["emilia-romagna"]}],
        "hardKeyword":None,"sourceUrl":url,"sourceStatus":"programmato" if st=="programmato" else "aperto",
        "autoDiscovered":True,"discoveryText":desc,"discoveryMethod":"official-direct-watch"
    }
    if st=="programmato": rec["tags"].insert(0,"PROGRAMMATO · APERTURA FUTURA")
    return rec,st,None


def main():
    auto=load(AUTO)
    bandi=auto.get("bandi",[]) if isinstance(auto.get("bandi",[]),list) else []
    static=known_urls()
    current={str(b.get("sourceUrl") or "").rstrip("/") for b in bandi}
    checked=[]; added=0; active=0
    for entry in WATCH:
        rec,st,err=record(entry)
        checked.append({"source":entry["source"],"url":entry["url"],"state":st,"error":err})
        if rec:
            active+=1
            key=rec["sourceUrl"].rstrip("/")
            if key not in static and key not in current:
                bandi.append(rec); current.add(key); added+=1
    auto["bandi"]=sorted(bandi,key=lambda x:(x.get("deadline") or "9999-12-31",x.get("title") or ""))
    auto["erDirectWatch"]={"checkedAt":datetime.now().isoformat(timespec="seconds"),"checked":len(checked),"active":active,"added":added,"items":checked}
    by={}
    for b in bandi:
        for t in b.get("territories",[]): by[t]=by.get(t,0)+1
    auto["bandiByRegion"]=by
    AUTO.write_text(json.dumps(auto,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"BANDOVERA ER direct watch: controllati={len(checked)}, attivi={active}, nuovi={added}")

if __name__=="__main__": main()
