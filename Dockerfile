# ==============================================================================
# Production Multi-Stage Dockerfile for Distributed Job Scheduler
# ==============================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application source
COPY . .

# Build Vite frontend assets and bundle backend server with esbuild
RUN npm run build

# ==============================================================================
# Production Runtime Stage
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production-only packages
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled build artifacts from builder
COPY --from=builder /app/dist ./dist

# Expose HTTP Port
EXPOSE 3000

# Health check endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/metrics/system || exit 1

# Start the bundled Express server + worker supervisor
CMD ["node", "dist/server.cjs"]
