# Agent worker image (roadmap 2.8): Node 22 (worker + Agent SDK) plus
# Python 3 + Playwright Chromium (canonical scripts/ checks + header gen).
FROM node:22-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python3-venv fontconfig ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Browsers go to a shared path, not /root/.cache: the worker runs as the
# non-root `node` user (see USER below) and must still reach them.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright

WORKDIR /app

# Install JS deps first for layer caching.
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/worker/package.json apps/worker/
RUN npm ci

# Python deps for blogheaderimagegen (PEP 668: use a dedicated venv).
COPY blogheaderimagegen/requirements.txt /tmp/headergen-requirements.txt
RUN python3 -m venv /opt/headergen-venv \
  && /opt/headergen-venv/bin/pip install --no-cache-dir -r /tmp/headergen-requirements.txt \
  && /opt/headergen-venv/bin/playwright install --with-deps chromium
ENV HEADERGEN_PYTHON=/opt/headergen-venv/bin/python

# Python deps for blogscraper (competitive module, roadmap 6.1). Chromium
# system deps are already present from the headergen install; this venv's
# playwright resolves its own browser build into the shared cache.
COPY blogscraper/requirements.txt /tmp/scraper-requirements.txt
RUN python3 -m venv /opt/scraper-venv \
  && /opt/scraper-venv/bin/pip install --no-cache-dir -r /tmp/scraper-requirements.txt \
  && /opt/scraper-venv/bin/playwright install chromium
ENV SCRAPER_PYTHON=/opt/scraper-venv/bin/python

# Engine specs + tools + worker source.
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY agents ./agents
COPY standards ./standards
COPY templates ./templates
COPY config ./config
COPY context ./context
COPY scripts ./scripts
COPY blogheaderimagegen ./blogheaderimagegen
COPY blogscraper ./blogscraper
COPY CLAUDE.md ./
# Only the allowlisted seed folders (see .dockerignore).
COPY articles ./articles

# Only the engine + worker: apps/web is copied in (via `COPY apps`) but its
# deps were never installed here — it has its own image (Dockerfile.web).
RUN npm run build -w @blogagent/engine -w @blogagent/worker

ENV NODE_ENV=production \
    REPO_ROOT=/app \
    PYTHON_BIN=python3

# Claude Code refuses bypassPermissions (the Agent SDK's headless mode) as
# root, so the worker runs as `node`. It writes only article workspaces and
# scrape corpora; everything else in the image stays root-owned, read-only.
RUN mkdir -p /app/outputs \
  && chown -R node:node /app/articles /app/outputs /opt/ms-playwright
USER node

CMD ["node", "apps/worker/dist/cli.js", "start"]
