# Production Optimization — Edge-Native Performance

EdApex runs on Cloudflare's edge network. Every operation must respect the hard constraints of the Workers runtime, as detailed in `backend-dev-guidelines`.

---

## 1. Cloudflare D1 (SQLite at the Edge)

### Hard Constraints
- **10ms CPU Limit**: All synchronous computation must complete within 10ms. Offload heavy work with `ctx.waitUntil()`.
- **1MB Query Result Limit**: Paginate large result sets.
- **No Distributed Transactions**: Each `db.batch()` call is a single transaction.

### Optimization Strategies
```typescript
// ✅ Batch mutations for atomicity and performance
const results = await db.batch([
  db.insert(ledgerEntries).values(entry).returning(),
  db.update(bankAccounts).set({ balance: newBalance }).where(eq(bankAccounts.id, bankId)),
]);

// ✅ Use ctx.waitUntil() for non-critical work
ctx.waitUntil(async () => {
  await eventBus.emit('finance.payment_received', payload);
});
```

### Index Strategy
- **Composite Indexes**: `(tenant_id, id)` on every operational table.
- **Covering Indexes**: Include frequently queried columns in the index.
- **Partial Indexes**: Use `WHERE active_status = 1`.

---

## 2. Cloudflare R2 (Object Storage)
- Store documents and media assets.
- Generate presigned URLs for secure access.
- **Path Convention**: `tenants/{tenantId}/{ownerType}/{ownerId}/{filename}`.

---

## 3. Cloudflare KV (Key-Value Store)
- Cache frequently accessed, rarely changing data: tenant configs, feature flags, enumeration lookups.
- Use `KV.getWithMetadata()` for conditional freshness checks.
- **TTL Strategy**:

| Data Type | TTL | Invalidation Strategy |
|:---|:---|:---|
| User sessions | 60s | Auth middleware refresh |
| Tenant configs | 300s | `settings.config_updated` event |
| Enumerations | 3600s | Manual flush on update |
| Feature flags | 120s | `settings.feature_toggled` event |
| Balance sheet cache | 600s | `finance.ledger_posted` event |

---

## 4. Cache API (Edge Caching)
- Cache API responses at the edge for read-heavy endpoints.
- **Cacheable Endpoints**: `GET /api/v1/enumerations`, `GET /api/v1/settings/:domain`, `GET /api/v1/cms/public/*`.
- Use `Cache-Control` headers with `stale-while-revalidate` for optimal UX.
- Invalidate cache entries on write operations via `cache.delete(request)`.

```typescript
// Edge caching pattern
const cacheKey = new Request(c.req.url);
const cache = caches.default;
const cached = await cache.match(cacheKey);
if (cached) return cached;

const response = await handler(c);
ctx.waitUntil(cache.put(cacheKey, response.clone()));
return response;
```

---

## 5. Bundle Size Management
- **3MB Limit**: The total Worker bundle must not exceed 3MB after compression.
- **Tree Shaking**: Import only what you need from Drizzle ORM and Mastra SDK.
- **Dynamic Imports**: Use `import()` for rarely-needed modules (e.g., CSV export, PDF generation).
- **Bundle Analysis**: Run `wrangler deploy --dry-run --outdir dist` to inspect output size before deploying.

---

## 6. Connection Management
- D1 connections are managed by the runtime—no connection pool configuration needed.
- For external APIs (Stripe, OpenAI), use connection reuse via `fetch` with `keepalive: true`.
- **Rate Limiting**: Implement tenant-level rate limiting using KV counters with TTL windows.

---

## 7. Observability & Monitoring
- **Structured Logging**: Use JSON format with `tenantId`, `action`, `layer`, and `run_id`.
- **Performance Budgets**: Controller response < 50ms, Repo query < 5ms CPU.
- **Proactive AI Issue Tracking**: Auditor agents scan `cost_events` and `agent_runs` for failures, automatically creating `SECURITY_INCIDENT` or `SYSTEM_ISSUE` WorkProducts in the Command Center.

---

## 8. Deployment Checklist
- [ ] Bundle size < 3MB (`wrangler deploy --dry-run`)
- [ ] All new queries use tenant_id composite indexes
- [ ] D1 migrations tested locally first
- [ ] KV cache invalidation handlers registered
- [ ] Health check endpoint updated
- [ ] Sync handlers registered in `frontend/src/lib/sync.ts`
