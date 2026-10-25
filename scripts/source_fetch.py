"""Read official public sources with bounded retries and fixed-source recovery."""
import re
import time
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup
from source_tls import source_tls_options

HEADERS = {"User-Agent": "BANDOVERA/1.6 (+monitoraggio fonti ufficiali pubbliche)"}
RECOVERED_PUBLIC_SOURCES = set()

def validate_source_html(html):
    """An HTTP 200 error/maintenance screen is not an official source read."""
    soup = BeautifulSoup(html, "html.parser")
    text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True)).lower()
    title = soup.title.get_text(" ", strip=True).lower() if soup.title else ""
    if ("pagina di cortesia" in text or
            ("momentaneamente indisponibile" in text and "manutenzione" in text) or
            (title.startswith("errore") and "si è verificato un errore imprevisto" in text)):
        raise ValueError("Fonte temporaneamente indisponibile: pagina di errore/manutenzione, non modifica del bando")

def fetch_source(url, method="GET", **kwargs):
    """Retry transient transport/server failures, preserving TLS verification."""
    host = urlparse(url).hostname
    if host in RECOVERED_PUBLIC_SOURCES:
        recovered = public_listing_fallback(url, method, kwargs)
        if recovered is not None:
            return recovered
    for attempt in range(3):
        try:
            send = requests.post if method == "POST" else requests.get
            response = send(url, headers=HEADERS, timeout=(10, 30),
                                    **source_tls_options(url), **kwargs)
            response.raise_for_status()
            content_type = response.headers.get("Content-Type", "")
            if isinstance(content_type, str) and "html" in content_type.lower():
                validate_source_html(response.text)
            return response
        except (requests.ConnectionError, requests.Timeout):
            if attempt == 2:
                relay = public_listing_fallback(url, method, kwargs)
                if relay is not None:
                    RECOVERED_PUBLIC_SOURCES.add(host)
                    return relay
                raise
        except requests.HTTPError as exc:
            if exc.response is None or exc.response.status_code not in {500, 502, 503, 504} or attempt == 2:
                raise
        time.sleep(attempt + 1)


def public_listing_fallback(url, method, kwargs):
    """Use our fixed public-source collector when the Actions runner cannot connect."""
    sources = {
        "https://portalebandi.regione.basilicata.it/": "basilicata",
        "https://www.regione.liguria.it/component/publiccompetitions/category/3-contributi.html": "liguria",
    }
    source = sources.get(url)
    params = {}
    parsed = urlparse(url)
    if not source and parsed.scheme == 'https' and not parsed.query and not parsed.fragment:
        if parsed.hostname == 'portalebandi.regione.basilicata.it' and re.fullmatch(r'/avvisi-e-bandi/[a-z0-9-]+/', parsed.path):
            source = 'basilicata'
        elif parsed.hostname == 'www.regione.liguria.it' and re.fullmatch(r'/component/publiccompetitions/publiccompetition/\d+:[a-z0-9-]+\.html', parsed.path):
            source = 'liguria'
        if source:
            params['detail'] = parsed.path
    if url == 'https://www.regione.liguria.it/components/com_publiccompetitions/includes/download.php?id=80856:dgr-399-2026.pdf':
        source = 'gaslini-regolamento'
    if not source:
        return None
    page = 1
    if method == "POST":
        data = kwargs.get("data", {})
        if source != "basilicata" or str(data.get("query[query_id]")) != "26" or str(data.get("widget_settings[lisitng_id]")) != "71":
            raise ValueError("Configurazione elenco pubblico Basilicata cambiata")
        page = int(data["page_settings[page]"])
    response = requests.get("https://radar-bandi-online.presidente-56d.workers.dev/api/official-listing",
                            params={"source": source, "page": page, **params}, headers=HEADERS, timeout=(10, 35))
    response.raise_for_status()
    if response.headers.get("X-Bandovera-Official-Source") != url:
        raise ValueError("Fonte ufficiale del recupero non confermata")
    return response

