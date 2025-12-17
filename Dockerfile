# Multi-stage build for production
# Build stage
FROM oven/bun:latest AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

RUN bun install --frozen-lockfile
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

# Install only production dependencies
RUN bun install --frozen-lockfile --production && \
    # Clean up bun cache to reduce image size
    bun pm cache clean --force

# Copy static assets and other necessary files
COPY --from=builder /app/static ./static

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
