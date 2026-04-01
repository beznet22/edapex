# Production Optimization — Edge-Native Performance

EdApex runs on Cloudflare's edge network. Every operation must respect the hard constraints of the Workers runtime. This document defines the canonical optimization strategies for production-grade performance.

---

## 1. Cloudflare D1 (SQLite at the Edge)

### Hard Constraints
- **10ms CPU Limit**: All synchronous computation must complete within 10ms. Offload heavy work with `ctx.waitUntil()`.
- **1MB Query Result Limit**: Paginate large result sets. Use `LIMIT/OFFSET` or cursor-based pagination.
- **No Distributed Transactions**: Each `db.batch()` call is a single transaction. Cross-table atomic operations must use batching.
- **25MB Database Size (Free)**: Monitor DB size; archive old audit logs and attendance records quarterly.

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
  await auditLog.record(action);
});

// ❌ Never do this — sequential unbatched mutations
await db.insert(ledgerEntries).values(entry);
await db.update(bankAccounts).set({ balance: newBalance }); // Separate transaction!
```

### Index Strategy
- **Composite Indexes**: `(tenant_id, id)` on every operational table.
- **Covering Indexes**: For frequently queried columns, include them in the index to avoid table lookups.
- **Partial Indexes**: Use `WHERE active_status = 1` for tables with soft-delete patterns.
- **Query Plan Auditing**: Use `EXPLAIN QUERY PLAN` locally to validate index usage before deploying new queries.

---

## 2. Cloudflare R2 (Object Storage)
- Store user uploads, documents, and media assets.
- Generate presigned URLs for secure, time-limited access (TTL: 3600s for downloads, 300s for uploads).
- Never store file content in D1; store only the R2 key reference.
- **Path Convention**: `tenants/{tenantId}/{ownerType}/{ownerId}/{filename}`.
- **Lifecycle Rules**: Auto-delete expired temporary uploads after 24 hours.

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
- **No Heavy Dependencies**: Avoid bundling large libraries. Prefer edge-compatible alternatives.
- **Bundle Analysis**: Run `wrangler deploy --dry-run --outdir dist` to inspect output size before deploying.

---

## 6. Connection Management
- D1 connections are managed by the runtime—no connection pool configuration needed.
- For external APIs (Stripe, OpenAI), use connection reuse via `fetch` with `keepalive: true`.
- **Rate Limiting**: Implement tenant-level rate limiting using KV counters with TTL windows.

---

## 7. Observability & Monitoring

### Structured Logging
```typescript
// Standard log format for all services
console.log(JSON.stringify({
  level: 'info',
  tenantId, action: 'payment_received',
  duration_ms: Date.now() - start,
  metadata: { amount, ledgerEntryId },
}));
```

### Performance Budgets
| Operation | Budget | Action if Exceeded |
|:---|:---|:---|
| Controller → Response | < 50ms wall-clock | Profile DB queries |
| Repository query | < 5ms CPU | Add covering index |
| AI agent invocation | < 30s wall-clock | Streaming response |
| Sync reconciliation | < 100ms | Reduce batch size |

### Health Checks
- `GET /healthz` — Returns D1 connectivity status, Worker version, and uptime.
- `GET /readyz` — Returns readiness including KV, R2, and external API reachability.

---

## 8. Disaster Recovery & Data Integrity

### D1 Backup Strategy
- **Point-in-Time Recovery**: D1 supports automatic 30-day backups.
- **Export Schedule**: Weekly export of critical tables (ledger_entries, payroll_runs) via scheduled Workers.
- **Migration Safety**: Always run `wrangler d1 migrations apply edapex_db --local` before `--remote`.

### Data Validation
- **Ledger Integrity Check**: Monthly scheduled job to verify `SUM(credits) == SUM(debits)` per tenant.
- **Orphan Detection**: Quarterly scan for records with broken FK references (orphaned enrollments, allocations).

---

## 9. Deployment Checklist

Before every production deployment:

- [ ] Bundle size < 3MB (`wrangler deploy --dry-run`)
- [ ] All new queries use tenant_id composite indexes
- [ ] D1 migrations tested locally first
- [ ] KV cache invalidation handlers registered for new events
- [ ] No `console.error` exposing raw SQL or stack traces
- [ ] Health check endpoint updated if new dependencies added
- [ ] Sync handlers registered in `frontend/src/lib/sync.ts` for new collections
