#!/usr/bin/env bash
set -euo pipefail

UMAMI_HOST="${UMAMI_HOST:-154.3.33.224}"
SSH_KEY="${SSH_KEY:-$HOME/Desktop/gentpan.pem}"
OUT_DIR="${OUT_DIR:-$(dirname "$0")/../data/umami-export}"
REMOTE='docker exec umami-tongji-db psql -U umami -d umami -t -A'

mkdir -p "$OUT_DIR"

run_remote() {
  ssh -i "$SSH_KEY" "root@${UMAMI_HOST}" "$REMOTE -c $(printf '%q' "$1")"
}

echo "Exporting websites..."
run_remote "
  SELECT coalesce(json_agg(row_to_json(w)), '[]'::json)::text
  FROM (
    SELECT website_id, name, domain, created_at
    FROM website
    WHERE deleted_at IS NULL
    ORDER BY created_at
  ) w
" > "${OUT_DIR}/websites.json"

echo "Exporting sessions..."
run_remote "
  SELECT coalesce(json_agg(row_to_json(s)), '[]'::json)::text
  FROM (
    SELECT
      s.session_id,
      s.website_id,
      s.browser,
      s.os,
      s.device,
      s.country,
      s.created_at,
      coalesce(max(e.created_at), s.created_at) AS last_seen_at
    FROM session s
    LEFT JOIN website_event e ON e.session_id = s.session_id
    GROUP BY
      s.session_id,
      s.website_id,
      s.browser,
      s.os,
      s.device,
      s.country,
      s.created_at
    ORDER BY s.created_at
  ) s
" > "${OUT_DIR}/sessions.json"

echo "Exporting events (CSV)..."
ssh -i "$SSH_KEY" "root@${UMAMI_HOST}" \
  "docker exec umami-tongji-db psql -U umami -d umami -c \"
COPY (
  SELECT
    session_id,
    website_id,
    created_at,
    url_path,
    url_query,
    referrer_domain,
    referrer_path,
    hostname,
    event_type,
    event_name
  FROM website_event
  ORDER BY created_at
) TO STDOUT WITH (FORMAT csv, HEADER true)
\"" > "${OUT_DIR}/events.csv"

echo "Done. Files in ${OUT_DIR}:"
ls -lh "${OUT_DIR}"
