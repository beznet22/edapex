import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { ResultsRepository } from '../../repository/result.repo';
import { StudentRepository } from '../../repository/student.repo';
import { getDatabase } from '$lib/server/db';
import type { TenantContext } from '../tenant-context';

/**
 * Static getContext tool for the supervisor — fetches domain context on demand.
 * Uses requestContext to access the active TenantContext at call time.
 */
export const getContextTool = createTool({
    id: 'getContext',
    description: 'Fetches specific domain context (assessment setups, students, subjects, etc.) on demand. Use this if the user asks about assessments, marks, students, or class assignments.',
    inputSchema: z.object({
        types: z.array(z.enum(['assessment', 'students', 'class'])).describe('The specific categories of context needed'),
        query: z.string().optional().describe('Optional filter/search term for students or assessments'),
    }),
    execute: async ({ types, query }, { requestContext }) => {
        const ctx = requestContext?.get('tenantContext') as TenantContext | undefined;
        if (!ctx) {
            return { error: 'No tenant context available. Cannot fetch domain data.' };
        }

        const staffId = ctx.userId;
        const db = await getDatabase();
        const resultRepo = new ResultsRepository(db, ctx);
        const studentRepo = new StudentRepository(db, ctx);

        const results: any = {};

        try {
            if (types.includes('assessment')) {
                const [examTypes, subjects, classSection] = await Promise.all([
                    resultRepo.getCurrentTerm(),
                    resultRepo.getSubjectsAssignedToStaff(staffId),
                    resultRepo.getAssignedClassSection(staffId),
                ]);

                const activeClassId = ctx.classId || classSection?.classId;
                const activeSectionId = ctx.sectionId || classSection?.sectionId;

                let examSetups: any[] = [];
                if (activeClassId && activeSectionId) {
                    examSetups = await resultRepo.getExamSetupsByClassSection(activeClassId, activeSectionId);
                } else {
                    examSetups = await resultRepo.getExamSetupsByStaffId(staffId);
                }

                results.assessment = {
                    examTypes,
                    subjects,
                    examSetups,
                    activeClassSection: {
                        classId: activeClassId,
                        sectionId: activeSectionId,
                    },
                };
            }

            if (types.includes('students')) {
                const activeClassId = ctx.classId;
                const activeSectionId = ctx.sectionId;

                if (!activeClassId || !activeSectionId) {
                    results.students = { error: 'No active class/section context found. Please ensure a class is selected.' };
                } else {
                    const students = await studentRepo.getStudentsByClassSection(
                        { classId: activeClassId, sectionId: activeSectionId },
                        query,
                    );

                    results.students = {
                        count: students?.length || 0,
                        list: students?.map((s: any) => ({
                            id: s.id,
                            name: s.name,
                            admissionNumber: s.admissionNo,
                        })) || [],
                    };
                }
            }

            if (types.includes('class')) {
                const classSection = await resultRepo.getAssignedClassSection(staffId);
                results.classAssignment = {
                    assignedClassSection: classSection,
                };
            }

            return results;
        } catch (error) {
            console.error('[supervisor] getContext tool failed:', error);
            return { error: 'Failed to fetch domain context from repositories.' };
        }
    },
}); 