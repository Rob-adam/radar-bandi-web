"""Observe curated official sources without certifying or rewriting grant facts."""
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup
from source_fetch import fetch_source

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
REPORT = PUBLIC / "radar_bandi_source_checks.json"
HEADERS = {"User-Agent": "BANDOVERA/1.5 (+monitoraggio fonti ufficiali)"}


def load_json(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def evidence_records(catalog):
    for record in catalog.get("bandi", []):
        evidence = (record.get("tracking") or {}).get("verificationEvidence") or []
        if isinstance(evidence, dict):
            evidence = [evidence]
        for item in evidence:
            if isinstance(item, dict) and str(item.get("url", "")).startswith("https://"):
                yield record, item


def response_hash(response):
    content_type = response.headers.get("Content-Type", "").lower()
    if "application/pdf" in content_type or response.content.startswith(b"%PDF"):
        return hashlib.sha256(response.content).hexdigest()
    soup = BeautifulSoup(response.text, "html.parser")
    for node in soup(["script", "style", "noscript", "svg"]):
        node.decompose()
    main = soup.find("main") or soup.find("article") or soup.body or soup
    text = re.sub(r"\s+", " ", main.get_text(" ", strip=True)).strip()
    if len(text) < 80:
        raise ValueError("testo fonte insufficiente")
    if any(token in text.lower() for token in ["verify you are human", "checking your browser", "enable javascript and cookies to continue"]):
        raise ValueError("pagina di controllo accesso anziché fonte")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def observe(url, checked_at, previous, stamp, fetch=None):
    result = {"url": url, "evidenceCheckedAt": checked_at, "attemptedAt": stamp}
    baseline = previous.get("baselineHash")
    if previous.get("evidenceCheckedAt") != checked_at:
        baseline = None  # A new documented human verification starts a new baseline.
    if baseline:
        result["baselineHash"] = baseline
    if previous.get("lastFetchSucceededAt"):
        result["lastFetchSucceededAt"] = previous["lastFetchSucceededAt"]
    try:
        response = fetch(url, headers=HEADERS, timeout=25) if fetch else fetch_source(url)
        response.raise_for_status()
        fingerprint = response_hash(response)
        changed = bool(baseline and fingerprint != baseline)
        result.update(ok=True, status="changed" if changed else ("unchanged" if baseline else "baseline"),
                      observedHash=fingerprint, baselineHash=baseline or fingerprint,
                      lastFetchSucceededAt=stamp, needsReview=changed)
    except Exception as exc:
        result.update(ok=False, status="unavailable", needsReview=True, error=str(exc)[:300])
    return result


def main():
    previous = load_json(REPORT, {}).get("checks", {})
    checks = {}
    stamp = datetime.now(ZoneInfo("Europe/Rome")).isoformat(timespec="seconds")
    for filename in ["radar_bandi_catalogo.json", "radar_bandi_catalogo_extra.json", "radar_bandi_verified_watchlist.json"]:
        for record, evidence in evidence_records(load_json(PUBLIC / filename, {})):
            key = str(record.get("id", "")) + "|" + evidence["url"]
            result = observe(evidence["url"], evidence.get("checkedAt"), previous.get(key, {}), stamp)
            result["bandoId"] = record.get("id")
            checks[key] = result
    payload = {"schemaVersion": 1, "attemptedAt": stamp,
               "note": "Controllo disponibilità e variazioni della fonte; non certifica requisiti o ammissibilità.",
               "summary": {"observed": len(checks), "needsReview": sum(x["needsReview"] for x in checks.values()),
                           "failed": sum(not x["ok"] for x in checks.values())}, "checks": checks}
    REPORT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload["summary"]))


if __name__ == "__main__":
    main()
