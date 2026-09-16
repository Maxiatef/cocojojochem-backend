# Multi-stage so the runtime image carries no TypeScript sources, no dev
# dependencies and no build cache — the deployed image is dist/ plus prod
# node_modules.
FROM node:20-alpine AS builder
WORKDIR /app

# Copied separately from the sources so a source-only change reuses the cached
# dependency layer instead of reinstalling every time.
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Uploads live on disk (see DEPLOY.md). Declared as a volume so the files
# survive a container replacement — mount a real persistent disk here, or the
# images are lost on every deploy.
RUN mkdir -p /app/uploads
VOLUME ["/app/uploads"]

# Informational only; the app binds process.env.PORT, which the host sets.
EXPOSE 4000

CMD ["node", "dist/main.js"]
