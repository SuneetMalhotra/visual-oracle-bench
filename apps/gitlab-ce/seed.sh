#!/usr/bin/env bash
# apps/gitlab-ce/seed.sh
#
# Seed a running GitLab CE instance with the deterministic fixture used
# by the visual-oracle-bench capture run. Idempotent: every create is
# preceded by a GET that returns the existing entity if present.
#
# Fixture spec (pre-registered):
#   - 1 admin       : root (created at first boot by the GitLab image)
#   - 3 regular users : alice, bob, carol (created via /api/v4/users)
#   - 2 groups      : engineering, design
#   - 5 projects    :
#       - engineering/oracle-bench-core   (group-owned)
#       - engineering/seedings-catalog    (group-owned)
#       - alice/notes                     (user-owned)
#       - bob/scratchpad                  (user-owned)
#       - carol/playground                (user-owned)
#   - 10 issues     : distributed across the 5 projects (2 each)
#   - 5 merge requests : one per project, all in 'opened' state
#
# Requires: bash, curl, jq
# Default API: http://localhost:8080/api/v4  (override with GITLAB_BASE_URL env var)
#
# First-run-only branch:
#   On a brand new GitLab instance the admin root user is created during
#   the omnibus reconfigure step with the password we set via
#   `initial_root_password` in docker-compose.yml ("voracle-seed-Pa55word!").
#   We use that to obtain an OAuth2 password-grant access token. On every
#   subsequent run the same login still works (we did NOT trigger the
#   force-password-change flow because we set the password BEFORE first
#   boot, not after).

set -euo pipefail

GITLAB_BASE_URL="${GITLAB_BASE_URL:-http://localhost:8080}"
API_BASE_URL="${GITLAB_BASE_URL}/api/v4"
ROOT_PASSWORD="voracle-seed-Pa55word!"
USER_PASSWORD="voracle-seed-Pa55word!"

# Per-app conventions: never echo tokens; suppress curl progress; fail on non-2xx.
curl_json() {
  # $1 = method, $2 = path, $3 = body (json string, may be empty), $4 = optional bearer token
  local method="$1" path="$2" body="${3:-}" token="${4:-}"
  local -a hdr=(-sS -H 'Content-Type: application/json' -H 'Accept: application/json')
  [[ -n "$token" ]] && hdr+=(-H "PRIVATE-TOKEN: ${token}")
  if [[ -n "$body" ]]; then
    curl "${hdr[@]}" -X "$method" -d "$body" "${API_BASE_URL}${path}"
  else
    curl "${hdr[@]}" -X "$method" "${API_BASE_URL}${path}"
  fi
}

wait_for_api() {
  echo "[seed] waiting for ${GITLAB_BASE_URL}/-/health ..."
  # GitLab's first-reconfigure can take 3-5 minutes. Be patient.
  for i in $(seq 1 120); do
    if curl -sS -o /dev/null -w '%{http_code}' "${GITLAB_BASE_URL}/-/health" | grep -qE '^200$'; then
      echo "[seed] api ready (after ${i} probes)"
      return 0
    fi
    sleep 5
  done
  echo "[seed] gitlab never became ready after 600s" >&2
  echo "[seed] try: docker compose -f apps/gitlab-ce/docker-compose.yml logs gitlab | tail -50" >&2
  exit 1
}

obtain_root_token() {
  # Use OAuth2 password grant to convert the seeded root password into a
  # short-lived access_token. This avoids the manual PAT-creation dance.
  # We mark the token as having `api` + `read_user` + `sudo` scopes
  # implicitly (password grant returns full-scope tokens for root).
  local resp token
  resp="$(curl -sS -X POST "${GITLAB_BASE_URL}/oauth/token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg p "$ROOT_PASSWORD" \
            '{grant_type:"password", username:"root", password:$p}')")"
  token="$(echo "$resp" | jq -r '.access_token // empty')"
  if [[ -z "$token" ]]; then
    echo "[seed] failed to obtain root oauth token" >&2
    echo "[seed] response: $resp" >&2
    echo "[seed] check that docker-compose.yml seeded initial_root_password=$ROOT_PASSWORD" >&2
    exit 1
  fi
  printf '%s' "$token"
}

# OAuth tokens for /api/v4 must be sent as Bearer, not PRIVATE-TOKEN.
curl_oauth() {
  local method="$1" path="$2" body="${3:-}" token="$4"
  local -a hdr=(-sS -H 'Content-Type: application/json' -H 'Accept: application/json'
                -H "Authorization: Bearer ${token}")
  if [[ -n "$body" ]]; then
    curl "${hdr[@]}" -X "$method" -d "$body" "${API_BASE_URL}${path}"
  else
    curl "${hdr[@]}" -X "$method" "${API_BASE_URL}${path}"
  fi
}

create_user_if_missing() {
  # echoes the numeric user id
  local token="$1" username="$2" email="$3" name="$4"
  local existing id
  existing="$(curl_oauth GET "/users?username=${username}" "" "$token")"
  id="$(echo "$existing" | jq -r '.[0].id // empty')"
  if [[ -n "$id" ]]; then
    echo "[seed]   user already present: $username (id=$id)" >&2
    printf '%s' "$id"
    return 0
  fi
  local payload resp
  payload="$(jq -n --arg u "$username" --arg e "$email" --arg n "$name" --arg p "$USER_PASSWORD" \
              '{username:$u, email:$e, name:$n, password:$p,
                skip_confirmation:true, can_create_group:true}')"
  resp="$(curl_oauth POST "/users" "$payload" "$token")"
  id="$(echo "$resp" | jq -r '.id // empty')"
  if [[ -z "$id" ]]; then
    echo "[seed] failed to create user: $username" >&2
    echo "[seed] response: $resp" >&2
    exit 1
  fi
  echo "[seed]   created user: $username (id=$id)" >&2
  printf '%s' "$id"
}

create_group_if_missing() {
  # echoes the numeric group id
  local token="$1" path="$2" name="$3"
  local existing id
  existing="$(curl_oauth GET "/groups/${path}" "" "$token")"
  id="$(echo "$existing" | jq -r '.id // empty')"
  if [[ -n "$id" ]]; then
    echo "[seed]   group already present: $path (id=$id)" >&2
    printf '%s' "$id"
    return 0
  fi
  local payload resp
  payload="$(jq -n --arg p "$path" --arg n "$name" \
              '{path:$p, name:$n, visibility:"internal"}')"
  resp="$(curl_oauth POST "/groups" "$payload" "$token")"
  id="$(echo "$resp" | jq -r '.id // empty')"
  if [[ -z "$id" ]]; then
    echo "[seed] failed to create group: $path" >&2
    echo "[seed] response: $resp" >&2
    exit 1
  fi
  echo "[seed]   created group: $path (id=$id)" >&2
  printf '%s' "$id"
}

create_project_if_missing() {
  # echoes the numeric project id
  # $1 token, $2 path-with-namespace ("engineering/oracle-bench-core" or "alice/notes"),
  # $3 namespace_id, $4 short name
  local token="$1" fullpath="$2" namespace_id="$3" name="$4"
  local project_path="${fullpath##*/}"
  local existing id
  # GitLab API: /projects/<URL-encoded-path-with-namespace>
  local encoded
  encoded="$(printf '%s' "$fullpath" | jq -sRr @uri)"
  existing="$(curl_oauth GET "/projects/${encoded}" "" "$token")"
  id="$(echo "$existing" | jq -r '.id // empty')"
  if [[ -n "$id" ]]; then
    echo "[seed]   project already present: $fullpath (id=$id)" >&2
    printf '%s' "$id"
    return 0
  fi
  local payload resp
  payload="$(jq -n --arg p "$project_path" --arg n "$name" \
                   --argjson ns "$namespace_id" \
              '{path:$p, name:$n, namespace_id:$ns,
                visibility:"internal", initialize_with_readme:true,
                default_branch:"main"}')"
  resp="$(curl_oauth POST "/projects" "$payload" "$token")"
  id="$(echo "$resp" | jq -r '.id // empty')"
  if [[ -z "$id" ]]; then
    echo "[seed] failed to create project: $fullpath" >&2
    echo "[seed] response: $resp" >&2
    exit 1
  fi
  echo "[seed]   created project: $fullpath (id=$id)" >&2
  printf '%s' "$id"
}

create_issue_if_missing() {
  local token="$1" project_id="$2" title="$3" description="$4"
  # GET issues filtered by exact title; idempotency check
  local existing iid
  existing="$(curl_oauth GET "/projects/${project_id}/issues?search=$(printf '%s' "$title" | jq -sRr @uri)&in=title" "" "$token")"
  iid="$(echo "$existing" | jq -r --arg t "$title" '.[] | select(.title == $t) | .iid' | head -n1)"
  if [[ -n "$iid" ]]; then
    echo "[seed]   issue already present: project=${project_id} iid=${iid} '${title}'" >&2
    return 0
  fi
  local payload resp
  payload="$(jq -n --arg t "$title" --arg d "$description" \
              '{title:$t, description:$d}')"
  resp="$(curl_oauth POST "/projects/${project_id}/issues" "$payload" "$token")"
  iid="$(echo "$resp" | jq -r '.iid // empty')"
  if [[ -z "$iid" ]]; then
    echo "[seed] failed to create issue: $title (project=$project_id)" >&2
    echo "[seed] response: $resp" >&2
    exit 1
  fi
  echo "[seed]   created issue: project=${project_id} iid=${iid} '${title}'" >&2
}

create_branch_if_missing() {
  local token="$1" project_id="$2" branch="$3" ref="$4"
  local existing
  existing="$(curl_oauth GET "/projects/${project_id}/repository/branches/${branch}" "" "$token")"
  if echo "$existing" | jq -e '.name' >/dev/null 2>&1; then
    echo "[seed]   branch already present: project=${project_id} ${branch}" >&2
    return 0
  fi
  local payload resp
  payload="$(jq -n --arg b "$branch" --arg r "$ref" \
              '{branch:$b, ref:$r}')"
  resp="$(curl_oauth POST "/projects/${project_id}/repository/branches" "$payload" "$token")"
  if ! echo "$resp" | jq -e '.name' >/dev/null 2>&1; then
    echo "[seed] failed to create branch: $branch (project=$project_id)" >&2
    echo "[seed] response: $resp" >&2
    exit 1
  fi
  echo "[seed]   created branch: project=${project_id} ${branch}" >&2
}

commit_file_to_branch() {
  # Create or update a file so the branch diverges from main, enabling MR creation.
  local token="$1" project_id="$2" branch="$3" path="$4" content="$5"
  # Check if file exists on branch.
  local check
  check="$(curl_oauth GET "/projects/${project_id}/repository/files/$(printf '%s' "$path" | jq -sRr @uri)?ref=${branch}" "" "$token")"
  local action="create"
  if echo "$check" | jq -e '.file_path' >/dev/null 2>&1; then
    action="update"
  fi
  local payload
  payload="$(jq -n --arg b "$branch" --arg p "$path" --arg c "$content" \
                   --arg cm "voracle-bench: seed ${path} on ${branch}" \
                   --arg a "$action" \
              '{branch:$b, commit_message:$cm,
                actions:[{action:$a, file_path:$p, content:$c}]}')"
  local resp
  resp="$(curl_oauth POST "/projects/${project_id}/repository/commits" "$payload" "$token")"
  if ! echo "$resp" | jq -e '.id' >/dev/null 2>&1; then
    # Acceptable: "A file with this name already exists" on re-run when we
    # raced with our own previous commit -- treat as idempotent success.
    if echo "$resp" | grep -q 'already exists'; then
      return 0
    fi
    echo "[seed] failed to commit ${path} on ${branch} (project=$project_id)" >&2
    echo "[seed] response: $resp" >&2
    exit 1
  fi
}

create_mr_if_missing() {
  local token="$1" project_id="$2" source_branch="$3" target_branch="$4" title="$5"
  local existing iid
  existing="$(curl_oauth GET "/projects/${project_id}/merge_requests?state=opened&source_branch=${source_branch}" "" "$token")"
  iid="$(echo "$existing" | jq -r '.[0].iid // empty')"
  if [[ -n "$iid" ]]; then
    echo "[seed]   MR already present: project=${project_id} !${iid} ${source_branch} -> ${target_branch}" >&2
    return 0
  fi
  local payload resp
  payload="$(jq -n --arg s "$source_branch" --arg t "$target_branch" --arg ti "$title" \
              '{source_branch:$s, target_branch:$t, title:$ti,
                description:"Seeded by voracle-bench seed.sh", remove_source_branch:false}')"
  resp="$(curl_oauth POST "/projects/${project_id}/merge_requests" "$payload" "$token")"
  iid="$(echo "$resp" | jq -r '.iid // empty')"
  if [[ -z "$iid" ]]; then
    echo "[seed] failed to create MR: $source_branch -> $target_branch (project=$project_id)" >&2
    echo "[seed] response: $resp" >&2
    exit 1
  fi
  echo "[seed]   created MR: project=${project_id} !${iid} ${source_branch} -> ${target_branch}" >&2
}

main() {
  command -v jq >/dev/null || { echo "[seed] jq required" >&2; exit 1; }
  command -v curl >/dev/null || { echo "[seed] curl required" >&2; exit 1; }

  wait_for_api

  echo "[seed] obtaining root OAuth token ..."
  local ROOT_TOKEN
  ROOT_TOKEN="$(obtain_root_token)"

  echo "[seed] creating 3 regular users ..."
  local alice_id bob_id carol_id
  alice_id="$(create_user_if_missing "$ROOT_TOKEN" "alice" "alice@voracle.test" "Alice Example")"
  bob_id="$(create_user_if_missing   "$ROOT_TOKEN" "bob"   "bob@voracle.test"   "Bob Example")"
  carol_id="$(create_user_if_missing "$ROOT_TOKEN" "carol" "carol@voracle.test" "Carol Example")"

  echo "[seed] creating 2 groups ..."
  local eng_id design_id
  eng_id="$(create_group_if_missing    "$ROOT_TOKEN" "engineering" "Engineering")"
  design_id="$(create_group_if_missing "$ROOT_TOKEN" "design"      "Design")"

  echo "[seed] creating 5 projects (2 group-owned, 3 user-owned) ..."
  # Resolve per-user namespace ids (each user has a personal namespace
  # of the same id as their user_id by GitLab convention, but we look
  # it up explicitly to be safe).
  local alice_ns bob_ns carol_ns
  alice_ns="$(curl_oauth GET "/namespaces/alice" "" "$ROOT_TOKEN" | jq -r '.id')"
  bob_ns="$(curl_oauth   GET "/namespaces/bob"   "" "$ROOT_TOKEN" | jq -r '.id')"
  carol_ns="$(curl_oauth GET "/namespaces/carol" "" "$ROOT_TOKEN" | jq -r '.id')"

  local p_core p_seed p_notes p_scratch p_play
  p_core="$(create_project_if_missing    "$ROOT_TOKEN" "engineering/oracle-bench-core" "$eng_id"   "oracle-bench-core")"
  p_seed="$(create_project_if_missing    "$ROOT_TOKEN" "engineering/seedings-catalog"  "$eng_id"   "seedings-catalog")"
  p_notes="$(create_project_if_missing   "$ROOT_TOKEN" "alice/notes"                   "$alice_ns" "notes")"
  p_scratch="$(create_project_if_missing "$ROOT_TOKEN" "bob/scratchpad"                "$bob_ns"   "scratchpad")"
  p_play="$(create_project_if_missing    "$ROOT_TOKEN" "carol/playground"              "$carol_ns" "playground")"

  echo "[seed] creating 10 issues (2 per project) ..."
  # 2 per project; titles encode project for human inspection of screenshots.
  create_issue_if_missing "$ROOT_TOKEN" "$p_core"    "Wire up the visual oracle harness"     "Acceptance: smoke pipeline produces 12 PNGs."
  create_issue_if_missing "$ROOT_TOKEN" "$p_core"    "Lock OSF pre-registration items"       "Section 12 items A, B, C."
  create_issue_if_missing "$ROOT_TOKEN" "$p_seed"    "Catalog 50 injection points per app"   "Distribution 8/8/8/8/9/9 across 6 categories."
  create_issue_if_missing "$ROOT_TOKEN" "$p_seed"    "Verify selectors post-Docker-build"    "All inferred selectors need a real-DOM pass."
  create_issue_if_missing "$ROOT_TOKEN" "$p_notes"   "Re-read Cohen 1960"                    "Compare with Fleiss 1971 for multi-rater."
  create_issue_if_missing "$ROOT_TOKEN" "$p_notes"   "Draft EMSE-track abstract"             "Target submission 2026-07-01."
  create_issue_if_missing "$ROOT_TOKEN" "$p_scratch" "Benchmark prompt-cache hit rate"       "Compare with cold path; target >= 90%."
  create_issue_if_missing "$ROOT_TOKEN" "$p_scratch" "Pin Gemini model checkpoint"           "Pin to specific snapshot, not latest."
  create_issue_if_missing "$ROOT_TOKEN" "$p_play"    "Try perceptual hash baseline"          "dHash + pHash; calibrate per app."
  create_issue_if_missing "$ROOT_TOKEN" "$p_play"    "Plot agreement curves"                 "Per-app kappa with bootstrap CIs."

  echo "[seed] creating branches + commits for 5 merge requests ..."
  # One MR per project, all 'opened'. We create a feature branch off main,
  # add one file to make it diverge, then open the MR.
  local mr_branch="feat/voracle-bench-seed"
  for p in "$p_core" "$p_seed" "$p_notes" "$p_scratch" "$p_play"; do
    create_branch_if_missing "$ROOT_TOKEN" "$p" "$mr_branch" "main"
    commit_file_to_branch    "$ROOT_TOKEN" "$p" "$mr_branch" \
      "SEED.md" \
      "# Visual Oracle Bench seed file\n\nThis file exists to create a non-empty diff for the seeded MR.\nProject id: ${p}\n"
    create_mr_if_missing     "$ROOT_TOKEN" "$p" "$mr_branch" "main" "Seed: add SEED.md (visual-oracle-bench)"
  done

  echo "[seed] verifying ..."
  local user_count group_count project_count
  user_count="$(curl_oauth   GET "/users?per_page=100"   "" "$ROOT_TOKEN" | jq -r 'length')"
  group_count="$(curl_oauth  GET "/groups?per_page=100"  "" "$ROOT_TOKEN" | jq -r 'length')"
  project_count="$(curl_oauth GET "/projects?per_page=100" "" "$ROOT_TOKEN" | jq -r 'length')"
  echo "[seed]   users=${user_count} groups=${group_count} projects=${project_count}"
  echo "[seed] done."
}

main "$@"
