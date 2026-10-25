"""Classify discovery work without pretending that rule triage verifies a grant."""
import re
from urllib.parse import urlparse


def observed_title(record):
    title = str(record.get('title') or '').strip()
    text = str(record.get('discoveryText') or '')
    host = urlparse(record.get('sourceUrl') or '').hostname or ''
    if host == 'bandi.regione.veneto.it':
        match = re.search(r'\bTitolo\s+(.+?)\s+Oggetto\b', text)
        if match:
            return match.group(1).strip()
    if host == 'portalebandi.regione.basilicata.it' and title.lower() == 'portale bandi':
        own = text.split('Avvisi e bandi correlati', 1)[0]
        own = own.split('Profilo Committente Altri Enti', 1)[-1]
        own = own.split('Tipo:', 1)[0].strip()
        if len(own) > 15 and not own.startswith('Vai al contenuto'):
            return own
    return title


def disposition(record):
    title = observed_title(record)
    t = title.lower()
    url = urlparse(record.get('sourceUrl') or '')
    if url.fragment and t in {'amministrazione trasparente', 'elenco bandi e avvisi', 'bandi di gara e contratti', 'bandi e avvisi - regione puglia'}:
        return 'not_a_call', 'Collegamento di navigazione della pagina, non un avviso autonomo.'
    if re.match(r'^(acquisto\b|acquisizione del software|affidamento\b|affido\b|fornitur[ae]\b|abbonamento\b|riparazione\b|sostituzione della serratura)', t):
        return 'not_a_grant', 'Acquisto, fornitura o affidamento di servizio: non è un contributo per progetti ETS.'
    if re.search(r'manifestazione di interesse per l.affidamento|elenco.*operatori economici.*affidare|^servizio di (?:accesso|riparazione)|^servizi di aggiornamento|^interventi di manutenzione di dispositivi|^corso di formazione (?:e aggiornamento )?in materia di (?:polizia stradale|autotrasporto)|^adesione al .servizio di base|^rinnovo novennale dell.accesso|^attivazione sistema informativo|stipula fideiussione assicurativa', t):
        return 'not_a_grant', 'Servizio, gara, elenco di fornitori o acquisto interno; non un contributo per progetti ETS.'
    if 'polizia locale' in t and re.search(r'corso|esercitazioni|adesione|rinnovo|servizi[oa]', t):
        return 'not_a_grant', 'Formazione o dotazione interna alla Polizia locale, non finanziamento di progetti ETS.'
    if re.search(r'^concorso\b|progressioni economiche|concessione mineraria|domande di saldo|approvazione dei risultati d.istruttoria', t):
        return 'not_a_new_grant', 'Concorso, concessione, graduatoria o saldo: non una nuova candidatura a contributo ETS.'
    if record.get('detailFetchOk') is False or (record.get('sourceStale') and record.get('detailFetchOk') is not True):
        return 'source_unavailable', 'Ultima lettura della fonte non riuscita; conservare i dati precedenti senza certificarli.'
    if record.get('tracking', {}).get('publicationReviewId'):
        return 'published', 'Revisione documentale pubblicata nel catalogo clienti.'
    return 'documentary_review', 'Verificare avviso e allegati: la sola pagina raccolta non prova destinatari e requisiti.'
