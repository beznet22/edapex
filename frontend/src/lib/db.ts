import { createCollection, localOnlyCollectionOptions } from '@tanstack/react-db'
import { z } from 'zod'

// Shared schemas for type safety
const schoolSchema = z.object({
  id: z.string(),
  name: z.string(),
  tenant_id: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
  updated_at: z.string(),
})

const studentSchema = z.object({
  id: z.string(),
  name: z.string(),
  tenant_id: z.string(),
  school_id: z.string(),
  updated_at: z.string(),
})

const examSchema = z.object({
  id: z.string(),
  title: z.string(),
  exam_type: z.enum(['term', 'continuous', 'mock', 'final']),
  tenant_id: z.string(),
  updated_at: z.string(),
})

const examSetupSchema = z.object({
  id: z.string(),
  exam_id: z.string(),
  class_id: z.string().optional(),
  section_id: z.string().optional(),
  subject_id: z.string().optional(),
  title: z.string(),
  exam_mark: z.number(),
  tenant_id: z.string(),
  updated_at: z.string(),
})

const markSchema = z.object({
  id: z.string(),
  student_id: z.string(),
  exam_id: z.string(),
  exam_setup_id: z.string(),
  score: z.number(),
  is_absent: z.number(),
  tenant_id: z.string(),
  updated_at: z.string(),
})

// Mutation Handler Factory
const createCollectionConfig = (id: string, schema: z.ZodObject<any>) => localOnlyCollectionOptions({
  id,
  getKey: (item: any) => item.id,
  schema,
  onInsert: async ({ transaction }) => {
    console.log(`[DB] Optimistic Insert: ${id}`, transaction.mutations)
  },
  onUpdate: async ({ transaction }) => {
    console.log(`[DB] Optimistic Update: ${id}`, transaction.mutations)
  },
  onDelete: async ({ transaction }) => {
    console.log(`[DB] Optimistic Delete: ${id}`, transaction.mutations)
  },
})

// Define Core Collections
export const schools = createCollection(createCollectionConfig('schools', schoolSchema))
export const students = createCollection(createCollectionConfig('students', studentSchema))
export const exams = createCollection(createCollectionConfig('exams', examSchema))
export const examSetups = createCollection(createCollectionConfig('examSetups', examSetupSchema))
export const marks = createCollection(createCollectionConfig('marks', markSchema))

export const db = {
  schools,
  students,
  exams,
  examSetups,
  marks,
}
