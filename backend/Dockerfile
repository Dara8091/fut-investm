# Production stage
FROM node:20-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies
RUN npm install --omit=dev --no-optional

# Copy application source
COPY src/ ./src/

# Create runtime directories
RUN mkdir -p data logs

# Set proper permissions
RUN addgroup --system nodejs && \
    adduser --system --ingroup nodejs nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "src/index.js"]
