"""Publish documented editorial decisions; discovery alone never certifies a call."""
import copy
from collections import Counter
from discovery_review import disposition, observed_title
import json
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
REVIEWS = ROOT / 'data/radar_bandi_reviews.json'
CATALOG = ROOT / 'public/radar_bandi_catalogo_extra.json'
AUTO = ROOT / 'public/radar_bandi_auto.json'
QUEUE = ROOT / 'data/radar_bandi_ai_queue.json'
REPORT = ROOT / 'public/radar_bandi_publication.json'
REQUIRED_FIELDS = {'deadline', 'legalForms', 'territories', 'hardRequirements', 'aid', 'foundationYear', 'annualRevenue'}


def load(path):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def approved_record(decision):
    if decision.get('decision') not in {'approved', 'pending', 'rejected', 'withdrawn'}:
        raise ValueError('Decisione di revisione non valida')
    if decision.get('decision') != 'approved':
        return None
    b = copy.deepcopy(decision['record'])
    reviewed = date.fromisoformat(decision['reviewedAt'])
    if reviewed > datetime.now(ZoneInfo('Europe/Rome')).date():
        raise ValueError('Revisione futura non valida')
    if not REQUIRED_FIELDS.issubset(set(decision.get('reviewedFields', []))):
        raise ValueError('Revisione incompleta: requisiti, territorio, scadenza e importi obbligatori')
    if not all(b.get(k) for k in ['id', 'title', 'source', 'sourceUrl', 'legalForms', 'territories', 'hardRequirements', 'aid']):
        raise ValueError('Scheda incompleta')
    evidence = decision.get('evidence', [])
    if not any(e.get('url') == b['sourceUrl'] for e in evidence):
        raise ValueError('Manca la prova della fonte principale')
    for e in evidence:
        if not str(e.get('url', '')).startswith('https://') or e.get('checkedAt') != decision['reviewedAt'] or not e.get('note'):
            raise ValueError('Prova ufficiale non documentata')
    if b.get('deadline'):
        date.fromisoformat(b['deadline'])
    elif b.get('tracking', {}).get('continuousDeadlineConfirmed') is not True:
        raise ValueError('Scadenza non verificata')
    if not b.get('applicantChecks') or any(c.get('status') != 'unknown' for c in b['applicantChecks']):
        raise ValueError('La revisione del bando non certifica i requisiti del cliente')
    b['eligibilityStatus'] = 'da_verificare'
    b['tracking'] = {**b.get('tracking', {}), 'needsAnalysis': False,
        'specificLegalFormConfirmed': True, 'officialSourceVerified': True,
        'deadlineVerified': True, 'eligibilityVerified': True,
        'verifiedAt': decision['reviewedAt'], 'verificationNote': decision['note'],
        'verificationEvidence': evidence, 'publicationReviewId': decision['id']}
    return b


def publish(catalog, decisions, queue, automatic):
    records = [approved_record(d) for d in decisions]
    records = [b for b in records if b is not None]
    ids = [b['id'] for b in records]
    urls = [b['sourceUrl'].rstrip('/') for b in records]
    if len(set(ids)) != len(ids) or len(set(urls)) != len(urls):
        raise ValueError('Revisioni duplicate')
    # Idempotent upsert: a reviewed discovery must not be republished as a duplicate.
    output = copy.deepcopy(catalog)
    managed_ids = {d['record']['id'] for d in decisions if d.get('record', {}).get('id')}
    existing = [b for b in output.get('bandi', []) if b.get('id') not in managed_ids and str(b.get('sourceUrl', '')).rstrip('/') not in urls]
    output['bandi'] = existing + records
    changed = output['bandi'] != catalog.get('bandi', [])
    if changed:
        now = datetime.now(ZoneInfo('Europe/Rome'))
        output.update(updatedAt=now.strftime('%d/%m/%Y %H:%M'), publishedAt=now.isoformat(timespec='seconds'))
    pending = copy.deepcopy(queue)
    pending['items'] = [q for q in pending.get('items', []) if q.get('id') not in ids and str(q.get('sourceUrl', '')).rstrip('/') not in urls]
    pending['count'] = len(pending['items'])
    report = {'schemaVersion': 1, 'reviewedPublished': len(records), 'publishedIds': ids,
        'discovered': len(automatic.get('bandi', [])), 'pendingReview': pending['count'],
        'note': 'La coda contiene anche segnalazioni da classificare, non solo bandi ammissibili. Nessuna AI è stata eseguita da questo passaggio.'}
    return output, pending, report


def main():
    catalog, queue, report = publish(load(CATALOG), load(REVIEWS).get('reviews', []), load(QUEUE), load(AUTO))
    write(CATALOG, catalog)
    write(QUEUE, queue)
    write(REPORT, report)
    published_urls = {b['sourceUrl'].rstrip('/') for b in catalog.get('bandi', []) if b.get('tracking', {}).get('publicationReviewId')}
    items = []
    for b in load(AUTO).get('bandi', []):
        status, reason = disposition(b)
        if b.get('sourceUrl', '').rstrip('/') in published_urls:
            status, reason = 'published', 'Revisione documentale pubblicata; requisiti del cliente ancora da verificare.'
        items.append({'id': b.get('id'), 'title': observed_title(b), 'sourceUrl': b.get('sourceUrl'),
                      'status': status, 'reason': reason, 'detailFetchOk': b.get('detailFetchOk'),
                      'detailFetchAttemptedAt': b.get('detailFetchAttemptedAt'),
                      'detailFetchedAt': b.get('detailFetchedAt')})
    write(ROOT / 'public/radar_bandi_discovery_audit.json', {
        'schemaVersion': 1, 'total': len(items), 'counts': dict(Counter(x['status'] for x in items)),
        'note': 'Esiti di raccolta e triage, distinti dalla verifica documentale e dalla ammissibilità del cliente. Una lettura fallita non aggiorna la data dell’ultima lettura riuscita.',
        'items': items})
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
