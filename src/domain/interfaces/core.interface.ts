/**
 * Reusable generic abstract types that don't depend on the Drizzle Dialect
 */
export interface ITenant {
  id: string;
  name: string;
  code: string | null;
  email: string | null;
  subscriptionTier: "free" | "basic" | "premium" | "enterprise" | null;
  metadata: any;
  activeStatus: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAccount {
  id: string; // Better-Auth UUID
  tenantId: string | null;
  name: string;
  email: string | null;
  emailVerified: number;
  image: string | null;
  username: string | null;
  phoneNumber: string | null;
  activeStatus: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAcademicYear {
  id: string;
  tenantId: string;
  title: string;
  year: string | null;
  startingDate: string | null;
  endingDate: string | null;
  isCurrent: number | null;
  activeStatus: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IEnumerator {
  id: string;
  tenantId: string | null;
  domain: string;
  code: string;
  label: string;
  sortOrder: number | null;
  metadata: any;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/**
 * Core Domain Repository Interface
 * This is the Anti-Corruption Layer (ACL).
 * Hono Services depend strictly on `ICoreRepository`, never on Drizzle ORM directly.
 */
export interface ICoreRepository {
  // Tenant Operations
  getTenantById(id: string): Promise<ITenant | null>;
  getTenantByDomain(domain: string): Promise<ITenant | null>;
  createTenant(data: Partial<ITenant>): Promise<ITenant>;

  // Better-Auth Account Operations
  getAccountById(accountId: string): Promise<IAccount | null>;
  getAccountByEmail(email: string): Promise<IAccount | null>;
  
  // Academic Year Operations
  getAcademicYears(tenantId: string): Promise<IAcademicYear[]>;
  getCurrentAcademicYear(tenantId: string): Promise<IAcademicYear | null>;

  // Enumeration Operations
  getEnumsByDomain(tenantId: string | null, domain: string): Promise<IEnumerator[]>;
}
