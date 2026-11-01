# syntax=docker/dockerfile:1.7
# Build from the repository root:  docker build -f deploy/Dockerfile -t twindesk-web .

ARG NODE_VERSION=22

# ---------------------------------------------------------------------------
# Build: install exactly what the lockfile says, then type-check and bundle.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
ENV CI=true

# Manifests first, so dependency layers are cached until the lockfile changes.
COPY package.json package-lock.json .npmrc ./
COPY packages/core/package.json packages/core/
COPY packages/embed-sdk/package.json packages/embed-sdk/
COPY apps/web/package.json apps/web/
# Lifecycle scripts are disabled: no dependency gets to run code during install.
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web

# Public build-time configuration only. Never pass secrets as VITE_ variables.
ARG VITE_API_MODE=mock
ARG VITE_API_BASE_URL=
ARG VITE_DEMO_MODE=true
ARG VITE_DEFAULT_TENANT=alchmai
ARG VITE_EMBED_ALLOWED_ORIGINS=
ENV VITE_API_MODE=${VITE_API_MODE} \
    VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_DEMO_MODE=${VITE_DEMO_MODE} \
    VITE_DEFAULT_TENANT=${VITE_DEFAULT_TENANT} \
    VITE_EMBED_ALLOWED_ORIGINS=${VITE_EMBED_ALLOWED_ORIGINS}

RUN npm run build

# ---------------------------------------------------------------------------
# Runtime: static files on unprivileged nginx (runs as uid 101, listens on 8080).
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime

USER root
RUN rm -f /etc/nginx/conf.d/default.conf
COPY --chown=101:0 deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chown=101:0 deploy/nginx/security-headers.inc.template /etc/nginx/templates/security-headers.inc.template
COPY --chown=101:0 --from=build /app/apps/web/dist /usr/share/nginx/html
USER 101

# Runtime settings, substituted into the nginx templates at start-up.
ENV TWINDESK_API_ORIGIN="" \
    TWINDESK_FRAME_ANCESTORS="'self'" \
    NGINX_ENVSUBST_FILTER="^TWINDESK_"

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
