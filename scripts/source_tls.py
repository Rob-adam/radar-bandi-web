"""Complete a known missing intermediate without changing trusted root CAs.

The Abruzzo front end presents only its leaf certificate. The issuer below is
published by Sectigo and verified against certifi's roots in the pipeline tests.
Requests still checks the certificate chain, hostname and validity dates.
"""
import atexit
from functools import lru_cache
from pathlib import Path
import tempfile
from urllib.parse import urlparse

import requests

ISSUER = Path(__file__).parent / "certificates" / "sectigo-public-server-authentication-ca-dv-r36.pem"
ABRUZZO_HOSTS = frozenset({"www.regione.abruzzo.it", "www2.regione.abruzzo.it"})


@lru_cache(maxsize=1)
def _abruzzo_bundle():
    # Keep the maintained public roots; the extra PEM is an intermediate,
    # not a replacement root store or a copy of the site's leaf certificate.
    with tempfile.NamedTemporaryFile(prefix="bandovera-abruzzo-", suffix=".pem", delete=False) as bundle:
        bundle.write(Path(requests.certs.where()).read_bytes())
        bundle.write(b"\n")
        bundle.write(ISSUER.read_bytes())
        path = Path(bundle.name)
    atexit.register(path.unlink, missing_ok=True)
    return str(path)


def source_tls_options(url):
    target = urlparse(url)
    if target.scheme == "https" and target.hostname in ABRUZZO_HOSTS:
        return {"verify": _abruzzo_bundle()}
    return {}
