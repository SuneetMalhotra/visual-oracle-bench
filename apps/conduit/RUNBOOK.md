# Conduit (RealWorld) — Onboarding Runbook

**Status:** W2 placeholder. Real onboarding planned 2026-06-15 to 2026-06-21.

## What this app provides for the benchmark

Conduit is the smallest fully-featured social/blog OSS web app. Selected as the W2 starting app because:
- Smallest container footprint
- Simplest seed data (users + articles + tags + comments)
- Well-documented official seed scripts
- React-based frontend (DOM-primary, easy to inject defects)
- 5+ navigable UI surfaces (home feed, article view, profile, editor, settings)

## W2 onboarding plan

1. Clone upstream: `https://github.com/gothinkster/realworld` (specifically the Vue/React/Node "Reference Apps")
2. Pin upstream Docker image digest in `Dockerfile`
3. Write `seed.sh` to populate 5 users, 10 articles, 5 tags, 20 comments
4. Identify 5 stable UI surfaces (home, article view, profile, editor, settings)
5. Write `injection-points.yaml` listing 50 defect points across 6 categories (suggested split: 8 layout / 8 color / 8 missing / 8 truncation / 9 zorder / 9 contrast)
6. Verify Playwright screenshot capture from cold start to all 5 surfaces in <60s

## Acceptance criteria

- `docker compose up` brings up app on localhost:3000 in <60s
- `seed.sh` completes in <30s and is idempotent
- Each of 5 UI surfaces is reachable via `wait_for_selector` from `wait-conditions.yaml`
- 50 defect-injection points specified with stable selectors

## Known risks (pre-registered)

- React StrictMode double-render may cause flaky baseline screenshots → disable in seed stage
- Article timestamps relative ("3 minutes ago") → freeze with seed.sh date offset
- User avatars random → seed deterministic avatars
