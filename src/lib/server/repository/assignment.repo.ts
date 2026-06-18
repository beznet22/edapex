import * as schema from "$lib/server/db/schema";
import { and, eq } from "drizzle-orm";
import { BaseRepository } from "./base.repo";

const SCHOOL_ID = 1 as const;

export class AssignmentRepository extends BaseRepository {
	async assignClassTeacher(params: {
		classId: number;
		sectionId: number;
		staffId: number;
		academicId?: number;
		sessionId?: number;
	}): Promise<{ assignClassTeacherId: number }> {
		return this.withErrorHandling(async () => {
			const {
				classId,
				sectionId,
				staffId,
				academicId: academicIdParam,
				sessionId: _sessionId,
			} = params;
			const academicId = academicIdParam ?? (await this.getAcademicId());

			const [existingHeader] = await this.db
				.select({ id: schema.smAssignClassTeachers.id })
				.from(schema.smAssignClassTeachers)
				.where(
					and(
						eq(schema.smAssignClassTeachers.schoolId, SCHOOL_ID),
						eq(schema.smAssignClassTeachers.classId, classId),
						eq(schema.smAssignClassTeachers.sectionId, sectionId),
						eq(schema.smAssignClassTeachers.academicId, academicId)
					)
				)
				.limit(1);

			const headerId =
				existingHeader?.id ??
				(
					await this.db
						.insert(schema.smAssignClassTeachers)
						.values({
							schoolId: SCHOOL_ID,
							classId,
							sectionId,
							academicId,
							activeStatus: 1,
							createdBy: this.tenant.userId,
							updatedBy: this.tenant.userId,
						})
						.$returningId()
				)[0].id;

			const [currentSlot] = await this.db
				.select({
					id: schema.smClassTeachers.id,
					teacherId: schema.smClassTeachers.teacherId,
				})
				.from(schema.smClassTeachers)
				.where(
					and(
						eq(schema.smClassTeachers.assignClassTeacherId, headerId),
						eq(schema.smClassTeachers.activeStatus, 1)
					)
				)
				.limit(1);

			if (!currentSlot || currentSlot.teacherId !== staffId) {
				if (currentSlot) {
					await this.db
						.update(schema.smClassTeachers)
						.set({
							activeStatus: 0,
							updatedBy: this.tenant.userId,
						})
						.where(eq(schema.smClassTeachers.id, currentSlot.id));
				}

				await this.db.insert(schema.smClassTeachers).values({
					assignClassTeacherId: headerId,
					teacherId: staffId,
					schoolId: SCHOOL_ID,
					academicId,
					activeStatus: 1,
					createdBy: this.tenant.userId,
					updatedBy: this.tenant.userId,
				});
			}

			return { assignClassTeacherId: headerId };
		}, "assignClassTeacher");
	}

	async assignSubjectTeacher(params: {
		classId: number;
		sectionId: number;
		subjectId: number;
		staffId: number;
		academicId?: number;
		sessionId?: number;
	}): Promise<void> {
		return this.withErrorHandling(async () => {
			const {
				classId,
				sectionId,
				subjectId,
				staffId,
				academicId: academicIdParam,
				sessionId: _sessionId,
			} = params;
			const academicId = academicIdParam ?? (await this.getAcademicId());

			const [existing] = await this.db
				.select({ id: schema.smAssignSubjects.id })
				.from(schema.smAssignSubjects)
				.where(
					and(
						eq(schema.smAssignSubjects.schoolId, SCHOOL_ID),
						eq(schema.smAssignSubjects.classId, classId),
						eq(schema.smAssignSubjects.sectionId, sectionId),
						eq(schema.smAssignSubjects.subjectId, subjectId),
						eq(schema.smAssignSubjects.academicId, academicId)
					)
				)
				.limit(1);

			if (existing) {
				await this.db
					.update(schema.smAssignSubjects)
					.set({
						teacherId: staffId,
						activeStatus: 1,
						updatedBy: this.tenant.userId,
					})
					.where(eq(schema.smAssignSubjects.id, existing.id));
				return;
			}

			await this.db.insert(schema.smAssignSubjects).values({
				schoolId: SCHOOL_ID,
				classId,
				sectionId,
				subjectId,
				teacherId: staffId,
				academicId,
				activeStatus: 1,
				createdBy: this.tenant.userId,
				updatedBy: this.tenant.userId,
			});
		}, "assignSubjectTeacher");
	}
}
