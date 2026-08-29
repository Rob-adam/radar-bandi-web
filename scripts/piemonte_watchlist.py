import json
import re
import hashlib
from datetime import date, datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
AUTO = PUBLIC / "radar_bandi_auto.json"
STATIC_FILES = [PUBLIC / "radar_bandi_catalogo.json", PUBLIC / "radar_bandi_catalogo_extra.json"]
HEADERS = {"User-Agent": "BANDOVERA/1.4 (+monitoraggio bandi pubblici)"}

WATCH = [
    "https://bandi.regione.piemonte.it/contributi-finanziamenti/azioni-orientamento-precoce-sostegno-prime-transizioni-periodo-2026-2028",
    "https://bandi.regione.piemonte.it/contributi-finanziamenti/patrimonio-linguistico-dialettale-piemonte-avviso-pubblico-finanziamento-invito-alla-presentazione",
    "https://bandi.regione.piemonte.it/contributi-finanziamenti/bando-piemonte-africa-subsahariana-anno-2026",
    "https://bandi.regione.piemonte.it/pre-informazione-fondi-ue/interventi-la-prevenzione-della-produzione-dei-rifiuti-rivolta-soggetti",
    "https://bandi.regione.piemonte.it/contributi-finanziamenti/lr-232004-e-smi-interventi-lo-sviluppo-e-la-promozione-della-cooperazione",
]

MONTHS={"gennaio":1,"febbraio":2,"marzo":3,"aprile":4,"maggio":5,"giugno":6,"luglio":7,"agosto":8,"settembre":9,"ottobre":10,"novembre":11,"dicembre":12}
ETS_SIGNALS=("terzo settore","enti del terzo settore","ente del terzo settore","organizzazioni di volontariato","associazioni di promozione sociale"," odv "," aps ","runts","non profit","non lucrativi")


def clean(v): return re.sub(r"\s+"," ",str(v or "")).strip()

def load(path):
    try:return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    except Exception:return {}

def known_urls():
    urls=set()
    for p in STATIC_FILES:
        for b in load(p).get("bandi",[]):
            if b.get("sourceUrl"):urls.add(str(b["sourceUrl"]).rstrip("/"))
    return urls

def parse_deadline(text):
    t=clean(text); months="|".join(MONTHS)
    patterns=[
        r"scadenza\s+(?:lun|mar|mer|gio|ven|sab|dom)[a-z]*,?\s*(\d{1,2})/(\d{1,2})/(\d{4})",
        r"scadenza\s*(\d{1,2})/(\d{1,2})/(\d{4})",
        rf"scadenza\s*(?:lun|mar|mer|gio|ven|sab|dom)[a-z]*,?\s*(\d{{1,2}})\s+({months})\s+(\d{{4}})",
        rf"scadenza\s*(\d{{1,2}})\s+({months})\s+(\d{{4}})",
    ]
    for i,p in enumerate(patterns):
        m=re.search(p,t,re.I)
        if not m:continue
        try:
            if i<2:return date(int(m.group(3)),int(m.group(2)),int(m.group(1)))
            return date(int(m.group(3)),MONTHS[m.group(2).lower()],int(m.group(1)))
        except Exception:pass
    return None

def page_state(text,deadline):
    low=clean(text).lower()
    if re.search(r"\bstato\s+pre[- ]?informazione\b",low):return "programmato"
    if re.search(r"\bstato\s+aperto\b",low):return "aperto"
    if re.search(r"\bstato\s+(scaduto|chiuso|esito)\b",low):return "chiuso"
    if deadline:return "aperto" if deadline>=date.today() else "chiuso"
    return "da-verificare"

def slug(url,title):return "PIE-AUTO-"+hashlib.sha1((url+"|"+title).encode()).hexdigest()[:12].upper()

def parse_record(url):
    try:
        r=requests.get(url,headers=HEADERS,timeout=25);r.raise_for_status()
    except Exception as exc:return None,"fetch-failed",str(exc)
    soup=BeautifulSoup(r.text,"html.parser")
    text=clean(soup.get_text(" ",strip=True));low=f" {text.lower()} "
    deadline=parse_deadline(text);st=page_state(text,deadline)
    if st not in {"aperto","programmato"}:return None,st,None
    if not any(x in low for x in ETS_SIGNALS):return None,"non-ets",None
    h1=soup.find("h1");title=clean(h1.get_text(" ",strip=True)) if h1 else clean(soup.title.get_text(" ",strip=True) if soup.title else "")
    if len(title)<10:return None,"bad-title",None
    desc=text[:6500]
    words=[w.lower() for w in re.findall(r"[A-Za-zÀ-ÿ]{4,}",title+" "+desc)]
    keywords=[]
    for w in words:
        if w not in keywords and w not in {"della","delle","degli","dello","sono","come","anche","alla","alle","nella","nelle","bando","regione","piemonte","regionale"}:keywords.append(w)
        if len(keywords)>=20:break
    rec={
      "id":slug(url,title),"title":title,"source":"Regione Piemonte · Bandi","deadline":deadline.isoformat() if deadline else None,
      "fund":0,"maxGrant":0,"aid":"Dettagli economici da verificare nella fonte ufficiale",
      "tags":["Automatico","Regione Piemonte · Bandi","piemonte"],
      "eligibility":["Requisiti estratti dalla fonte ufficiale e da verificare nel dettaglio"],
      "keywords":keywords,"sectors":keywords[:8],"beneficiaries":[],"activities":[],"purposes":[],"territories":["piemonte"],
      "legalForms":["ets","odv","aps","associazione","fondazione","ente non profit"],
      "hardRequirements":[{"label":"Territorio: piemonte","anyOf":["piemonte"]}],"hardKeyword":None,
      "sourceUrl":url,"sourceStatus":st,"autoDiscovered":True,"discoveryText":desc,"discoveryMethod":"official-direct-watch"
    }
    if st=="programmato":rec["tags"].insert(0,"PROGRAMMATO · APERTURA FUTURA")
    return rec,st,None

def main():
    auto=load(AUTO);bandi=auto.get("bandi",[]) if isinstance(auto.get("bandi",[]),list) else []
    static=known_urls();current={str(b.get("sourceUrl") or "").rstrip("/") for b in bandi}
    checked=[];active=0;added=0
    for url in WATCH:
        rec,st,err=parse_record(url);checked.append({"url":url,"state":st,"error":err})
        if not rec:continue
        active+=1;key=rec["sourceUrl"].rstrip("/")
        if key not in static and key not in current:
            bandi.append(rec);current.add(key);added+=1
    auto["bandi"]=sorted(bandi,key=lambda x:(x.get("deadline") or "9999-12-31",x.get("title") or ""))
    by={}
    for b in bandi:
        for t in b.get("territories",[]):by[t]=by.get(t,0)+1
    auto["bandiByRegion"]=by
    auto["piemonteDirectWatch"]={"checkedAt":datetime.now().isoformat(timespec="seconds"),"checked":len(checked),"activeOrProgrammed":active,"added":added,"items":checked}
    stats=auto.get("sourceStats",[])
    for s in stats:
        if s.get("source")=="Regione Piemonte · Bandi":
            s["directChecked"]=len(checked);s["directActiveOrProgrammed"]=active;s["directAdded"]=added;s["found"]=max(int(s.get("found") or 0),active)
    auto["sourceStats"]=stats
    AUTO.write_text(json.dumps(auto,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"BANDOVERA Piemonte direct watch: controllati={len(checked)}, attivi_programmati={active}, nuovi={added}")

if __name__=="__main__":main()
