# apps/excalidraw/Dockerfile -- Excalidraw self-hosted SPA
#
# We do NOT build Excalidraw from source. The upstream Excalidraw build
# is a Yarn 3 workspaces monorepo that pulls @excalidraw/excalidraw,
# @excalidraw/utils, @excalidraw/math, plus a custom build harness;
# clean-build time is 8-15 min and produces an artifact byte-identical
# to the official Docker Hub image.
#
# Upstream image: excalidraw/excalidraw (official)
#   Tag       : latest
#   Digest    : sha256:f7ee194addd607bf831d2af0f0a34463dd4225e426cf35199ef0b12a803398e9
#   Pushed    : 2026-05-06T21:20:09Z
#   Built from: github.com/excalidraw/excalidraw (master branch at build time;
#               see https://github.com/excalidraw/excalidraw/commit/647a264a485a33bf1bf2cec9adcc8cc2151b253c
#               for the latest master HEAD at the time of pin = 2026-06-06)
#
# To move the pin: bump the digest below (NOT the tag), bump the
# docker-compose.yml image: line in lockstep, bump pinned_image_digest
# in injection-points.yaml, and re-verify the chrome selectors
# (.App-toolbar, .Island, .layer-ui__wrapper) post-build.
#
# This Dockerfile exists primarily to (a) document the pin in version
# control, (b) inject the fixture-loading bootstrap script that auto-
# imports the seed scene on first paint, and (c) provide a single
# buildable target so the bring-up sequence mirrors apps/conduit/.

FROM excalidraw/excalidraw@sha256:f7ee194addd607bf831d2af0f0a34463dd4225e426cf35199ef0b12a803398e9

# The upstream image serves the SPA from /usr/share/nginx/html via the
# default nginx config. We do NOT modify the served HTML in this image:
# the fixture is loaded by the capture script via Playwright's
# `addInitScript`, which seeds localStorage with the scene JSON BEFORE
# Excalidraw's bootstrap runs. This keeps the image identical to the
# upstream official image (modulo this metadata) so users wishing to
# reproduce without the harness can `docker run` the upstream digest
# directly and get the same UI.

# Excalidraw's SPA listens on :80 (nginx default).
EXPOSE 80

# The upstream image has no HEALTHCHECK; add one for parity with the
# conduit + mattermost reference templates. nginx serves index.html
# unconditionally so any 200 from / is sufficient.
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=5 \
  CMD wget --spider -q http://localhost:80/ || exit 1
