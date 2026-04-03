import { relations } from "drizzle-orm";
import * as schema from "./schema";

// --- CORE RELATIONS ---

export const tenantsRelations = relations(schema.tenants, ({ many }) => ({
  accounts: many(schema.accounts),
  users: many(schema.users),
  academicYears: many(schema.academicYears),
}));

export const accountsRelations = relations(schema.accounts, ({ one, many }) => ({
  tenant: one(schema.tenants, {
    fields: [schema.accounts.tenantId],
    references: [schema.tenants.id],
  }),
  users: many(schema.users), // Multiple personas (student, staff) per login
  sessions: many(schema.sessions),
  authAccounts: many(schema.authAccounts),
}));

export const authAccountsRelations = relations(schema.authAccounts, ({ one }) => ({
  account: one(schema.accounts, {
    fields: [schema.authAccounts.accountId],
    references: [schema.accounts.id],
  }),
}));

export const usersRelations = relations(schema.users, ({ one, many }) => ({
  account: one(schema.accounts, {
    fields: [schema.users.accountId],
    references: [schema.accounts.id],
  }),
  tenant: one(schema.tenants, {
    fields: [schema.users.tenantId],
    references: [schema.tenants.id],
  }),
  parent: one(schema.users, {
    fields: [schema.users.parentUserId],
    references: [schema.users.id],
    relationName: "family",
  }),
  children: many(schema.users, {
    relationName: "family",
  }),
  documents: many(schema.userDocuments),
  addresses: many(schema.userAddresses),
  
  // Domain Links (moved from accounts to users)
  enrollments: many(schema.enrollments),
  attendances: many(schema.attendances),
  recordedAttendances: many(schema.attendances, { relationName: "recorder" }),
  examMarks: many(schema.examMarks),
  gradedExams: many(schema.examMarks, { relationName: "grader" }),
  computedResults: many(schema.computedResults),
  leaveRequests: many(schema.hrLeaveRequests),
  approvedLeaves: many(schema.hrLeaveRequests, { relationName: "approver" }),
  bookIssues: many(schema.bookIssues),
  lmsEnrollments: many(schema.lmsEnrollments),
  lmsSubmissions: many(schema.lmsSubmissions),
}));

// --- DOMAIN RELATIONS (POINTING TO USERS) ---

export const examMarksRelations = relations(schema.examMarks, ({ one }) => ({
  student: one(schema.users, {
    fields: [schema.examMarks.userId],
    references: [schema.users.id],
  }),
  grader: one(schema.users, {
    fields: [schema.examMarks.gradedBy],
    references: [schema.users.id],
    relationName: "grader",
  }),
  setup: one(schema.examSetups, {
    fields: [schema.examMarks.examSetupId],
    references: [schema.examSetups.id],
  }),
}));

export const computedResultsRelations = relations(schema.computedResults, ({ one }) => ({
  student: one(schema.users, {
    fields: [schema.computedResults.userId],
    references: [schema.users.id],
  }),
  exam: one(schema.exams, {
    fields: [schema.computedResults.examId],
    references: [schema.exams.id],
  }),
}));

export const onlineExamAttemptsRelations = relations(schema.onlineExamAttempts, ({ one }) => ({
  student: one(schema.users, {
    fields: [schema.onlineExamAttempts.userId],
    references: [schema.users.id],
  }),
  exam: one(schema.onlineExams, {
    fields: [schema.onlineExamAttempts.onlineExamId],
    references: [schema.onlineExams.id],
  }),
}));

export const attendancesRelations = relations(schema.attendances, ({ one }) => ({
  user: one(schema.users, {
    fields: [schema.attendances.userId],
    references: [schema.users.id],
  }),
  recorder: one(schema.users, {
    fields: [schema.attendances.recordedBy],
    references: [schema.users.id],
    relationName: "recorder",
  }),
}));

// AI Relations
export const aiSessionsRelations = relations(schema.aiSessions, ({ one, many }) => ({
  user: one(schema.users, {
    fields: [schema.aiSessions.userId],
    references: [schema.users.id],
  }),
  messages: many(schema.aiMessages),
  votes: many(schema.aiVotes),
}));

export const aiMessagesRelations = relations(schema.aiMessages, ({ one, many }) => ({
  session: one(schema.aiSessions, {
    fields: [schema.aiMessages.sessionId],
    references: [schema.aiSessions.id],
  }),
  votes: many(schema.aiVotes),
}));

export const aiVotesRelations = relations(schema.aiVotes, ({ one }) => ({
  session: one(schema.aiSessions, {
    fields: [schema.aiVotes.sessionId],
    references: [schema.aiSessions.id],
  }),
  message: one(schema.aiMessages, {
    fields: [schema.aiVotes.messageId],
    references: [schema.aiMessages.id],
  }),
}));

// LMS Relations
export const lmsCoursesRelations = relations(schema.lmsCourses, ({ many }) => ({
  modules: many(schema.lmsModules),
  enrollments: many(schema.lmsEnrollments),
  assignments: many(schema.lmsAssignments),
}));

export const lmsModulesRelations = relations(schema.lmsModules, ({ one, many }) => ({
  course: one(schema.lmsCourses, {
    fields: [schema.lmsModules.courseId],
    references: [schema.lmsCourses.id],
  }),
  lessons: many(schema.lmsLessons),
}));

export const lmsLessonsRelations = relations(schema.lmsLessons, ({ one, many }) => ({
  module: one(schema.lmsModules, {
    fields: [schema.lmsLessons.moduleId],
    references: [schema.lmsModules.id],
  }),
  tutoringSessions: many(schema.lmsTutoringSessions),
  progress: many(schema.lmsProgress),
}));

export const lmsEnrollmentsRelations = relations(schema.lmsEnrollments, ({ one, many }) => ({
  course: one(schema.lmsCourses, {
    fields: [schema.lmsEnrollments.courseId],
    references: [schema.lmsCourses.id],
  }),
  user: one(schema.users, {
    fields: [schema.lmsEnrollments.userId],
    references: [schema.users.id],
  }),
  progress: many(schema.lmsProgress),
}));

export const lmsSubmissionsRelations = relations(schema.lmsSubmissions, ({ one }) => ({
  assignment: one(schema.lmsAssignments, {
    fields: [schema.lmsSubmissions.assignmentId],
    references: [schema.lmsAssignments.id],
  }),
  user: one(schema.users, {
    fields: [schema.lmsSubmissions.userId],
    references: [schema.users.id],
  }),
}));
