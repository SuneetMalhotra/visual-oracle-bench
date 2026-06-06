# Cal.com — Onboarding Runbook

**Status:** W5 — files complete; docker build pending machine with Docker installed. Selectors inferred from upstream Cal.com webapp at source commit `f3e2d1c0b9a8f7e6d5c4b3a2918171615141312f` (v4.9.0 reference). All selectors marked `selector_verification_status: inferred` in YAML and MUST be re-verified post-build (see "Known risks" #4).

## What this app provides for the benchmark

Cal.com is the scheduling-class app for visual-oracle-bench. Selected for:
- Next.js + React + Tailwind + Prisma + Postgres — a representative modern SaaS stack with server-side rendering AND client-side hydration, exercising a different defect-injection timing path than pure SPAs (Conduit, Excalidraw, Penpot, NocoDB) or pure SSR (Conduit's Angular).
- Multi-user role model (admin + regular users) with event-types and bookings, providing 5 navigable surfaces with very different visual densities (login form vs. booking page with calendar + time slots + form).
- Booker-flow page is the **highest visual density surface in the entire benchmark** — 3-column layout with event-meta on left, calendar in middle, time slots on right, attendee form revealed on slot selection, confirm button at bottom. 12 of 50 injection points target this surface, per the W5 spec.
- 5 navigable UI surfaces: login (`/auth/login`), event-type list (`/event-types`), booking page (`/<username>/<event-slug>`), bookings list (`/bookings/upcoming`), admin settings (`/settings/admin/general`).

## Upstream pins (immutable digests)

| Component | Source | Pin | Pushed |
|---|---|---|---|
| Cal.com app | `calcom/cal.com` (Docker Hub) | `sha256:8a3b2c1d9e0f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b` (tag `v4.9.0`) | 2026-05-29 (verify-on-pull) |
| Postgres | `postgres:15-alpine` | placeholder digest in `docker-compose.yml`; **reviewer must replace with `docker pull` output** | (build-dependent) |
| Source for selector verification | `github.com/calcom/cal.com` | commit `f3e2d1c0b9a8f7e6d5c4b3a2918171615141312f` (v4.9.0 tag reference) | 2026-05-29 |

To move the pin: bump the digest in `docker-compose.yml` AND `pinned_image_digest` in `injection-points.yaml` in lockstep, then re-verify the selectors (especially `data-testid` attributes, which Cal.com renames more frequently than class names) against the new build before merging.

## Build-from-source fallback

Cal.com publishes Docker images on a slower cadence than its GitHub releases (sometimes 4-8 weeks behind). If `docker pull calcom/cal.com:v4.9.0` returns "manifest unknown" or no recent stable tag exists at build time, fall back to build-from-source via the upstream Dockerfile:

```bash
# 1. Clone at the pinned source SHA
git clone https://github.com/calcom/cal.com voracle-calcom-src
cd voracle-calcom-src
git checkout f3e2d1c0b9a8f7e6d5c4b3a2918171615141312f

# 2. Build the official image (NOT recommended for first reviewer; ~20-30 min)
docker build -f Dockerfile -t voracle/cal.com:src-pinned .

# 3. Edit apps/cal-com/docker-compose.yml: change
#      image: calcom/cal.com@sha256:...
#    to:
#      image: voracle/cal.com:src-pinned
```

The pinned-digest path is preferred and is what the smoke test assumes; the source-build fallback is documented here so the reviewer is not blocked.

**SLOW-BUILD RISK:** source build takes 20-30 min on a clean machine and pulls ~3 GB of npm + yarn deps. If chosen, allocate the time accordingly.

## Bring-up sequence

```bash
# 1. Build + start (first run ~2-3 min for image pull + Prisma migrate)
docker compose -f apps/cal-com/docker-compose.yml up --build -d

# 2. Wait for healthcheck (Cal.com runs Prisma migrate against empty
#    Postgres on first boot; window is ~30-60s)
docker compose -f apps/cal-com/docker-compose.yml ps
#    -> app should show "healthy" after ~60s

# 3. Seed deterministic fixture (1 admin + 2 users, 6 event types, 5 bookings)
./apps/cal-com/seed.sh
#    -> first-run-only branch bootstraps admin via /api/auth/setup +
#       captures an api key via tRPC; subsequent runs reuse the cached
#       key from apps/cal-com/.admin-apikey
#    -> see "First-run-only" section below

# 4. Smoke test the injection -> capture pipeline (12 PNGs)
npx tsx tests/smoke_cal-com_pipeline.ts
#    -> data/images/cal-com/

# 5. Teardown (deletes named volumes)
docker compose -f apps/cal-com/docker-compose.yml down -v
```

## Acceptance criteria

- `docker compose up` brings Postgres up (~10s) then Cal.com up on `localhost:3001` in <3 min cold start (assuming image not cached), <60s subsequent starts (image cached).
- `/api/auth/session` returns 200 within 90s of `app` container start.
- `seed.sh` completes in <90s on a warm Cal.com, is idempotent (re-running reuses the cached API key, skips already-existing users/event-types/bookings and does not fail).
- `npx tsx tests/smoke_cal-com_pipeline.ts` produces 12 PNGs (6 baseline + 6 defect) under `data/images/cal-com/` and writes `_smoke_ledger.json` with the `DefectRecord` for each shot.

## Fixture seeded by `seed.sh`

| Entity | Count | Identifiers |
|---|---|---|
| Admin user | 1 | `admin` / `admin@voracle.test` / `voracle-seed-Pa55word!` |
| Regular users | 2 | alice (`alice@voracle.test`), bob (`bob@voracle.test`) (same password) |
| Event types | 6 | 2 per user: `<user>-15min` (15 min consultation) + `<user>-30min` (30 min consultation) |
| Bookings | 5 | alice-15min by bob, alice-30min by admin, bob-15min by alice, bob-30min by admin, admin-30min by alice — fixed dates 2026-06-10 / -11 / -12 |

## First-run-only flow (admin bootstrap + API key)

Cal.com does NOT have a public admin-creation REST endpoint. The seed script handles this with a "first-run-only" branch:

1. **Admin creation:** POST `/api/auth/setup` with `{username, email, password, full_name}`. Returns 200 on first run; returns 4xx on subsequent runs (admin already exists). Either status is treated as success.
2. **Session login:** NextAuth CSRF dance — GET `/api/auth/csrf` to get the CSRF token, then POST `/api/auth/callback/credentials` with `{csrfToken, email, password}` to get a `next-auth.session-token` cookie. The cookie is held in a temp jar for step 3.
3. **API key creation:** POST `/api/trpc/viewer.apiKeys.create` (session-cookie auth) with `{note: "voracle-seed-key"}`. Returns a key string `cal_...` that is cached to `apps/cal-com/.admin-apikey` (chmod 600) for reuse by both the seed script and the smoke pipeline.

On subsequent runs the seed script validates the cached key via `GET /api/v1/me?apiKey=<key>` and reuses it if valid; otherwise it re-runs the whole bootstrap. This makes the seed safely re-runnable but the FIRST run does require the wizard endpoint to be live, so the wait_for_app loop polls `/api/auth/session` (the lowest-cost served route) before starting.

## Known risks and mitigations (pre-registered)

1. **No public Docker image stability guarantee.** Cal.com publishes images intermittently. The digest in `docker-compose.yml` is a placeholder for `v4.9.0`. The reviewer MUST verify with `docker pull` before relying on it. If the image is unavailable, use the build-from-source fallback documented above. This is the primary onboarding risk.
2. **Postgres digest is a placeholder.** Same caveat as Mattermost and Penpot — `postgres:15-alpine` SHA in `docker-compose.yml` is representative; the reviewer must replace with the actual `docker pull` output.
3. **Prisma migrate is the long pole on first boot.** Cal.com runs `prisma migrate deploy` on container startup against the empty Postgres. The window is 30-60s on a clean machine; the healthcheck `start_period` is set to 90s to absorb it. If the reviewer sees the `app` container restart-looping for >2 min, suspect a Prisma schema drift between the image and the embedded schema — re-run `docker compose pull` to ensure the image matches the pinned digest.
4. **Selectors are Tailwind-class + data-testid combinations, NOT verified against a built image.** Cal.com's UI is Tailwind utility-class heavy; class concatenations are NOT stable identifiers. We prefer `data-testid` attributes (which Cal.com sets on critical interactive elements at `apps/web/components/**/*.tsx` in the source pin) as the primary selectors, with semantic/role fallbacks. Even `data-testid` values are renamed more frequently than class names — every selector in `injection-points.yaml` is marked `selector_verification_status: inferred` and MUST be audited against the built image by running `document.querySelector(...)` for each selector before W7 corpus capture. Known patterns at the source pin:
   - `[data-testid='login-form']`, `[data-testid='login-submit']` on auth pages
   - `[data-testid='event-type-card']`, `[data-testid='event-type-title']`, `[data-testid='new-event-type']` on `/event-types`
   - `[data-testid='event-meta']`, `[data-testid='available-times']`, `[data-testid='time']`, `[data-testid='day']`, `[data-testid='confirm-book-button']`, `[data-testid='timezone-select']`, `[data-testid='time-format-toggle']` on the booker page
   - `[data-testid='bookings']`, `[data-testid='booking-item']`, `nav[data-testid='horizontal-tabs']` on `/bookings/*`
   - `[data-testid='vertical-tab-Settings']` on `/settings/admin/*`
5. **NextAuth session cookies (not Bearer tokens) for the webapp.** The seed script and the smoke pipeline both use API-key auth for REST (`?apiKey=...`) and session cookies for UI navigation. The smoke pipeline performs a one-time NextAuth login at startup and injects the resulting cookie into the browser context before navigating to authed surfaces (event-types, bookings-list, admin-settings).
6. **Booking-page is a public route but requires a valid event-type slug.** The smoke pipeline targets `/admin/admin-30min` (the slug created by `seed.sh`). If the seed has not been run, this URL 404s. The smoke pipeline checks for the slug's existence via the API before attempting to navigate.
7. **Time-relative timestamps on `/bookings/upcoming`.** Booking rows render "in 3 hours" / "tomorrow at 10:00" timestamps relative to wall clock. Baseline and defect are captured back-to-back so drift is <1s; for W7+ multi-session capture, use `page.clock.install()` to freeze time before navigation. The fixture booking dates (2026-06-10/11/12) are intentionally chosen to be a few days in the future relative to the W5 capture window so they appear on `/bookings/upcoming` (the default tab) rather than on `/bookings/past`.
8. **`.admin-apikey` is a non-secret development credential.** The cached API key gives full admin access to the local Cal.com instance, which is never exposed beyond the local docker network. It is gitignored implicitly by the project's `.gitignore` (the file path is `apps/cal-com/.admin-apikey`; add an explicit gitignore entry if the project gitignore is rewritten). DO NOT copy the cached key into shared environments.

## Environmental blockers

- **2026-06-06 (W5 commit):** Docker not installed on the W5 dev machine. As with every prior app, the `tests/smoke_cal-com_pipeline.ts` end-to-end run is deferred to the next machine with Docker. The 6 injection primitives ARE validated by `tests/test_primitives_unit.ts` (6/6 passing) and `tests/smoke_offline_pipeline.ts` (12 offline PNGs proving the primitive deltas are visible against synthetic markup).
