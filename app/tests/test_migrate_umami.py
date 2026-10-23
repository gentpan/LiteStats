"""Offline migration invariants; no services or credentials are used."""

from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("migrate_umami", Path(__file__).parents[1] / "scripts" / "migrate_umami.py")
migration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migration)


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.paths = [self.root / name for name in ("snapshot.json", "mapping.json", "events.jsonl", "manifest.json")]
        self.snapshot = {
            "websites": [{"website_id": "site-a", "domain": "example.com"}, {"website_id": "site-b", "domain": "empty.example"}],
            "sessions": [{"session_id": "user-1", "website_id": "site-a", "distinct_id": "do-not-replace-user-id",
                          "browser": "chrome", "os": "Mac OS", "device": "desktop", "country": "cn",
                          "region": "CN-SH", "city": "Shanghai", "screen": "1920x1080", "language": "zh-CN"}],
            "events": [
                {"event_id": "event-1", "website_id": "site-a", "session_id": "user-1", "visit_id": "visit-1",
                 "event_type": 1, "event_name": None, "created_at": "2026-10-22T15:59:59.999Z", "url_path": "/",
                 "hostname": "example.com", "url_query": "fbclid=abc", "fbclid": "abc",
                 "referrer_domain": "www.google.com", "referrer_path": "/search", "referrer_query": "q=test"},
                {"event_id": "event-2", "website_id": "site-a", "session_id": "missing-user", "visit_id": "visit-2",
                 "event_type": 2, "event_name": "Subscribe", "created_at": "2026-10-22T16:00:00.123456+00:00",
                 "url_path": "/thanks", "utm_source": "newsletter"},
            ],
            "event_data": [{"event_data_id": "property-1", "website_id": "site-a", "website_event_id": "event-2",
                            "data_key": "text", "string_value": "Hello 世界", "number_value": None, "date_value": None,
                            "data_type": 1}],
        }
        self.mapping = {"site-a": 10, "site-b": 11}

    def write_input(self):
        self.paths[0].write_text(json.dumps(self.snapshot), encoding="utf-8")
        self.paths[1].write_text(json.dumps(self.mapping), encoding="utf-8")

    def convert(self):
        self.write_input()
        manifest = migration.migrate(*self.paths)
        records = [json.loads(line) for line in self.paths[2].read_text().splitlines()]
        return records, manifest

    def assert_rejected(self):
        self.write_input()
        with self.assertRaises(migration.MigrationError):
            migration.migrate(*self.paths)
        self.assertFalse(self.paths[2].exists())
        self.assertFalse(self.paths[3].exists())

    def test_preserves_identity_milliseconds_properties_and_missing_sessions(self):
        records, manifest = self.convert()
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["user_id"], "user-1")
        self.assertEqual(records[0]["session_id"], "visit-1")
        self.assertEqual(records[1]["user_id"], "missing-user")
        self.assertEqual(records[1]["session_id"], "visit-2")
        self.assertEqual(records[1]["browser"], "")
        self.assertEqual(records[0]["timestamp"], 1792684799)
        self.assertEqual(records[1]["timestamp"], 1792684800)
        meta = dict(zip(records[1]["meta.key"], records[1]["meta.value"]))
        self.assertEqual(meta["text"], "Hello 世界")
        self.assertEqual(meta["umami.created_at"], "2026-10-22T16:00:00.123456+00:00")
        self.assertEqual(meta["umami.event_type"], "2")
        self.assertEqual(json.loads(meta["umami.session_json"]), None)
        first_meta = dict(zip(records[0]["meta.key"], records[0]["meta.value"]))
        self.assertEqual(first_meta["umami.event.fbclid"], "abc")
        self.assertEqual(first_meta["umami.referrer_query"], "q=test")
        self.assertEqual(records[0]["referrer"], "https://www.google.com/search?q=test")
        self.assertEqual(records[0]["referrer_source"], "google.com")
        self.assertEqual(records[1]["referrer_source"], "newsletter")
        self.assertEqual(manifest["totals"]["missing_session_events"], 1)
        self.assertEqual(manifest["totals"]["subsecond_truncated_events"], 2)
        self.assertEqual(manifest["totals"]["event_properties"], 1)
        self.assertEqual(manifest["output_sha256"], hashlib.sha256(self.paths[2].read_bytes()).hexdigest())
        self.assertEqual(manifest["output_bytes"], self.paths[2].stat().st_size)
        self.assertEqual(json.loads(self.paths[3].read_text()), manifest)
        self.assertEqual(self.paths[2].stat().st_mode & 0o777, 0o600)

    def test_beijing_days_and_zero_event_site(self):
        _, manifest = self.convert()
        site = manifest["sites"][0]
        self.assertEqual(site["events"], 2)
        self.assertEqual(site["unique_users"], 2)
        self.assertEqual(site["unique_visits"], 2)
        self.assertEqual(site["days"]["2026-10-22"]["pageviews"], 1)
        self.assertEqual(site["days"]["2026-10-23"]["custom_events"], 1)
        self.assertEqual(manifest["sites"][1]["events"], 0)
        self.assertIsNone(manifest["sites"][1]["min_timestamp_utc"])

    def test_rejects_duplicate_event_id(self):
        self.snapshot["events"].append(deepcopy(self.snapshot["events"][0]))
        self.assert_rejected()

    def test_rejects_unknown_event_website(self):
        self.snapshot["events"][0]["website_id"] = "unknown"
        self.assert_rejected()

    def test_rejects_incomplete_or_extra_mapping(self):
        for mapping in ({"site-a": 10}, {"site-a": 10, "site-b": 11, "unknown": 12}):
            with self.subTest(mapping=mapping):
                self.mapping = mapping
                self.assert_rejected()

    def test_rejects_bool_or_duplicate_target_id(self):
        for target in (True, 10, 0, -1, 2**64):
            with self.subTest(target=target):
                self.mapping["site-b"] = target
                self.assert_rejected()

    def test_rejects_unknown_event_types(self):
        for event_type in (0, 3, True, "1"):
            with self.subTest(event_type=event_type):
                self.snapshot["events"][0]["event_type"] = event_type
                self.assert_rejected()

    def test_rejects_reserved_or_empty_custom_names(self):
        for name in ("pageview", " PAGEVIEW ", "", None):
            with self.subTest(name=name):
                self.snapshot["events"][1]["event_name"] = name
                self.assert_rejected()

    def test_rejects_bad_timestamps_and_target_overflow(self):
        for value in (None, "bad", "2026-10-23T00:00:00", "2026-10-23T00:00:00+08:00",
                      "2026-02-31T00:00:00Z", "1969-12-31T23:59:59.999Z", "2200-01-01T00:00:00Z",
                      "2026-10-23T00:00:00.1234567Z"):
            with self.subTest(value=value):
                self.snapshot["events"][0]["created_at"] = value
                self.assert_rejected()

    def test_postgres_fractional_precision_one_through_six_digits(self):
        for digits in ("1", "18", "123", "1234", "12345", "123456"):
            for suffix in ("Z", "+00:00"):
                with self.subTest(digits=digits, suffix=suffix):
                    original = "2026-03-01T02:09:13." + digits + suffix
                    event = {**self.snapshot["events"][0], "created_at": original}
                    record, parsed = migration.convert_event(event, self.snapshot["websites"][0],
                                                             self.snapshot["sessions"][0], [], 10)
                    self.assertEqual(parsed.microsecond, int(digits.ljust(6, "0")))
                    self.assertEqual(record["timestamp"], 1772330953)
                    meta = dict(zip(record["meta.key"], record["meta.value"]))
                    self.assertEqual(meta["umami.created_at"], original)
                    self.assertEqual(json.loads(meta["umami.event_json"])["created_at"], original)

    def test_rejects_missing_identity_and_cross_site_session(self):
        for field in ("session_id", "visit_id"):
            value = self.snapshot["events"][0].pop(field)
            self.assert_rejected()
            self.snapshot["events"][0][field] = value
        self.snapshot["sessions"][0]["website_id"] = "site-b"
        self.assert_rejected()

    def test_rejects_orphan_properties_and_reserved_namespace(self):
        self.snapshot["event_data"][0]["website_event_id"] = "unknown"
        self.assert_rejected()
        self.snapshot["event_data"][0]["website_event_id"] = "event-2"
        self.snapshot["event_data"][0]["data_key"] = "umami.event_id"
        self.assert_rejected()

    def test_rejects_ambiguous_or_empty_property_values(self):
        self.snapshot["event_data"][0]["number_value"] = 123
        self.assert_rejected()
        self.snapshot["event_data"][0]["number_value"] = None
        self.snapshot["event_data"][0]["string_value"] = None
        self.assert_rejected()

    def test_exact_decimal_and_duplicate_property_keys_are_preserved(self):
        self.snapshot["event_data"].append({**self.snapshot["event_data"][0], "event_data_id": "property-2",
                                            "string_value": None, "number_value": 1, "data_type": 2})
        self.write_input()
        raw = self.paths[0].read_text().replace('"number_value": 1,', '"number_value": 123456789.01234567890123456789,')
        self.paths[0].write_text(raw)
        manifest = migration.migrate(*self.paths)
        records = [json.loads(line) for line in self.paths[2].read_text().splitlines()]
        values = [value for key, value in zip(records[1]["meta.key"], records[1]["meta.value"]) if key == "text"]
        self.assertEqual(values, ["Hello 世界", "123456789.01234567890123456789"])
        self.assertEqual(manifest["totals"]["event_properties"], 2)

    def test_exclusive_output_and_manifest_do_not_overwrite(self):
        self.write_input()
        for existing in (self.paths[2], self.paths[3]):
            with self.subTest(existing=existing.name):
                existing.write_text("existing sentinel")
                with self.assertRaises(FileExistsError):
                    migration.migrate(*self.paths)
                self.assertEqual(existing.read_text(), "existing sentinel")
                other = self.paths[3] if existing == self.paths[2] else self.paths[2]
                self.assertFalse(other.exists())
                existing.unlink()

    def test_late_bad_row_cleans_partial_output_and_manifest(self):
        # Type validation occurs while transforming the second event, after the
        # first has been written. A bad row must never be silently discarded.
        self.snapshot["events"][1]["hostname"] = 123
        self.assert_rejected()

    def test_rejects_duplicate_json_keys_and_nonfinite_numbers(self):
        self.write_input()
        for raw in ('{"site-a":10,"site-a":11,"site-b":12}', '{"site-a":NaN,"site-b":12}'):
            with self.subTest(raw=raw):
                self.paths[1].write_text(raw)
                with self.assertRaises(migration.MigrationError):
                    migration.migrate(*self.paths)
                self.assertFalse(self.paths[2].exists())

    def test_rejects_input_output_alias(self):
        self.write_input()
        with self.assertRaises(migration.MigrationError):
            migration.migrate(self.paths[0], self.paths[1], self.paths[0], self.paths[3])
        self.assertEqual(json.loads(self.paths[0].read_text()), self.snapshot)

    def test_timezone_only_changes_manifest_dates(self):
        self.write_input()
        utc = migration.migrate(*self.paths, timezone_name="UTC")
        self.assertEqual(list(utc["sites"][0]["days"]), ["2026-10-22"])
        self.assertEqual(utc["sites"][0]["days"]["2026-10-22"]["events"], 2)


if __name__ == "__main__":
    unittest.main()
