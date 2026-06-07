# Mattermost (Team Edition) — Onboarding Runbook

**Status:** W3 — files complete; docker build pending machine with Docker installed. Selectors are inferred from the upstream `mattermost/mattermost` webapp at the `release-11.8` branch HEAD and MUST be re-verified post-build (see "Known risks" #4).

## What this app provides for the benchmark

Mattermost is the chat/collab class app for visual-oracle-bench. Selected for:
- React + Redux DOM-primary frontend (defect injection via CSS selectors is straightforward).
- Realtime UI elements (channel sidebar, post composer, channel header) that exercise different injection categories than a blog/social app.
- Well-documented REST API (`/api/v4/...`) with token-bearer auth, enabling fully scripted seed.
- 5 navigable UI surfaces: login (`/login`), channel list sidebar (`/{team}/channels/{any}`), channel view (`/{team}/channels/{custom}`), profile-popover modal (opened by clicking a post avatar), settings (the admin console at `/admin_console`).

## Upstream pins (immutable digests)

| Component | Source | Pin | Pushed |
|---|---|---|---|
| Mattermost server | `mattermost/mattermost-team-edition` (Docker Hub) | multi-arch index digest `sha256:a603c831151383f7fca707a2c7b5e52a1c9b7833de55a02ce59dd1c64667cce1` (tag `release-11.8`) | 2026-06-05 |
| Mattermost server (amd64 manifest) | (same) | `sha256:204b98d6f09fff2b957607d7750b1105d200b6c0ae6315912908d57aa0c2704e` | 2026-06-05 |
| Source for selector verification | `github.com/mattermost/mattermost` | branch `release-11.8` HEAD at image build time | (build-dependent) |
| Postgres | `postgres:15-alpine` | placeholder digest in `docker-compose.yml`; **reviewer must replace with `docker pull` output** | (build-dependent) |

The Mattermost backend is NOT built from source: see the header comment in `Dockerfile` for the rationale (build-time cost-overrun risk identified at W3 planning). The Docker Hub image is the official supported distribution.

To move the pin: bump the digest in `Dockerfile`, `docker-compose.yml`, AND `injection-points.yaml` in lockstep, then re-verify selectors against the new build before merging.

## Bring-up sequence

```bash
# 1. Build + start (first run ~2-3 min for image pull, ~30-60s subsequent)
docker compose -f apps/mattermost/docker-compose.yml up --build -d

# 2. Wait for healthcheck (server runs initial migrations + bot creation)
docker compose -f apps/mattermost/docker-compose.yml ps
#    -> mattermost should show "healthy" after ~30-60s

# 3. Seed deterministic fixture (3 teams, 10 users, 15 channels, 30 messages)
./apps/mattermost/seed.sh
#    -> bootstraps admin@voracle.test as sysadmin, then creates everything

# 4. Smoke test the injection -> capture pipeline (12 PNGs)
npx tsx tests/smoke_mattermost_pipeline.ts
#    -> data/images/mattermost/

# 5. Teardown (deletes named volumes)
docker compose -f apps/mattermost/docker-compose.yml down -v
```

## Acceptance criteria

- `docker compose up` brings Postgres up (~10s) then Mattermost up on `localhost:8065` in <3 min cold start (assuming image not cached), <60s subsequent starts (image cached).
- `/api/v4/system/ping` returns 200 within 60s of `mattermost` container start.
- `seed.sh` completes in <60s on a warm Mattermost, is idempotent (re-running does not duplicate teams/channels/users/messages and does not fail).
- `npx tsx tests/smoke_mattermost_pipeline.ts` produces 12 PNGs (6 baseline + 6 defect) under `data/images/mattermost/` and writes `_smoke_ledger.json` with the `DefectRecord` for each shot.

## Fixture seeded by `seed.sh`

| Entity | Count | Identifiers |
|---|---|---|
| Sysadmin | 1 | `admin` / `admin@voracle.test` / `voracle-seed-Pa55word!` |
| Regular users | 10 | alice, bob, carol, dave, eve, frank, grace, heidi, ivan, judy (all same password) |
| Teams | 3 | `engineering`, `design`, `ops` (open type, all 10 users joined to all 3) |
| Channels (custom) | 9 | eng: backend/frontend/releases · des: visual/ux/brand · ops: incidents/deploys/on-call |
| Channels (auto) | 6 | town-square + off-topic per team (Mattermost auto-creates on team creation) |
| Total channels | 15 | matches the pre-registered "5 per team × 3 teams" target |
| Messages | 30 | round-robin posted by alice/bob/carol/dave/eve across the 9 custom channels |

## Known risks and mitigations (pre-registered)

1. **First-user bootstrap race.** Mattermost auto-promotes the FIRST registered user to sysadmin. `seed.sh` relies on this for the `admin` token. If the volume has any existing user (e.g., from a previous run not torn down with `-v`), the POST `/users` for `admin` will return 400 and `seed.sh` falls through to login. Mitigation: always tear down with `down -v` between fresh runs; the seed itself is idempotent against either state.
2. **Postgres digest is a placeholder.** The `docker-compose.yml` pins `postgres:15-alpine` to a representative SHA that has NOT been verified against the live Docker Hub registry on this dev machine (Docker not installed; see top-level README "Status"). The reviewer running the first real build MUST run `docker pull postgres:15-alpine`, capture the actual digest from the output, and update the `image:` line. Tracked in this RUNBOOK and not in code TODOs to keep it visible.
3. **React-portaled profile modal.** The `profile-modal` surface in `injection-points.yaml` is NOT a deep link — Mattermost renders the user-info popover as a React portal anchored to the avatar click target. `smoke_mattermost_pipeline.ts` MUST drive a `page.click('.post:first-of-type .post__header .profile-icon')` (or equivalent) and `page.waitForSelector('.user-popover')` before invoking the injection primitive. Documented in the test file.
4. **Selectors inferred from upstream class conventions, NOT verified against a built image.** All selectors in `injection-points.yaml` (`.SidebarChannel`, `.post-create__container`, `.user-popover__email`, `.admin-console__header`, etc.) are taken from the `release-11.8` branch of `mattermost/mattermost` (the canonical webapp source). They are stable across patch releases within 11.x BUT Mattermost CSS Modules occasionally introduce hashed class suffixes on certain components (the `SidebarChannelGroupHeader_text` suffix style is a known pattern). The reviewer with Docker MUST run a one-shot selector audit by loading each surface and confirming every selector resolves via `document.querySelector(...)`. Any failures should be remediated in this YAML before W7 corpus capture.
5. **Admin console as the "settings" surface.** Mattermost's per-user "Settings" modal is a portal (same React-portal problem as #3 but harder because it has no stable open trigger from a clean session). To get a stable, deep-linkable settings UI we instead capture the **admin console** at `/admin_console/user_management/users`, which is a full-page route and is reachable only with sysadmin auth. `smoke_mattermost_pipeline.ts` logs in as `admin` (not `alice`) for this surface. Pre-registered substitution; documented here so the reviewer does not flag it as a deviation.
6. **Time-relative post timestamps.** Posts render "5 minutes ago" / "yesterday" timestamps that drift between sessions. Mitigation (matches the Conduit pattern): for the W7+ multi-session corpus, use `page.clock.install()` to freeze wall clock to a fixed instant before navigation. The W3 smoke test does not freeze the clock; baseline and defect are captured back-to-back so any drift is <1s and below the relative-time granularity.
7. **CSRF token requirement on some POST endpoints.** Recent Mattermost versions (10.x+) require the `X-CSRF-Token` header on a subset of admin write endpoints. The seed script's `/users`, `/teams`, `/channels`, `/posts` calls do NOT trigger CSRF because they use `Authorization: Bearer` token auth (not session-cookie auth). Documented for future maintainers who add cookie-auth flows.

## Environmental blockers

- **2026-06-06 (W3 commit):** Docker not installed on the W3 dev machine. As with Conduit, the `tests/smoke_mattermost_pipeline.ts` end-to-end run is deferred to the next machine with Docker. The 6 injection primitives ARE validated by `tests/test_primitives_unit.ts` (6/6 passing) and `tests/smoke_offline_pipeline.ts` (12 offline PNGs proving the primitive deltas are visible against synthetic markup).

## Called from `scripts/capture_corpus.ts` (W6 orchestrator contract)

The W6 corpus orchestrator (`scripts/capture_corpus.ts`) drives the all-50-points capture against Mattermost via the per-app driver `capture/drivers/mattermost.ts`. The orchestrator assumes:

- **Stable docker-compose service names.** `apps/mattermost/docker-compose.yml` exposes Mattermost on `localhost:8065` (env override `MM_BASE_URL`); the Postgres container is internal-only. The driver fetches `GET <BASE_URL>/api/v4/system/ping` for the healthcheck.
- **Healthcheck wait command.** `while ! curl -sf http://localhost:8065/api/v4/system/ping; do sleep 3; done` (covers the JVM-equivalent Go boot + Postgres-ready window, ~30-60s on a warm image).
- **Seed-script invocation.** `./apps/mattermost/seed.sh` (idempotent against either fresh-volume or already-seeded state; see Known risks #1). The orchestrator runs this once per app before the capture loop unless `--assume-running` is passed.
- **Capture-loop expectations.** The driver iterates all 50 injection points from `injection-points.yaml`, capturing one `data/images/mattermost/baseline/<id>.png` + one `data/images/mattermost/defect/<id>.png` per point. Per-surface auth: `login` is captured unauthenticated; `channel-list`/`channel-view`/`profile-modal` use the `alice` token; `settings` (admin console) uses the `admin` token. Both tokens are harvested via `POST /api/v4/users/login` and injected as `MMAUTHTOKEN` cookies before navigation (same auth pattern as `tests/smoke_mattermost_pipeline.ts`). For `profile-modal`, the driver clicks `.post:not(.post--system) .post__header .profile-icon` and waits for `.user-popover` -- same scripted flow as the smoke test. Concurrency within an app defaults to 4 (override via `--concurrency`).
- **Teardown.** `docker compose -f apps/mattermost/docker-compose.yml down -v` after the per-app capture completes, unless `--keep-up` is passed. Always tear down with `-v` to avoid Known risks #1 (first-user-bootstrap race) on the next session.
