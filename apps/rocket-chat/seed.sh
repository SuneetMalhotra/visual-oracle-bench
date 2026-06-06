#!/usr/bin/env bash
# apps/rocket-chat/seed.sh
#
# Seed a running Rocket.Chat instance with the deterministic fixture
# used by the visual-oracle-bench capture run. Idempotent: every create
# is preceded by a list/info call that returns the existing entity if
# present (Rocket.Chat REST returns `errorType: "error-duplicate-..."`
# on duplicate creates, which we tolerate).
#
# Fixture spec (pre-registered):
#   - 5 users    : 1 admin (created at first boot via ADMIN_USERNAME env
#                  in docker-compose.yml), 4 regular: alice, bob, carol, dave
#   - 3 channels : general, random, dev
#       (NB: `general` is auto-created by Rocket.Chat at first boot; we
#        treat it as pre-existing and join all users to it.)
#   - 15 messages : 5 per channel, round-robin authors across all 5 users
#
# Requires: bash, curl, jq
# Default API: http://localhost:3001/api/v1  (override with ROCKET_BASE_URL env var)

set -euo pipefail

ROCKET_BASE_URL="${ROCKET_BASE_URL:-http://localhost:3001}"
API_BASE_URL="${ROCKET_BASE_URL}/api/v1"
ADMIN_USER="admin"
ADMIN_PASSWORD="voracle-seed-Pa55word!"
USER_PASSWORD="voracle-seed-Pa55word!"

ADMIN_AUTH_TOKEN=""
ADMIN_USER_ID=""

# Per-app conventions: never echo tokens; suppress curl progress; fail on non-2xx.
curl_json() {
  # $1 = method, $2 = path, $3 = body (json string, may be empty)
  local method="$1" path="$2" body="${3:-}"
  local -a hdr=(-sS -H 'Content-Type: application/json' -H 'Accept: application/json'
                -H "X-Auth-Token: ${ADMIN_AUTH_TOKEN}"
                -H "X-User-Id: ${ADMIN_USER_ID}")
  if [[ -n "$body" ]]; then
    curl "${hdr[@]}" -X "$method" -d "$body" "${API_BASE_URL}${path}"
  else
    curl "${hdr[@]}" -X "$method" "${API_BASE_URL}${path}"
  fi
}

# Unauthenticated variant for /login + /info bootstrap.
curl_json_noauth() {
  local method="$1" path="$2" body="${3:-}"
  local -a hdr=(-sS -H 'Content-Type: application/json' -H 'Accept: application/json')
  if [[ -n "$body" ]]; then
    curl "${hdr[@]}" -X "$method" -d "$body" "${API_BASE_URL}${path}"
  else
    curl "${hdr[@]}" -X "$method" "${API_BASE_URL}${path}"
  fi
}

wait_for_api() {
  echo "[seed] waiting for ${API_BASE_URL}/info ..."
  for i in $(seq 1 60); do
    if curl -sS -o /dev/null -w '%{http_code}' "${API_BASE_URL}/info" | grep -qE '^200$'; then
      echo "[seed] api ready (after ${i} probes)"
      return 0
    fi
    sleep 3
  done
  echo "[seed] rocket.chat never became ready after 180s" >&2
  echo "[seed] try: docker compose -f apps/rocket-chat/docker-compose.yml logs rocketchat | tail -50" >&2
  exit 1
}

login_admin() {
  # POST /api/v1/login returns { status: "success", data: { authToken, userId } }
  local resp
  resp="$(curl_json_noauth POST "/login" \
            "$(jq -n --arg u "$ADMIN_USER" --arg p "$ADMIN_PASSWORD" \
                  '{user:$u, password:$p}')")"
  ADMIN_AUTH_TOKEN="$(echo "$resp" | jq -r '.data.authToken // empty')"
  ADMIN_USER_ID="$(echo "$resp" | jq -r '.data.userId // empty')"
  if [[ -z "$ADMIN_AUTH_TOKEN" || -z "$ADMIN_USER_ID" ]]; then
    echo "[seed] failed to login as admin" >&2
    echo "[seed] response: $resp" >&2
    echo "[seed] check that docker-compose.yml seeded ADMIN_USERNAME=$ADMIN_USER / ADMIN_PASS=$ADMIN_PASSWORD" >&2
    exit 1
  fi
}

create_user_if_missing() {
  local username="$1" email="$2" name="$3"
  local existing user_id
  # /users.info returns 200 + { user: {...} } if found; 400 if not.
  existing="$(curl_json GET "/users.info?username=${username}")"
  user_id="$(echo "$existing" | jq -r '.user._id // empty')"
  if [[ -n "$user_id" ]]; then
    echo "[seed]   user already present: $username ($user_id)"
    return 0
  fi
  local payload resp
  payload="$(jq -n --arg u "$username" --arg e "$email" --arg n "$name" --arg p "$USER_PASSWORD" \
              '{username:$u, email:$e, name:$n, password:$p,
                active:true, verified:true, requirePasswordChange:false,
                sendWelcomeEmail:false, joinDefaultChannels:true}')"
  resp="$(curl_json POST "/users.create" "$payload")"
  user_id="$(echo "$resp" | jq -r '.user._id // empty')"
  if [[ -z "$user_id" ]]; then
    # Tolerate `error-field-unavailable` (username taken in a race) by re-checking.
    if echo "$resp" | grep -q 'error-field-unavailable\|already in use'; then
      echo "[seed]   user already present (race): $username"
      return 0
    fi
    echo "[seed] failed to create user: $username" >&2
    echo "[seed] response: $resp" >&2
    exit 1
  fi
  echo "[seed]   created user: $username ($user_id)"
}

create_channel_if_missing() {
  local name="$1"
  local existing room_id
  existing="$(curl_json GET "/channels.info?roomName=${name}")"
  room_id="$(echo "$existing" | jq -r '.channel._id // empty')"
  if [[ -n "$room_id" ]]; then
    echo "[seed]   channel already present: #$name ($room_id)" >&2
    printf '%s' "$room_id"
    return 0
  fi
  local payload resp
  # `members: [all-five-users]` makes them visible immediately in everyone's
  # sidebar -- important for the channel-sidebar capture surface.
  payload="$(jq -n --arg n "$name" \
              '{name:$n, members:["alice","bob","carol","dave"],
                readOnly:false}')"
  resp="$(curl_json POST "/channels.create" "$payload")"
  room_id="$(echo "$resp" | jq -r '.channel._id // empty')"
  if [[ -z "$room_id" ]]; then
    if echo "$resp" | grep -q 'name-already-exists\|error-duplicate-channel-name'; then
      # Re-fetch and return the existing id.
      existing="$(curl_json GET "/channels.info?roomName=${name}")"
      room_id="$(echo "$existing" | jq -r '.channel._id // empty')"
      if [[ -n "$room_id" ]]; then
        echo "[seed]   channel already present (race): #$name ($room_id)" >&2
        printf '%s' "$room_id"
        return 0
      fi
    fi
    echo "[seed] failed to create channel: $name" >&2
    echo "[seed] response: $resp" >&2
    exit 1
  fi
  echo "[seed]   created channel: #$name ($room_id)" >&2
  printf '%s' "$room_id"
}

ensure_membership() {
  # Ensure all four regular users are in the given channel; tolerate
  # already-in-room errors.
  local room_id="$1"
  for u in alice bob carol dave; do
    local payload resp
    payload="$(jq -n --arg r "$room_id" --arg u "$u" \
                '{roomId:$r, username:$u}')"
    resp="$(curl_json POST "/channels.invite" "$payload" || true)"
    # Acceptable errors: "user-already-in-room" or success.
    if echo "$resp" | jq -e '.success == true' >/dev/null 2>&1; then
      continue
    fi
    if echo "$resp" | grep -q 'user-already-in-room\|already-in-channel'; then
      continue
    fi
    # Other errors are non-fatal here (the user may not yet exist on the
    # first invocation if create_user races); log and move on.
    echo "[seed]   note: invite $u -> $room_id soft-failed: $(echo "$resp" | jq -c '.error // .message // .')" >&2
  done
}

# Idempotent message-post: search /chat.search for an exact-text match on
# the channel before posting. Rocket.Chat does not return a stable message
# id by content out-of-the-box, but `chat.search?searchText=<exact>` is
# good enough for the unique seeded strings we emit.
post_message_if_missing() {
  local room_id="$1" sender_user="$2" text="$3"
  local existing match
  # /chat.search?roomId=...&searchText=...
  local encoded_text
  encoded_text="$(printf '%s' "$text" | jq -sRr @uri)"
  existing="$(curl_json GET "/chat.search?roomId=${room_id}&searchText=${encoded_text}")"
  match="$(echo "$existing" | jq -r --arg t "$text" '.messages // [] | map(select(.msg == $t)) | .[0]._id // empty')"
  if [[ -n "$match" ]]; then
    echo "[seed]   message already present in $room_id (by $sender_user)" >&2
    return 0
  fi
  # `sendMessage` requires `_id` (we let server generate) and the `alias`
  # field can override the displayed sender, but messages MUST be posted
  # by a session-authenticated user for `u` to reflect them. To post as
  # alice/bob/etc, we need their tokens. Two options:
  #   (a) login as each user and post (adds 4 logins per run)
  #   (b) admin posts on behalf of users via `users.impersonate` or by
  #       creating per-user tokens at admin time.
  # We pick a simpler third route: admin uses `/chat.postMessage` with
  # `avatar` + `alias` to attribute the message visually, while the actual
  # `u` field is admin. This is sufficient for screenshot purposes (the
  # visible author name is the alias). RUNBOOK.md notes this caveat.
  local payload resp
  payload="$(jq -n --arg r "$room_id" --arg t "$text" --arg a "$sender_user" \
              '{roomId:$r, text:$t, alias:$a}')"
  resp="$(curl_json POST "/chat.postMessage" "$payload")"
  if ! echo "$resp" | jq -e '.success == true' >/dev/null 2>&1; then
    echo "[seed] failed to post message in $room_id (by $sender_user)" >&2
    echo "[seed] response: $resp" >&2
    exit 1
  fi
}

main() {
  command -v jq >/dev/null || { echo "[seed] jq required" >&2; exit 1; }
  command -v curl >/dev/null || { echo "[seed] curl required" >&2; exit 1; }

  wait_for_api
  echo "[seed] logging in as admin ..."
  login_admin

  echo "[seed] creating 4 regular users ..."
  create_user_if_missing "alice" "alice@voracle.test" "Alice Example"
  create_user_if_missing "bob"   "bob@voracle.test"   "Bob Example"
  create_user_if_missing "carol" "carol@voracle.test" "Carol Example"
  create_user_if_missing "dave"  "dave@voracle.test"  "Dave Example"

  echo "[seed] resolving / creating 3 channels ..."
  # `general` is auto-created by Rocket.Chat on first boot; we just look
  # it up. `random` and `dev` we create.
  local r_general r_random r_dev
  r_general="$(curl_json GET "/channels.info?roomName=general" | jq -r '.channel._id // empty')"
  if [[ -z "$r_general" ]]; then
    # If `general` does not exist (rare edge case after a delete), create it.
    r_general="$(create_channel_if_missing "general")"
  else
    echo "[seed]   channel already present: #general ($r_general)"
  fi
  r_random="$(create_channel_if_missing "random")"
  r_dev="$(create_channel_if_missing "dev")"

  echo "[seed] ensuring all 4 users are members of all 3 channels ..."
  ensure_membership "$r_general"
  ensure_membership "$r_random"
  ensure_membership "$r_dev"

  echo "[seed] posting 15 messages (5 per channel, round-robin authors) ..."
  local authors=(alice bob carol dave admin)
  local i=0
  for room in "$r_general" "$r_random" "$r_dev"; do
    # 5 messages per channel; round-robin across 5 authors so each author
    # posts once per channel.
    local channel_name
    case "$room" in
      "$r_general") channel_name="general" ;;
      "$r_random")  channel_name="random"  ;;
      "$r_dev")     channel_name="dev"     ;;
    esac
    for n in 1 2 3 4 5; do
      local author="${authors[$(((n - 1 + i) % 5))]}"
      local text="[voracle-seed] hello from ${author} in #${channel_name} (msg ${n})"
      post_message_if_missing "$room" "$author" "$text"
    done
    i=$((i + 1))
  done

  echo "[seed] verifying ..."
  local user_count channel_count
  user_count="$(curl_json GET "/users.list?count=100" | jq -r '.total // .users | if type=="array" then length else . end')"
  channel_count="$(curl_json GET "/channels.list?count=100" | jq -r '.total // .channels | if type=="array" then length else . end')"
  echo "[seed]   users=${user_count} channels=${channel_count}"
  echo "[seed] done."
}

main "$@"
