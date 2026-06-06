# GitLab CE — Onboarding Runbook

**Status:** W4 — files complete; docker build pending machine with Docker installed. Selectors are inferred from upstream `gitlabhq/gitlabhq` at the `v16.11.0-ce.0` tag (matching the pinned image) and MUST be re-verified post-build (see "Known risks" #3).

## What this app provides for the benchmark

GitLab CE is the "code host" class app in the visual-oracle-bench corpus. Selected for:
- Rails 7 server-rendered DOM with progressive enhancement via Vue.js for some views (MR diffs, issue boards, admin panels). Selectors are stable BEM-style class names (`.foo__bar`) plus the modern GitLab UI library (`.gl-*`) plus `data-testid` / `data-qa-selector` attributes on Vue components.
- A rich, well-documented REST API (`/api/v4/...`) with both OAuth password-grant tokens and PATs. We use OAuth password-grant against the root user to bootstrap, eliminating any manual token-creation step from the seed flow.
- 5 navigable UI surfaces representative of code-host workflows: login (`/users/sign_in`), project dashboard (`/<group>/<project>`), merge requests list (`/<group>/<project>/-/merge_requests`), issue view (`/<group>/<project>/-/issues/<id>`), admin overview (`/admin`).
- It is the MOST COMPLEX onboarding in the corpus (5 backend services bundled in the omnibus image: Rails, Sidekiq, Gitaly, Postgres, Redis, nginx). Choosing the official Docker image rather than a from-source build is a deliberate cost-control decision tracked in OSF pre-registration §3.1.

## Upstream pins (immutable digests)

| Component | Source | Pin | Pushed |
|---|---|---|---|
| GitLab CE server | `gitlab/gitlab-ce` (Docker Hub) | digest `sha256:e1d8a2a4d59b46c5a9e2bda7c0bbf8a8f7e3a4e64a3d36f8d7c1d8d3c7e0e7e3` (tag `16.11.0-ce.0`, **REVIEWER MUST VERIFY**) | 2024-04-22 |
| Source for selector inference | `github.com/gitlabhq/gitlabhq` | tag `v16.11.0-ce.0` | 2024-04-22 |

The pinned digest written into `docker-compose.yml` is a representative placeholder produced WITHOUT a `docker pull` (Docker not installed on this dev machine). The reviewer must run:

```bash
docker pull gitlab/gitlab-ce:16.11.0-ce.0
docker inspect --format='{{index .RepoDigests 0}}' gitlab/gitlab-ce:16.11.0-ce.0
```

and update the digest in `docker-compose.yml` AND `injection-points.yaml` (field `pinned_image_digest:`) in lockstep. Tracked under "Known risks" #1.

The GitLab backend is NOT built from source (a from-source build is 3+ GB and 30+ min on a developer laptop; the official `gitlab/gitlab-ce` image is the upstream-supported distribution).

## Bring-up sequence

```bash
# 1. Pull + start (first cold pull ~5-10 min for a 2GB+ image)
docker compose -f apps/gitlab-ce/docker-compose.yml up -d

# 2. Wait for healthcheck. GitLab's first-boot runs DB migrations, secret
#    generation, Puma + Sidekiq + Gitaly + nginx init, and Rails reconfigure.
#    Cold-start to healthy is 3-5 MINUTES on a developer laptop.
while ! curl -sf http://localhost:8080/-/health >/dev/null; do
  echo "[wait] GitLab not yet healthy ..."; sleep 10
done
echo "[wait] GitLab is healthy"

# 3. Seed deterministic fixture
#    (3 users + 2 groups + 5 projects + 10 issues + 5 MRs)
./apps/gitlab-ce/seed.sh

# 4. Smoke test the injection -> capture pipeline (12 PNGs)
npx tsx tests/smoke_gitlab_ce_pipeline.ts
#    -> data/images/gitlab-ce/

# 5. Teardown (deletes named volumes -- ~3GB of state)
docker compose -f apps/gitlab-ce/docker-compose.yml down -v
```

## Acceptance criteria

- `docker compose up -d` brings GitLab CE healthy on `localhost:8080` in <10 min cold start (assuming image not cached) and <3 min warm restart.
- `/-/health` returns 200 within 6 min of `gitlab` container start (this is the GATING latency for the whole capture run; budget accordingly in W7).
- `seed.sh` completes in <2 min on a warm GitLab, is idempotent (re-running does not duplicate users / groups / projects / issues / MRs and does not fail).
- `npx tsx tests/smoke_gitlab_ce_pipeline.ts` produces 12 PNGs (6 baseline + 6 defect) under `data/images/gitlab-ce/` and writes `_smoke_ledger.json` with the DefectRecord for each shot.

## Fixture seeded by `seed.sh`

| Entity | Count | Identifiers |
|---|---|---|
| Sysadmin | 1 | `root` / `voracle-seed-Pa55word!` (created by GitLab at first boot via `initial_root_password`) |
| Regular users | 3 | `alice`, `bob`, `carol` (all email `<name>@voracle.test`, all password `voracle-seed-Pa55word!`) |
| Groups | 2 | `engineering`, `design` |
| Projects | 5 | 2 group-owned: `engineering/oracle-bench-core`, `engineering/seedings-catalog`; 3 user-owned: `alice/notes`, `bob/scratchpad`, `carol/playground` (all with README initialized on `main`) |
| Issues | 10 | 2 per project, deterministic titles (see `seed.sh`) |
| Merge requests | 5 | 1 per project, all `opened`, all `feat/voracle-bench-seed` -> `main`, each adding a `SEED.md` |

### First-boot password handling

GitLab normally writes a random root password to `/etc/gitlab/initial_root_password` on first boot and rotates it after 24h. We override this by setting `initial_root_password: 'voracle-seed-Pa55word!'` in the omnibus config (`docker-compose.yml`). The password is therefore stable across container lifetimes and `seed.sh` can convert it to an OAuth access token via the standard `POST /oauth/token` `password` grant — no manual PAT-creation step required.

If you ever destroy the `gitlab_data` volume and recreate, the password seeding still works (it is re-applied by the reconfigure step on the new volume). If you change `initial_root_password` AFTER first boot, it is ignored — you must `docker compose down -v` to take effect.

## Known risks and mitigations (pre-registered)

1. **Image digest is unverified placeholder.** The `sha256:...` written into `docker-compose.yml` and `injection-points.yaml` was NOT produced by a real `docker pull` (Docker not installed on dev machine). The reviewer with Docker must replace it with the actual multi-arch index digest from `docker inspect` before W7 capture. Use the `16.11.0-ce.0` tag as the source-of-truth for which release we are targeting.
2. **Boot time is the GATING latency for the corpus capture run.** GitLab needs 3-5 min from `docker compose up` to first healthy response on `/-/health`. The capture script must use the `while ! curl -sf .../-/health` wait-loop documented above, not `docker compose --wait` (the latter respects healthcheck `start_period` but still flake-fails on slow laptops). For W7 corpus capture, budget 7 min for the GitLab bring-up.
3. **Selectors in `injection-points.yaml` are INFERRED from the upstream source, not verified against a running container.** GitLab's mix of Rails-rendered HAML + Vue.js means class names can shift between feature flags and theme settings. The first real-Docker run MUST sweep all 50 selectors with Playwright `page.$$()` and report any zero-match selectors. Flip `selector_verification_status: inferred` to `verified` in `injection-points.yaml` after the sweep passes. Highest-risk selectors:
   - `.merge-request-list-table` -- the MR list UI was refactored in GitLab 16.x; the actual container may be `.issuable-list` or use a Vue grid component without a stable class.
   - `.issue-sticky-header` -- present only when scrolled past the issue title in viewport >= 1024px; the capture pipeline uses 1440x900 so this is expected to be visible, but verify.
   - `.admin-dashboard-stats` -- admin landing page has been progressively Vue-ified across 16.x; the actual selector may be a `data-testid` on a Vue wrapper.
4. **Devise CSRF token on `/users/sign_in`.** The login surface includes a CSRF token in a hidden form field. This is stable within a session but the value rotates per page load — does NOT affect screenshots, but DO NOT compare DOM-text snapshots of the login page; compare images only.
5. **GitLab emits absolute URLs based on `external_url`.** We force `external_url 'http://localhost:8080'` in `GITLAB_OMNIBUS_CONFIG` so every link in seeded MRs / issues uses `localhost:8080`. If a future reviewer moves the publish port off `:8080`, they must update `external_url` in lockstep or links in screenshots will point at the wrong host.
6. **`hostname: localhost` in compose.** GitLab uses `gitlab_rails['gitlab_host']` for SSH clone URLs. Setting compose-level `hostname: localhost` keeps SSH URLs as `git@localhost:2222/...`; harmless for the capture pipeline but documented here so it is not a surprise.

## Environmental blockers

- **2026-06-06 (this commit):** Docker not installed on the W4 dev machine. The `tests/smoke_gitlab_ce_pipeline.ts` end-to-end run is therefore deferred to the next machine with Docker. The 6 primitives ARE validated by `tests/test_primitives_unit.ts` (passing 6/6 against a synthetic HTML fixture) and the offline pipeline-equivalence test (`tests/smoke_offline_pipeline.ts`) produces 12 PNGs proving baseline-vs-defect deltas are visible at the primitive level.
- **Selector verification:** as above — the 50 selectors in `injection-points.yaml` need a real-Docker sweep before W7 corpus capture.
