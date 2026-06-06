#!/usr/bin/env bash
# apps/mattermost/seed.sh
#
# Seed a running Mattermost server with the deterministic fixture used
# by the benchmark capture run. Idempotent: re-creating an existing
# user / team / channel returns the existing object's ID via a search
# fallback rather than failing.
#
# Fixture spec (pre-registered):
#   - 1 sysadmin   : admin   (bootstraps the install)
#   - 10 users     : alice, bob, carol, dave, eve, frank, grace, heidi, ivan, judy
#   - 3 teams      : engineering, design, ops
#   - 5 channels per team = 15 total channels (town-square + off-topic + 3 custom)
#     custom channels per team:
#       engineering: backend, frontend, releases
#       design     : visual, ux, brand
#       ops        : incidents, deploys, on-call
#   - 30 messages distributed across the 9 custom channels (~3 each),
#     round-robin posted by alice/bob/carol/dave/eve
#
# Requires: bash, curl, jq
# Default API: http://localhost:8065/api/v4  (override with MM_BASE_URL env var)

set -euo pipefail

MM_BASE_URL="${MM_BASE_URL:-http://localhost:8065/api/v4}"
ADMIN_USER="${MM_ADMIN_USERNAME:-admin}"
ADMIN_EMAIL="${MM_ADMIN_EMAIL:-admin@voracle.test}"
ADMIN_PASSWORD="${MM_ADMIN_PASSWORD:-voracle-seed-Pa55word!}"
USER_PASSWORD="voracle-seed-Pa55word!"

# Per-app conventions: never echo tokens; suppress curl progress; fail on non-2xx.
curl_json() {
  # $1 = method, $2 = path, $3 = body (json, may be empty), $4 = optional bearer token
  local method="$1" path="$2" body="${3:-}" token="${4:-}"
  local -a hdr=(-sS -H 'Content-Type: application/json' -H 'Accept: application/json')
  [[ -n "$token" ]] && hdr+=(-H "Authorization: Bearer ${token}")
  if [[ -n "$body" ]]; then
    curl "${hdr[@]}" -X "$method" -d "$body" "${MM_BASE_URL}${path}"
  else
    curl "${hdr[@]}" -X "$method" "${MM_BASE_URL}${path}"
  fi
}

wait_for_api() {
  echo "[seed] waiting for ${MM_BASE_URL}/system/ping ..."
  for i in $(seq 1 60); do
    if curl -sS -o /dev/null -w '%{http_code}' "${MM_BASE_URL}/system/ping" | grep -qE '^2'; then
      echo "[seed] api ready"
      return 0
    fi
    sleep 2
  done
  echo "[seed] api never became ready" >&2
  exit 1
}

# ----- Bootstrap admin via the open-server endpoint --------------------
# Mattermost's first user (when none exist) is auto-promoted to sysadmin.
# POST /users with no token works for the FIRST user only; subsequent
# calls require admin auth, so we capture the token here.
register_admin_or_login() {
  local body resp token
  body="$(jq -n --arg u "$ADMIN_USER" --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" \
            '{username:$u, email:$e, password:$p}')"
  # POST /users (no token). 201 on first run, 400/403 if user exists.
  resp="$(curl -sS -H 'Content-Type: application/json' \
            -X POST -d "$body" "${MM_BASE_URL}/users" || true)"
  # Whether create succeeded or failed, attempt login to get a token.
  body="$(jq -n --arg li "$ADMIN_USER" --arg p "$ADMIN_PASSWORD" \
            '{login_id:$li, password:$p}')"
  # /users/login returns the token in the "Token" response header.
  token="$(curl -sS -D - -o /dev/null \
              -H 'Content-Type: application/json' \
              -X POST -d "$body" "${MM_BASE_URL}/users/login" \
            | awk 'BEGIN{IGNORECASE=1} /^token:/ {print $2}' | tr -d '\r')"
  if [[ -z "$token" ]]; then
    echo "[seed] failed to obtain admin token (resp=$resp)" >&2
    exit 1
  fi
  printf '%s' "$token"
}

# Returns user_id for a username, creating the user if it does not exist.
ensure_user() {
  local admin_token="$1" username="$2" email="$3"
  local resp user_id body
  # GET /users/username/{u} returns 200 + object, 404 otherwise.
  resp="$(curl -sS -H "Authorization: Bearer ${admin_token}" \
            "${MM_BASE_URL}/users/username/${username}" || true)"
  user_id="$(echo "$resp" | jq -r '.id // empty')"
  if [[ -n "$user_id" ]]; then
    printf '%s' "$user_id"
    return 0
  fi
  body="$(jq -n --arg u "$username" --arg e "$email" --arg p "$USER_PASSWORD" \
            '{username:$u, email:$e, password:$p}')"
  resp="$(curl_json POST /users "$body" "$admin_token")"
  user_id="$(echo "$resp" | jq -r '.id // empty')"
  if [[ -z "$user_id" ]]; then
    echo "[seed] failed to create user $username: $resp" >&2
    exit 1
  fi
  printf '%s' "$user_id"
}

# Returns team_id, creating the team if missing.
ensure_team() {
  local admin_token="$1" name="$2" display_name="$3"
  local resp team_id body
  resp="$(curl -sS -H "Authorization: Bearer ${admin_token}" \
            "${MM_BASE_URL}/teams/name/${name}" || true)"
  team_id="$(echo "$resp" | jq -r '.id // empty')"
  if [[ -n "$team_id" ]]; then
    printf '%s' "$team_id"
    return 0
  fi
  body="$(jq -n --arg n "$name" --arg d "$display_name" \
            '{name:$n, display_name:$d, type:"O"}')"
  resp="$(curl_json POST /teams "$body" "$admin_token")"
  team_id="$(echo "$resp" | jq -r '.id // empty')"
  if [[ -z "$team_id" ]]; then
    echo "[seed] failed to create team $name: $resp" >&2
    exit 1
  fi
  printf '%s' "$team_id"
}

# Adds a user to a team; idempotent (404/already-member is non-fatal).
add_user_to_team() {
  local admin_token="$1" team_id="$2" user_id="$3"
  local body
  body="$(jq -n --arg t "$team_id" --arg u "$user_id" \
            '{team_id:$t, user_id:$u}')"
  curl_json POST "/teams/${team_id}/members" "$body" "$admin_token" >/dev/null || true
}

# Returns channel_id, creating the channel if missing within the team.
ensure_channel() {
  local admin_token="$1" team_id="$2" name="$3" display_name="$4"
  local resp channel_id body
  resp="$(curl -sS -H "Authorization: Bearer ${admin_token}" \
            "${MM_BASE_URL}/teams/${team_id}/channels/name/${name}" || true)"
  channel_id="$(echo "$resp" | jq -r '.id // empty')"
  if [[ -n "$channel_id" ]]; then
    printf '%s' "$channel_id"
    return 0
  fi
  body="$(jq -n --arg t "$team_id" --arg n "$name" --arg d "$display_name" \
            '{team_id:$t, name:$n, display_name:$d, type:"O"}')"
  resp="$(curl_json POST /channels "$body" "$admin_token")"
  channel_id="$(echo "$resp" | jq -r '.id // empty')"
  if [[ -z "$channel_id" ]]; then
    echo "[seed] failed to create channel $name: $resp" >&2
    exit 1
  fi
  printf '%s' "$channel_id"
}

add_user_to_channel() {
  local admin_token="$1" channel_id="$2" user_id="$3"
  local body
  body="$(jq -n --arg u "$user_id" '{user_id:$u}')"
  curl_json POST "/channels/${channel_id}/members" "$body" "$admin_token" >/dev/null || true
}

# Posts a message as a given user. Requires THAT user's token (not admin).
post_message() {
  local user_token="$1" channel_id="$2" message="$3"
  local body
  body="$(jq -n --arg c "$channel_id" --arg m "$message" \
            '{channel_id:$c, message:$m}')"
  curl_json POST /posts "$body" "$user_token" >/dev/null
}

# Logs a non-admin user in and returns their token (for post_message).
user_login() {
  local username="$1"
  local body token
  body="$(jq -n --arg li "$username" --arg p "$USER_PASSWORD" \
            '{login_id:$li, password:$p}')"
  token="$(curl -sS -D - -o /dev/null \
              -H 'Content-Type: application/json' \
              -X POST -d "$body" "${MM_BASE_URL}/users/login" \
            | awk 'BEGIN{IGNORECASE=1} /^token:/ {print $2}' | tr -d '\r')"
  if [[ -z "$token" ]]; then
    echo "[seed] login failed for $username" >&2
    exit 1
  fi
  printf '%s' "$token"
}

main() {
  command -v jq >/dev/null || { echo "[seed] jq required" >&2; exit 1; }
  command -v curl >/dev/null || { echo "[seed] curl required" >&2; exit 1; }

  wait_for_api

  echo "[seed] bootstrapping admin user ..."
  local ADMIN_TOKEN
  ADMIN_TOKEN="$(register_admin_or_login)"
  echo "[seed]   admin token acquired"

  echo "[seed] creating 10 users ..."
  declare -A UID_OF
  declare -A TOK_OF
  local idx=0
  for entry in "alice:alice@voracle.test" \
               "bob:bob@voracle.test" \
               "carol:carol@voracle.test" \
               "dave:dave@voracle.test" \
               "eve:eve@voracle.test" \
               "frank:frank@voracle.test" \
               "grace:grace@voracle.test" \
               "heidi:heidi@voracle.test" \
               "ivan:ivan@voracle.test" \
               "judy:judy@voracle.test"; do
    u="${entry%:*}" e="${entry#*:}"
    UID_OF[$u]="$(ensure_user "$ADMIN_TOKEN" "$u" "$e")"
    echo "[seed]   ok: $u"
    idx=$((idx + 1))
  done

  # We only need login tokens for the 5 round-robin posters.
  for u in alice bob carol dave eve; do
    TOK_OF[$u]="$(user_login "$u")"
  done

  echo "[seed] creating 3 teams ..."
  declare -A TID
  TID[engineering]="$(ensure_team "$ADMIN_TOKEN" engineering Engineering)"
  TID[design]="$(ensure_team "$ADMIN_TOKEN" design Design)"
  TID[ops]="$(ensure_team "$ADMIN_TOKEN" ops Operations)"

  echo "[seed] adding all 10 users to all 3 teams ..."
  for team in engineering design ops; do
    for u in alice bob carol dave eve frank grace heidi ivan judy; do
      add_user_to_team "$ADMIN_TOKEN" "${TID[$team]}" "${UID_OF[$u]}"
    done
  done

  echo "[seed] creating 5 channels per team (town-square + off-topic auto, +3 custom) ..."
  # town-square and off-topic are created automatically with the team -- we
  # only need to create the 3 custom channels per team.
  declare -A CID
  CID[eng-backend]="$(ensure_channel "$ADMIN_TOKEN" "${TID[engineering]}" backend Backend)"
  CID[eng-frontend]="$(ensure_channel "$ADMIN_TOKEN" "${TID[engineering]}" frontend Frontend)"
  CID[eng-releases]="$(ensure_channel "$ADMIN_TOKEN" "${TID[engineering]}" releases Releases)"
  CID[des-visual]="$(ensure_channel "$ADMIN_TOKEN" "${TID[design]}" visual Visual)"
  CID[des-ux]="$(ensure_channel "$ADMIN_TOKEN" "${TID[design]}" ux UX)"
  CID[des-brand]="$(ensure_channel "$ADMIN_TOKEN" "${TID[design]}" brand Brand)"
  CID[ops-incidents]="$(ensure_channel "$ADMIN_TOKEN" "${TID[ops]}" incidents Incidents)"
  CID[ops-deploys]="$(ensure_channel "$ADMIN_TOKEN" "${TID[ops]}" deploys Deploys)"
  CID[ops-oncall]="$(ensure_channel "$ADMIN_TOKEN" "${TID[ops]}" on-call On-Call)"

  echo "[seed] adding posters (alice-eve) to each custom channel ..."
  for key in eng-backend eng-frontend eng-releases \
             des-visual des-ux des-brand \
             ops-incidents ops-deploys ops-oncall; do
    for u in alice bob carol dave eve; do
      add_user_to_channel "$ADMIN_TOKEN" "${CID[$key]}" "${UID_OF[$u]}"
    done
  done

  echo "[seed] posting 30 messages (round-robin) across 9 custom channels ..."
  local posters=(alice bob carol dave eve)
  local channels=(eng-backend eng-frontend eng-releases \
                  des-visual des-ux des-brand \
                  ops-incidents ops-deploys ops-oncall)
  # 9 channels x ~3.33 messages = 30 total. Distribution: 3,3,3,3,3,3,4,4,4
  local counts=(3 3 3 3 3 3 4 4 4)
  local msg_idx=0
  for i in "${!channels[@]}"; do
    local ch_key="${channels[$i]}"
    local n="${counts[$i]}"
    for j in $(seq 1 "$n"); do
      local poster="${posters[$((msg_idx % 5))]}"
      local body_text="Seeded message #${msg_idx} from ${poster} in ${ch_key}. Visual oracle bench corpus."
      post_message "${TOK_OF[$poster]}" "${CID[$ch_key]}" "$body_text"
      msg_idx=$((msg_idx + 1))
    done
  done

  echo "[seed] verifying ..."
  local team_count user_count channel_count
  team_count="$(curl -sS -H "Authorization: Bearer ${ADMIN_TOKEN}" \
                  "${MM_BASE_URL}/teams" | jq -r 'length')"
  user_count="$(curl -sS -H "Authorization: Bearer ${ADMIN_TOKEN}" \
                  "${MM_BASE_URL}/users?per_page=50" | jq -r 'length')"
  channel_count="$(curl -sS -H "Authorization: Bearer ${ADMIN_TOKEN}" \
                    "${MM_BASE_URL}/channels?per_page=100" | jq -r 'length')"
  echo "[seed]   teams=${team_count} users=${user_count} channels=${channel_count}"
  echo "[seed]   (channels count includes town-square + off-topic auto-created per team)"
  echo "[seed] done."
}

main "$@"
