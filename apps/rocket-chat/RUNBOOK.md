# Rocket.Chat — Onboarding Runbook

**Status:** W4 — files complete; docker build pending machine with Docker installed. Selectors are inferred from the upstream RocketChat/Rocket.Chat source at the `6.10.0` tag (matching the pinned image) and MUST be re-verified post-build (see "Known risks" #3).

## What this app provides for the benchmark

Rocket.Chat is a chat/collab class app in the visual-oracle-bench corpus — paired with Mattermost (W3) so the corpus has TWO chat apps on DIFFERENT stacks (Mattermost is React + Go, Rocket.Chat is Meteor + React + Blaze on Node). Selected for:
- Meteor + React + Blaze hybrid stack (different from Mattermost's React + Redux + Go). Newer UI surfaces use React + Fuselage (`.rcx-*` class names); legacy surfaces (some message-list internals, parts of the channel header) are Blaze templates with `.rc-*` classes.
- Documented REST API (`/api/v1/...`) with header-bearer auth (`X-Auth-Token` + `X-User-Id`), enabling fully scripted seed.
- 5 navigable UI surfaces: login (`/home` while unauthenticated), channel sidebar (always visible when authenticated), channel view (`/channel/<name>`), user-profile modal (opened by clicking a message avatar — same modal-via-click pattern as Mattermost's profile-popover), admin panel (`/admin/info`).

## Upstream pins (immutable digests)

| Component | Source | Pin | Pushed |
|---|---|---|---|
| Rocket.Chat server | `rocketchat/rocket.chat` (Docker Hub) | digest `sha256:1bb7f2e5dca5e7e0ad0d50c4d9c9e3c7a8e8e7a0c7b2b1c3d4e5f6a7b8c9d0e1` (tag `6.10.0`, **REVIEWER MUST VERIFY**) | 2024-04-19 |
| MongoDB | `mongo:7.0` (Docker Hub) | digest `sha256:2cc8f1e8dca6f7f0bc1e51d5e0d0e4c8b9f9f8b1d8c3c2d4e5f7a8b9c0d1e2f3` (**REVIEWER MUST VERIFY**) | (build-dependent) |
| Source for selector inference | `github.com/RocketChat/Rocket.Chat` | tag `6.10.0` | 2024-04-19 |

Both digests in `docker-compose.yml` are representative placeholders produced WITHOUT a real `docker pull` (Docker not installed on this dev machine). The reviewer must run:

```bash
docker pull rocketchat/rocket.chat:6.10.0
docker inspect --format='{{index .RepoDigests 0}}' rocketchat/rocket.chat:6.10.0
docker pull mongo:7.0
docker inspect --format='{{index .RepoDigests 0}}' mongo:7.0
```

and update both image lines in `docker-compose.yml` AND the `pinned_image_digest:` field in `injection-points.yaml` in lockstep. Tracked under "Known risks" #1.

The Rocket.Chat backend is NOT built from source (the Meteor build is slow and brittle outside the Rocket.Chat team's CI; the official `rocketchat/rocket.chat` image is the upstream-supported distribution).

## Bring-up sequence

```bash
# 1. Pull + start (first cold pull ~2-3 min for the two images, ~30-60s warm)
docker compose -f apps/rocket-chat/docker-compose.yml up -d

# 2. Wait for healthcheck. Mongo's rs.initiate() runs in the mongo
#    container's healthcheck (idempotent: re-runs if already initiated).
#    Rocket.Chat then waits for the replica-set oplog, runs first-boot
#    bootstrap (admin user via ADMIN_USERNAME env), starts Meteor, exposes
#    /api/info. Cold start to healthy is typically 30-60s.
while ! curl -sf http://localhost:3001/api/info >/dev/null; do
  echo "[wait] Rocket.Chat not yet healthy ..."; sleep 3
done
echo "[wait] Rocket.Chat is healthy"

# 3. Seed deterministic fixture (5 users, 3 channels, 15 messages)
./apps/rocket-chat/seed.sh

# 4. Smoke test the injection -> capture pipeline (12 PNGs)
npx tsx tests/smoke_rocket_chat_pipeline.ts
#    -> data/images/rocket-chat/

# 5. Teardown (deletes mongo volumes)
docker compose -f apps/rocket-chat/docker-compose.yml down -v
```

## Acceptance criteria

- `docker compose up -d` brings Mongo up (~10s, including `rs.initiate()`) then Rocket.Chat up on `localhost:3001` in <3 min cold start (assuming images not cached), <60s warm restart.
- `/api/info` returns 200 within 90s of `rocketchat` container start.
- `seed.sh` completes in <30s on a warm Rocket.Chat, is idempotent (re-running does not duplicate users / channels / messages and does not fail).
- `npx tsx tests/smoke_rocket_chat_pipeline.ts` produces 12 PNGs (6 baseline + 6 defect) under `data/images/rocket-chat/` and writes `_smoke_ledger.json` with the DefectRecord for each shot.

## Fixture seeded by `seed.sh`

| Entity | Count | Identifiers |
|---|---|---|
| Sysadmin | 1 | `admin` / `admin@voracle.test` / `voracle-seed-Pa55word!` (created by Rocket.Chat at first boot via `ADMIN_USERNAME`+`ADMIN_PASS` env) |
| Regular users | 4 | `alice`, `bob`, `carol`, `dave` (all `<name>@voracle.test`, all password `voracle-seed-Pa55word!`, all verified, all joined to default channels) |
| Channels | 3 | `general` (auto-created by Rocket.Chat first-boot), `random`, `dev` (created by seed.sh) — all four regular users are members of all three |
| Messages | 15 | 5 per channel; authors round-robin across all 5 users (admin + alice + bob + carol + dave) per channel, deterministic text encoding channel + author + index |

### Notes on message authorship

Rocket.Chat's REST API requires per-user session auth to post AS that user. To keep `seed.sh` simple (one admin login, no four-extra-logins), messages are POSTed via `/chat.postMessage` by admin with an `alias` field set to the intended author's username. This means:
- The VISIBLE author name in the message header is alice/bob/etc. (which is what the screenshot captures and what the LLM-as-judge will see).
- The UNDERLYING `u` field in the message document is `admin`. This is invisible in the UI but would be visible in raw API responses.

This is sufficient for screenshot-based benchmarking but DOES make this seed unsuitable for behavioral tests where bot/role permissions matter. RUNBOOK.md flags this; if a future workflow needs true per-user authorship, swap to a per-user-login flow in `seed.sh`.

## Known risks and mitigations (pre-registered)

1. **Image digests are unverified placeholders.** Both `rocketchat/rocket.chat:6.10.0` and `mongo:7.0` digests written into `docker-compose.yml` and `injection-points.yaml` were NOT produced by a real `docker pull` (Docker not installed on dev machine). The reviewer with Docker must replace them with the actual multi-arch index digests from `docker inspect` before W7 capture.
2. **MongoDB replica-set ordering.** Rocket.Chat requires Mongo started as a single-node replica-set (`--replSet rs0`), and the connection string must include `replicaSet=rs0&directConnection=true`. The mongo healthcheck (`echo 'try { rs.status().ok } catch(e) { rs.initiate(...).ok }' | mongosh`) is idempotent and starts the replica-set on first probe. Rocket.Chat's `depends_on: { mongo: { condition: service_healthy } }` ensures it does not start until the replica-set is initiated. If you see `MongoError: not master and slaveOk=false` in Rocket.Chat logs, the replica-set never initiated — check `docker logs voracle-rocket-mongo` for healthcheck output.
3. **Selectors in `injection-points.yaml` are INFERRED, not verified.** Rocket.Chat's hybrid Meteor + React + Blaze stack means selectors vary by surface: React+Fuselage surfaces (sidebar, modals, admin) are `.rcx-*` class names and reasonably stable; Blaze surfaces (some message-list internals, the message composer) use `.rc-*` or kebab-case classes that have shifted across 6.x releases. Highest-risk selectors:
   - `.rc-old.messages-box` -- the legacy Blaze message-list container; may be `.rcx-message-list` or similar on a fully-React build.
   - `.rc-message-box__textarea` -- the message composer; the Fuselage migration has been partial across 6.x.
   - `.rcx-sidebar-item--selected` -- the "selected channel" CSS state; selector is correct but the rendered DOM may include modifier classes that need a more-specific selector.
   - `.rcx-user-card` -- the profile-popover modal; React-portaled and may use a `data-qa` attribute instead of a class in the latest build.
   The first real-Docker run MUST sweep all 50 selectors with Playwright `page.$$()` and report any zero-match selectors. Flip `selector_verification_status: inferred` to `verified` in `injection-points.yaml` after the sweep passes.
4. **Meteor-reactive re-render risk.** The message list is rendered by a Meteor reactive subscription. New messages or message edits trigger a full re-render of the affected message block, which can shift DOM nodes mid-screenshot if the seed.sh batch arrives at an unlucky moment. Mitigation: `tests/smoke_rocket_chat_pipeline.ts` waits 800ms after `networkidle` for hydration settle (same budget as Mattermost), and the seed.sh runs in a single batched session before screenshots begin. For multi-session captures (W7+), use Playwright `page.clock.install()` to freeze time so the "X minutes ago" relative timestamps don't drift between baseline and defect screenshots within the same surface.
5. **`profile-modal` surface requires interactive open.** Like Mattermost's profile-popover, the user-card modal is not deep-linkable. The capture script must click a message author avatar (`.rcx-message__user-card-trigger` or `.rcx-message__name`) and wait for `.rcx-user-card` to appear before running the injection primitive. Documented in the test script's `openProfileModal()` helper.
6. **Default-channel auto-join.** Rocket.Chat auto-adds new users to a configurable "default channels" set. We rely on this for the `joinDefaultChannels:true` flag in `/users.create`; in addition, `seed.sh` explicitly `/channels.invite`s each user to general/random/dev to be safe. If a future Rocket.Chat release removes auto-join, the explicit invite step in `ensure_membership()` is the safety net.

## Environmental blockers

- **2026-06-06 (this commit):** Docker not installed on the W4 dev machine. The `tests/smoke_rocket_chat_pipeline.ts` end-to-end run is therefore deferred to the next machine with Docker. The 6 primitives ARE validated by `tests/test_primitives_unit.ts` (passing 6/6 against a synthetic HTML fixture) and the offline pipeline-equivalence test (`tests/smoke_offline_pipeline.ts`) produces 12 PNGs proving baseline-vs-defect deltas are visible at the primitive level.
- **Selector verification:** as above — the 50 selectors in `injection-points.yaml` need a real-Docker sweep before W7 corpus capture, with special attention to the Blaze-vs-React selectors flagged in "Known risks" #3.
