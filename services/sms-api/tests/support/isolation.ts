import { expect } from "vitest";

import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import type {
  RepositoryDb,
  ScopedRepositoryContext
} from "../../src/lib/server/repository/base/repository-context";
import { tenantOf } from "./seed";
import type { SeededSchool } from "./seed";

export interface IsolationCase<TRow extends { readonly id: number }> {
  readonly name: string;
  readonly run: (ctx: ScopedRepositoryContext) => Promise<readonly TRow[]>;
  /** Set only when the second tenant legitimately has no matching rows. */
  readonly allowEmptyForSecondTenant?: boolean;
}

/**
 * Runs every read against both seeded tenants. The caller's rows must be
 * present and must never appear in the other tenant's result set.
 */
export async function expectTenantIsolation<TRow extends { readonly id: number }>(
  db: RepositoryDb,
  schools: readonly [SeededSchool, SeededSchool],
  cases: readonly IsolationCase<TRow>[]
): Promise<void> {
  const [first, second] = schools;
  const contexts: readonly [ScopedRepositoryContext, ScopedRepositoryContext] = [
    createRepositoryContext(db, tenantOf(first)),
    createRepositoryContext(db, tenantOf(second))
  ];

  for (const testCase of cases) {
    const own = await testCase.run(contexts[0]);
    const other = await testCase.run(contexts[1]);
    expect(own.length, `${testCase.name} returned nothing for its own tenant`).toBeGreaterThan(0);
    if (testCase.allowEmptyForSecondTenant !== true) {
      expect(other.length, `${testCase.name} returned nothing for tenant 2`).toBeGreaterThan(0);
    }
    const ownIds = new Set(own.map((row) => row.id));
    for (const row of other) {
      expect(ownIds.has(row.id), `${testCase.name} leaked row ${row.id} across tenants`).toBe(false);
    }
  }
}
