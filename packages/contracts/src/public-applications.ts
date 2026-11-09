import { z } from "zod";

export const APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "info_requested",
  "offered",
  "waitlisted",
  "rejected",
  "withdrawn"
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const applicantContactSchema = z
  .object({
    email: z.string().trim().email().max(191).optional(),
    phone: z.string().trim().min(7).max(32).optional()
  })
  .strict()
  .refine((value) => value.email !== undefined || value.phone !== undefined, {
    message: "An email address or phone number is required",
    path: ["email"]
  });

export const applicationDraftSchema = z
  .object({
    applicant: z
      .object({
        firstName: z.string().trim().min(1).max(100),
        middleName: z.string().trim().max(100).optional(),
        lastName: z.string().trim().min(1).max(100),
        dateOfBirth: z.string().date().optional(),
        gender: z.enum(["female", "male", "other", "prefer_not_to_say"]).optional()
      })
      .strict(),
    contact: applicantContactSchema,
    guardian: z
      .object({
        name: z.string().trim().min(1).max(191),
        relationship: z.string().trim().min(1).max(60),
        email: z.string().trim().email().max(191).optional(),
        phone: z.string().trim().min(7).max(32).optional()
      })
      .strict(),
    desiredClassId: z.number().int().positive().optional(),
    previousSchool: z.string().trim().max(191).optional(),
    notes: z.string().trim().max(4_000).optional(),
    documentIds: z.array(z.string().uuid()).max(20).default([])
  })
  .strict();

export type ApplicationDraft = z.infer<typeof applicationDraftSchema>;

export interface ApplicationSummary {
  readonly id: string;
  readonly status: ApplicationStatus;
  readonly applicantName: string;
  readonly submittedAt: number | null;
  readonly updatedAt: number;
  readonly decisionAt: number | null;
}

export interface ApplicationStatusView {
  readonly application: ApplicationSummary;
  readonly events: readonly {
    readonly status: ApplicationStatus;
    readonly at: number;
    readonly note: string | null;
  }[];
}

export interface ApplicationDocument {
  readonly id: string;
  readonly applicationId: string;
  readonly kind: "birth_certificate" | "report_card" | "passport_photo" | "other";
  readonly fileName: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly uploadedAt: number;
}

export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);
