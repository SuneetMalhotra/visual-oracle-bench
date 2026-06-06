# Excalidraw (self-hosted SPA) — Onboarding Runbook

**Status:** W3 — files complete; docker build pending machine with Docker installed. Selectors inferred from upstream master commit `647a264a485a33bf1bf2cec9adcc8cc2151b253c` and MUST be re-verified post-build. Canvas-content injection is documented as a methodological compromise (see "Known risks" #3).

## What this app provides for the benchmark

Excalidraw is the canvas/design class app for visual-oracle-bench. Selected for:
- Canvas-primary rendering paradigm (HTMLCanvas + Roughjs) that fundamentally differs from the DOM-primary Conduit / Mattermost stacks — necessary for external-validity claims about LLM-as-judge across rendering paradigms.
- React UI chrome wrapping the canvas: toolbar, library panel, modals, settings drawer all use stable DOM/CSS selectors that the 6 DOM injection primitives CAN mutate.
- Single-user, IndexedDB / localStorage-backed: NO backend server, NO database, NO authentication, NO seed-via-REST flow. Drastically simpler bring-up than Mattermost.
- 5 navigable UI surfaces (all on `/`, differentiated by app-state): empty-canvas, toolbar-visible (canvas + chrome), library-open (left panel pinned), export-modal (image-export dialog), settings-drawer (bottom-left menu).

## Upstream pins (immutable digests)

| Component | Source | Pin | Pushed / committed |
|---|---|---|---|
| Excalidraw SPA | `excalidraw/excalidraw` (Docker Hub) | digest `sha256:f7ee194addd607bf831d2af0f0a34463dd4225e426cf35199ef0b12a803398e9` (tag `latest`) | 2026-05-06 |
| Source for selector verification | `github.com/excalidraw/excalidraw` | commit `647a264a485a33bf1bf2cec9adcc8cc2151b253c` (master HEAD) | 2026-06-06 |

NOTE: the Docker Hub image was built from an EARLIER master commit than the `pinned_source_sha` (image pushed 2026-05-06, source pin 2026-06-06). This is intentional: the Docker image is the canonical build artifact; the source SHA is the most-recent reference for the reviewer to grep for selector class names. The smoke pipeline runs against the IMAGE, not the source.

To move the pin: bump the image digest in `Dockerfile`, `docker-compose.yml`, AND `injection-points.yaml` in lockstep, then re-verify the chrome selectors against the new build.

## Bring-up sequence

```bash
# 1. Build + start (first run ~2 min for image pull, <10s subsequent)
docker compose -f apps/excalidraw/docker-compose.yml up --build -d

# 2. Wait for healthcheck (nginx is up almost immediately)
docker compose -f apps/excalidraw/docker-compose.yml ps

# 3. (Optional) Pre-warm the fixture into a running browser session.
#    This step is NOT required: the smoke pipeline seeds via addInitScript
#    automatically. seed.ts is provided for parity with apps/conduit/seed.sh
#    and for out-of-band manual loads where a human wants to interact with
#    the seeded canvas.
npx tsx apps/excalidraw/seed.ts

# 4. Smoke test the injection -> capture pipeline (12 PNGs)
npx tsx tests/smoke_excalidraw_pipeline.ts
#    -> data/images/excalidraw/

# 5. Teardown
docker compose -f apps/excalidraw/docker-compose.yml down -v
```

## Acceptance criteria

- `docker compose up` brings nginx up on `localhost:5500` in <2 min cold start (image pull dominates), <10s subsequent.
- `apps/excalidraw/seed.ts` writes `fixtures/seed-scene.json` and `fixtures/seed-library.json` deterministically (byte-identical re-runs). The "live" portion (browser session that injects into localStorage) is best-effort and silently no-ops if Excalidraw isn't running.
- `npx tsx tests/smoke_excalidraw_pipeline.ts` produces 12 PNGs (6 baseline + 6 defect) under `data/images/excalidraw/` and writes `_smoke_ledger.json` with the `DefectRecord` for each shot.

## Fixture seeded by `seed.ts`

| Entity | Count | Identifiers |
|---|---|---|
| Scene elements | 10 | 2 rectangles, 2 ellipses, 2 diamonds, 1 arrow, 1 line, 1 text ("Visual Oracle Bench Fixture"), 1 free-draw |
| Library items | 3 | voracle-lib-star, voracle-lib-callout, voracle-lib-arrow-set |
| App state | 1 | zoom 1.0, scroll (0,0), theme light, name "voracle-bench-fixture" |
| Element seeds | fixed | every element has a fixed `seed` int (1001–1010); Roughjs uses this for jitter, so re-renders are pixel-identical across runs |
| Updated timestamp | fixed | `1717689600000` (2024-06-06T16:00:00Z) on every element |

The fixture is written to `apps/excalidraw/fixtures/seed-scene.json` and `apps/excalidraw/fixtures/seed-library.json`. These files are reproducible Excalidraw-format JSON; a human can drop either into the Excalidraw "Open" / "Load library" UI to reproduce the canvas state by hand.

## Known risks and mitigations (pre-registered)

1. **Excalidraw localStorage schema may change between versions.** Excalidraw 0.x has migrated the `excalidraw-state` schema several times. The keys we write (`excalidraw`, `excalidraw-state`, `excalidraw-library`) match the schema at the pinned image. If the pin moves, run a one-shot fixture sanity test by loading the SPA fresh and confirming the 10 shapes render at the seeded coordinates.

2. **Library import format also drifts.** We write the library as `{type:"excalidrawlib", version:2, source, libraryItems:[...]}` per the schema at `excalidraw/packages/excalidraw/data/library.ts` at the pinned source SHA. Re-verify the `version` field if Excalidraw cuts a 0.18+ release.

3. **CANVAS-CONTENT INJECTION COMPROMISE (methodological).** Excalidraw renders all drawn shapes to a single HTMLCanvas with no per-shape selectors. The 6 DOM injection primitives in `injection/primitives.ts` cannot mutate canvas pixels via CSS selectors. **Pre-registered mitigation:**
   - 32 of 50 injection points target the UI CHROME (toolbar, library panel, settings drawer, export modal, top/bottom menu islands) where Excalidraw renders standard HTML/CSS DOM with stable React class names. These 32 points use the same primitive API as Conduit and Mattermost with no compromise.
   - 18 of 50 injection points target canvas content. These are marked with `params.canvas_compromise: true` in `injection-points.yaml`. The smoke pipeline implements them as DOM-equivalent positional overlays (absolutely-positioned divs aligned to the canvas bounding box, populated with text and rectangles that mirror the seeded canvas content). For the W3 milestone, these overlays SIMULATE the visual effect of the defect on canvas; the full canvas-pixel injection harness (using `page.evaluate` to call into Excalidraw's `ExcalidrawAPI.updateScene()` plus pixel-level mutation via `OffscreenCanvas`) is scheduled for W5. Documented in the OSF pre-registration draft (`preregistration/draft.md` §6.3, "Excalidraw canvas-content compromise").
   - The 8/8/8/8/9/9 category distribution is preserved through this compromise; what changes is only the surface mix, not the per-category counts.

4. **Welcome-screen-only surface ("empty-canvas") requires localStorage clearing.** Excalidraw shows the welcome screen ONLY when localStorage is empty. The smoke pipeline gets `empty-canvas` by opening a fresh browser context with no fixture seeding. Other surfaces all use the seeded context. This is handled in `tests/smoke_excalidraw_pipeline.ts` via two separate `BrowserContext`s.

5. **Export-modal and settings-drawer require interactive open.** Neither is deep-linkable. The smoke pipeline drives:
   - Export modal: click `.App-menu_top .ToolIcon` (hamburger) -> click `.dropdown-menu-item[data-testid="export-image"]`.
   - Settings drawer: click `.App-menu_top .ToolIcon` (hamburger).
   Documented in the test file.

6. **Library panel "open" state is not the default.** On a fresh load, the library panel is collapsed. The smoke pipeline opens it via `page.click('.ToolIcon[aria-label="Library"]')` before capture.

7. **Theme drift (light vs system).** Excalidraw 0.17 added system-theme detection that can flip the app to dark mode based on OS preferences during headless capture. The seeded `appState.theme = 'light'` overrides this. Re-verify if the pin moves.

## Environmental blockers

- **2026-06-06 (W3 commit):** Docker not installed on the W3 dev machine. As with Conduit and Mattermost, the `tests/smoke_excalidraw_pipeline.ts` end-to-end run is deferred to the next machine with Docker. The 6 injection primitives ARE validated by `tests/test_primitives_unit.ts` (6/6 passing) and `tests/smoke_offline_pipeline.ts` (12 offline PNGs proving the primitive deltas are visible against synthetic markup).
