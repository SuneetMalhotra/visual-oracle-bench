# Application Onboarding

8 OSS web applications, each Dockerized and seeded for reproducible screenshot capture.

| App | Class | Onboarding week | Status |
|---|---|---|---|
| Conduit (RealWorld) | Social/blog | W2 | not started |
| Mattermost | Chat/collab | W3 | not started |
| Excalidraw | Canvas/design | W3 | not started |
| GitLab CE | Code host | W4 | not started |
| Rocket.Chat | Chat/collab | W4 | not started |
| Penpot | Canvas/design | W5 | not started |
| Cal.com | Scheduling | W5 | not started |
| NocoDB | Database UI | W5 | not started |

## Per-app onboarding checklist (2-day budget)

For each app, complete in `apps/{name}/`:

1. **Dockerfile** — pin upstream image digest (not tag). Boot to first paint <60s.
2. **seed.sh** — scripted seed data: users, content, navigation state.
3. **RUNBOOK.md** — how to reproduce app state from cold start; viewport assumptions; known-stable UI surfaces.
4. **injection-points.yaml** — list of 50 defect injection points distributed across 6 categories (suggested 8/8/8/8/9/9 split). Each entry: `{id, category, selector, expected_visible_change}`.
5. **wait-conditions.yaml** — `wait_for_selector` + post-`networkidle` buffer for each captured UI surface.

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
