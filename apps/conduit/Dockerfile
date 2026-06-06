# apps/conduit/Dockerfile -- backend (Express + Prisma + SQLite)
#
# Builds the RealWorld Node/Express reference backend from the upstream Nx
# monorepo, pinned to commit SHA (more reproducible than a Docker Hub tag).
# The upstream Dockerfile expects a pre-built `dist/api` artifact; we run the
# Nx build inside the image so this Dockerfile is self-contained.
#
# Upstream: https://github.com/gothinkster/node-express-realworld-example-app
# Pinned commit: 30b68e1e881462b2f4164ea09ab4c4f5699c7b0b (master, 2024-01-04)
#
# Build:  docker build -t voracle/conduit-backend:pinned .
# Run:    docker run -p 3000:3000 voracle/conduit-backend:pinned

# ----- Stage 1: build ------------------------------------------------------
FROM node:20.11.1-alpine AS build

# Pinned commit for reproducibility (NOT a moving branch ref).
ARG REALWORLD_BACKEND_SHA=30b68e1e881462b2f4164ea09ab4c4f5699c7b0b

RUN apk add --no-cache git python3 make g++ openssl

WORKDIR /src

# Clone shallow + checkout the pinned SHA.
RUN git init && \
    git remote add origin https://github.com/gothinkster/node-express-realworld-example-app.git && \
    git fetch --depth 1 origin "${REALWORLD_BACKEND_SHA}" && \
    git checkout FETCH_HEAD

RUN npm ci --no-audit --no-fund
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma || true
RUN npx nx build api --configuration=production

# Apply database migrations against a fresh SQLite file shipped in the image.
ENV DATABASE_URL="file:/data/conduit.db"
RUN mkdir -p /data && \
    npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma || true

# ----- Stage 2: runtime ----------------------------------------------------
FROM node:20.11.1-alpine AS runtime

ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production
ENV JWT_SECRET="voracle-bench-non-secret-dev-key"
ENV DATABASE_URL="file:/data/conduit.db"

WORKDIR /app

RUN addgroup --system api && adduser --system -G api api && \
    mkdir -p /data && chown -R api:api /data

# Copy the Nx-built artifact and the migrated SQLite DB.
COPY --from=build --chown=api:api /src/dist/api /app/api
COPY --from=build --chown=api:api /data/conduit.db /data/conduit.db

# Install runtime deps for the bundled api.
RUN cd /app/api && npm install --omit=dev --no-audit --no-fund && \
    chown -R api:api /app

USER api
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget --spider -q http://localhost:3000/api/tags || exit 1

CMD ["node", "/app/api/main.js"]
