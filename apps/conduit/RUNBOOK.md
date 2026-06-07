# Conduit (RealWorld) — Onboarding Runbook

**Status:** W2 — first app onboarded. Pipeline files complete; docker build pending machine with Docker installed.

## What this app provides for the benchmark

Conduit is the smallest fully-featured social/blog OSS web app. Selected as the W2 starting app because:
- Smallest container footprint
- Simplest seed data (users + articles + tags + comments)
- Well-documented official seed scripts
- Angular-based reference frontend (DOM-primary, easy to inject defects)
- 5 navigable UI surfaces: home (`/`), article (`/article/<slug>`), profile (`/profile/<user>`), editor (`/editor`), settings (`/settings`)

## Upstream pins (immutable commit SHAs)

| Component | Repo | Commit | Date |
|---|---|---|---|
| Backend (Express + Prisma + SQLite) | `gothinkster/node-express-realworld-example-app` | `30b68e1e881462b2f4164ea09ab4c4f5699c7b0b` | 2024-01-04 |
| Frontend (Angular 21) | `gothinkster/angular-realworld-example-app` | `dd99ed2cf39c805d719f943c5d7061a5683d98a8` | 2026-05-13 |

Both are pinned via `ARG` in the Dockerfiles, fetched at build time with `git fetch --depth 1 origin <sha>`. To move the pin, edit the `ARG REALWORLD_*_SHA=` line in each Dockerfile and rebuild.

## Bring-up sequence

```bash
# 1. Build + start (first run ~5-10 min for npm install / nx build / ng build)
docker compose -f apps/conduit/docker-compose.yml up --build -d

# 2. Wait for healthcheck (backend exposes /api/tags as health probe)
docker compose -f apps/conduit/docker-compose.yml ps

# 3. Seed deterministic fixture (5 users, 10 articles, 5 tags, 20 comments)
./apps/conduit/seed.sh

# 4. Smoke test the injection -> capture pipeline (12 PNGs to data/images/conduit/)
npx tsx tests/smoke_conduit_pipeline.ts

# 5. Teardown
docker compose -f apps/conduit/docker-compose.yml down -v
```

## Acceptance criteria

- `docker compose up` brings backend up on `localhost:3000` and frontend on `localhost:4100` in <10 min cold build, <60s subsequent starts.
- `seed.sh` completes in <30s, is idempotent (re-running does not duplicate articles or fail).
- `npx tsx tests/smoke_conduit_pipeline.ts` produces 12 PNGs (6 baseline + 6 defect) under `data/images/conduit/` and writes `_smoke_ledger.json` with the DefectRecord for each shot.

## Fixture seeded by `seed.sh`

| Entity | Count | Identifiers |
|---|---|---|
| Users | 5 | alice, bob, carol, dave, eve (all password `voracle-seed-Pa55word!`) |
| Tags | 5 | ai, testing, opensource, longread, demo |
| Articles | 10 | 2 per user, deterministic titles (see `seed.sh`) |
| Comments | 20 | 2 per article, round-robin author rotation |

## Known risks and mitigations (pre-registered)

- **Angular hydration delay** may cause flaky baseline screenshots. Mitigation: `smoke_conduit_pipeline.ts` waits for `networkidle` then 400ms additional settle before screenshot.
- **Article timestamps** ("3 minutes ago") leak wall-clock into snapshots. Mitigation: seed.sh runs in one batch; the relative-time component renders once and stays stable within a single capture session. For multi-session captures (W7+), use Playwright `page.clock.install()` to freeze time before navigation.
- **User avatars** are deterministic gravatars based on email (not random) — already addressed by seeded email addresses.
- **JWT in localStorage** is required for `/editor` and `/settings` routes; `smoke_conduit_pipeline.ts` performs the login via the API and injects the token via `addInitScript` before navigation.
- **Selectors in `injection-points.yaml` are tied to the pinned frontend SHA**. If the pin is moved, re-verify selectors against the new build before re-running.

## Environmental blockers

- **2026-06-06 (this commit):** Docker not installed on the W2 dev machine. The `tests/smoke_conduit_pipeline.ts` end-to-end run is therefore deferred to the next machine with Docker. The 6 primitives ARE validated by `tests/test_primitives_unit.ts` (passing 6/6 against a synthetic HTML fixture) and the offline pipeline-equivalence test (`tests/smoke_offline_pipeline.ts`) produces 12 PNGs in `data/images/_offline_smoke/` proving baseline-vs-defect deltas are visible.

## Called from `scripts/capture_corpus.ts` (W6 orchestrator contract)

The W6 corpus orchestrator (`scripts/capture_corpus.ts`) drives the all-50-points capture against this app via the per-app driver `capture/drivers/conduit.ts`. The orchestrator assumes:

- **Stable docker-compose service names.** `apps/conduit/docker-compose.yml` exposes the frontend on `localhost:4100` (env override `CONDUIT_FRONTEND_URL`) and the backend on `localhost:3000` (env override `CONDUIT_BACKEND_URL`). The driver fetches `GET <FRONTEND_URL>/` for the healthcheck.
- **Healthcheck wait command.** `while ! curl -sf http://localhost:4100/; do sleep 2; done` (covers the Angular build + first-paint window inside the container).
- **Seed-script invocation.** `./apps/conduit/seed.sh` (idempotent; safe to re-run between capture sessions). The orchestrator runs this once per app before the capture loop unless `--assume-running` is passed.
- **Capture-loop expectations.** The driver iterates all 50 injection points from `injection-points.yaml`, capturing one `data/images/conduit/baseline/<id>.png` + one `data/images/conduit/defect/<id>.png` per point and writing the per-app ledger to `data/images/conduit/_capture_ledger.json`. Concurrency within an app defaults to 4 (override via `--concurrency`). For `/editor` and `/settings` surfaces the driver logs in as `alice` via `POST /api/users/login` and injects the JWT into localStorage before navigation -- same auth pattern as the 6-point smoke test.
- **Teardown.** `docker compose -f apps/conduit/docker-compose.yml down -v` after the per-app capture completes, unless `--keep-up` is passed.
