#!/usr/bin/env bash
# apps/conduit/seed.sh
#
# Seed a running Conduit backend with the deterministic fixture used by the
# benchmark capture run. Idempotent: re-registers users if they already exist
# (login fallback), re-creates articles only if their slug is not yet present.
#
# Fixture spec (pre-registered):
#   - 5 users  : alice, bob, carol, dave, eve
#   - 5 tags   : ai, testing, opensource, longread, demo
#   - 10 articles : 2 per author, deterministic titles + bodies
#   - 20 comments : 2 per article, round-robin across authors
#
# Requires: bash, curl, jq
# Default API: http://localhost:3000/api  (override with API_BASE_URL env var)

set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:3000/api}"
PASSWORD="voracle-seed-Pa55word!"

# Per-app conventions: never echo tokens; suppress curl progress; fail on non-2xx.
curl_json() {
  # $1 = method, $2 = path, $3 = body (json string, may be empty), $4 = optional bearer token
  local method="$1" path="$2" body="${3:-}" token="${4:-}"
  local -a hdr=(-sS -H 'Content-Type: application/json' -H 'Accept: application/json')
  [[ -n "$token" ]] && hdr+=(-H "Authorization: Token ${token}")
  if [[ -n "$body" ]]; then
    curl "${hdr[@]}" -X "$method" -d "$body" "${API_BASE_URL}${path}"
  else
    curl "${hdr[@]}" -X "$method" "${API_BASE_URL}${path}"
  fi
}

wait_for_api() {
  echo "[seed] waiting for ${API_BASE_URL}/tags ..."
  for i in $(seq 1 30); do
    if curl -sS -o /dev/null -w '%{http_code}' "${API_BASE_URL}/tags" | grep -qE '^2'; then
      echo "[seed] api ready"
      return 0
    fi
    sleep 2
  done
  echo "[seed] api never became ready" >&2
  exit 1
}

register_or_login() {
  # echoes the auth token for the user
  local username="$1" email="$2"
  local body resp token
  body="$(jq -n --arg u "$username" --arg e "$email" --arg p "$PASSWORD" \
            '{user:{username:$u, email:$e, password:$p}}')"
  resp="$(curl_json POST /users "$body" || true)"
  token="$(echo "$resp" | jq -r '.user.token // empty')"
  if [[ -z "$token" ]]; then
    # likely already exists -> login
    body="$(jq -n --arg e "$email" --arg p "$PASSWORD" '{user:{email:$e, password:$p}}')"
    resp="$(curl_json POST /users/login "$body")"
    token="$(echo "$resp" | jq -r '.user.token // empty')"
  fi
  if [[ -z "$token" ]]; then
    echo "[seed] failed to obtain token for $username" >&2
    echo "[seed] response: $resp" >&2
    exit 1
  fi
  printf '%s' "$token"
}

create_article_if_missing() {
  local token="$1" title="$2" desc="$3" body="$4" tags_json="$5"
  local slug
  slug="$(echo "$title" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')"
  # GET first; only POST if missing.
  if curl -sS -o /dev/null -w '%{http_code}' "${API_BASE_URL}/articles/${slug}" | grep -qE '^2'; then
    echo "[seed]   article already present: $slug"
    printf '%s' "$slug"
    return 0
  fi
  local payload
  payload="$(jq -n --arg t "$title" --arg d "$desc" --arg b "$body" --argjson tags "$tags_json" \
              '{article:{title:$t, description:$d, body:$b, tagList:$tags}}')"
  local resp
  resp="$(curl_json POST /articles "$payload" "$token")"
  slug="$(echo "$resp" | jq -r '.article.slug // empty')"
  if [[ -z "$slug" ]]; then
    echo "[seed] failed to create article: $title" >&2
    echo "[seed] response: $resp" >&2
    exit 1
  fi
  echo "[seed]   created article: $slug"
  printf '%s' "$slug"
}

add_comment() {
  local token="$1" slug="$2" body="$3"
  local payload
  payload="$(jq -n --arg b "$body" '{comment:{body:$b}}')"
  curl_json POST "/articles/${slug}/comments" "$payload" "$token" >/dev/null
}

main() {
  command -v jq >/dev/null || { echo "[seed] jq required" >&2; exit 1; }
  command -v curl >/dev/null || { echo "[seed] curl required" >&2; exit 1; }

  wait_for_api

  echo "[seed] registering 5 users ..."
  declare -A TOK
  for entry in "alice:alice@voracle.test" \
               "bob:bob@voracle.test" \
               "carol:carol@voracle.test" \
               "dave:dave@voracle.test" \
               "eve:eve@voracle.test"; do
    user="${entry%:*}" email="${entry#*:}"
    TOK[$user]="$(register_or_login "$user" "$email")"
    echo "[seed]   ok: $user"
  done

  echo "[seed] creating 10 articles (2 per author) with 5 tags ..."
  # 5 tags: ai, testing, opensource, longread, demo
  declare -a ARTICLES
  ARTICLES+=("$(create_article_if_missing "${TOK[alice]}" \
    "Visual Oracle Bench Overview" \
    "Why multi-app visual regression matters" \
    "This article introduces the Visual Oracle Bench corpus." \
    '["ai","testing"]')")
  ARTICLES+=("$(create_article_if_missing "${TOK[alice]}" \
    "Seeded Defects 101" \
    "A taxonomy of injected defects" \
    "Layout, color, missing, truncation, zorder, contrast." \
    '["testing","opensource"]')")
  ARTICLES+=("$(create_article_if_missing "${TOK[bob]}" \
    "Pixel Diff Is Not Enough" \
    "On the limits of SSIM" \
    "Pixel comparisons miss semantics; LLM judges miss structure." \
    '["ai","longread"]')")
  ARTICLES+=("$(create_article_if_missing "${TOK[bob]}" \
    "Perceptual Hash Pitfalls" \
    "dHash and friends" \
    "Hash thresholds need per-app calibration." \
    '["testing","longread"]')")
  ARTICLES+=("$(create_article_if_missing "${TOK[carol]}" \
    "LLM as Judge in Practice" \
    "Real benchmark numbers" \
    "Four models, eight apps, eight hundred image pairs." \
    '["ai","demo"]')")
  ARTICLES+=("$(create_article_if_missing "${TOK[carol]}" \
    "Cohen Kappa for Practitioners" \
    "Stop reporting raw accuracy" \
    "Kappa controls for chance agreement; report bootstrap CIs." \
    '["testing","longread"]')")
  ARTICLES+=("$(create_article_if_missing "${TOK[dave]}" \
    "Mixed Effects Models in Empirical SE" \
    "Why random intercepts matter" \
    "App-level variance dwarfs defect-category variance in our pilot." \
    '["longread","opensource"]')")
  ARTICLES+=("$(create_article_if_missing "${TOK[dave]}" \
    "Docker Pinning Strategies" \
    "SHA vs tag vs digest" \
    "Pin to image digest or upstream commit SHA, never to a moving tag." \
    '["opensource","demo"]')")
  ARTICLES+=("$(create_article_if_missing "${TOK[eve]}" \
    "Pre-registration as Engineering" \
    "OSF for systems papers" \
    "Lock hypotheses, exclusion rules, and analysis plans before data." \
    '["longread","ai"]')")
  ARTICLES+=("$(create_article_if_missing "${TOK[eve]}" \
    "Reproducibility Beyond a README" \
    "Single-command reproduction" \
    "If your reproduction takes more than one command, it does not reproduce." \
    '["opensource","demo"]')")

  echo "[seed] adding 20 comments (2 per article, round-robin) ..."
  local commenters=(alice bob carol dave eve)
  local i=0
  for slug in "${ARTICLES[@]}"; do
    [[ -z "$slug" ]] && continue
    local c1="${commenters[$((i % 5))]}"
    local c2="${commenters[$(((i + 2) % 5))]}"
    add_comment "${TOK[$c1]}" "$slug" "Nice writeup. Linking this in our next meeting."
    add_comment "${TOK[$c2]}" "$slug" "Curious about the threshold calibration -- have you tried Youden's J?"
    i=$((i + 1))
  done

  echo "[seed] verifying ..."
  local tag_count article_count
  tag_count="$(curl -sS "${API_BASE_URL}/tags" | jq -r '.tags | length')"
  article_count="$(curl -sS "${API_BASE_URL}/articles?limit=100" | jq -r '.articlesCount')"
  echo "[seed]   tags=${tag_count} articles=${article_count}"
  echo "[seed] done."
}

main "$@"
