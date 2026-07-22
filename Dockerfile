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

# Production stage - Use Ubuntu Noble for GLIBC 2.39 (required by bin/html2pdf)
FROM ubuntu:noble AS production

# Install Node.js 22, pnpm, and system libraries for html2pdf in one layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    fontconfig \
    fonts-liberation \
    libglib2.0-0 \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && corepack enable \
    && rm -rf /var/lib/apt/lists/*

# Set working directory and environment
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --gid 1001 nodejs && \
    adduser --uid 1001 --gid 1001 --disabled-password --gecos "" nodejs

# Create necessary directories first
RUN mkdir -p /app/storage/uploads /app/storage/cache /app/storage/private /app/.workspaces /app/temp && \
    chown -R nodejs:nodejs /app

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
