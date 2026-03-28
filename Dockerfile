# Lightweight Database Migration Runner
FROM oven/bun:slim

WORKDIR /app

# Copy essential package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy database schema and configuration
COPY drizzle.config.ts .
COPY src/db ./src/db
COPY scripts ./scripts
COPY bin ./bin

# Start the database schema push automatically
CMD ["bun", "x", "drizzle-kit", "push", "--force"]
