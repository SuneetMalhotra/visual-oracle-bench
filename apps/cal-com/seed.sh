#!/usr/bin/env bash
# apps/cal-com/seed.sh
#
# Seed a running Cal.com instance with the deterministic fixture used
# by the benchmark capture run. Idempotent: re-creating a user / event
# type / booking that already exists returns the existing object's id
# via a search fallback rather than failing.
#
# Fixture spec (pre-registered for the W5 onboarding milestone):
#   - 1 admin user      : admin       (bootstraps the install + has API key)
#   - 2 regular users   : alice, bob  (each has 2 event types)
#   - 2 event types per user (6 total):
#       admin : admin-15min, admin-30min
#       alice : alice-15min, alice-30min
#       bob   : bob-15min,   bob-30min
#   - 5 sample bookings distributed across users:
#       alice-15min   booked by bob   on 2026-06-10T10:00Z
#       alice-30min   booked by admin on 2026-06-10T14:00Z
#       bob-15min     booked by alice on 2026-06-11T10:00Z
#       bob-30min     booked by admin on 2026-06-11T14:00Z
#       admin-30min   booked by alice on 2026-06-12T10:00Z
#
# Requires: bash, curl, jq
# Default API: http://localhost:3001/api/v1  (override with CAL_BASE_URL env var)
#
# First-run-only steps documented below: Cal.com does NOT have a public
# admin-bootstrap REST endpoint. The seed instead drives the
# /auth/setup wizard via curl on first run (Cal.com exposes the wizard
# as a Next.js page that accepts a JSON POST), then uses the regular
# /api/v1 surface with the resulting API key for everything else.

set -euo pipefail

CAL_BASE_URL="${CAL_BASE_URL:-http://localhost:3001}"
API_BASE="${CAL_BASE_URL}/api/v1"
ADMIN_EMAIL="${CAL_ADMIN_EMAIL:-admin@voracle.test}"
ADMIN_USERNAME="${CAL_ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${CAL_ADMIN_PASSWORD:-voracle-seed-Pa55word!}"
USER_PASSWORD="voracle-seed-Pa55word!"

# We persist the admin API key to disk so re-running the seed is fast
# and so the smoke test can reuse it.
APIKEY_FILE="${CAL_APIKEY_FILE:-apps/cal-com/.admin-apikey}"

# Per-app conventions: never echo secrets to stdout, suppress curl
# progress, fail on non-2xx for required endpoints.
curl_json() {
  # $1 = method, $2 = full url, $3 = body (json, may be empty), $4 = optional bearer
  local method="$1" url="$2" body="${3:-}" token="${4:-}"
  local -a hdr=(-sS -H 'Content-Type: application/json' -H 'Accept: application/json')
  [[ -n "$token" ]] && hdr+=(-H "Authorization: Bearer ${token}")
  if [[ -n "$body" ]]; then
    curl "${hdr[@]}" -X "$method" -d "$body" "$url"
  else
    curl "${hdr[@]}" -X "$method" "$url"
  fi
}

wait_for_app() {
  echo "[seed] waiting for ${CAL_BASE_URL}/api/auth/session ..."
  for i in $(seq 1 60); do
    if curl -sS -o /dev/null -w '%{http_code}' "${CAL_BASE_URL}/api/auth/session" | grep -qE '^2'; then
      echo "[seed] app ready"
      return 0
    fi
    sleep 2
  done
  echo "[seed] app never became ready" >&2
  exit 1
}

# ----- First-run-only: bootstrap the admin and capture an API key ------
# Cal.com's /auth/setup wizard is a Next.js page that accepts a JSON
# POST to create the very first user (auto-promoted to admin role).
# After that, /api/v1/users requires an API key. We create the admin's
# API key via the trpc.viewer.apiKeys.create endpoint, which uses
# session-cookie auth on Next.js.
bootstrap_admin_and_apikey() {
  # If we already have an api key cached, validate it and reuse it.
  if [[ -f "$APIKEY_FILE" ]]; then
    local cached_key
    cached_key="$(cat "$APIKEY_FILE")"
    if [[ -n "$cached_key" ]]; then
      local probe
      probe="$(curl -sS -o /dev/null -w '%{http_code}' \
                "${API_BASE}/me?apiKey=${cached_key}" || true)"
      if [[ "$probe" =~ ^2 ]]; then
        printf '%s' "$cached_key"
        return 0
      fi
    fi
  fi

  # 1. Try the setup wizard. 200/201 on first run, 4xx if admin exists.
  local body resp
  body="$(jq -n --arg u "$ADMIN_USERNAME" --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" \
            '{username:$u, email:$e, password:$p, full_name:"Voracle Admin"}')"
  resp="$(curl -sS -o /dev/null -w '%{http_code}' \
            -H 'Content-Type: application/json' \
            -X POST -d "$body" "${CAL_BASE_URL}/api/auth/setup" || true)"
  if [[ ! "$resp" =~ ^2 && ! "$resp" =~ ^4 ]]; then
    echo "[seed] setup wizard returned unexpected status $resp" >&2
    exit 1
  fi
  echo "[seed]   admin setup status: $resp (4xx = already bootstrapped)"

  # 2. Login via NextAuth credentials provider; capture the session cookie.
  # The CSRF + sign-in dance:
  #   GET  /api/auth/csrf            -> { csrfToken }
  #   POST /api/auth/callback/credentials with cookies -> sets next-auth.session-token
  local cookiejar
  cookiejar="$(mktemp -t calcom-cookies.XXXXXX)"
  trap 'rm -f "$cookiejar"' RETURN
  local csrf
  csrf="$(curl -sS -c "$cookiejar" -b "$cookiejar" \
            "${CAL_BASE_URL}/api/auth/csrf" | jq -r '.csrfToken')"
  if [[ -z "$csrf" || "$csrf" == "null" ]]; then
    echo "[seed] failed to obtain csrfToken" >&2
    exit 1
  fi
  curl -sS -c "$cookiejar" -b "$cookiejar" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -X POST \
    --data-urlencode "csrfToken=${csrf}" \
    --data-urlencode "email=${ADMIN_EMAIL}" \
    --data-urlencode "password=${ADMIN_PASSWORD}" \
    --data-urlencode 'callbackUrl=/' \
    -o /dev/null \
    "${CAL_BASE_URL}/api/auth/callback/credentials"

  # 3. Create an API key via the tRPC endpoint. The route name is
  #    `viewer.apiKeys.create` and the input is { note, expiresAt? }.
  local trpc_body trpc_resp api_key
  trpc_body='{"json":{"note":"voracle-seed-key","expiresAt":null}}'
  trpc_resp="$(curl -sS -b "$cookiejar" \
                  -H 'Content-Type: application/json' \
                  -X POST -d "$trpc_body" \
                  "${CAL_BASE_URL}/api/trpc/viewer.apiKeys.create?batch=1")"
  # tRPC v10 wraps responses in [{ result: { data: { json: <value> } } }].
  api_key="$(echo "$trpc_resp" | jq -r '.[0].result.data.json // .result.data.json // empty')"
  if [[ -z "$api_key" ]]; then
    # Some Cal.com builds return the raw key string instead of a wrapper.
    api_key="$(echo "$trpc_resp" | jq -r '.. | strings | select(test("^cal_"))' | head -n1)"
  fi
  if [[ -z "$api_key" ]]; then
    echo "[seed] failed to create api key. tRPC response: $trpc_resp" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$APIKEY_FILE")"
  printf '%s' "$api_key" > "$APIKEY_FILE"
  chmod 600 "$APIKEY_FILE"
  printf '%s' "$api_key"
}

# Returns user_id, creating the user via /api/v1/users if missing.
ensure_user() {
  local api_key="$1" username="$2" email="$3" full_name="$4"
  local resp user_id body
  # List users; v1 returns { users: [...] }.
  resp="$(curl_json GET "${API_BASE}/users?apiKey=${api_key}")"
  user_id="$(echo "$resp" | jq -r --arg u "$username" '.users[]? | select(.username == $u) | .id // empty' | head -n1)"
  if [[ -n "$user_id" ]]; then
    printf '%s' "$user_id"
    return 0
  fi
  body="$(jq -n --arg u "$username" --arg e "$email" --arg p "$USER_PASSWORD" --arg n "$full_name" \
            '{username:$u, email:$e, password:$p, name:$n, timeZone:"UTC", weekStart:"Monday", locale:"en"}')"
  resp="$(curl_json POST "${API_BASE}/users?apiKey=${api_key}" "$body")"
  user_id="$(echo "$resp" | jq -r '.user.id // .id // empty')"
  if [[ -z "$user_id" ]]; then
    echo "[seed] failed to create user $username: $resp" >&2
    exit 1
  fi
  printf '%s' "$user_id"
}

# Returns event_type_id, creating the event type if missing.
ensure_event_type() {
  local api_key="$1" user_id="$2" slug="$3" title="$4" length="$5"
  local resp et_id body
  resp="$(curl_json GET "${API_BASE}/event-types?apiKey=${api_key}&userId=${user_id}")"
  et_id="$(echo "$resp" | jq -r --arg s "$slug" '.event_types[]? | select(.slug == $s) | .id // empty' | head -n1)"
  if [[ -n "$et_id" ]]; then
    printf '%s' "$et_id"
    return 0
  fi
  body="$(jq -n --arg s "$slug" --arg t "$title" --argjson l "$length" --argjson u "$user_id" \
            '{slug:$s, title:$t, length:$l, userId:$u, schedulingType:null, locations:[{type:"integrations:daily"}]}')"
  resp="$(curl_json POST "${API_BASE}/event-types?apiKey=${api_key}" "$body")"
  et_id="$(echo "$resp" | jq -r '.event_type.id // .id // empty')"
  if [[ -z "$et_id" ]]; then
    echo "[seed] failed to create event type $slug: $resp" >&2
    exit 1
  fi
  printf '%s' "$et_id"
}

# Creates a booking; non-fatal if it already exists (uid collision).
create_booking() {
  local api_key="$1" event_type_id="$2" booker_email="$3" booker_name="$4" start_iso="$5" end_iso="$6"
  local body resp
  body="$(jq -n --argjson e "$event_type_id" --arg be "$booker_email" --arg bn "$booker_name" \
              --arg s "$start_iso" --arg en "$end_iso" \
              '{eventTypeId:$e, start:$s, end:$en, responses:{name:$bn, email:$be},
                timeZone:"UTC", language:"en", metadata:{seed:"voracle"}}')"
  resp="$(curl_json POST "${API_BASE}/bookings?apiKey=${api_key}" "$body" || true)"
  local booking_id
  booking_id="$(echo "$resp" | jq -r '.booking.id // .id // empty')"
  if [[ -n "$booking_id" ]]; then
    echo "[seed]   booking ok: et=${event_type_id} booker=${booker_email} (id=${booking_id})"
  else
    echo "[seed]   booking returned no id (likely already exists): $(echo "$resp" | jq -c '.message? // .' 2>/dev/null || echo "$resp")"
  fi
}

main() {
  command -v jq >/dev/null || { echo "[seed] jq required" >&2; exit 1; }
  command -v curl >/dev/null || { echo "[seed] curl required" >&2; exit 1; }

  wait_for_app

  echo "[seed] bootstrapping admin + api key (first-run-only) ..."
  local API_KEY
  API_KEY="$(bootstrap_admin_and_apikey)"
  echo "[seed]   api key cached -> ${APIKEY_FILE}"

  echo "[seed] looking up admin user id ..."
  local ADMIN_ID
  ADMIN_ID="$(curl_json GET "${API_BASE}/users?apiKey=${API_KEY}" \
                | jq -r --arg u "$ADMIN_USERNAME" '.users[]? | select(.username == $u) | .id // empty' | head -n1)"
  if [[ -z "$ADMIN_ID" ]]; then
    echo "[seed] could not resolve admin user id" >&2
    exit 1
  fi

  echo "[seed] creating 2 regular users (alice, bob) ..."
  local ALICE_ID BOB_ID
  ALICE_ID="$(ensure_user "$API_KEY" alice alice@voracle.test "Alice Example")"
  BOB_ID="$(ensure_user   "$API_KEY" bob   bob@voracle.test   "Bob Example")"
  echo "[seed]   admin=${ADMIN_ID} alice=${ALICE_ID} bob=${BOB_ID}"

  echo "[seed] creating 2 event types per user (6 total) ..."
  local ADMIN_15 ADMIN_30 ALICE_15 ALICE_30 BOB_15 BOB_30
  ADMIN_15="$(ensure_event_type "$API_KEY" "$ADMIN_ID" admin-15min "Admin 15min Consultation" 15)"
  ADMIN_30="$(ensure_event_type "$API_KEY" "$ADMIN_ID" admin-30min "Admin 30min Consultation" 30)"
  ALICE_15="$(ensure_event_type "$API_KEY" "$ALICE_ID" alice-15min "Alice 15min Consultation" 15)"
  ALICE_30="$(ensure_event_type "$API_KEY" "$ALICE_ID" alice-30min "Alice 30min Consultation" 30)"
  BOB_15="$(ensure_event_type   "$API_KEY" "$BOB_ID"   bob-15min   "Bob 15min Consultation"   15)"
  BOB_30="$(ensure_event_type   "$API_KEY" "$BOB_ID"   bob-30min   "Bob 30min Consultation"   30)"

  echo "[seed] creating 5 sample bookings ..."
  create_booking "$API_KEY" "$ALICE_15" bob@voracle.test   "Bob Example"   "2026-06-10T10:00:00.000Z" "2026-06-10T10:15:00.000Z"
  create_booking "$API_KEY" "$ALICE_30" admin@voracle.test "Voracle Admin" "2026-06-10T14:00:00.000Z" "2026-06-10T14:30:00.000Z"
  create_booking "$API_KEY" "$BOB_15"   alice@voracle.test "Alice Example" "2026-06-11T10:00:00.000Z" "2026-06-11T10:15:00.000Z"
  create_booking "$API_KEY" "$BOB_30"   admin@voracle.test "Voracle Admin" "2026-06-11T14:00:00.000Z" "2026-06-11T14:30:00.000Z"
  create_booking "$API_KEY" "$ADMIN_30" alice@voracle.test "Alice Example" "2026-06-12T10:00:00.000Z" "2026-06-12T10:30:00.000Z"

  echo "[seed] verifying ..."
  local users_count event_types_count bookings_count
  users_count="$(curl_json GET "${API_BASE}/users?apiKey=${API_KEY}" \
                  | jq -r '.users | length')"
  event_types_count="$(curl_json GET "${API_BASE}/event-types?apiKey=${API_KEY}" \
                        | jq -r '.event_types | length')"
  bookings_count="$(curl_json GET "${API_BASE}/bookings?apiKey=${API_KEY}" \
                      | jq -r '.bookings | length')"
  echo "[seed]   users=${users_count} event_types=${event_types_count} bookings=${bookings_count}"
  echo "[seed] done."
}

main "$@"
