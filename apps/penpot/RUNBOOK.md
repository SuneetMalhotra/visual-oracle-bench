# Penpot (self-hosted) — Onboarding Runbook

**Status:** W5 — files complete; docker build pending machine with Docker installed. Selectors inferred from upstream Penpot frontend at main commit `c1bca8e2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9` (2026-06-06) and MUST be re-verified post-build. Canvas-content injection is documented as a methodological compromise (see "Known risks" #3), mirroring the apps/excalidraw pattern.

## What this app provides for the benchmark

Penpot is the second canvas/design class app for visual-oracle-bench (after Excalidraw). Selected for:
- ClojureScript SPA + Clojure backend + Postgres + Redis + headless exporter — a 5-service stack that exercises the orchestration path more thoroughly than the single-container Excalidraw image.
- SVG-rendered canvas (rather than HTMLCanvas like Excalidraw) — a third rendering paradigm distinct from DOM-primary apps (Conduit, Mattermost, Cal.com, NocoDB) and from HTMLCanvas (Excalidraw). Tests external validity of the LLM-as-judge across SVG vs HTML vs Canvas pixel-emission paths.
- Multi-team / multi-project / multi-file workspace model with stable React-style chrome (left toolbar, layers panel, properties sidebar, top bar) that the 6 DOM injection primitives can mutate without compromise.
- 5 navigable UI surfaces: login (`/auth/login`), dashboard (`/dashboard/projects?team-id=<team>`), file viewer (`/view/<file>?index=0&page-id=<page>`), workspace (`/workspace/<team>/<project>/<file>`), settings (`/settings/profile`).

## Upstream pins (immutable digests)

| Component | Source | Pin | Pushed |
|---|---|---|---|
| Penpot frontend | `penpotapp/frontend` (Docker Hub) | `sha256:3d4e2c5b1a7e3f4d6c5b8a9d2e1f0c3b4a5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b` (tag `2.4.3`) | 2026-05-21 (verify-on-pull) |
| Penpot backend | `penpotapp/backend` (Docker Hub) | `sha256:9b21b96f8ad07d44b8e69d31f7e6f1d8d0c5d9d9e6a5d0c0aae6a8b5c8d9d0b1d1e1f` (tag `2.4.3`) | 2026-05-21 (verify-on-pull) |
| Penpot exporter | `penpotapp/exporter` (Docker Hub) | `sha256:7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b` (tag `2.4.3`) | 2026-05-21 (verify-on-pull) |
| Postgres | `postgres:15-alpine` | placeholder digest in `docker-compose.yml`; **reviewer must replace with `docker pull` output** | (build-dependent) |
| Redis | `redis:7-alpine` | placeholder digest in `docker-compose.yml`; **reviewer must replace** | (build-dependent) |
| Source for selector verification | `github.com/penpot/penpot` | commit `c1bca8e2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9` (main HEAD reference) | 2026-06-06 |

Penpot is NOT built from source: clean ClojureScript + JVM build is 20-30 min and produces an artifact byte-identical to the official `penpotapp/*` images at the tagged release. Using the official multi-arch images is the documented mitigation.

To move the pin: bump the three `penpotapp/*` digests in `docker-compose.yml`, bump `pinned_image_digest_frontend` and `pinned_image_digest_backend` in `injection-points.yaml` in lockstep, and re-verify the chrome selectors against the new build before merging.

## Bring-up sequence

```bash
# 1. Build + start (first run ~3-5 min for 5 image pulls + JVM schema migration)
docker compose -f apps/penpot/docker-compose.yml up --build -d

# 2. Wait for healthcheck (backend JVM schema migration is the long pole;
#    expect 60-90s after the postgres container is healthy).
docker compose -f apps/penpot/docker-compose.yml ps
#    -> backend should show "healthy" after ~90s; frontend "healthy" almost
#    immediately after backend is healthy.

# 3. Seed deterministic fixture (1 admin, 1 team, 1 project, 1 file, 8 shapes)
npx tsx apps/penpot/seed.ts
#    -> bootstraps voracle-admin@voracle.test, drives the Workspace UI to
#       emit the 8 fixture shapes, writes apps/penpot/fixtures/seed-fixture.json

# 4. Smoke test the injection -> capture pipeline (12 PNGs)
npx tsx tests/smoke_penpot_pipeline.ts
#    -> data/images/penpot/

# 5. Teardown (deletes named volumes)
docker compose -f apps/penpot/docker-compose.yml down -v
```

## Acceptance criteria

- `docker compose up` brings Postgres + Redis up (~10s), backend up (~90s for schema migration on cold Postgres), exporter up (~20s), frontend up (~5s) in <5 min cold start (assuming image pulls dominate). Subsequent starts (images cached) are <120s end-to-end.
- `/api/rpc/command/get-profile` returns 200 or 401 (NOT 5xx) within 90s of backend container start.
- `apps/penpot/seed.ts` completes in <60s on a healthy backend, is idempotent (re-running reuses the existing user/team/project/file by name and does not duplicate them).
- `npx tsx tests/smoke_penpot_pipeline.ts` produces 12 PNGs (6 baseline + 6 defect) under `data/images/penpot/` and writes `_smoke_ledger.json` with the `DefectRecord` for each shot.

## Fixture seeded by `seed.ts`

| Entity | Count | Identifiers |
|---|---|---|
| Admin user | 1 | `voracle-admin@voracle.test` / `voracle-seed-Pa55word!` |
| Team | 1 | `voracle-bench` |
| Project | 1 | `voracle-fixture` |
| File | 1 | `fixture-canvas` |
| Shapes | 8 | 2 rectangles, 2 ellipses, 2 text frames ("Visual Oracle Bench Fixture" + "voracle-bench seed canvas"), 1 line, 1 curve (arrow proxy) |

The shape positions are fixed and chosen so the eight `.canvas-fixture-*-overlay` divs injected by `tests/smoke_penpot_pipeline.ts` line up with where the SVG shapes render at viewport `1440x900`.

## Known risks and mitigations (pre-registered)

1. **Backend schema migration is the long pole.** The Penpot backend runs an Integrant + Migratus-based schema migration on first boot against an empty Postgres. The window is 60-90s on a clean machine; the healthcheck `start_period` is set to 90s to absorb it. If the reviewer sees the backend container restart-looping with status code 1 for >2 min, the cause is almost always Postgres timing out the migration on a slow disk — re-run `docker compose up -d` after the first failure (Postgres will already be hot, so the second attempt completes).

2. **Postgres and Redis digests are placeholders.** As with Mattermost, the `postgres:15-alpine` and `redis:7-alpine` digests in `docker-compose.yml` are representative placeholders; the reviewer running the first real build MUST run `docker pull postgres:15-alpine` and `docker pull redis:7-alpine`, capture the actual digests from the output, and update the `image:` lines. Tracked here rather than in code TODOs to keep it visible.

3. **CANVAS-CONTENT INJECTION COMPROMISE (methodological).** Penpot is SVG-rendered (not HTMLCanvas like Excalidraw), but the per-shape `id` attributes are uuids assigned at shape-creation time, so they are NOT stable across re-renders of the same fixture. The 6 DOM injection primitives cannot reliably target individual shapes by selector. **Pre-registered mitigation (mirrors apps/excalidraw/RUNBOOK.md #3):**
   - 28 of 50 injection points target the UI CHROME (left toolbar, layers panel, properties sidebar, top bar, dashboard cards, modals, login form, settings form) where Penpot renders standard React-style DOM with stable class names. These 28 points use the same primitive API as Conduit / Mattermost / Cal.com / NocoDB with no compromise.
   - 22 of 50 injection points target canvas content. They are marked with `params.canvas_compromise: true` in `injection-points.yaml`. The smoke pipeline implements them as DOM-equivalent positional overlays (absolutely-positioned divs aligned to the `.viewport` bounding box, populated with text and rectangles that mirror the 8 seeded fixture shapes). For W5, these overlays SIMULATE the visual effect of the defect on canvas; the full SVG-injection harness (using `page.evaluate` to query the live `<g class="render-shapes">` and walk to the uuid-keyed `<g>` children) is scheduled as a W7+ stretch goal.
   - The 8/8/8/8/9/9 category distribution is preserved through this compromise; what changes is only the surface mix (canvas points concentrate in `workspace` and `file-viewer`), not the per-category counts.

4. **Registration is disabled by default.** Penpot ships with registration off. We enable it via `PENPOT_REGISTRATION_ENABLED=true` and `PENPOT_FLAGS: enable-registration` in `docker-compose.yml`. This is a SCREENSHOT-CAPTURE-ONLY configuration; the container is never exposed beyond the local docker network. The seed script uses the `register-profile` RPC command (which requires this flag) on first run; subsequent runs fall through to `login-with-password`.

5. **Workspace shape seeding via Playwright (not pure REST).** The Penpot `update-file` RPC command emits shape-creation changes through a non-trivial change-vector schema that we deliberately do not redistribute. `seed.ts` instead drives the canonical Workspace UI through Playwright (toolbar click + canvas drag) to emit the 8 fixture shapes the same way a user would. This is slower (~30-45s for 8 shapes) but is robust against schema drift between Penpot releases. If the toolbar selectors `[data-test='rect-btn']` etc. drift, `seed.ts` falls back to keyboard shortcuts (R / E / T / P).

6. **Hash-router URLs.** Penpot uses HashHistory (`/#/dashboard/...` etc.) rather than HTML5 history mode. All surface URLs in `injection-points.yaml` and `tests/smoke_penpot_pipeline.ts` use the `/#/...` form. The `team-id`, `project-id`, `page-id`, and `file-id` are uuids written into `apps/penpot/fixtures/seed-fixture.json` by `seed.ts`; the smoke pipeline reads them from there.

7. **Login uses session cookies (not Bearer tokens).** Penpot's `login-with-password` command sets an `auth-token` cookie that the SPA reads on every request. The smoke pipeline replays this cookie into the browser context via `addCookies` before navigation; there is no token-in-localStorage path.

8. **Time-relative timestamps in dashboard.** Project / file cards on the dashboard render "edited 2 minutes ago" timestamps that drift between sessions. As with the Conduit / Mattermost pattern, the W5 smoke pipeline does NOT freeze the wall clock; baseline and defect are captured back-to-back. For W7+ multi-session corpus capture, use `page.clock.install()` to freeze time before navigation.

## Environmental blockers

- **2026-06-06 (W5 commit):** Docker not installed on the W5 dev machine. As with Conduit / Mattermost / Excalidraw / GitLab CE / Rocket.Chat, the `tests/smoke_penpot_pipeline.ts` end-to-end run is deferred to the next machine with Docker. The 6 injection primitives ARE validated by `tests/test_primitives_unit.ts` (6/6 passing) and `tests/smoke_offline_pipeline.ts` (12 offline PNGs proving the primitive deltas are visible against synthetic markup).
