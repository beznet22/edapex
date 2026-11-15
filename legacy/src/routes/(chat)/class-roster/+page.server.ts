import { error, fail } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smStudents, studentRecords } from "$lib/server/db/sms-schema";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { StudentRepository } from "$lib/server/repository";
import { resolveActiveClassScope, resolveClassNamesByIds } from "$lib/server/helpers/class-scope";
import type { PageServerLoad, Actions } from "./$types";

export interface RosterStudent {
	id: number;
	name: string | null;
	admissionNo: number | null;
	active: boolean;
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	if (!locals.user) throw error(401);
	const schoolId = locals.user.schoolId ?? 1;

	const scope = await resolveActiveClassScope({
		schoolId,
		staffId: locals.user.staffId,
		className: url.searchParams.get("className") ?? undefined,
		sectionName: url.searchParams.get("sectionName") ?? undefined,
		selectedClassCookie: cookies.get("selected-class") ?? undefined,
	});

	if (!scope) {
		return { students: [] as RosterStudent[], classInfo: null };
	}

	const { classId, sectionId, academicId } = scope;
	const db = await getDatabase();

	const rawRows = await db
		.select({
			id: smStudents.id,
			name: smStudents.fullName,
			admissionNo: smStudents.admissionNo,
			active: smStudents.activeStatus,
		})
		.from(smStudents)
		.innerJoin(
			studentRecords,
			and(
				eq(smStudents.id, studentRecords.studentId),
				eq(studentRecords.classId, classId),
				eq(studentRecords.sectionId, sectionId),
				eq(studentRecords.academicId, academicId),
				eq(studentRecords.isDefault, 1),
			),
		)
		.orderBy(smStudents.id);

	const students: RosterStudent[] = rawRows.map((r) => ({
		id: r.id,
		name: r.name,
		admissionNo: r.admissionNo,
		active: r.active === 1,
	}));

	const displayNames = await resolveClassNamesByIds({ schoolId, classId, sectionId, academicId });

	return {
		students,
		classInfo: {
			classId,
			sectionId,
			academicId,
			className: displayNames.className ?? `Class ${classId}`,
			sectionName: displayNames.sectionName ?? `Section ${sectionId}`,
		},
	};
};

export const actions: Actions = {
	toggleStatus: async ({ locals, request }) => {
		if (!locals.user) throw error(401);
		const schoolId = locals.user.schoolId ?? 1;

		const formData = await request.formData();
		const studentId = Number(formData.get("studentId"));
		const active = formData.get("active") === "true";

		if (!studentId) {
			return fail(400, { error: "studentId required" });
		}

		const tenant = createTenantContext({
			schoolId,
			userId: locals.user.id,
			staffId: locals.user.staffId,
		});
		const db = await getDatabase();
		const provider = new ScopedRepositoryProvider(db, tenant);
		const studentRepo = provider.getRepo(StudentRepository);

		return await studentRepo.updateStudentStatus({ studentId, active });
	},
};
