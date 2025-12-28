# Multi-stage build for production
# Build stage
FROM oven/bun:latest AS builder

WORKDIR /app

# Copy package files first to leverage Docker layer caching
COPY package.json bun.lock* ./

# Install dependencies with frozen lockfile for reproducible builds
RUN bun install --frozen-lockfile --prefer-offline

# Copy source code excluding unnecessary files (using .dockerignore)
COPY . .

# Build the SvelteKit application
RUN bun run build

# Production stage - Use slim (Debian) for glibc compatibility and smaller size
FROM oven/bun:slim AS production

# Set working directory and environment
WORKDIR /app
ENV NODE_ENV=production

# Install necessary libraries for html2pdf and rendering in one layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fontconfig \
    fonts-liberation \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/temp

# Create non-root user first
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs nodejs

# Copy files using --chown to prevent layer doubling
COPY --from=builder --chown=nodejs:nodejs /app/build ./build
COPY --from=builder --chown=nodejs:nodejs /app/bin ./bin
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/bun.lock* ./bun.lock*
COPY --from=builder --chown=nodejs:nodejs /app/static ./static
COPY --from=builder --chown=nodejs:nodejs /app/storage ./storage

# Install only production dependencies and clean cache in one layer
RUN bun install --frozen-lockfile --production --prefer-offline && \
    bun pm cache clean --force && \
    chmod +x /app/bin/html2pdf && \
    chown -R nodejs:nodejs /app/temp

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Start the application
CMD ["bun", "run", "start"]
