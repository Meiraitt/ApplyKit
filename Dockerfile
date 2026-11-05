# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
RUN npm ci --prefix backend && npm ci --prefix frontend
COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src
COPY frontend ./frontend
RUN npm run build --prefix backend && npm run build --prefix frontend \
    && npm prune --omit=dev --prefix backend

FROM node:24-bookworm-slim AS runtime
ARG CODEX_VERSION=0.166.0
ARG CLAUDE_VERSION=2.1.318
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    DISABLE_AUTOUPDATER=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium ca-certificates fonts-liberation git \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global @openai/codex@${CODEX_VERSION} @anthropic-ai/claude-code@${CLAUDE_VERSION} \
    && npm cache clean --force
WORKDIR /app
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend/dist ./frontend/dist
RUN mkdir -p /app/data/cvs /home/node/.codex /home/node/.claude \
    && chown -R node:node /app/data /home/node
USER node
EXPOSE 3333
CMD ["node", "backend/dist/server.js"]
