import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import enrich_bandi
import update_bandi
import check_verified_sources


class PipelineTests(unittest.TestCase):
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
