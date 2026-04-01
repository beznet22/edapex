export interface IHomeschoolSubscription {
  id: string;
  tenantId: string;
  academicId: string;
  plan: "basic" | "family" | "premium" | "b2b_micro";
  status: "active" | "past_due" | "canceled" | "trial";
  renewsAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IHomeschoolSchedule {
  id: string;
  tenantId: string;
  userId: string; 
  academicId: string;
  subjectId: string | null;
  lessonId: string | null;
  title: string;
  scheduleDate: string;
  startTime: string | null;
  endTime: string | null;
  status: "planned" | "in_progress" | "completed" | "skipped";
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IHomeschoolPortfolio {
  id: string;
  tenantId: string;
  userId: string; 
  academicId: string;
  courseId: string | null;
  submissionId: string | null;
  evidenceType: "project" | "exam" | "artwork" | "certification";
  title: string;
  description: string | null;
  attachmentUrl: string | null;
  recordedDate: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IRevenueShare {
  id: string;
  tenantId: string;
  facilitatorId: string;
  period: string;
  baseAmount: number;
  performanceBonus: number;
  totalEarned: number;
  status: "pending" | "paid";
  ledgerEntryId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IHomeschoolRepository {
  getSubscription(tenantId: string, academicId: string): Promise<IHomeschoolSubscription[]>;
  createSubscription(data: Partial<IHomeschoolSubscription>): Promise<IHomeschoolSubscription>;

  getSchedules(tenantId: string, userId: string, academicId: string): Promise<IHomeschoolSchedule[]>;
  createSchedule(data: Partial<IHomeschoolSchedule>): Promise<IHomeschoolSchedule>;

  getPortfolios(tenantId: string, userId: string, academicId: string): Promise<IHomeschoolPortfolio[]>;
  createPortfolio(data: Partial<IHomeschoolPortfolio>): Promise<IHomeschoolPortfolio>;

  getRevenueShares(tenantId: string, facilitatorId: string): Promise<IRevenueShare[]>;
}
