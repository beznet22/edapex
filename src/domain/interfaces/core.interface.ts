/**
 * Reusable generic abstract types that don't depend on the Drizzle Dialect
 */
export interface ITenant {
  id: number;
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
  tenantId: number | null;
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
  id: number;
  tenantId: number;
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
  id: number;
  tenantId: number | null;
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
  getTenantById(id: number): Promise<ITenant | null>;
  getTenantByDomain(domain: string): Promise<ITenant | null>;
  createTenant(data: Partial<ITenant>): Promise<ITenant>;

  // Better-Auth Account Operations
  getAccountById(accountId: string): Promise<IAccount | null>;
  getAccountByEmail(email: string): Promise<IAccount | null>;
  
  // Academic Year Operations
  getAcademicYears(tenantId: number): Promise<IAcademicYear[]>;
  getCurrentAcademicYear(tenantId: number): Promise<IAcademicYear | null>;

  // Enumeration Operations
  getEnumsByDomain(tenantId: number | null, domain: string): Promise<IEnumerator[]>;
}
