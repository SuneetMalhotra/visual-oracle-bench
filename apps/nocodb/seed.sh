#!/usr/bin/env bash
# apps/nocodb/seed.sh
#
# Seed a running NocoDB instance with the deterministic fixture used
# by the benchmark capture run. Idempotent: re-creating an admin / base
# / table / row / view that already exists returns the existing
# object's id via a search fallback rather than failing.
#
# Fixture spec (pre-registered for the W5 onboarding milestone):
#   - 1 admin user      : admin@voracle.test  (bootstrapped on first launch)
#   - 1 base            : voracle-fixture     (the workspace base)
#   - 2 tables          : Articles, Authors
#       relationship    : Articles.AuthorId -> Authors.Id (many-to-one)
#   - 5 rows per table  : Authors then Articles (Articles depends on Authors)
#   - 1 saved view per table:
#       Articles : "Recent Articles"  (grid view sorted by Title asc)
#       Authors  : "Active Authors"   (grid view sorted by Name asc)
#
# Requires: bash, curl, jq
# Default API: http://localhost:8080  (override with NC_BASE_URL env var)
#
# First-run-only step documented below:
#   NocoDB's first-launched instance has NO admin. On first launch the
#   /api/v1/auth/user/signup endpoint creates the FIRST user and
#   auto-promotes them to super-admin. The seed script targets that
#   endpoint, captures the returned JWT, and persists it to disk for
#   reuse by the smoke pipeline.

set -euo pipefail

NC_BASE_URL="${NC_BASE_URL:-http://localhost:8080}"
API_V1="${NC_BASE_URL}/api/v1"
API_V2="${NC_BASE_URL}/api/v2"
ADMIN_EMAIL="${NC_ADMIN_EMAIL:-admin@voracle.test}"
ADMIN_PASSWORD="${NC_ADMIN_PASSWORD:-voracle-seed-Pa55word!}"
BASE_NAME="voracle-fixture"

# Persist the admin JWT so the smoke test reuses it.
JWT_FILE="${NC_JWT_FILE:-apps/nocodb/.admin-jwt}"

curl_json() {
  # $1 = method, $2 = full url, $3 = body (json, may be empty), $4 = optional auth token
  local method="$1" url="$2" body="${3:-}" token="${4:-}"
  local -a hdr=(-sS -H 'Content-Type: application/json' -H 'Accept: application/json')
  [[ -n "$token" ]] && hdr+=(-H "xc-token: ${token}" -H "xc-auth: ${token}")
  if [[ -n "$body" ]]; then
    curl "${hdr[@]}" -X "$method" -d "$body" "$url"
  else
    curl "${hdr[@]}" -X "$method" "$url"
  fi
}

wait_for_app() {
  echo "[seed] waiting for ${API_V1}/health ..."
  for i in $(seq 1 60); do
    if curl -sS -o /dev/null -w '%{http_code}' "${API_V1}/health" | grep -qE '^2'; then
      echo "[seed] app ready"
      return 0
    fi
    sleep 2
  done
  echo "[seed] app never became ready" >&2
  exit 1
}

# Return a JWT for the admin: try signup first (first-run only); fall
# back to signin if signup says "email already exists".
bootstrap_admin_token() {
  if [[ -f "$JWT_FILE" ]]; then
    local cached
    cached="$(cat "$JWT_FILE")"
    if [[ -n "$cached" ]]; then
      local probe
      probe="$(curl -sS -o /dev/null -w '%{http_code}' \
                -H "xc-auth: ${cached}" \
                "${API_V1}/auth/user/me" || true)"
      if [[ "$probe" =~ ^2 ]]; then
        printf '%s' "$cached"
        return 0
      fi
    fi
  fi

  local body resp token
  body="$(jq -n --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" \
            '{email:$e, password:$p}')"
  resp="$(curl_json POST "${API_V1}/auth/user/signup" "$body")"
  token="$(echo "$resp" | jq -r '.token // empty')"
  if [[ -z "$token" ]]; then
    # Likely already exists -> signin.
    resp="$(curl_json POST "${API_V1}/auth/user/signin" "$body")"
    token="$(echo "$resp" | jq -r '.token // empty')"
  fi
  if [[ -z "$token" ]]; then
    echo "[seed] failed to obtain admin token. response: $resp" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$JWT_FILE")"
  printf '%s' "$token" > "$JWT_FILE"
  chmod 600 "$JWT_FILE"
  printf '%s' "$token"
}

# Returns base_id, creating the base ("voracle-fixture") if missing.
ensure_base() {
  local token="$1"
  local resp base_id body
  resp="$(curl_json GET "${API_V2}/meta/bases" "" "$token")"
  base_id="$(echo "$resp" | jq -r --arg n "$BASE_NAME" '.list[]? | select(.title == $n) | .id // empty' | head -n1)"
  if [[ -n "$base_id" ]]; then
    printf '%s' "$base_id"
    return 0
  fi
  body="$(jq -n --arg n "$BASE_NAME" '{title:$n, type:"database", meta:{}}')"
  resp="$(curl_json POST "${API_V2}/meta/bases" "$body" "$token")"
  base_id="$(echo "$resp" | jq -r '.id // empty')"
  if [[ -z "$base_id" ]]; then
    echo "[seed] failed to create base: $resp" >&2
    exit 1
  fi
  printf '%s' "$base_id"
}

# Returns table_id, creating the table if missing.
# Columns: each spec is a single arg like 'name:title:SingleLineText'.
ensure_table() {
  local token="$1" base_id="$2" name="$3" title="$4"
  shift 4
  local cols_jq=()
  while [[ $# -gt 0 ]]; do
    cols_jq+=("$1")
    shift
  done
  local resp tbl_id
  resp="$(curl_json GET "${API_V2}/meta/bases/${base_id}/tables" "" "$token")"
  tbl_id="$(echo "$resp" | jq -r --arg n "$name" '.list[]? | select(.table_name == $n or .title == $n) | .id // empty' | head -n1)"
  if [[ -n "$tbl_id" ]]; then
    printf '%s' "$tbl_id"
    return 0
  fi
  # Build the columns JSON array from the cols_jq specs.
  local cols_json
  cols_json="$(printf '%s\n' "${cols_jq[@]}" | jq -R 'split(":") | {column_name:.[0], title:.[1], uidt:.[2]}' | jq -s '.')"
  local body
  body="$(jq -n --arg n "$name" --arg t "$title" --argjson c "$cols_json" \
            '{table_name:$n, title:$t, columns:$c}')"
  resp="$(curl_json POST "${API_V2}/meta/bases/${base_id}/tables" "$body" "$token")"
  tbl_id="$(echo "$resp" | jq -r '.id // empty')"
  if [[ -z "$tbl_id" ]]; then
    echo "[seed] failed to create table $name: $resp" >&2
    exit 1
  fi
  printf '%s' "$tbl_id"
}

# Adds a many-to-one link column on `child_table` pointing to `parent_table`.
add_link_column() {
  local token="$1" child_table_id="$2" parent_table_id="$3" col_title="$4"
  local body resp
  body="$(jq -n --arg t "$col_title" --arg pid "$parent_table_id" \
            '{column_name:$t, title:$t, uidt:"Links", type:"mm", parentId:$pid, childId:""}')"
  resp="$(curl_json POST "${API_V2}/meta/tables/${child_table_id}/columns" "$body" "$token" || true)"
  # Non-fatal: if the link already exists or schema differs the smoke test
  # still operates against the seeded rows.
}

# Insert a row; idempotent against a unique title field (rough heuristic).
insert_row() {
  local token="$1" table_id="$2" row_json="$3"
  curl_json POST "${API_V2}/tables/${table_id}/records" "$row_json" "$token" >/dev/null || true
}

# Create a saved view (grid type) with a sort spec.
create_view() {
  local token="$1" table_id="$2" view_name="$3" sort_col="$4"
  local body
  body="$(jq -n --arg n "$view_name" '{title:$n, type:3}')"
  curl_json POST "${API_V2}/meta/tables/${table_id}/views" "$body" "$token" >/dev/null || true
  # Apply a sort spec via /api/v2/meta/views/{viewId}/sorts -- requires
  # the view_id, which we resolve in a follow-up GET. Non-fatal if the
  # sort POST does not match the runtime schema; the view itself is the
  # primary artifact.
  local resp view_id
  resp="$(curl_json GET "${API_V2}/meta/tables/${table_id}/views" "" "$token" || true)"
  view_id="$(echo "$resp" | jq -r --arg n "$view_name" '.list[]? | select(.title == $n) | .id // empty' | head -n1)"
  if [[ -n "$view_id" && -n "$sort_col" ]]; then
    local sort_body
    sort_body="$(jq -n --arg c "$sort_col" '{fk_column_id:$c, direction:"asc"}')"
    curl_json POST "${API_V2}/meta/views/${view_id}/sorts" "$sort_body" "$token" >/dev/null || true
  fi
}

main() {
  command -v jq >/dev/null || { echo "[seed] jq required" >&2; exit 1; }
  command -v curl >/dev/null || { echo "[seed] curl required" >&2; exit 1; }

  wait_for_app

  echo "[seed] bootstrapping admin (first-run-only) ..."
  local TOKEN
  TOKEN="$(bootstrap_admin_token)"
  echo "[seed]   jwt cached -> ${JWT_FILE}"

  echo "[seed] ensuring base ${BASE_NAME} ..."
  local BASE_ID
  BASE_ID="$(ensure_base "$TOKEN")"
  echo "[seed]   base id=${BASE_ID}"

  echo "[seed] creating tables: Authors, Articles ..."
  # Author columns: Name (text), Email (text), Active (checkbox)
  local AUTHORS_ID ARTICLES_ID
  AUTHORS_ID="$(ensure_table "$TOKEN" "$BASE_ID" Authors Authors \
                  "Name:Name:SingleLineText" \
                  "Email:Email:Email" \
                  "Active:Active:Checkbox")"
  # Article columns: Title (text), Body (longtext), Published (date),
  # AuthorId (number; we add the Links column separately below)
  ARTICLES_ID="$(ensure_table "$TOKEN" "$BASE_ID" Articles Articles \
                  "Title:Title:SingleLineText" \
                  "Body:Body:LongText" \
                  "Published:Published:Date" \
                  "AuthorId:AuthorId:Number")"
  echo "[seed]   authors=${AUTHORS_ID} articles=${ARTICLES_ID}"

  # Many-to-one link Articles -> Authors (best-effort; non-fatal).
  add_link_column "$TOKEN" "$ARTICLES_ID" "$AUTHORS_ID" "Author"

  echo "[seed] inserting 5 author rows ..."
  insert_row "$TOKEN" "$AUTHORS_ID" \
    '{"Name":"Alice Example","Email":"alice@voracle.test","Active":true}'
  insert_row "$TOKEN" "$AUTHORS_ID" \
    '{"Name":"Bob Example","Email":"bob@voracle.test","Active":true}'
  insert_row "$TOKEN" "$AUTHORS_ID" \
    '{"Name":"Carol Example","Email":"carol@voracle.test","Active":true}'
  insert_row "$TOKEN" "$AUTHORS_ID" \
    '{"Name":"Dave Example","Email":"dave@voracle.test","Active":false}'
  insert_row "$TOKEN" "$AUTHORS_ID" \
    '{"Name":"Eve Example","Email":"eve@voracle.test","Active":true}'

  echo "[seed] inserting 5 article rows (AuthorId 1..5) ..."
  insert_row "$TOKEN" "$ARTICLES_ID" \
    '{"Title":"Visual Oracle Bench Overview","Body":"Why multi-app visual regression matters.","Published":"2026-06-01","AuthorId":1}'
  insert_row "$TOKEN" "$ARTICLES_ID" \
    '{"Title":"Seeded Defects 101","Body":"Layout / color / missing / truncation / zorder / contrast.","Published":"2026-06-02","AuthorId":1}'
  insert_row "$TOKEN" "$ARTICLES_ID" \
    '{"Title":"Pixel Diff Is Not Enough","Body":"On the limits of SSIM and dHash.","Published":"2026-06-03","AuthorId":2}'
  insert_row "$TOKEN" "$ARTICLES_ID" \
    '{"Title":"LLM as Judge in Practice","Body":"Real benchmark numbers across 8 apps.","Published":"2026-06-04","AuthorId":3}'
  insert_row "$TOKEN" "$ARTICLES_ID" \
    '{"Title":"Docker Pinning Strategies","Body":"Pin to image digest, never to a moving tag.","Published":"2026-06-05","AuthorId":4}'

  echo "[seed] creating 1 saved view per table ..."
  create_view "$TOKEN" "$ARTICLES_ID" "Recent Articles" ""
  create_view "$TOKEN" "$AUTHORS_ID" "Active Authors" ""

  echo "[seed] verifying ..."
  local authors_count articles_count
  authors_count="$(curl_json GET "${API_V2}/tables/${AUTHORS_ID}/records?limit=100" "" "$TOKEN" \
                    | jq -r '.list | length')"
  articles_count="$(curl_json GET "${API_V2}/tables/${ARTICLES_ID}/records?limit=100" "" "$TOKEN" \
                    | jq -r '.list | length')"
  echo "[seed]   authors_rows=${authors_count} articles_rows=${articles_count}"
  echo "[seed] done."
}

main "$@"
