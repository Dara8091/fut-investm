# Production stage
FROM node:20-slim AS production

WORKDIR /app

# Install system dependencies for native modules and runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies with native module rebuild
RUN npm ci --omit=dev && \
    npm rebuild better-sqlite3 && \
    npm cache clean --force

# Copy application source
COPY src/ ./src/

# Copy public assets (legal pages, 404, etc.)
COPY public/ ./public/

# Create runtime directories
RUN mkdir -p data logs

# Set proper permissions for node user (uid 1000)
RUN chown -R node:node /app

# Use default node user
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "src/index.js"]
