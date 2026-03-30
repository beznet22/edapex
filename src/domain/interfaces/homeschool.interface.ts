export interface IHomeschoolSubscription {
  id: number;
  tenantId: number;
  academicId: number;
  plan: "basic" | "family" | "premium" | "b2b_micro";
  status: "active" | "past_due" | "canceled" | "trial";
  renewsAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IHomeschoolSchedule {
  id: number;
  tenantId: number;
  userId: number; 
  academicId: number;
  subjectId: number | null;
  lessonId: number | null;
  title: string;
  scheduleDate: string;
  startTime: string | null;
  endTime: string | null;
  status: "planned" | "in_progress" | "completed" | "skipped";
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IHomeschoolPortfolio {
  id: number;
  tenantId: number;
  userId: number; 
  academicId: number;
  courseId: number | null;
  submissionId: number | null;
  evidenceType: "project" | "exam" | "artwork" | "certification";
  title: string;
  description: string | null;
  attachmentUrl: string | null;
  recordedDate: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IHomeschoolRepository {
  getSubscription(tenantId: number, academicId: number): Promise<IHomeschoolSubscription[]>;
  createSubscription(data: Partial<IHomeschoolSubscription>): Promise<IHomeschoolSubscription>;

  getSchedules(userId: number, academicId: number): Promise<IHomeschoolSchedule[]>;
  createSchedule(data: Partial<IHomeschoolSchedule>): Promise<IHomeschoolSchedule>;

  getPortfolios(userId: number, academicId: number): Promise<IHomeschoolPortfolio[]>;
  createPortfolio(data: Partial<IHomeschoolPortfolio>): Promise<IHomeschoolPortfolio>;
}
