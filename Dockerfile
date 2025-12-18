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

# Production stage - Use alpine for minimal size
FROM oven/bun:alpine AS production

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock* ./bun.lock*

# Install only production dependencies with offline mode for speed
RUN bun install --frozen-lockfile --production --prefer-offline && \
    # Clean up bun cache to reduce image size
    bun pm cache clean --force

# Copy static assets and other necessary files
COPY --from=builder /app/static ./static
COPY --from=builder /app/storage ./storage


# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Start the application using the start script
CMD ["bun", "run", "start"]
