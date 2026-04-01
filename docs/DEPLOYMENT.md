# EdApex V2: Deployment & CI/CD Strategy

This document outlines the authoritative infrastructure setup and deployment paths for the EdApex V2 Agentic School platform. It covers local development, Docker environments, Cloudflare serverless deployments, and automated CI/CD pipelines.

---

## 🏗️ 1. Technical Stack Overview
- **Frontend**: React 19, TanStack Start (SPA mode), Vite.
- **Backend / Edge**: Hono (RPC), Cloudflare Workers.
- **Local-First Database**: TanStack DB (IndexedDB) + Custom D1 Sync Engine.
- **Cloud Database**: Cloudflare D1 (SQLite), KV bindings for PBAC caching.

---

## 💻 2. Localhost Development

The standard daily driver environment for developers. Uses standard Hono and Vite tooling mapped via our `package.json` scripts.

### Prerequisites
- [Node.js](https://nodejs.org/) (v22+)
- [pnpm](https://pnpm.io/) (or Bun)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (`pnpm i -g wrangler`)

### Bootstrapping
1. **Install Dependencies**:
   ```bash
   pnpm install
   ```

2. **Provision D1 Locally**:
   Ensure your local D1 database schema aligns with Drizzle models.
   ```bash
   pnpm run db:migrate:local
   ```

3. **Start the Unified Dev Server**:
   Vite + TanStack Start will serve the UI while proxying RPC requests to your local edge-emulated Hono endpoints.
   ```bash
   pnpm run dev
   ```

4. **Verify Type Safety**:
   ```bash
   pnpm run typecheck
   ```

---

## 🐳 3. Docker & Docker Compose (Self-Hosted / Test Enviroment)

For isolated testing or self-hosting external to Cloudflare infrastructure. We emulate the edge environment using `miniflare` or native Node/Bun runtimes embedded in containers.

### Standard Commands
```bash
# Build the core image
pnpm run docker:build

# Spin up the orchestrated multi-container environment (API + UI + SQLite/Postgres stub)
pnpm run docker:up

# Tear down the environment
pnpm run docker:down
```

### Example `docker-compose.yml` (dev)
```yaml
version: "3.8"
services:
  web:
    build: 
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "5173:5173" # Vite Frontend
      - "8787:8787" # Miniflare / Hono Edge
    volumes:
      - ./src:/app/src
    environment:
      - NODE_ENV=development
```

*(Note: Production container environments must compile the edge handler to a standard Node `server.js` using adapter-node if straying from Cloudflare).*

---

## ☁️ 4. Cloudflare Ecosystem (Production Deployment)

EdApex natively deploys on the **Cloudflare Edge**.

### Prerequisites
- Authorized access to the targeted Cloudflare account.
- Configured `wrangler.toml` specifying `d1_databases` and `kv_namespaces`.

### Deployment Steps
1. **Apply Production Migrations**:
   Run D1 migrations against the live database before deploying new code.
   ```bash
   pnpm run db:migrate:prod
   ```
2. **Deploy to Workers**:
   Build the frontend bundle and publish the Hono edge worker.
   ```bash
   pnpm run build
   pnpm run start # Mapped to `wrangler deploy`
   ```

---

## 🔄 5. Automated CI/CD (GitHub Actions)

All code pushed to `main` must pass strict quality gates (as mandated by our Agent Prompts) and automatically deploy to staging/production.

### `.github/workflows/deploy.yml` Template
```yaml
name: Deploy EdApex V2

on:
  push:
    branches:
      - main
  pull_request:

jobs:
  validate-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "pnpm"
          
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        
      - name: Strict Typecheck
        run: pnpm run typecheck
        
      - name: Run Unit Tests
        run: pnpm run test

  deploy-edge:
    needs: validate-and-test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        
      - name: Build and Deploy to Cloudflare
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          command: deploy
```

## 🛠️ Project Management Commands Checklist
Ensure all agents and developers adhere to the orchestrated `package.json` macros:
- Formatting: `pnpm run format`
- Code Structure Audit: `pnpm run lint`
- End-to-End Build: `pnpm run build`
