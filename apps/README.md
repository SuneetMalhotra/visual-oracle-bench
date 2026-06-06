# Application Onboarding

8 OSS web applications, each Dockerized and seeded for reproducible screenshot capture.

| App | Class | Onboarding week | Status |
|---|---|---|---|
| Conduit (RealWorld) | Social/blog | W2 | **files complete; docker build pending** |
| Mattermost | Chat/collab | W3 | **files complete; docker build pending; selectors inferred from release-11.8, post-build verification required** |
| Excalidraw | Canvas/design | W3 | **files complete; docker build pending; canvas-content injection uses positional-overlay compromise (32/50 chrome, 18/50 canvas overlays) — see RUNBOOK.md #3** |
| GitLab CE | Code host | W4 | **files complete; docker build pending** |
| Rocket.Chat | Chat/collab | W4 | **files complete; docker build pending** |
| Penpot | Canvas/design | W5 | **files complete; docker build pending; SVG canvas-content injection uses positional-overlay compromise (28/50 chrome, 22/50 canvas overlays) — see RUNBOOK.md #3** |
| Cal.com | Scheduling | W5 | **files complete; docker build pending; selectors inferred from v4.9.0 source pin, post-build verification required; image-digest is verify-on-pull placeholder (see RUNBOOK.md #1) with documented build-from-source fallback** |
| NocoDB | Database UI | W5 | **files complete; docker build pending; selectors inferred from v0.262 source pin, post-build verification required; grid view has reactive-rendering drift mitigated by 2-frame-stability wait (see RUNBOOK.md #3)** |

## Per-app onboarding checklist (2-day budget)

For each app, complete in `apps/{name}/`:

1. **Dockerfile** — pin upstream by commit SHA or image digest (NOT a moving tag). Boot to first paint <60s after the first build.
2. **seed.sh** — scripted seed data: users, content, navigation state. Idempotent.
3. **RUNBOOK.md** — how to reproduce app state from cold start; viewport assumptions; known-stable UI surfaces.
4. **injection-points.yaml** — list of 50 defect injection points distributed across 6 categories (8/8/8/8/9/9 split). Schema: see `apps/conduit/injection-points.yaml` (the W2 reference implementation).
5. **wait-conditions.yaml** *(optional for apps where `networkidle` + 400ms is insufficient)* — `wait_for_selector` + post-`networkidle` buffer for each captured UI surface.

The Conduit subdir (`apps/conduit/`) is the **W2 reference template** — copy its layout and adapt the upstream pins, seed payload, and selectors for each new app.

## Substitution rule (pre-registered in OSF)

If any of the 8 apps cannot be onboarded by 2026-07-12 (W5 milestone), drop in priority order:
1. NocoDB
2. Penpot

Re-derive sample to 7 or 6 apps; document substitution in manuscript.

## App selection rationale (locked in OSF pre-registration)

Selected for diversity across:
- **Application class:** social/blog, chat, design canvas, code host, scheduling, database UI
- **Frontend framework:** React (Conduit, Excalidraw), React Native Web (Mattermost), Meteor (Rocket.Chat), Vue/Rails (GitLab CE), ClojureScript (Penpot), Next.js (Cal.com), Vue (NocoDB)
- **Rendering paradigm:** DOM-primary (Conduit, GitLab CE), heavy canvas/SVG (Excalidraw, Penpot), real-time-rendered (Mattermost, Rocket.Chat)
- **Defect-injection surface diversity:** text-heavy, form-heavy, image-heavy, drag-drop, table-heavy
