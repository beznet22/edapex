# Multi-stage build for production
# Build stage
FROM node:22-slim AS builder

# Enable pnpm via corepack (version from package.json packageManager field)
RUN corepack enable

# Build-time placeholder — Telegram adapter validates botToken at module import
# during postbuild analysis. Real value injected at runtime via compose.
# ARG (not ENV) ensures it doesn't persist into production image layers.
ARG TELEGRAM_BOT_TOKEN=placeholder

WORKDIR /app

# Copy package files first to leverage Docker layer caching
COPY package.json pnpm-lock.yaml ./

# Install dependencies with frozen lockfile for reproducible builds
RUN pnpm install --frozen-lockfile

# Copy source code excluding unnecessary files (using .dockerignore)
COPY . .

# Build the SvelteKit application
RUN pnpm run build

# Production stage - Use slim (Debian) for glibc compatibility and smaller size
FROM node:22-slim AS production

# Enable pnpm via corepack
RUN corepack enable

# Set working directory and environment
WORKDIR /app
ENV NODE_ENV=production

# Install necessary libraries for html2pdf and rendering in one layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fontconfig \
    fonts-liberation \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user first
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs nodejs

# Create necessary directories first
RUN mkdir -p /app/storage/uploads /app/storage/cache /app/storage/private /app/temp && \
    chown -R nodejs:nodejs /app/storage /app/temp

# Copy files using --chown to prevent layer doubling
COPY --from=builder --chown=nodejs:nodejs /app/build ./build
COPY --from=builder --chown=nodejs:nodejs /app/bin ./bin
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder --chown=nodejs:nodejs /app/static ./static

# Install only production dependencies and clean cache in one layer
RUN pnpm install --frozen-lockfile --prod && \
    pnpm store prune && \
    chmod +x /app/bin/html2pdf && \
    chown -R nodejs:nodejs /app/temp

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000
EXPOSE 587
EXPOSE 465

# Start the application
CMD ["node", "build/index.js"]
