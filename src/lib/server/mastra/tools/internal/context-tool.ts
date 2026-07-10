import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { ResultsRepository } from '../../../repository/result.repo';
import { StudentRepository } from '../../../repository/student.repo';
import { buildMastraToolContext } from '../../tenant-context';

/**
 * Static getContext tool for the supervisor — retrieves ADDITIONAL domain
 * context on demand. The system prompt already surfaces the tenant
 * context, class roster, and `resolvedMentions`; this tool is the escape
 * hatch for lookups that aren't already present (a specific student,
 * assessment setup, or class assignment).
 * Uses the Slice 0 bridge (buildMastraToolContext) to access the active
 * TenantContext and ScopedRepositoryProvider at call time. Read-only: no sm*
 * table is written.
 */
export const getContextTool = createTool({
    id: 'getContext',
    description: 'Retrieve ADDITIONAL domain context (assessment setups, students, subjects, etc.) on demand. The system prompt already contains the tenant context, class roster, and resolved @mentions — only call this tool when you need data NOT already present in that context (e.g. a specific student lookup, assessment setup details, or class assignment).',
    inputSchema: z.object({
        types: z.array(z.enum(['assessment', 'students', 'class'])).describe('The specific categories of context needed'),
        query: z.string().optional().describe('Optional filter/search term for students or assessments'),
    }),
    execute: async ({ types, query }, { requestContext }) => {
        const bridge = await buildMastraToolContext(requestContext);
        const ctx = bridge.tenantContext;
        if (!ctx) {
            return { error: 'No tenant context available. Cannot fetch domain data.' };
        }

        const staffId = ctx.userId;
        const resultRepo = bridge.getRepo(ResultsRepository);
        const studentRepo = bridge.getRepo(StudentRepository);

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