import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import enrich_bandi
import update_bandi
import check_verified_sources
import source_tls
import source_fetch


class PipelineTests(unittest.TestCase):
    def test_actions_connect_timeout_recovers_only_fixed_public_listings(self):
        url = 'https://www.regione.liguria.it/component/publiccompetitions/category/3-contributi.html'
        response = unittest.mock.Mock(headers={'X-Bandovera-Official-Source': url})
        response.raise_for_status.return_value = None
        with patch.object(source_fetch, 'RECOVERED_PUBLIC_SOURCES', set()), patch.object(update_bandi.requests, 'get', side_effect=[update_bandi.requests.ConnectTimeout()] * 3 + [response, response]) as fetch, patch.object(source_fetch.time, 'sleep'):
            self.assertIs(update_bandi.fetch_source(url), response)
            self.assertEqual(fetch.call_args.args[0], 'https://radar-bandi-online.presidente-56d.workers.dev/api/official-listing')
            self.assertEqual(fetch.call_args.kwargs['params'], {'source': 'liguria', 'page': 1})
            self.assertIs(update_bandi.fetch_source(url), response)
            self.assertEqual(fetch.call_count, 5)  # No further direct timeout once recovered.
        self.assertIsNone(update_bandi.public_listing_fallback('https://example.org/private', 'GET', {}))
        with self.assertRaises(ValueError):
            update_bandi.public_listing_fallback('https://portalebandi.regione.basilicata.it/', 'POST', {'data': {'query[query_id]': 'other'}})

    def test_detail_recovery_reaches_enrichment_without_accepting_arbitrary_paths(self):
        url = 'https://portalebandi.regione.basilicata.it/avvisi-e-bandi/progetto-sociale/'
        response = unittest.mock.Mock(headers={'X-Bandovera-Official-Source': url})
        response.raise_for_status.return_value = None
        with patch.object(source_fetch.requests, 'get', return_value=response) as fetch:
            self.assertIs(source_fetch.public_listing_fallback(url, 'GET', {}), response)
            self.assertEqual(fetch.call_args.kwargs['params']['detail'], '/avvisi-e-bandi/progetto-sociale/')
        self.assertIsNone(source_fetch.public_listing_fallback('https://portalebandi.regione.basilicata.it/wp-admin/', 'GET', {}))

    def test_transient_fetch_is_retried_but_forbidden_is_not(self):
        response = unittest.mock.Mock()
        response.raise_for_status.return_value = None
        with patch.object(update_bandi.requests, "get", side_effect=[update_bandi.requests.Timeout(), response]) as fetch, patch.object(source_fetch.time, "sleep"):
            self.assertIs(update_bandi.fetch_source("https://example.org"), response)
            self.assertEqual(fetch.call_count, 2)
        response.status_code = 403
        response.raise_for_status.side_effect = update_bandi.requests.HTTPError(response=response)
        with patch.object(update_bandi.requests, "get", return_value=response) as fetch:
            with self.assertRaises(update_bandi.requests.HTTPError):
                update_bandi.fetch_source("https://example.org")
            self.assertEqual(fetch.call_count, 1)

    def test_liguria_reads_beneficiaries_and_deadline_from_whole_own_card(self):
        html = '''<div class="pc_latest_item"><h3><a class="bando_link" href="/publiccompetition/a">Case rifugio</a></h3>
          <div>Avviso pubblico rivolto al terzo settore</div><div class="pc_latest_item_chiusura">26 Ottobre 2099</div></div>
          <div class="pc_latest_item"><h3><a class="bando_link" href="/publiccompetition/b">Bando per privati</a></h3><div>solo privati</div></div>'''
        records = update_bandi.regional_card_items(html, "https://www.regione.liguria.it/", "Liguria", "liguria")
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["deadline"], "2099-10-26")
        self.assertEqual(records[0]["legalForms"], [])

    def test_basilicata_migrated_cards_and_structural_failure(self):
        html = '''<div class="jet-listing-grid__item"><span class="elementor-heading-title">Contributi per servizi sociali</span>
          <div>Data di scadenza: 27/10/2099 23:59</div><a href="/avvisi-e-bandi/sociali/">Maggiori dettagli</a></div>'''
        record = update_bandi.regional_card_items(html, "https://portalebandi.regione.basilicata.it/", "Basilicata", "basilicata")[0]
        self.assertEqual(record["title"], "Contributi per servizi sociali")
        self.assertEqual(record["deadline"], "2099-10-27")
        with self.assertRaises(ValueError):
            update_bandi.regional_card_items('<meta http-equiv="refresh" content="0;URL=/index.jsp">', "https://example.org", "Basilicata", "basilicata")

    def test_basilicata_follows_public_scroll_and_rejects_repeated_pages(self):
        nav = json.dumps({"query": {"query_id": 26}, "widget_settings": {"_element_id": "in-scadenza", "lisitng_id": 71}})
        card = lambda ident: f'<div class="jet-listing-grid__item"><span class="elementor-heading-title">Progetto {ident}</span>Data di scadenza: 31/12/2099<a href="/avvisi-e-bandi/{ident}/">Maggiori dettagli</a></div>'
        html = f"<div data-nav='{nav}' data-pages='2' data-queried-id='77|WP_Post'>{card(1)}</div>"
        response = unittest.mock.Mock(json=lambda: {"success": True, "data": {"html": card(2)}})
        with patch.object(update_bandi, "fetch_source", return_value=response) as fetch:
            records = update_bandi.basilicata_items(html, "https://portalebandi.regione.basilicata.it/", "Basilicata")
        self.assertEqual(len(records), 2)
        self.assertEqual(fetch.call_args.kwargs["data"]["handler"], "listing_load_more")
        repeated = unittest.mock.Mock(json=lambda: {"success": True, "data": {"html": card(1)}})
        with patch.object(update_bandi, "fetch_source", return_value=repeated):
            with self.assertRaises(ValueError):
                update_bandi.basilicata_items(html, "https://portalebandi.regione.basilicata.it/", "Basilicata")

    def test_veneto_consumes_every_json_page_including_unlabelled_applicants(self):
        def response(title, ident):
            return unittest.mock.Mock(json=lambda: {"recordsFiltered": 2, "aaData": [[f'<div class="partialId"><a href="Dettaglio?idAtto={ident}">{title}</a></div><span class="DtScadenza">31/12/2099</span>']]})
        with patch.object(update_bandi, "fetch_source", side_effect=[response("Progetti sanitari", 1), response("Sostegno alle associazioni", 2)]) as fetch:
            records = update_bandi.veneto_items("https://bandi.regione.veneto.it/Public/Elenco?Tipo=1", "Veneto")
        self.assertEqual(len(records), 2)
        self.assertEqual(fetch.call_args_list[1].kwargs["params"]["iDisplayStart"], 1)
        self.assertEqual(records[0]["deadline"], "2099-12-31")
        with patch.object(update_bandi, "fetch_source", return_value=unittest.mock.Mock(json=lambda: {"recordsFiltered": 2, "aaData": []})):
            with self.assertRaises(ValueError):
                update_bandi.veneto_items("https://bandi.regione.veneto.it/Public/Elenco?Tipo=1", "Veneto")

    def test_abruzzo_missing_intermediate_chains_to_existing_public_root(self):
        subprocess.run(["openssl", "verify", "-CAfile", source_tls.requests.certs.where(), str(source_tls.ISSUER)], check=True, capture_output=True)
        observed = subprocess.check_output(["openssl", "x509", "-in", str(source_tls.ISSUER), "-noout", "-fingerprint", "-sha256"], text=True)
        self.assertIn("8C:54:C3:34:B6:6B:A4:E4:26:77:2A:F4:A3:F9:13:6C:19:A1:AE:C7:29:FD:B2:8C:53:5C:07:A5:A4:EF:22:E0", observed)

    def test_abruzzo_bundle_is_scoped_and_preserves_public_roots(self):
        for url in ["https://example.org/", "http://www.regione.abruzzo.it/", "https://www.regione.abruzzo.it.evil.example/", "https://coesione.regione.abruzzo.it/"]:
            self.assertEqual(source_tls.source_tls_options(url), {})
        for host in source_tls.ABRUZZO_HOSTS:
            options = source_tls.source_tls_options("https://" + host + "/contenuti/bandi")
            self.assertIsInstance(options["verify"], str)
            bundle = Path(options["verify"]).read_bytes()
            self.assertEqual(bundle, Path(source_tls.requests.certs.where()).read_bytes() + b"\n" + source_tls.ISSUER.read_bytes())

    def test_phase_one_is_entry_deadline_even_after_phase_two(self):
        text = "Scadenza fase 2: 08/04/2027. Scadenza fase 1: 29/10/2026"
        for parser in [enrich_bandi.parse_date, update_bandi.parse_date]:
            self.assertEqual(parser(text), "2026-10-29")
            self.assertIsNone(parser("Scadenza fase 2: 08/04/2027"))
            self.assertEqual(parser("Prima fase: scadenza 29 ottobre 2026"), "2026-10-29")

    def test_unambiguous_dates_and_invalid_dates(self):
        self.assertEqual(enrich_bandi.parse_date("Scadenza: 18 febbraio 2027"), "2027-02-18")
        self.assertIsNone(enrich_bandi.parse_date("Scadenza 31/02/2027"))
        self.assertIsNone(enrich_bandi.parse_date("Pubblicato il 20/10/2026"))

    def test_retain_failed_sources_only_without_refreshing_proof(self):
        old = {"id": "a", "source": "Failed", "sourceUrl": "https://example.org/a", "sourceCheckedAt": "old", "detailFetchedAt": "old"}
        removed = {**old, "id": "b", "source": "Successful", "sourceUrl": "https://example.org/b"}
        disabled = {**old, "id": "c", "source": "Not configured", "sourceUrl": "https://example.org/c"}
        records = update_bandi.retain_failed_source_records([], {"bandi": [old, removed, disabled]}, [{"source": "Failed", "ok": False}, {"source": "Successful", "ok": True}], "now")
        self.assertEqual(len(records), 1)
        self.assertTrue(records[0]["sourceStale"])
        self.assertEqual(records[0]["sourceCheckedAt"], "old")
        self.assertEqual(records[0]["detailFetchedAt"], "old")
        self.assertNotIn("sourceStale", old)
        self.assertEqual(len(update_bandi.retain_failed_source_records([old], {"bandi": [old]}, [{"source": "Failed", "ok": False}], "now")), 1)

    def test_failed_detail_fetch_does_not_advance_success_timestamp(self):
        with tempfile.TemporaryDirectory() as directory:
            catalog = Path(directory) / "catalog.json"
            queue = Path(directory) / "queue.json"
            report = Path(directory) / "report.json"
            record = {"id": "a", "sourceUrl": "https://example.org/a", "detailFetchedAt": "old"}
            catalog.write_text(json.dumps({"bandi": [record]}))
            queue.write_text(json.dumps({"items": [{"key": "url:https://example.org/a"}]}))
            with patch.multiple(enrich_bandi, CATALOG=catalog, AI_QUEUE=queue, REPORT=report), patch.object(enrich_bandi.requests, "get", side_effect=RuntimeError("timeout")):
                enrich_bandi.main()
            observed = json.loads(catalog.read_text())["bandi"][0]
            self.assertEqual(observed["detailFetchedAt"], "old")
            self.assertFalse(observed["detailFetchOk"])
            self.assertIn("detailFetchAttemptedAt", observed)

    def test_discovery_does_not_certify_legal_form(self):
        record = update_bandi.make_record("a", "Bando per associazioni", "source", "https://example.org/a", "APS ETS associazioni", "veneto")
        self.assertEqual(record["legalForms"], [])
        self.assertNotIn("verifiedAt", record)

    def test_source_monitor_baseline_change_failure_and_recovery(self):
        def response(text):
            class Response:
                headers = {"Content-Type": "text/html"}
                content = text.encode()
                def raise_for_status(self):
                    pass
            result = Response()
            result.text = text
            return result
        original = "<main>" + "Requisiti e scadenza ufficiali. " * 5 + "</main>"
        fetch = lambda *a, **k: response(original)
        baseline = check_verified_sources.observe("https://example.org", "checked", {}, "first", fetch)
        self.assertEqual(baseline["status"], "baseline")
        changed = check_verified_sources.observe("https://example.org", "checked", baseline, "second", lambda *a, **k: response(original.replace("</main>","Proroga</main>")))
        self.assertTrue(changed["needsReview"])
        self.assertEqual(changed["baselineHash"], baseline["baselineHash"])
        def failure(*a, **k):
            raise RuntimeError("timeout")
        failed = check_verified_sources.observe("https://example.org", "checked", changed, "third", failure)
        self.assertTrue(failed["needsReview"])
        self.assertEqual(failed["lastFetchSucceededAt"], "second")
        restored = check_verified_sources.observe("https://example.org", "checked", failed, "fourth", fetch)
        self.assertEqual(restored["status"], "unchanged")
        self.assertNotIn("verifiedAt", restored)


if __name__ == "__main__":
    unittest.main()
