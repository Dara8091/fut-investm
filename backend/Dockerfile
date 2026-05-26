FROM node:20-slim

WORKDIR /app

# Install build dependencies for native modules + curl for healthcheck
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# Copy and install dependencies
COPY package.json ./
RUN npm install --production --no-optional 2>&1 || npm install --production

# Rebuild native modules from source
RUN cd node_modules/better-sqlite3 && npm run build-release 2>/dev/null || true

# Copy application code
COPY src/ ./src/
COPY public/ ./public/

# Create directories
RUN mkdir -p data logs && chown -R node:node /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "src/index.js"]
