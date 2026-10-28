#!/usr/bin/env python3
"""Validate an offline Umami snapshot and convert it to ClickHouse JSONEachRow.

This program never connects to a server or inserts into any database. Export the
four source tables in one consistent transaction before invoking it. Keep the
snapshot, mapping, output and manifest private; they may contain visitor data.
The manifest describes the snapshot, not any later live Umami traffic.

Usage:
  python3 scripts/migrate_umami.py --snapshot snapshot.json --mapping mapping.json \
    --output events.jsonl --manifest manifest.json --timezone Asia/Shanghai

Snapshot: {"websites": [...], "events": [...], "sessions": [...], "event_data": [...]}
Mapping: {"source-website-uuid": positive_target_site_integer}
"""

import argparse
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class MigrationError(ValueError):
    """The snapshot cannot be represented without ambiguity or data loss."""


EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
DATE_TIME_MAX = 2**32 - 1  # Target events_v2.timestamp is ClickHouse DateTime.
ISO_UTC = re.compile(r"^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$")
VALUE_FIELDS = ("string_value", "number_value", "date_value", "boolean_value")


def fail(message):
    raise MigrationError(message)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            fail("Duplicate JSON object key; snapshot or mapping is ambiguous")
        result[key] = value
    return result


def load_json(path):
    raw = Path(path).read_bytes()
    try:
        value = json.loads(raw, parse_float=Decimal, object_pairs_hook=unique_object,
                           parse_constant=lambda _: fail("Non-finite JSON number"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise MigrationError("Invalid JSON input") from exc
    return value, hashlib.sha256(raw).hexdigest()


def json_text(value):
    # Decimal is rendered as an exact string in metadata. This avoids rounding
    # PostgreSQL numeric event properties through a binary floating point value.
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"),
                      allow_nan=False, default=lambda v: str(v) if isinstance(v, Decimal) else fail("Unsupported JSON value"))


def text_field(row, key, context, required=False):
    value = row.get(key)
    if value is None and not required:
        return ""
    if not isinstance(value, str) or (required and not value.strip()):
        fail(f"{context}: {key} must be a {'nonempty ' if required else ''}string")
    return value


def parse_time(value, context):
    if not isinstance(value, str) or not ISO_UTC.fullmatch(value):
        fail(f"{context}: created_at must be an ISO UTC timestamp, with at most six fractional digits")
    try:
        # PostgreSQL omits trailing fractional zeros, whereas older Python
        # versions only accept 3 or 6 fractional digits. Pad a parsing copy;
        # source metadata must retain the exact original timestamp string.
        parsing_value = re.sub(r"\.(\d{1,6})(?=\+00:00$)",
                               lambda match: "." + match.group(1).ljust(6, "0"),
                               value.replace("Z", "+00:00"))
        result = datetime.fromisoformat(parsing_value)
    except ValueError as exc:
        raise MigrationError(f"{context}: invalid created_at") from exc
    delta = result - EPOCH
    seconds = delta.days * 86400 + delta.seconds  # Exact floor, independent of host timezone.
    if not 0 <= seconds <= DATE_TIME_MAX:
        fail(f"{context}: created_at is outside target ClickHouse DateTime range")
    return result, seconds


def utc_string(value):
    return value.isoformat().replace("+00:00", "Z") if value else None


def normalize_browser(raw):
    value = raw.lower().strip()
    known = {"chrome": "Chrome", "crios": "Chrome", "firefox": "Firefox", "safari": "Safari",
             "ios": "Safari", "ios-webview": "Safari", "edge": "Edge", "chromium": "Chromium",
             "opera": "Opera", "samsung": "Samsung Browser", "miui": "MIUI Browser",
             "yandex": "Yandex Browser"}
    return known.get(value, raw)


def normalize_os(raw):
    # The live tracker retains OS versions in the display name when known.
    return {"Mac OS": "macOS", "Mac": "macOS", "Android OS": "Android"}.get(raw, raw)


def normalize_device(raw):
    return {"mobile": "Mobile", "laptop": "Laptop", "desktop": "Desktop", "tablet": "Tablet"}.get(raw.lower(), raw)


def prepare(snapshot, mapping):
    if not isinstance(snapshot, dict) or not isinstance(mapping, dict):
        fail("Snapshot and mapping must be JSON objects")
    for name in ("websites", "events", "sessions", "event_data"):
        if not isinstance(snapshot.get(name), list):
            fail(f"Snapshot requires a {name} array")
        if any(not isinstance(row, dict) for row in snapshot[name]):
            fail(f"{name}: every row must be an object")

    websites = {}
    for index, row in enumerate(snapshot["websites"]):
        identifier = text_field(row, "website_id", f"websites[{index}]", True)
        if identifier in websites:
            fail("Duplicate website_id")
        text_field(row, "domain", f"websites[{index}]")
        websites[identifier] = row
    if not websites or set(websites) != set(mapping):
        fail("Mapping must cover exactly the snapshot's websites; unknown or unmapped website")
    if any(type(value) is not int or not 0 < value < 2**64 for value in mapping.values()):
        fail("Every target site ID must be a positive UInt64 integer")
    if len(set(mapping.values())) != len(mapping):
        fail("Different source websites must not map to the same target site")

    sessions = {}
    for index, row in enumerate(snapshot["sessions"]):
        context = f"sessions[{index}]"
        identifier = text_field(row, "session_id", context, True)
        if identifier in sessions:
            fail("Duplicate session_id")
        if row.get("website_id") not in websites:
            fail(f"{context}: unknown website_id")
        sessions[identifier] = row

    events = {}
    for index, row in enumerate(snapshot["events"]):
        context = f"events[{index}]"
        identifier = text_field(row, "event_id", context, True)
        if identifier in events:
            fail("Duplicate event_id; refusing an ambiguous or repeated import source")
        if row.get("website_id") not in websites:
            fail(f"{context}: unknown website_id")
        if type(row.get("event_type")) is not int or row["event_type"] not in (1, 2):
            fail(f"{context}: unsupported event_type (only 1 and 2 are allowed)")
        event_name = text_field(row, "event_name", context)
        if row["event_type"] == 2 and (not event_name.strip() or event_name.casefold().strip() == "pageview"):
            fail(f"{context}: empty custom name or reserved pageview name")
        for key in ("session_id", "visit_id"):
            text_field(row, key, context, True)
        parse_time(row.get("created_at"), context)
        session = sessions.get(row["session_id"])
        if session and session["website_id"] != row["website_id"]:
            fail(f"{context}: session belongs to a different website")
        events[identifier] = row

    properties = defaultdict(list)
    property_ids = set()
    for index, row in enumerate(snapshot["event_data"]):
        context = f"event_data[{index}]"
        identifier = text_field(row, "event_data_id", context, True)
        if identifier in property_ids:
            fail("Duplicate event_data_id")
        property_ids.add(identifier)
        event_id = text_field(row, "website_event_id", context, True)
        event = events.get(event_id)
        if event is None:
            fail(f"{context}: orphan event property")
        if row.get("website_id") != event["website_id"]:
            fail(f"{context}: unknown or mismatched website_id")
        key = text_field(row, "data_key", context, True)
        if key.startswith("umami."):
            fail(f"{context}: property key conflicts with reserved umami metadata namespace")
        populated = [key for key in VALUE_FIELDS if row.get(key) is not None]
        if len(populated) != 1:
            fail(f"{context}: event property requires exactly one non-null typed value")
        value = row[populated[0]]
        if populated[0] == "number_value" and (type(value) is not int and not isinstance(value, Decimal)):
            fail(f"{context}: number_value must be numeric")
        if populated[0] == "boolean_value" and type(value) is not bool:
            fail(f"{context}: boolean_value must be boolean")
        if populated[0] in ("string_value", "date_value") and not isinstance(value, str):
            fail(f"{context}: string/date property must be a string")
        properties[event_id].append(row)
    return websites, sessions, properties


def property_value(row):
    value = next(row[key] for key in VALUE_FIELDS if row.get(key) is not None)
    if isinstance(value, str):
        return value
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def convert_event(event, website, session, properties, site_id):
    context = "event"
    source_time, timestamp = parse_time(event["created_at"], context)
    fields = ("hostname", "url_path", "url_query", "referrer_domain", "referrer_path", "referrer_query",
              "page_title", "utm_source", "utm_medium", "utm_campaign")
    values = {key: text_field(event, key, context) for key in fields}
    session_values = {key: text_field(session or {}, key, "session") for key in
                      ("browser", "os", "device", "screen", "language", "country", "region", "city")}
    ref_domain = values["referrer_domain"]
    referrer = ("https://" + ref_domain + values["referrer_path"]) if ref_domain else ""
    if ref_domain and values["referrer_query"]:
        referrer += "?" + values["referrer_query"].lstrip("?")
    source = values["utm_source"] or re.sub(r"^www\.", "", ref_domain.lower()) or "Direct"
    meta = [(row["data_key"], property_value(row)) for row in properties]
    meta.extend(("umami." + key, str(value)) for key, value in (
        ("event_id", event["event_id"]), ("website_id", event["website_id"]),
        ("event_type", event["event_type"]), ("created_at", event["created_at"]),
        ("session_id", event["session_id"]), ("visit_id", event["visit_id"]),
        ("referrer_query", values["referrer_query"])))
    meta.extend(("umami.event." + key, value if isinstance(value, str) else json_text(value))
                for key, value in event.items() if key not in fields and key not in
                ("event_id", "website_id", "event_type", "created_at", "session_id", "visit_id"))
    # Full source rows retain fields with no equivalent column, including click
    # identifiers, distinct_id, property types, precision and original casing.
    meta.extend((("umami.event_json", json_text(event)), ("umami.session_json", json_text(session)),
                 ("umami.event_data_json", json_text(properties))))
    region = session_values["region"]
    record = {
        "timestamp": timestamp,
        "name": "pageview" if event["event_type"] == 1 else event["event_name"],
        "site_id": site_id, "user_id": event["session_id"], "session_visitor_id": event["session_id"],
        "session_id": event["visit_id"],
        "hostname": values["hostname"] or website.get("domain") or "", "pathname": values["url_path"] or "/",
        "referrer": referrer, "referrer_source": source,
        "browser": normalize_browser(session_values["browser"]), "browser_version": "",
        "operating_system": normalize_os(session_values["os"]), "operating_system_version": "",
        "screen_size": normalize_device(session_values["device"]), "country_code": session_values["country"].upper(),
        "page_title": values["page_title"], "browser_language": session_values["language"],
        "screen_resolution": session_values["screen"], "url_query": values["url_query"], "search_query": "",
        "utm_source": values["utm_source"], "utm_medium": values["utm_medium"], "utm_campaign": values["utm_campaign"],
        "acquisition_channel": "", "region_name": region,
        "subdivision1_code": region.split("-", 1)[-1] if "-" in region else "", "city_name": session_values["city"],
        "city_geoname_id": 0, "meta.key": [key for key, _ in meta], "meta.value": [value for _, value in meta],
    }
    return record, source_time


class Counts:
    def __init__(self):
        self.events = self.pageviews = self.custom_events = self.properties = self.missing_sessions = self.truncated = 0
        self.users, self.visits = set(), set()
        self.minimum = self.maximum = None

    def add(self, event, at, property_count, session):
        self.events += 1
        self.pageviews += event["event_type"] == 1
        self.custom_events += event["event_type"] == 2
        self.properties += property_count
        self.missing_sessions += session is None
        self.truncated += at.microsecond != 0
        self.users.add(event["session_id"])
        self.visits.add(event["visit_id"])
        self.minimum = min(self.minimum, at) if self.minimum else at
        self.maximum = max(self.maximum, at) if self.maximum else at

    def result(self):
        minimum_epoch = ((self.minimum - EPOCH).days * 86400 + (self.minimum - EPOCH).seconds) if self.minimum else None
        maximum_epoch = ((self.maximum - EPOCH).days * 86400 + (self.maximum - EPOCH).seconds) if self.maximum else None
        return {"events": self.events, "pageviews": self.pageviews, "custom_events": self.custom_events,
                "unique_users": len(self.users), "unique_visits": len(self.visits), "event_properties": self.properties,
                "missing_session_events": self.missing_sessions, "subsecond_truncated_events": self.truncated,
                "min_timestamp_utc": utc_string(self.minimum), "max_timestamp_utc": utc_string(self.maximum),
                "min_target_timestamp_epoch": minimum_epoch, "max_target_timestamp_epoch": maximum_epoch,
                "min_target_timestamp_utc": utc_string(self.minimum.replace(microsecond=0)) if self.minimum else None,
                "max_target_timestamp_utc": utc_string(self.maximum.replace(microsecond=0)) if self.maximum else None}


def exclusive_file(path):
    return os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w", encoding="utf-8", newline="\n")


def migrate(snapshot_path, mapping_path, output_path, manifest_path, timezone_name="Asia/Shanghai"):
    try:
        tz = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise MigrationError("Unknown reporting timezone") from exc
    paths = [Path(value).resolve() for value in (snapshot_path, mapping_path, output_path, manifest_path)]
    if len(set(paths)) != len(paths):
        fail("Snapshot, mapping, output and manifest must be different files")
    snapshot, snapshot_sha = load_json(paths[0])
    mapping, mapping_sha = load_json(paths[1])
    websites, sessions, properties = prepare(snapshot, mapping)
    created = []
    try:
        with exclusive_file(paths[2]) as output:
            created.append(paths[2])
            with exclusive_file(paths[3]) as manifest_file:
                created.append(paths[3])
                checksum = hashlib.sha256()
                total = Counts()
                per_site = {key: Counts() for key in websites}
                per_day = {key: defaultdict(Counts) for key in websites}
                missing_ids = set()
                for event in snapshot["events"]:
                    website_id = event["website_id"]
                    session = sessions.get(event["session_id"])
                    props = properties.get(event["event_id"], [])
                    record, at = convert_event(event, websites[website_id], session, props, mapping[website_id])
                    line = json_text(record) + "\n"
                    output.write(line)
                    checksum.update(line.encode("utf-8"))
                    day = at.astimezone(tz).date().isoformat()
                    for counts in (total, per_site[website_id], per_day[website_id][day]):
                        counts.add(event, at, len(props), session)
                    if session is None:
                        missing_ids.add(event["session_id"])
                output.flush()
                os.fsync(output.fileno())
                manifest = {
                    "format_version": 1, "mode": "offline-conversion-only", "timezone": timezone_name,
                    "snapshot_sha256": snapshot_sha, "mapping_sha256": mapping_sha,
                    "output_sha256": checksum.hexdigest(), "output_bytes": paths[2].stat().st_size,
                    "source_counts": {key: len(snapshot[key]) for key in ("websites", "events", "sessions", "event_data")},
                    "totals": total.result(), "missing_session_ids": len(missing_ids),
                    "sites": [{"website_id": key, "site_id": mapping[key], "domain": websites[key].get("domain"),
                               **per_site[key].result(), "days": {day: counts.result() for day, counts in sorted(per_day[key].items())}}
                              for key in sorted(websites)],
                    "semantics": {
                        "user_id": "Original Umami session_id; distinct_id is preserved only in source metadata",
                        "session_visitor_id": "Original Umami session_id for Umami-compatible visitor reporting",
                        "session_id": "Original Umami visit_id",
                        "timestamp": "Exact floor to UTC epoch seconds; original subsecond value in umami.created_at",
                        "referrer_source": "utm_source, else lowercase referrer hostname without www., else Direct (matches live collector)",
                        "acquisition_channel": "Empty, matching current LiteStats live collector; no invented historical attribution",
                        "source_metadata": "umami.* entries preserve all original event/session/property rows; numeric metadata uses exact decimal strings",
                        "timezone": "Report date grouping only; stored timestamps remain UTC",
                        "consistency": "Caller must export all arrays in one consistent source transaction",
                        "orphan_sessions": len(sessions) - len({event["session_id"] for event in snapshot["events"]} & set(sessions)),
                    },
                }
                manifest_file.write(json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
                manifest_file.flush()
                os.fsync(manifest_file.fileno())
        return manifest
    except BaseException:
        # Never leave a partial import file. Existing paths were never opened for
        # replacement, and only files created by this invocation are removed.
        for path in reversed(created):
            path.unlink(missing_ok=True)
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for name in ("snapshot", "mapping", "output", "manifest"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--timezone", default="Asia/Shanghai")
    args = parser.parse_args(argv)
    try:
        manifest = migrate(args.snapshot, args.mapping, args.output, args.manifest, args.timezone)
    except (MigrationError, OSError) as exc:
        print(f"Conversion failed: {exc}", file=sys.stderr)
        return 1
    print(f"Validated and converted {manifest['totals']['events']} events across {len(manifest['sites'])} sites; no database was modified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
