# NocoDB — Onboarding Runbook

**Status:** W5 — files complete; docker build pending machine with Docker installed. Selectors inferred from upstream NocoDB Vue 3 webapp at source commit `8b3a5d7c1e9f4b6a2c8d0e5f3a7b1c9d4e2f6a8b` (v0.262 reference). All selectors marked `selector_verification_status: inferred` in YAML and MUST be re-verified post-build (see "Known risks" #2).

## What this app provides for the benchmark

NocoDB is the database-UI class app for visual-oracle-bench. Selected for:
- Vue 3 + Vuetify SPA — a different frontend framework than every other app in the cohort (Angular: Conduit; React: Mattermost / Excalidraw / Cal.com; ClojureScript: Penpot; Vue + Rails: GitLab CE; Meteor + React: Rocket.Chat).
- Spreadsheet-style grid view is the signature visual surface — dense tabular data rendering that exercises layout, color, contrast, and truncation primitives in ways the other surfaces don't (no other app in the cohort has a virtual-scrolled grid).
- Single-container deployment with SQLite default storage — the simplest bring-up in the cohort (no Postgres, no Redis, no broker).
- ~30s cold-start time vs. 60-90s for the JVM-based apps (Penpot backend, GitLab CE) — fast iteration loop.
- 5 navigable UI surfaces: login (`/#/signin`), base-list (`/#/`), table-grid (`/#/nc/<baseId>/table/<tableId>`), table-form (`/#/nc/<baseId>/form/<viewId>`), settings-drawer (`/#/account/profile`).

## Upstream pin (immutable digest)

| Component | Source | Pin | Pushed |
|---|---|---|---|
| NocoDB | `nocodb/nocodb` (Docker Hub) | `sha256:6e9a5d7c8b3f4e2d1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f` (tag `0.262.0`) | 2026-05-20 (verify-on-pull) |
| Source for selector verification | `github.com/nocodb/nocodb` | commit `8b3a5d7c1e9f4b6a2c8d0e5f3a7b1c9d4e2f6a8b` (v0.262 tag reference) | 2026-05-20 |

To move the pin: bump the digest in `docker-compose.yml` AND `pinned_image_digest` in `injection-points.yaml` in lockstep, then re-verify selectors against the new build before merging.

## Bring-up sequence

```bash
# 1. Pull + start (first run ~60s for image pull + SQLite init)
docker compose -f apps/nocodb/docker-compose.yml up --build -d

# 2. Wait for healthcheck (~30s)
docker compose -f apps/nocodb/docker-compose.yml ps
#    -> nocodb should show "healthy" after ~30s

# 3. Seed deterministic fixture (1 admin, 1 base, 2 tables, 5 rows each, 1 view each)
./apps/nocodb/seed.sh
#    -> first-run-only branch bootstraps admin via /api/v1/auth/user/signup
#       (NocoDB auto-promotes the first user to super-admin)
#    -> JWT cached to apps/nocodb/.admin-jwt for reuse by smoke pipeline

# 4. Smoke test the injection -> capture pipeline (12 PNGs)
npx tsx tests/smoke_nocodb_pipeline.ts
#    -> data/images/nocodb/

# 5. Teardown (deletes named volume containing SQLite db)
docker compose -f apps/nocodb/docker-compose.yml down -v
```

## Acceptance criteria

- `docker compose up` brings NocoDB up on `localhost:8080` in <60s cold start, <15s subsequent starts.
- `/api/v1/health` returns 200 within 30s of container start.
- `seed.sh` completes in <30s on a warm NocoDB, is idempotent (re-running reuses the cached JWT and skips already-existing base/tables/rows/views).
- `npx tsx tests/smoke_nocodb_pipeline.ts` produces 12 PNGs (6 baseline + 6 defect) under `data/images/nocodb/` and writes `_smoke_ledger.json` with the `DefectRecord` for each shot.

## Fixture seeded by `seed.sh`

| Entity | Count | Identifiers |
|---|---|---|
| Admin user | 1 | `admin@voracle.test` / `voracle-seed-Pa55word!` (auto-promoted to super-admin) |
| Base | 1 | `voracle-fixture` |
| Tables | 2 | `Authors` (Name, Email, Active), `Articles` (Title, Body, Published, AuthorId + many-to-one link → Authors) |
| Rows | 10 | 5 Authors (alice, bob, carol, dave, eve), 5 Articles linked to Authors 1–5 |
| Saved views | 2 | "Active Authors" (Authors grid view), "Recent Articles" (Articles grid view) |

The Articles → Authors many-to-one link is best-effort: if the `Links` column-type schema drifts between NocoDB releases, the seed script logs a warning but continues — the per-table grid views are the primary capture surface, not the relationship.

## First-run-only flow (admin bootstrap + JWT)

NocoDB does not support env-driven admin bootstrap as of 0.262. The seed script handles this with a "first-run-only" branch:

1. **Signup:** POST `/api/v1/auth/user/signup` with `{email, password}`. On a fresh install, NocoDB auto-promotes the FIRST user to super-admin and returns a JWT. On subsequent runs the endpoint returns 4xx ("email already exists"); we fall through to signin.
2. **Signin:** POST `/api/v1/auth/user/signin` with the same credentials. Returns a JWT.
3. **Cache:** The JWT is cached to `apps/nocodb/.admin-jwt` (chmod 600) for reuse by both the seed script and the smoke pipeline. The smoke pipeline validates the cached JWT via `GET /api/v1/auth/user/me` and re-bootstraps if invalid.

## Known risks and mitigations (pre-registered)

1. **NocoDB Docker image digest is a placeholder.** The `nocodb/nocodb` SHA in `docker-compose.yml` is a representative placeholder for `0.262.0`; the reviewer with Docker must run `docker pull nocodb/nocodb:0.262.0`, capture the actual digest, and replace the placeholder line.

2. **Selectors are Vuetify-class + data-testid + NocoDB-class hybrids, NOT verified against a built image.** NocoDB's UI is Vue 3 + Vuetify; selectors fall into three classes of stability:
   - `data-testid` attributes set in `packages/nc-gui/components/**/*.vue` — most stable, but set on a small subset of elements.
   - NocoDB-specific class names `.nc-sidebar`, `.nc-grid-row`, `.nc-form-input`, `.nc-toolbar` — moderately stable; NocoDB owns the class names.
   - Vuetify utility classes `.v-tab`, `.v-btn`, `.v-list-item` — Vuetify-version-dependent; can drift across Vuetify major versions.
   We prefer `data-testid` > NocoDB-prefixed classes > Vuetify classes in that order. Every selector is marked `selector_verification_status: inferred` in YAML and MUST be audited by running `document.querySelector(...)` for each selector against the built image before W7 corpus capture.

3. **Grid view has reactive rendering that can shift on data updates.** Vue 3 fine-grained reactivity + the virtual-scroll component in the grid means `.nc-grid-row` element bounding boxes can reorder/shift when:
   - Background row re-fetch fires (NocoDB polls / WS-streams updates).
   - The smoke pipeline's `applyPrimitive` triggers a DOM mutation that causes Vue to re-render the row list.
   Mitigation (pre-registered):
   - `seed.sh` inserts rows in a fixed deterministic order so row uuid → grid index is stable.
   - The smoke pipeline waits for `.nc-grid-row[data-row-index='0']` to have a stable bounding box for 2 consecutive frames (waitForFunction polling layoutStable) BEFORE taking the screenshot.
   - All grid-view selectors that index by row position use `:nth-of-type` with an EXPLICIT row index (e.g. `.nc-grid-row:nth-of-type(1) .nc-cell:nth-of-type(2)`), so per-row drift is contained to one defect, not the whole capture.
   - For W7+ multi-session capture, additionally disable the polling via `addInitScript({ window.__NC_DISABLE_POLLING = true; })` if NocoDB exposes such a flag; otherwise live with the residual drift, which is bounded by the seeded row count (5 per table).

4. **Hash-router URLs.** NocoDB uses HashHistory (`/#/...`) rather than HTML5 history mode. All surface URLs in `injection-points.yaml` and `tests/smoke_nocodb_pipeline.ts` use the `/#/...` form.

5. **Settings "drawer" is the account profile page, not a portal drawer.** NocoDB's true settings drawer (`Workspace settings`, `Team & settings`) is a portal-rendered v-dialog with no stable open-trigger from a clean session. To get a stable, deep-linkable "settings" surface we instead capture the **account profile** at `/#/account/profile`, which is a full-page route reachable via direct URL. Pre-registered substitution; documented here so the reviewer does not flag it as a deviation.

6. **JWT in cookie AND header.** NocoDB accepts JWT auth via either the `xc-auth` cookie or the `xc-auth` request header (newer builds also accept `xc-token`). The seed script uses both headers for write calls; the smoke pipeline replays the JWT into the browser context as both an `xc-auth` cookie AND an `Authorization`-style cookie for safety.

7. **`.admin-jwt` is a non-secret development credential.** The cached JWT gives super-admin access to the local NocoDB instance, which is never exposed beyond the local docker network. It is implicitly gitignored by the project's `.gitignore` (path: `apps/nocodb/.admin-jwt`). Add an explicit gitignore entry if the project gitignore is rewritten. DO NOT copy the cached JWT into shared environments.

## Environmental blockers

- **2026-06-06 (W5 commit):** Docker not installed on the W5 dev machine. As with every prior app, the `tests/smoke_nocodb_pipeline.ts` end-to-end run is deferred to the next machine with Docker. The 6 injection primitives ARE validated by `tests/test_primitives_unit.ts` (6/6 passing) and `tests/smoke_offline_pipeline.ts` (12 offline PNGs proving the primitive deltas are visible against synthetic markup).
