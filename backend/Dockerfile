# Production stage
FROM node:20-slim

WORKDIR /app

# Install system dependencies for native modules (better-sqlite3)
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies
# Use npm install instead of ci to handle missing/mismatched lock files gracefully
RUN npm install --omit=dev && \
    npm rebuild better-sqlite3 --build-from-source && \
    npm cache clean --force

# Copy application source
COPY src/ ./src/

# Copy public assets
COPY public/ ./public/

# Create runtime directories
RUN mkdir -p data logs

# Set proper permissions
RUN chown -R node:node /app

# Use default node user
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "src/index.js"]
