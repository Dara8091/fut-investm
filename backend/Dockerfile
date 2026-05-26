# Build stage
FROM node:20-alpine AS builder

# Force rebuild
ARG REBUILD_DATE=2026-05-26-v2

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm install --omit=dev --no-optional 2>/dev/null || npm install --omit=dev

# Copy application source
COPY src/ ./src/

# Verify the build
RUN ls -la /app/src/ && echo "Build OK"

# Production stage
FROM node:20-alpine

ARG REBUILD_DATE=2026-05-26-v2

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy built artifacts from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./

# Create runtime directories
RUN mkdir -p data logs

# Set proper permissions
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "src/index.js"]
